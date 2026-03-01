/**
 * @satkey/crypto — Shared cryptographic utilities
 *
 * Used by both the frontend and the prover service.
 * BIG-ENDIAN ONLY throughout.
 * felt = bigint % STARK_FIELD_PRIME
 */

// ── Constants ─────────────────────────────────────────────────────────────────
export const STARK_FIELD_PRIME = BigInt(
  "0x0800000000000011000000000000000000000000000000000000000000000001"
);

/** Domain tag: ASCII "SATKEY" big-endian = 0x5341544b4559 */
export const DOMAIN_TAG = BigInt("0x5341544b4559");

// ── Modular arithmetic ────────────────────────────────────────────────────────

/** Modular exponentiation (for secp256k1 sqrt) */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

// ── secp256k1 ─────────────────────────────────────────────────────────────────

/** secp256k1 field prime */
export const SECP256K1_P =
  0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

/**
 * Decompress a secp256k1 public key into (x, y) coordinates.
 * Accepts 33-byte compressed (02/03-prefix) or 65-byte uncompressed (04-prefix) hex.
 */
export function decompressPubkey(pubkeyHex: string): { x: bigint; y: bigint } {
  const clean = pubkeyHex.startsWith("0x") ? pubkeyHex.slice(2) : pubkeyHex;

  if (clean.length === 130 && clean.startsWith("04")) {
    return {
      x: BigInt("0x" + clean.slice(2, 66)),
      y: BigInt("0x" + clean.slice(66, 130)),
    };
  }

  if (clean.length !== 66) {
    throw new Error(
      `Invalid pubkey length ${clean.length}. Expected 66 (compressed) or 130 (uncompressed).`
    );
  }

  const prefix = clean.slice(0, 2);
  if (prefix !== "02" && prefix !== "03") {
    throw new Error(`Invalid compressed pubkey prefix: ${prefix}`);
  }

  const x = BigInt("0x" + clean.slice(2));
  const y2 = (x ** 3n + 7n) % SECP256K1_P;
  let y = modPow(y2, (SECP256K1_P + 1n) / 4n, SECP256K1_P);

  const isOdd = prefix === "03";
  if ((y & 1n) !== (isOdd ? 1n : 0n)) {
    y = SECP256K1_P - y;
  }

  return { x, y };
}

// ── Felt encoding ─────────────────────────────────────────────────────────────

/**
 * Convert a bigint to a 0x-prefixed hex felt252 string (% STARK_FIELD_PRIME).
 * BIG-ENDIAN.
 */
export function bigintToFelt(n: bigint): string {
  const felt = n % STARK_FIELD_PRIME;
  return "0x" + felt.toString(16);
}

/**
 * Convert a 32-byte big-endian byte array to a felt252 bigint.
 * Splits into two 16-byte halves to avoid overflow.
 */
export function bytes32ToFelt(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) {
    throw new Error(`bytes32ToFelt: expected 32 bytes, got ${bytes.length}`);
  }
  let hi = 0n;
  let lo = 0n;
  for (let i = 0; i < 16; i++) hi = hi * 256n + BigInt(bytes[i]);
  for (let i = 16; i < 32; i++) lo = lo * 256n + BigInt(bytes[i]);
  const two128 = BigInt("0x100000000000000000000000000000000");
  return (hi * two128 + lo) % STARK_FIELD_PRIME;
}

/**
 * Pack raw proof bytes (big-endian) into an array of felt252 hex strings.
 * Each 32-byte chunk becomes one felt (% STARK_FIELD_PRIME).
 */
export function proofBytesToFelts(proofHex: string): string[] {
  const hex = proofHex.startsWith("0x") ? proofHex.slice(2) : proofHex;
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
  const felts: string[] = [];
  for (let i = 0; i < padded.length; i += 64) {
    const chunk = padded.slice(i, i + 64);
    const n = BigInt("0x" + chunk);
    felts.push("0x" + (n % STARK_FIELD_PRIME).toString(16));
  }
  return felts;
}

/**
 * Build the full Starknet signature span from proof + public signals.
 * Layout: [proof_len, ...proof_felts, salt, msg_hash, nonce, expiry]
 */
export function buildSignatureSpan(
  proofHex: string,
  publicSignals: string[]
): string[] {
  const proofFelts = proofBytesToFelts(proofHex);
  return [
    "0x" + proofFelts.length.toString(16),
    ...proofFelts,
    ...publicSignals,
  ];
}
