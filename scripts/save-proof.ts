#!/usr/bin/env ts-node
/**
 * Simple script to generate proof and save for garaga calldata testing
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import * as crypto from "crypto";
import * as fs from "fs";

const PROVER_URL = process.env.PROVER_URL || "http://localhost:3001";

// Simple test key
const TEST_PRIVKEY = "0101010101010101010101010101010101010101010101010101010101010101";

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Buffer.from(bytes).toString("hex");
}

// Compute Bitcoin Signed Message hash
function computeBitcoinSignedMessageHash(message: string): Buffer {
  const MAGIC_BYTES = "\x18Bitcoin Signed Message:\n";
  const messageBytes = Buffer.from(message, "utf8");
  
  let varint: Buffer;
  const len = messageBytes.length;
  if (len < 0xfd) {
    varint = Buffer.from([len]);
  } else if (len <= 0xffff) {
    varint = Buffer.from([0xfd, len & 0xff, (len >> 8) & 0xff]);
  } else {
    throw new Error("Message too long");
  }

  const payload = Buffer.concat([
    Buffer.from(MAGIC_BYTES, "utf8"),
    varint,
    messageBytes
  ]);

  return crypto.createHash("sha256").update(crypto.createHash("sha256").update(payload).digest()).digest();
}

async function run() {
  const privKeyBytes = hexToBytes(TEST_PRIVKEY);
  const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true);
  const pubKeyHex = bytesToHex(pubKeyBytes);

  const nonce = Date.now().toString();
  const expiry = (Date.now() + 5 * 60 * 1000).toString();
  const message = `Authenticate with Sat Key

Nonce: ${nonce}
Expiry: ${expiry}

Sign this message to prove ownership of your wallet and generate a Zero-Knowledge Proof for Starknet.`;

  const msgHashBytes = computeBitcoinSignedMessageHash(message);
  const sig = secp256k1.sign(msgHashBytes, privKeyBytes, { lowS: true, prehash: false });
  
  const sigR = "0x" + Buffer.from(sig.slice(0, 32)).toString("hex");
  const sigS = "0x" + Buffer.from(sig.slice(32, 64)).toString("hex");
  const messageHash = "0x" + msgHashBytes.toString("hex");

  console.log("Sending to prover...");
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
    throw new Error(`Prover failed: ${await proveRes.text()}`);
  }

  const proofData = await proveRes.json();
  
  console.log("Proof length:", proofData.proof.length);
  console.log("Public signals:", proofData.publicSignals);
  
  // Save proof as hex string in a file
  fs.writeFileSync("test_proof.hex", proofData.proof);
  
  // Save public signals as JSON
  fs.writeFileSync("test_public_signals.json", JSON.stringify(proofData.publicSignals, null, 2));
  
  console.log("Saved test_proof.hex and test_public_signals.json");
}

run().catch(console.error);
