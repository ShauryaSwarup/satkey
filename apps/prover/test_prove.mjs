import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { secp256k1 } from "@noble/curves/secp256k1.js";

const CIRCUIT_DIR = "/Users/shaurya/Documents/satkey/circuits/satkey_auth";
const HOME = process.env.HOME || "~";
const NARGO = path.join(HOME, ".nargo/bin/nargo");
const BB = path.join(HOME, ".bb/bb");

// 1. Generate a valid key pair and signature
const privKey = "0101010101010101010101010101010101010101010101010101010101010101";
const privKeyBytes = Uint8Array.from(Buffer.from(privKey, "hex"));
const pubKeyUncompressed = secp256k1.getPublicKey(privKeyBytes, false);
const pubKeyHex = Buffer.from(pubKeyUncompressed).toString("hex");

console.log("Pubkey (uncompressed):", pubKeyHex.slice(0, 20) + "...");
console.log("Pubkey length:", pubKeyHex.length, "chars =", pubKeyHex.length / 2, "bytes");

const x = pubKeyHex.slice(2, 66);
const y = pubKeyHex.slice(66, 130);
console.log("x:", x);
console.log("y:", y);

// Validate on secp256k1 curve: y² = x³ + 7 (mod p)
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const xBig = BigInt("0x" + x);
const yBig = BigInt("0x" + y);
const lhs = (yBig * yBig) % P;
const rhs = (xBig ** 3n + 7n) % P;
console.log("On secp256k1 curve:", lhs === rhs ? "✅ YES" : "❌ NO");

// 2. Sign a message
const message = "Test message for proving";
const msgHash = crypto.createHash("sha256").update(message, "utf8").digest();
const sig = secp256k1.sign(msgHash, privKeyBytes, { lowS: true, prehash: false });

// In noble/curves v2, sign returns 64-byte compact signature
const sigHex = Buffer.from(sig).toString('hex');
const rHex = sigHex.slice(0, 64);
const sHex = sigHex.slice(64, 128);

console.log("\nmsgHash:", Buffer.from(msgHash).toString("hex"));
console.log("sig.r:", rHex.slice(0, 32), "...");
console.log("sig.s:", sHex.slice(0, 32), "...");

const isValid = secp256k1.verify(sig, msgHash, pubKeyUncompressed);
console.log("Signature valid (noble):", isValid ? "✅ YES" : "❌ NO");

// 3. Build Prover.toml
function toTomlArray(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return `[${bytes.join(", ")}]`;
}

const toml = [
  `pubkey_x = ${toTomlArray(x)}`,
  `pubkey_y = ${toTomlArray(y)}`,
  `sig_r = ${toTomlArray(rHex)}`,
  `sig_s = ${toTomlArray(sHex)}`,
  `message_hash = ${toTomlArray(Buffer.from(msgHash).toString("hex"))}`,
  `nonce = "0x1"`,
  `expiry = "0x2"`,
].join("\n");

console.log("\n--- Prover.toml ---");
console.log(toml);

// 4. Write Prover.toml to circuit dir
const proverTomlPath = path.join(CIRCUIT_DIR, "Prover.toml");
const origToml = fs.existsSync(proverTomlPath) ? fs.readFileSync(proverTomlPath, "utf8") : null;
fs.writeFileSync(proverTomlPath, toml);

try {
  // 5. nargo execute
  console.log("\n--- Running nargo execute ---");
  execSync(`${NARGO} execute`, { cwd: CIRCUIT_DIR, stdio: "inherit" });
  console.log("✅ nargo execute succeeded");

  // 6. bb prove_ultra_keccak_honk
  console.log("\n--- Running bb prove ---");
  const outDir = "/tmp";
  execSync(
    `${BB} prove -s ultra_honk --oracle_hash keccak -b ${path.join(CIRCUIT_DIR, "target", "satkey_auth.json")} -w ${path.join(CIRCUIT_DIR, "target", "satkey_auth.gz")} -o ${outDir} --write_vk -v`,
    { cwd: CIRCUIT_DIR, stdio: "inherit" }
  );
  console.log("✅ bb prove succeeded!");
  const proofFile = path.join(outDir, "proof");
  const vkFile = path.join(outDir, "vk");
  console.log("Proof file:", proofFile, ", size:", fs.statSync(proofFile).size, "bytes");
  
  console.log("\n--- Running garaga calldata ---");
  const publicInputsFile = path.join(outDir, "public_inputs");
  const calldataOut = execSync(
    `garaga calldata --system ultra_keccak_zk_honk --vk ${vkFile} --proof ${proofFile} --public-inputs ${publicInputsFile} --format starkli`,
    { encoding: "utf8" }
  );
  console.log("garaga calldata output:\n", calldataOut.slice(0, 500), "...");
  fs.writeFileSync("/tmp/garaga_calldata.txt", calldataOut);
} catch (err) {
  console.error("❌ FAILED:", err.message?.slice(0, 500));
} finally {
  if (origToml !== null) {
    fs.writeFileSync(proverTomlPath, origToml);
  }
}
