/**
 * Starknet Address Derivation Utilities
 *
 * Computes deterministic Starknet address from BTC public key using:
 * - BN254 Poseidon hash (circomlibjs) for salt derivation — matches Noir circuit exactly
 * - Salt is reduced mod STARK_FIELD_PRIME for use as a felt252 on Starknet
 * - starknet.js hash.calculateContractAddressFromHash for address derivation
 */

import { buildPoseidon } from "circomlibjs";
import { hash as starkHash, num } from "starknet";

// Domain separation tag: "SATKEY" as bigint — matches Noir circuit's DOMAIN_TAG
export const DOMAIN_TAG = BigInt("0x5341544b4559"); // "SATKEY" ASCII bytes big-endian

// Starknet field prime
export const STARK_FIELD_PRIME = BigInt(
  "0x0800000000000011000000000000000000000000000000000000000000000001"
);

// Cached BN254 Poseidon instance (initialized once)
let _poseidon: Awaited<ReturnType<typeof buildPoseidon>> | null = null;
async function getPoseidon() {
  if (!_poseidon) {
    _poseidon = await buildPoseidon();
  }
  return _poseidon;
}

/** Convert Uint8Array to bigint (big-endian) */
function uint8ArrayToBigInt(arr: Uint8Array): bigint {
  let result = 0n;
  for (const byte of arr) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/** Modular exponentiation */
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

/**
 * Decompress a 33-byte compressed secp256k1 public key into x, y coordinates.
 * Also handles 65-byte uncompressed (04-prefixed) keys.
 */
function decompressPubkey(pubkeyHex: string): { x: bigint; y: bigint } {
  const clean = pubkeyHex.startsWith("0x") ? pubkeyHex.slice(2) : pubkeyHex;

  // Uncompressed: 04 + 32-byte x + 32-byte y
  if (clean.length === 130 && clean.startsWith("04")) {
    return {
      x: BigInt("0x" + clean.slice(2, 66)),
      y: BigInt("0x" + clean.slice(66, 130)),
    };
  }

  if (clean.length !== 66) {
    throw new Error(
      `Invalid pubkey hex length ${clean.length}. Expected 66 (compressed) or 130 (uncompressed).`
    );
  }

  const prefix = clean.slice(0, 2);
  if (prefix !== "02" && prefix !== "03") {
    throw new Error(`Invalid compressed pubkey prefix: ${prefix}`);
  }

  // secp256k1: y² = x³ + 7 (mod P)
  const P =
    0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const x = BigInt("0x" + clean.slice(2));
  const y2 = (x ** 3n + 7n) % P;
  // Since P ≡ 3 (mod 4): sqrt = y2^((P+1)/4) mod P
  let y = modPow(y2, (P + 1n) / 4n, P);

  // Adjust parity to match prefix
  const isOdd = prefix === "03";
  if ((y & 1n) !== (isOdd ? 1n : 0n)) {
    y = P - y;
  }

  return { x, y };
}

/**
 * Derives a deterministic Starknet salt from a BTC public key using BN254 Poseidon hash.
 *
 * This matches the Noir circuit exactly:
 *   salt = poseidon::bn254::hash_3([bytes32_to_field(pubkey_x), bytes32_to_field(pubkey_y), DOMAIN_TAG])
 *
 * The BN254 Poseidon output is then reduced mod STARK_FIELD_PRIME so it fits in a felt252.
 * The account contract performs the same reduction on the verifier's output.
 *
 * @param pubkeyHex - Compressed (33-byte) or uncompressed (65-byte) secp256k1 pubkey hex
 * @returns salt as bigint (reduced mod STARK_FIELD_PRIME)
 */
export async function deriveStarknetSalt(pubkeyHex: string): Promise<bigint> {
  const { x, y } = decompressPubkey(pubkeyHex);

  const poseidon = await getPoseidon();
  const hash = poseidon([x, y, DOMAIN_TAG]);
  const bn254Salt = poseidon.F.toObject(hash) as bigint;

  // Reduce mod Stark prime so it fits in felt252 (matches account contract logic)
  return bn254Salt % STARK_FIELD_PRIME;
}

/**
 * Derives the expected Starknet account address from salt, classHash, and constructor calldata.
 *
 * @param salt - The Poseidon-derived salt (bigint)
 * @param classHash - The deployed SatKey account class hash (0x-prefixed hex)
 * @param constructorCalldata - Array of felt252 values as 0x-prefixed hex strings
 * @returns The derived Starknet address as 0x-prefixed hex string
 */
export function deriveExpectedAccountAddress(
  salt: bigint,
  classHash: string,
  constructorCalldata: string[] = []
): string {
  const address = starkHash.calculateContractAddressFromHash(
    num.toHex(salt),
    classHash,
    constructorCalldata,
    0
  );
  return num.toHex(address);
}

/**
 * Validates if a string is a valid Starknet address
 */
export function isValidStarknetAddress(address: string): boolean {
  if (!address.startsWith("0x")) return false;
  if (address.length > 66) return false;
  return /^0x[0-9a-fA-F]+$/.test(address);
}

/**
 * Formats a Starknet address for display (truncated)
 */
export function formatStarknetAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Network configuration for Starknet
 */
export interface StarknetNetwork {
  name: string;
  chainId: string;
  rpcUrl: string;
}

export const STARKNET_NETWORKS: Record<string, StarknetNetwork> = {
  mainnet: {
    name: "Starknet Mainnet",
    chainId: "0x534e5f4d41494e4554", // SN_MAIN
    rpcUrl: "https://starknet-mainnet.public.blastapi.io",
  },
  sepolia: {
    name: "Starknet Sepolia",
    chainId: "0x534e5f5345504f4c4941", // SN_SEPOLIA
    rpcUrl: "https://starknet-sepolia.public.blastapi.io",
  },
};

/**
 * Get network config by name
 */
export function getStarknetNetwork(networkName: string): StarknetNetwork {
  return STARKNET_NETWORKS[networkName.toLowerCase()] || STARKNET_NETWORKS.sepolia;
}
