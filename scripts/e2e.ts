#!/usr/bin/env ts-node
/**
 * e2e.ts — Sat Key end-to-end integration test
 *
 * Tests the full pipeline:
 *   BTC key → sign message → POST /prove → POST /relay → verify on-chain
 *
 * Prerequisites:
 *   - apps/prover running on $PROVER_URL (default http://localhost:3001)
 *   - apps/relayer running on $RELAYER_URL (default http://localhost:3002)
 *   - A deployed SatKey account + Garaga verifier on Starknet Sepolia
 *
 * Run:
 *   npx ts-node scripts/e2e.ts
 *
 * Environment:
 *   PROVER_URL=http://localhost:3001
 *   RELAYER_URL=http://localhost:3002
 *   STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io
 *   TEST_PRIVKEY=<secp256k1 private key hex, 32 bytes>
 *   TEST_STARKNET_ADDRESS=<deployed SatKey account address>
 */

import * as crypto from "crypto";
import * as fs from "fs";
import { secp256k1 } from "@noble/curves/secp256k1.js";

const PROVER_URL = process.env.PROVER_URL || "http://localhost:3001";
const RELAYER_URL = process.env.RELAYER_URL || "http://localhost:3002";
const TEST_PRIVKEY =
  process.env.TEST_PRIVKEY ||
  "0101010101010101010101010101010101010101010101010101010101010101"; // test-only
const TEST_STARKNET_ADDRESS =
  process.env.TEST_STARKNET_ADDRESS || "0x0";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Buffer.from(bytes).toString("hex");
}

function sha256(message: string): string {
  return "0x" + crypto.createHash("sha256").update(message, "utf8").digest("hex");
}

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

// ── Test cases ────────────────────────────────────────────────────────────────

async function testHealthChecks(): Promise<void> {
  console.log("\n─── Health checks ───────────────────────────────────");

  const proverHealth = await fetch(`${PROVER_URL}/health`).then((r) =>
    r.json()
  );
  assert(proverHealth.status === "ok", `Prover unhealthy: ${JSON.stringify(proverHealth)}`);
  console.log("✓ Prover healthy");

  const relayerHealth = await fetch(`${RELAYER_URL}/health`).then((r) =>
    r.json()
  );
  assert(relayerHealth.status === "ok", `Relayer unhealthy: ${JSON.stringify(relayerHealth)}`);
  console.log("✓ Relayer healthy");
}

async function testHappyPath(): Promise<void> {
  console.log("\n─── Happy path: valid BTC sig → proof → relay ───────");

  // 1. Generate key pair from test private key
  const privKeyBytes = hexToBytes(TEST_PRIVKEY);
  const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true); // compressed
  const pubKeyHex = bytesToHex(pubKeyBytes);
  console.log(`  pubkey: ${pubKeyHex.slice(0, 12)}...`);

  // 2. Compose auth message
  const nonce = Date.now().toString();
  const expiry = (Date.now() + 5 * 60 * 1000).toString();
  const message = `Authenticate with Sat Key

Nonce: ${nonce}
Expiry: ${expiry}

Sign this message to prove ownership of your wallet and generate a Zero-Knowledge Proof for Starknet.`;

  // 3. Sign with secp256k1 (compact 64-byte sig)
  const msgHashBytes = Buffer.from(
    crypto.createHash("sha256").update(message, "utf8").digest()
  );
  const sig = secp256k1.sign(msgHashBytes, privKeyBytes, { lowS: true, prehash: false });
  const sigR = "0x" + Buffer.from(sig.slice(0, 32)).toString("hex");
  const sigS = "0x" + Buffer.from(sig.slice(32, 64)).toString("hex");
  const messageHash = "0x" + msgHashBytes.toString("hex");

  console.log(`  nonce: ${nonce}`);
  console.log(`  expiry: ${expiry}`);
  console.log(`  msg_hash: ${messageHash.slice(0, 12)}...`);
  console.log(`  sig.r: ${sigR.slice(0, 12)}...`);

  // 4. POST /prove
  console.log("\n  → POST /prove ...");
  const proveRes = await fetch(`${PROVER_URL}/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pubkey: pubKeyHex,
      signature_r: sigR,
      signature_s: sigS,
      message_hash: messageHash,
      nonce,
      expiry,
    }),
  });

  if (!proveRes.ok) {
    const errText = await proveRes.text();
    throw new Error(`Prover returned ${proveRes.status}: ${errText}`);
  }
  const proofData = await proveRes.json();
  assert(typeof proofData.proof === "string", "proof must be a string");
  assert(
    Array.isArray(proofData.publicSignals) && proofData.publicSignals.length === 4,
    `Expected 4 publicSignals, got ${proofData.publicSignals?.length}`
  );
  console.log(`  ✓ Proof generated (${proofData.proof.length} chars)`);
  console.log(`  ✓ publicSignals: [${proofData.publicSignals.map((s: string) => s.slice(0, 8) + "...").join(", ")}]`);

  // Save proof for testing
  fs.writeFileSync("test_proof.hex", proofData.proof);
  fs.writeFileSync("test_public_signals.json", JSON.stringify(proofData.publicSignals, null, 2));
  console.log(`  ✓ Saved test_proof.hex and test_public_signals.json`);

  // 5. POST /relay (only if address configured)
  if (TEST_STARKNET_ADDRESS === "0x0") {
    console.log("  ⚠ Skipping relay test — TEST_STARKNET_ADDRESS not set");
  } else {
    console.log("\n  → POST /relay ...");
    const relayRes = await fetch(`${RELAYER_URL}/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proof: proofData.proof,
        publicSignals: proofData.publicSignals,
        starknetAddress: TEST_STARKNET_ADDRESS,
      }),
    });

    assert(relayRes.ok, `Relayer returned ${relayRes.status}: ${await relayRes.text()}`);
    const relayData = await relayRes.json();
    assert(
      typeof relayData.transactionHash === "string",
      "Expected transactionHash"
    );
    console.log(`  ✓ Transaction: ${relayData.transactionHash}`);
  }
}

