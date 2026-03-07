/**
 * proof.ts
 *
 * Runs nargo + bb CLI tools to generate a Noir/UltraHonk proof,
 * then encodes the Garaga calldata as felt252 hex strings.
 *
 * Noir circuit return layout → publicSignals indices:
 *   [0] salt              (BN254 Poseidon of pubkey)
 *   [1] message_hash_field (packed message hash)
 *   [2] nonce
 *   [3] expiry
 *
 * These map to Garaga public_inputs indices 34–37 on-chain.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const STARK_FIELD_PRIME = BigInt(
  "0x0800000000000011000000000000000000000000000000000000000000000001"
);

function resolveBin(name: string, envVar: string, searchPaths: string[]): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  for (const p of searchPaths) {
    if (fs.existsSync(p)) return p;
  }
  return name;
}

const NARGO_BIN = resolveBin("nargo", "NARGO_BIN", [
  path.join(process.env.HOME || "~", ".nargo/bin/nargo"),
]);
const BB_BIN = resolveBin("bb", "BB_BIN", [
  path.join(process.env.HOME || "~", ".bb/bb"),
]);

export interface ProofResult {
  /** Garaga calldata felts as 0x-prefixed hex strings (excludes the leading length token). */
  fullProof: string[];
  /**
   * Circuit return values: [salt, message_hash_field, nonce, expiry]
   * These are the 4 values the Noir circuit returns, parsed from nargo's stdout.
   * On-chain they appear at Garaga public_inputs indices 34–37.
   */
  publicSignals: string[];
}

export async function generateProof(
  workDir: string,
  circuitDir: string
): Promise<ProofResult> {
  const srcDir = path.join(circuitDir, "src");
  const nargoToml = path.join(circuitDir, "Nargo.toml");
  const artifactPath = path.join(circuitDir, "target", "satkey_auth.json");

  // Shadow project: real Nargo.toml copy + symlinked src + symlinked artifact
  fs.copyFileSync(nargoToml, path.join(workDir, "Nargo.toml"));
  fs.symlinkSync(srcDir, path.join(workDir, "src"));

  const localTarget = path.join(workDir, "target");
  fs.mkdirSync(localTarget);

  if (fs.existsSync(artifactPath)) {
    fs.symlinkSync(artifactPath, path.join(localTarget, "satkey_auth.json"));
  } else {
    // Artifact must be pre-compiled in production — compile here as a fallback only.
    execSync(`${NARGO_BIN} compile`, { cwd: workDir, stdio: "pipe" });
  }

  // ── Step 1: Generate witness ───────────────────────────────────────────────
  const nargoOutput = execSync(`${NARGO_BIN} execute`, {
    cwd: workDir,
    stdio: "pipe",
  }).toString();

  console.log("[prover] nargo output:", nargoOutput);

  // Parse the 4 circuit return values from nargo's "Circuit output: [...]" line.
  // These are [salt, message_hash_field, nonce, expiry] in declaration order.
  const publicSignals: string[] = [];

  const outputMatch = nargoOutput.match(/Circuit output:\s*\[([^\]]+)\]/);
  if (outputMatch?.[1]) {
    const tokens = outputMatch[1].split(",").map((s) => s.trim());
    for (const token of tokens) {
      // nargo emits hex (0x...) — normalise to 0x-prefixed lowercase
      const hex = token.startsWith("0x") ? token : "0x" + token;
      // Reduce mod stark_prime in case of BN254 overflow
      const reduced = BigInt(hex) % STARK_FIELD_PRIME;
      publicSignals.push("0x" + reduced.toString(16));
    }
  } else {
    // Fallback: Field(...) format from older nargo versions
    const fieldMatches = [...nargoOutput.matchAll(/Field\(([^)]+)\)/g)];
    for (const match of fieldMatches) {
      const val = match[1];
      const n = BigInt(val.startsWith("-") ? val : val);
      const reduced = ((n % STARK_FIELD_PRIME) + STARK_FIELD_PRIME) % STARK_FIELD_PRIME;
      publicSignals.push("0x" + reduced.toString(16));
    }
  }

  if (publicSignals.length !== 4) {
    throw new Error(
      `Expected 4 public signals from circuit, got ${publicSignals.length}. ` +
      `Raw nargo output:\n${nargoOutput}`
    );
  }

  // publicSignals indices:
  //   [0] salt              → Garaga public_inputs[34]
  //   [1] message_hash_field → Garaga public_inputs[35]  (not checked on-chain)
  //   [2] nonce             → Garaga public_inputs[36]
  //   [3] expiry            → Garaga public_inputs[37]
  console.log("[prover] publicSignals:", {
    salt: publicSignals[0],
    message_hash_field: publicSignals[1],
    nonce: publicSignals[2],
    expiry: publicSignals[3],
  });

  // ── Step 2: Generate proof ─────────────────────────────────────────────────
  const witnessPath = path.join(localTarget, "satkey_auth.gz");
  const jsonPath = path.join(localTarget, "satkey_auth.json");

  execSync(
    `${BB_BIN} prove -s ultra_honk --oracle_hash keccak ` +
    `-b ${jsonPath} -w ${witnessPath} -o ${workDir} --write_vk`,
    { cwd: workDir, stdio: "pipe" }
  );

  const proofFile = path.join(workDir, "proof");
  const vkFile = path.join(workDir, "vk");
  const publicInputsFile = path.join(workDir, "public_inputs");

  // ── Step 3: Generate Garaga calldata ──────────────────────────────────────
  // garaga calldata starkli format: "<count> <felt1> <felt2> ..."
  // tokens[0] is the array length; tokens[1..] are the actual felt252 values.
  const calldataStr = execSync(
    `garaga calldata --system ultra_keccak_zk_honk ` +
    `--vk ${vkFile} --proof ${proofFile} --public-inputs ${publicInputsFile} ` +
    `--format starkli`,
    { encoding: "utf8" }
  );

  const tokens = calldataStr.trim().split(/\s+/);

  // tokens[0] is the length prefix emitted by starkli format — skip it.
  // The signer re-prepends proof.length as proof_len when building the signature array.
  const fullProof = tokens.slice(1).map((t) => {
    let value = BigInt(t);
    // Garaga may emit negative values for BN254 field elements — normalise
    if (value < 0n) {
      value = ((value % STARK_FIELD_PRIME) + STARK_FIELD_PRIME) % STARK_FIELD_PRIME;
    }
    return "0x" + value.toString(16);
  });

  console.log("[prover] fullProof length:", fullProof.length);

  return { fullProof, publicSignals };
}
