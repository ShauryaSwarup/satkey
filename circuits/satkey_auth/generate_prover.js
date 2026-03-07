// generate_prover.js
import { buildPoseidon } from "circomlibjs";
import { writeFileSync } from "fs";

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Test secret — any non-zero field element
  const secret = BigInt(
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  );

  // pubkey_commitment = Poseidon(secret) — must match circuit assert
  const commitmentRaw = poseidon([secret]);
  const pubkey_commitment =
    "0x" + F.toString(commitmentRaw, 16).padStart(64, "0");

  // Test pubkey — any 32 bytes each (real values come from wallet later)
  const pubkey_x = Array(32)
    .fill(0)
    .map((_, i) => i + 1);
  const pubkey_y = Array(32)
    .fill(0)
    .map((_, i) => i + 33);

  // Nonce and expiry as hex fields
  const nonce =
    "0x0000000000000000000000000000000000000000000000000000000000000001";
  const expiry =
    "0x" + (Math.floor(Date.now() / 1000) + 900).toString(16).padStart(64, "0");

  const secretHex = "0x" + secret.toString(16).padStart(64, "0");

  const toml = `pubkey_x = [${pubkey_x.join(", ")}]
pubkey_y = [${pubkey_y.join(", ")}]
nonce = "${nonce}"
expiry = "${expiry}"
pubkey_commitment = "${pubkey_commitment}"
secret = "${secretHex}"
`;

  writeFileSync("Prover.toml", toml);
  console.log("Prover.toml written successfully");
  console.log("secret:            ", secretHex);
  console.log("pubkey_commitment: ", pubkey_commitment);
}

main();
