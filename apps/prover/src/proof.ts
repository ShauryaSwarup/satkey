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

// No longer need STARK_FIELD_PRIME manually since garaga calldata does the formatting

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
  fullProof: string[];     // the FullProof array (including MSM/KZG hints) of felt252 hex strings
  publicSignals: string[]; // [salt, msg_hash, nonce, expiry] as 0x-prefixed felt hex
}

export async function generateProof(
  workDir: string,
  circuitDir: string
): Promise<ProofResult> {
  // To avoid race conditions in the shared circuit directory, we create a
  // "shadow" project in the temporary workDir using symlinks for the source
  // but a REAL COPY of Nargo.toml.
  // This ensures nargo treats workDir as a distinct project root and looks
  // for Prover.toml in the workDir.
  
  const srcDir = path.join(circuitDir, "src");
  const nargoToml = path.join(circuitDir, "Nargo.toml");
  const artifactPath = path.join(circuitDir, "target", "satkey_auth.json");

  // Copy Nargo.toml (essential to avoid nargo following symlink to shared root)
  fs.copyFileSync(nargoToml, path.join(workDir, "Nargo.toml"));
  
  // Symlink the source code (read-only)
  fs.symlinkSync(srcDir, path.join(workDir, "src"));
  
  // Create a local target directory and symlink the compiled artifact
  const localTarget = path.join(workDir, "target");
  fs.mkdirSync(localTarget);
  if (fs.existsSync(artifactPath)) {
    fs.symlinkSync(artifactPath, path.join(localTarget, "satkey_auth.json"));
  } else {
    // In production, the artifact should ALWAYS be present.
    // If missing, we compile once in the workDir.
    execSync(`${NARGO_BIN} compile`, {
      cwd: workDir,
      stdio: "pipe",
    });
  }

  try {
    // Generate witness (writes to workDir/target/satkey_auth.gz)
    const nargoOutput = execSync(`${NARGO_BIN} execute`, {
      cwd: workDir,
      stdio: "pipe",
    }).toString();

    // Extract public signals from nargo output: [0x..., 0x...]
    const publicSignals: string[] = [];
    const outputMatch = nargoOutput.match(/Circuit output: \[(.*)\]/);
    if (outputMatch && outputMatch[1]) {
      const tokens = outputMatch[1].split(",").map(s => s.trim());
      for (const token of tokens) {
        // Ensure 0x prefix
        publicSignals.push(token.startsWith("0x") ? token : "0x" + token);
      }
    } else {
      // Fallback to legacy Field(...) parsing if output format differs
      const fieldMatch = nargoOutput.matchAll(/Field\(([^)]+)\)/g);
      const STARK_FIELD_PRIME = BigInt("0x0800000000000011000000000000000000000000000000000000000000000001");
      for (const match of fieldMatch) {
        const val = match[1];
        const felt = (BigInt(val) + (val.startsWith("-") ? STARK_FIELD_PRIME : 0n)) % STARK_FIELD_PRIME;
        publicSignals.push("0x" + felt.toString(16));
      }
    }

    const witnessPath = path.join(localTarget, "satkey_auth.gz");
    const jsonPath = path.join(localTarget, "satkey_auth.json");
    
    // Generate proof and write VK
    execSync(
      `${BB_BIN} prove -s ultra_honk --oracle_hash keccak -b ${jsonPath} -w ${witnessPath} -o ${workDir} --write_vk`,
      { cwd: workDir, stdio: "pipe" }
    );

    const proofFile = path.join(workDir, "proof");
    const vkFile = path.join(workDir, "vk");
    const publicInputsFile = path.join(workDir, "public_inputs");

    // Generate FullProof calldata via garaga
    const calldataStr = execSync(
      `garaga calldata --system ultra_keccak_zk_honk --vk ${vkFile} --proof ${proofFile} --public-inputs ${publicInputsFile} --format starkli`,
      { encoding: "utf8" }
    );

    const tokens = calldataStr.trim().split(/\s+/);
    const fullProof = tokens.slice(1).map(t => "0x" + BigInt(t).toString(16));

    return {
      fullProof,
      publicSignals,
    };
  } catch (err) {
    console.error("[prover] generateProof failed:", err);
    throw err;
  }
}
