#!/usr/bin/env ts-node
/**
 * e2e-wallet.ts — Sat Key prover test using Bitcoin Signed Message hashing
 *
 * Tests the prover pipeline using wallet-style message hashing:
 *   SHA256(SHA256("\x18Bitcoin Signed Message:\n" + varint(len) + msg))
 *
 * Prerequisites:
 *   - apps/prover running on $PROVER_URL (default http://localhost:3001)
 *
 * Run:
 *   npx ts-node scripts/e2e-wallet.ts
 *
 * Environment:
 *   PROVER_URL=http://localhost:3001
 *   TEST_PRIVKEY=<secp256k1 private key hex, 32 bytes>
 */

import * as crypto from "crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";

const PROVER_URL = process.env.PROVER_URL || "http://localhost:3001";
const TEST_PRIVKEY =
  process.env.TEST_PRIVKEY ||
  "0101010101010101010101010101010101010101010101010101010101010101"; // test-only

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Buffer.from(bytes).toString("hex");
}

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

function encodeVarint(n: number): Uint8Array {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf[0] = 0xfd;
    buf.writeUInt16LE(n, 1);
    return buf;
  }
  // Messages won't be > 65535 bytes, so this is enough
  throw new Error("Message too long");
}

function bitcoinMessageHash(message: string): Uint8Array {
  const prefix = "\x18Bitcoin Signed Message:\n";
  const prefixBuf = Buffer.from(prefix, "utf8");
  const messageBuf = Buffer.from(message, "utf8");
  const varint = encodeVarint(messageBuf.length);
  const fullMsg = Buffer.concat([prefixBuf, varint, messageBuf]);
  const hash1 = crypto.createHash("sha256").update(fullMsg).digest();
  const hash2 = crypto.createHash("sha256").update(hash1).digest();
  return hash2;
}

// ── Test cases ────────────────────────────────────────────────────────────────

async function testHealthChecks(): Promise<void> {
  console.log("\n─── Health checks ───────────────────────────────────");

  const proverHealth = await fetch(`${PROVER_URL}/health`).then((r) =>
    r.json()
  );
  assert(proverHealth.status === "ok", `Prover unhealthy: ${JSON.stringify(proverHealth)}`);
  console.log("✓ Prover healthy");
}

async function testHappyPath(): Promise<void> {
  console.log("\n─── Happy path: wallet hash → proof ─────────────────");

  // 1. Generate key pair from test private key
  const privKeyBytes = hexToBytes(TEST_PRIVKEY);
  const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true); // compressed
  const pubKeyHex = bytesToHex(pubKeyBytes);
  console.log(`  pubkey: ${pubKeyHex.slice(0, 12)}...`);

  // 2. Compose auth message
  const nonce = Date.now().toString();
  const expiry = (Date.now() + 5 * 60 * 1000).toString();
  const message = `Authenticate with Sat Key\n\nNonce: ${nonce}\nExpiry: ${expiry}\n\nSign this message to prove ownership of your wallet and generate a Zero-Knowledge Proof for Starknet.`;

  // 3. Bitcoin Signed Message hash + sign
  const msgHashBytes = bitcoinMessageHash(message);
  const sig = secp256k1.sign(msgHashBytes, privKeyBytes, { lowS: true, prehash: false });
  const sigR = "0x" + Buffer.from(sig.slice(0, 32)).toString("hex");
  const sigS = "0x" + Buffer.from(sig.slice(32, 64)).toString("hex");
  const messageHash = "0x" + Buffer.from(msgHashBytes).toString("hex");

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
}

async function testWrongHash(): Promise<void> {
  console.log("\n─── Negative: wrong hash → proof should fail ───────");

  const privKeyBytes = hexToBytes(TEST_PRIVKEY);
  const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true);
  const pubKeyHex = bytesToHex(pubKeyBytes);

  const nonce = Date.now().toString();
  const expiry = (Date.now() + 5 * 60 * 1000).toString();
  const message = `Authenticate with Sat Key\n\nNonce: ${nonce}\nExpiry: ${expiry}\n\nSign this message to prove ownership of your wallet and generate a Zero-Knowledge Proof for Starknet.`;

  const msgHashBytes = bitcoinMessageHash(message);
  const sig = secp256k1.sign(msgHashBytes, privKeyBytes, { lowS: true, prehash: false });
  const sigR = "0x" + Buffer.from(sig.slice(0, 32)).toString("hex");
  const sigS = "0x" + Buffer.from(sig.slice(32, 64)).toString("hex");

  const wrongHashBytes = bitcoinMessageHash(message + " (tampered)");
  const wrongHash = "0x" + Buffer.from(wrongHashBytes).toString("hex");

  const proveRes = await fetch(`${PROVER_URL}/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pubkey: pubKeyHex,
      signature_r: sigR,
      signature_s: sigS,
      message_hash: wrongHash,
      nonce,
      expiry,
    }),
  });

  assert(
    !proveRes.ok,
    "Expected prover to reject wrong hash with valid signature but it succeeded"
  );
  console.log(`  ✓ Prover rejected wrong hash (${proveRes.status})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Sat Key E2E Wallet Hash Test Suite ===");
  console.log(`Prover:  ${PROVER_URL}`);

  let passed = 0;
  let failed = 0;

  for (const [name, fn] of [
    ["Health checks", testHealthChecks],
    ["Happy path", testHappyPath],
    ["Wrong hash", testWrongHash],
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
