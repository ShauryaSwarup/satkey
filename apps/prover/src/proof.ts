/**
 * proof.ts
 *
 * Runs nargo + bb CLI tools to generate a Noir/UltraHonk proof,
 * then reads and encodes the proof bytes as felt252 hex strings.
 *
 * BIG-ENDIAN ONLY: felt = bigint % STARK_FIELD_PRIME, big-endian byte encoding.
 *
 * Output layout for relay/on-chain use:
 *   publicSignals: [salt_hex, message_hash_hex, nonce_hex, expiry_hex]
 *   proof: hex string of raw proof bytes
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const STARK_FIELD_PRIME = BigInt(
  "0x0800000000000011000000000000000000000000000000000000000000000001"
);

/**
 * Resolve a CLI binary by checking common install paths.
 * Falls back to the bare name (relies on PATH).
 */
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
  proof: string;           // hex-encoded proof bytes
  publicSignals: string[]; // [salt, msg_hash, nonce, expiry] as 0x-prefixed felt hex
}

/**
 * Converts raw proof bytes (Uint8Array, big-endian) into an array of felt252
 * hex strings. Each 32-byte chunk → one felt (% STARK_FIELD_PRIME).
 */
export function proofBytesToFelts(proofBytes: Uint8Array): string[] {
  const felts: string[] = [];
  // Pad to multiple of 32
  const padded = Buffer.alloc(Math.ceil(proofBytes.length / 32) * 32);
  Buffer.from(proofBytes).copy(padded);

  for (let i = 0; i < padded.length; i += 32) {
    const chunk = padded.slice(i, i + 32);
    const n = BigInt("0x" + chunk.toString("hex"));
    const felt = n % STARK_FIELD_PRIME;
    felts.push("0x" + felt.toString(16));
  }
  return felts;
}

/**
 * Run `nargo execute` then `bb prove` synchronously.
 *
 * nargo requires Prover.toml to live in the circuit root directory
 * (same folder as Nargo.toml). We copy the generated Prover.toml there,
 * run nargo, then restore the original if one existed.
 *
 * @param workDir    - temporary directory containing the generated Prover.toml
 * @param circuitDir - path to the circuits/satkey_auth directory (contains Nargo.toml)
 */
export async function generateProof(
  workDir: string,
  circuitDir: string
): Promise<ProofResult> {
  const circuitProverToml = path.join(circuitDir, "Prover.toml");
  const workProverToml = path.join(workDir, "Prover.toml");

  // Back up existing Prover.toml if present
  let originalProverToml: string | null = null;
  if (fs.existsSync(circuitProverToml)) {
    originalProverToml = fs.readFileSync(circuitProverToml, "utf8");
  }

  try {
    // Copy generated Prover.toml into circuit root where nargo expects it
    fs.copyFileSync(workProverToml, circuitProverToml);

    // 1. Recompile circuit to ensure artifact matches installed nargo version
    execSync(`${NARGO_BIN} compile`, {
      cwd: circuitDir,
      stdio: "pipe",
    });

    // 2. Execute the circuit (generate witness)
    // nargo execute outputs circuit return values to stdout
    const nargoOutput = execSync(`${NARGO_BIN} execute`, {
      cwd: circuitDir,
      stdio: "pipe",
    }).toString();

    // Parse circuit output: [salt, message_hash, nonce, expiry]
    // Format: Vec([Field(...), Field(...), Field(...), Field(...)])
    const publicSignals: string[] = [];
    const fieldMatch = nargoOutput.matchAll(/Field\(([^)]+)\)/g);
    for (const match of fieldMatch) {
      let val = match[1];
      // Handle negative numbers (modular representation)
      if (val.startsWith('-')) {
        const absVal = BigInt(val);
        const felt = (STARK_FIELD_PRIME + absVal) % STARK_FIELD_PRIME;
        publicSignals.push("0x" + felt.toString(16));
      } else {
        const felt = BigInt(val) % STARK_FIELD_PRIME;
        publicSignals.push("0x" + felt.toString(16));
      }
    }

    const witnessPath = path.join(circuitDir, "target", "satkey_auth.gz");

    // 3. Generate proof via Barretenberg (ultra_keccak_honk)
    // Output is a file, not a directory
    const bbProofPath = path.join(workDir, "proof");

    execSync(
      `${BB_BIN} prove_ultra_keccak_honk -b ${path.join(circuitDir, "target", "satkey_auth.json")} -w ${witnessPath} -o ${bbProofPath}`,
      { cwd: circuitDir, stdio: "pipe" }
    );
    // 4. Read proof from bb output file
    // 4. Read proof from bb output file
    const proofBytes = fs.readFileSync(bbProofPath);

    return {
      proof: "0x" + proofBytes.toString("hex"),
      publicSignals,
    };
  } finally {
    // Restore original Prover.toml (or remove if there wasn't one)
    if (originalProverToml !== null) {
      fs.writeFileSync(circuitProverToml, originalProverToml, "utf8");
    } else {
      fs.unlinkSync(circuitProverToml);
    }
  }
}