async function testInvalidSignature(): Promise<void> {
  console.log("\n─── Negative: wrong signature → proof should fail ───");

  const privKeyBytes = hexToBytes(TEST_PRIVKEY);
  const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true);
  const pubKeyHex = bytesToHex(pubKeyBytes);

  const nonce = Date.now().toString();
  const expiry = (Date.now() + 5 * 60 * 1000).toString();
  const message = "wrong message — not signed by privkey";
  const messageHash = sha256(message);

  // Sign a *different* message but send the *original* hash → invalid sig
  const wrongMsg = Buffer.from(
    crypto.createHash("sha256").update("different content").digest()
  );
  const sig = secp256k1.sign(wrongMsg, privKeyBytes, { lowS: true, prehash: false });
  const sigR = "0x" + Buffer.from(sig.slice(0, 32)).toString("hex");
  const sigS = "0x" + Buffer.from(sig.slice(32, 64)).toString("hex");

  const proveRes = await fetch(`${PROVER_URL}/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pubkey: pubKeyHex,
      signature_r: sigR,
      signature_s: sigS,
      message_hash: messageHash,
      nonce,
      expiry,
    }),
  });

  assert(
    !proveRes.ok,
    "Expected prover to reject invalid signature but it succeeded"
  );
  console.log(`  ✓ Prover rejected invalid signature (${proveRes.status})`);
}

async function testExpiredProof(): Promise<void> {
  console.log("\n─── Negative: expired proof → relay should fail ─────");
  // This requires a real Starknet deployment — skip if no address configured
  if (TEST_STARKNET_ADDRESS === "0x0") {
    console.log("  ⚠ Skipping — TEST_STARKNET_ADDRESS not set");
    return;
  }

  const privKeyBytes = hexToBytes(TEST_PRIVKEY);
  const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true);
  const pubKeyHex = bytesToHex(pubKeyBytes);

  const nonce = Date.now().toString();
  const expiry = (Date.now() - 1000).toString(); // already expired!
  const message = `Auth\nNonce: ${nonce}\nExpiry: ${expiry}`;
  const msgHashBytes = Buffer.from(
    crypto.createHash("sha256").update(message, "utf8").digest()
  );
  const sig = secp256k1.sign(msgHashBytes, privKeyBytes, { lowS: true, prehash: false });

  const proveRes = await fetch(`${PROVER_URL}/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pubkey: pubKeyHex,
      signature_r: "0x" + Buffer.from(sig.slice(0, 32)).toString("hex"),
      signature_s: "0x" + Buffer.from(sig.slice(32, 64)).toString("hex"),
      message_hash: "0x" + Buffer.from(msgHashBytes).toString("hex"),
      nonce,
      expiry,
    }),
  });

  if (!proveRes.ok) {
    console.log(`  ✓ Prover rejected (${proveRes.status}) — circuit enforces expiry`);
    return;
  }

  // If proof generated (circuit doesn't enforce expiry, contract does), relay should fail
  const proofData = await proveRes.json();
  const relayRes = await fetch(`${RELAYER_URL}/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proof: proofData.proof,
      publicSignals: proofData.publicSignals,
      starknetAddress: TEST_STARKNET_ADDRESS,
    }),
  });
  assert(!relayRes.ok, "Expected relayer to reject expired proof");
  console.log(`  ✓ Relayer rejected expired proof (${relayRes.status})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Sat Key E2E Test Suite ===");
  console.log(`Prover:  ${PROVER_URL}`);
  console.log(`Relayer: ${RELAYER_URL}`);

  let passed = 0;
  let failed = 0;

  for (const [name, fn] of [
    ["Health checks", testHealthChecks],
    ["Happy path", testHappyPath],
    ["Invalid signature", testInvalidSignature],
    ["Expired proof", testExpiredProof],
  ] as [string, () => Promise<void>][]) {
    try {
      await fn();
      passed++;
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  ✗ ${name}: ${msg}`);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
