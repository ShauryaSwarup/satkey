/**
 * server.ts — Sat Key Prover Service
 *
 * POST /prove
 *   Body: { pubkey, signature_r, signature_s, message_hash, nonce, expiry }
 *   Returns: { fullProof, publicSignals, accountAddress }
 *
 * publicSignals layout (matches Noir circuit return order):
 *   [0] salt               → Garaga public_inputs[34]
 *   [1] message_hash_field → Garaga public_inputs[35]
 *   [2] nonce              → Garaga public_inputs[36]
 *   [3] expiry             → Garaga public_inputs[37]
 */

import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import "dotenv/config";
import { hash as starkHash, num } from "starknet";

import { buildProverToml, ProveRequest } from "./witness";
import { generateProof } from "./proof";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

function resolveCircuitDir(): string {
  if (process.env.CIRCUIT_ARTIFACT_PATH) {
    let dir = path.resolve(path.dirname(process.env.CIRCUIT_ARTIFACT_PATH));
    for (let i = 0; i < 3; i++) {
      if (fs.existsSync(path.join(dir, "Nargo.toml"))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return path.resolve(path.dirname(process.env.CIRCUIT_ARTIFACT_PATH));
  }
  return path.resolve(path.join(__dirname, "../../../circuits/satkey_auth"));
}

const CIRCUIT_DIR = resolveCircuitDir();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "satkey-prover" });
});

// ── POST /prove ───────────────────────────────────────────────────────────────
app.post("/prove", async (req, res) => {
  const body = req.body as Partial<ProveRequest>;

  const required: (keyof ProveRequest)[] = [
    "pubkey", "signature_r", "signature_s", "message_hash", "nonce", "expiry",
  ];
  console.log("[prover] /prove request received with body:", body);
  for (const field of required) {
    if (!body[field]) {
      res.status(400).json({ error: `Missing required field: ${field}` });
      return;
    }
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "satkey-prove-"));

  try {
    // 1. Build Prover.toml and run nargo + bb
    fs.writeFileSync(
      path.join(workDir, "Prover.toml"),
      buildProverToml(body as ProveRequest),
      "utf8"
    );

    const result = await generateProof(workDir, CIRCUIT_DIR);

    // 2. Derive account address from publicSignals[0] (salt from circuit output).
    //    This is authoritative — it comes directly from the same Poseidon hash
    //    the circuit computed, so it will always match the on-chain check.
    //
    //    publicSignals[0] is already reduced mod stark_prime by proof.ts.
    //
    const STARK_FIELD_PRIME = BigInt(
      "0x0800000000000011000000000000000000000000000000000000000000000001"
    );

    const saltHex = result.publicSignals[0]; // return[0] from circuit = salt
    const salt = BigInt(saltHex) % STARK_FIELD_PRIME;

    // Sanity-log the full signal set for debugging
    console.log("[prover] signals — salt:", result.publicSignals[0],
      "| msg_hash_field:", result.publicSignals[1],
      "| nonce:", result.publicSignals[2],
      "| expiry:", result.publicSignals[3]);

    const classHash = process.env.SATKEY_CLASS_HASH || "0x0";
    const verifierClassHash = process.env.VERIFIER_CLASS_HASH || "0x0";

    // Constructor calldata must match the contract's constructor signature:
    //   constructor(verifier_class_hash: ClassHash, public_key_salt: felt252)
    const constructorCalldata = [verifierClassHash, num.toHex(salt)];

    const accountAddress = starkHash.calculateContractAddressFromHash(
      num.toHex(salt),       // salt used as deploy salt
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
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

app.listen(PORT, () => {
  console.log(`[prover] Listening on http://localhost:${PORT}`);
  console.log(`[prover] Circuit dir: ${CIRCUIT_DIR}`);
});

export default app;
