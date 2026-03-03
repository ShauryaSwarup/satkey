/**
 * server.ts — Sat Key Prover Service
 *
 * POST /prove
 *   Body: { pubkey, signature_r, signature_s, message_hash, nonce, expiry }
 *   Returns: { proof: string, publicSignals: string[] }
 *
 * Synchronous: no queue, no job IDs — proves in-process and returns result.
 */

import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import "dotenv/config";
import { hash as starkHash, num } from "starknet";
import { buildPoseidon } from "circomlibjs";

import { buildProverToml, ProveRequest } from "./witness";
import { generateProof } from "./proof";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

/**
 * Resolve CIRCUIT_DIR — must point to the directory containing Nargo.toml.
 *
 * CIRCUIT_ARTIFACT_PATH typically points into target/ (e.g. .../target/satkey_auth.json).
 * We walk up from dirname(CIRCUIT_ARTIFACT_PATH) until we find Nargo.toml,
 * falling back to the default relative path from __dirname.
 */
function resolveCircuitDir(): string {
  if (process.env.CIRCUIT_ARTIFACT_PATH) {
    let dir = path.resolve(path.dirname(process.env.CIRCUIT_ARTIFACT_PATH));
    // Walk up until we find Nargo.toml (max 3 levels to avoid infinite walk)
    for (let i = 0; i < 3; i++) {
      if (fs.existsSync(path.join(dir, "Nargo.toml"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break; // filesystem root
      dir = parent;
    }
    // If we found nothing, use the dirname as-is (original behavior)
    return path.resolve(path.dirname(process.env.CIRCUIT_ARTIFACT_PATH));
  }
  return path.resolve(path.join(__dirname, "../../../circuits/satkey_auth"));
}

const CIRCUIT_DIR = resolveCircuitDir();
const poseidonPromise = buildPoseidon();

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "satkey-prover" });
});

// ── POST /prove ───────────────────────────────────────────────────────────────
app.post("/prove", async (req, res) => {
  const body = req.body as Partial<ProveRequest>;

  // Validate required fields
  const required: (keyof ProveRequest)[] = [
    "pubkey",
    "signature_r",
    "signature_s",
    "message_hash",
    "nonce",
    "expiry",
  ];
  for (const field of required) {
    if (!body[field]) {
      res.status(400).json({ error: `Missing required field: ${field}` });
      return;
    }
  }

  // Create a temp working directory for this proof run
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "satkey-prove-"));

  try {
    // 1. Build Prover.toml
    const tomlContent = buildProverToml(body as ProveRequest);
    fs.writeFileSync(path.join(workDir, "Prover.toml"), tomlContent, "utf8");

    // 2. Run nargo execute + bb prove
    const result = await generateProof(workDir, CIRCUIT_DIR);

    // 3. Predict Starknet address from pubkey using BN254 Poseidon (matches Noir circuit)
    //    Then reduce mod STARK_FIELD_PRIME to fit in felt252 (matches account contract)
    const STARK_FIELD_PRIME = BigInt("0x0800000000000011000000000000000000000000000000000000000000000001");
    const DOMAIN_TAG = BigInt("0x5341544b4559"); // "SATKEY" ASCII

    // Decompress pubkey to get x, y coordinates
    const pubkeyClean = (body.pubkey as string).replace(/^0x/i, "").toLowerCase();
    let px: bigint, py: bigint;
    if (pubkeyClean.length === 130 && pubkeyClean.startsWith("04")) {
      px = BigInt("0x" + pubkeyClean.slice(2, 66));
      py = BigInt("0x" + pubkeyClean.slice(66, 130));
    } else if (pubkeyClean.length === 66) {
      const prefix = pubkeyClean.slice(0, 2);
      const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
      const x = BigInt("0x" + pubkeyClean.slice(2));
      const y2 = (x ** 3n + 7n) % P;
      let y = modPow(y2, (P + 1n) / 4n, P);
      if ((y & 1n) !== (prefix === "03" ? 1n : 0n)) y = P - y;
      px = x;
      py = y;
    } else {
      throw new Error(`Invalid pubkey length: ${pubkeyClean.length}`);
    }

    // BN254 Poseidon hash — matches Noir circuit's poseidon::bn254::hash_3
    const poseidon = await poseidonPromise;
    const Fr = poseidon.F;
    const hash = poseidon([Fr.e(px), Fr.e(py), Fr.e(DOMAIN_TAG)]);
    const bn254Salt = poseidon.F.toObject(hash) as bigint;
    const salt = bn254Salt % STARK_FIELD_PRIME;

    const classHash = process.env.SATKEY_CLASS_HASH || "0x0";
    const verifierAddress = process.env.VERIFIER_ADDRESS || "0x0";
    const constructorCalldata = [verifierAddress, num.toHex(salt)];
    const accountAddress = starkHash.calculateContractAddressFromHash(
      num.toHex(salt),
      classHash,
      constructorCalldata,
      0,
    );

    res.json({
      ...result,
      accountAddress: num.toHex(accountAddress),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[prover] Error:", message);
    res.status(500).json({ error: message });
  } finally {
    // Clean up temp dir
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

app.listen(PORT, () => {
  console.log(`[prover] Listening on http://localhost:${PORT}`);
  console.log(`[prover] Circuit dir: ${CIRCUIT_DIR}`);
});

export default app;
