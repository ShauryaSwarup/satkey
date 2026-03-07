import { hash as starkHash, num } from 'starknet';

/**
 * Validates if a string is a valid Starknet address
 */
export function isValidStarknetAddress(address: string): boolean {
  try {
    return /^0x[0-9a-fA-F]{63,64}$/.test(address);
  } catch {
    return false;
  }
}

/**
 * Formats a Starknet address for display (e.g. 0x1234...5678)
 */
export function formatStarknetAddress(address: string): string {
  if (!address || !isValidStarknetAddress(address)) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Derives a deterministic Starknet salt from a public key.
 * Now using BN254 Poseidon to match the Noir circuit!
 */
export async function deriveStarknetSalt(pubkeyHex: string): Promise<bigint> {
  const clean = pubkeyHex.startsWith("0x") ? pubkeyHex.slice(2) : pubkeyHex;
  let x: string, y: string;

  if (clean.length === 130 && clean.startsWith("04")) {
    x = clean.slice(2, 66);
    y = clean.slice(66, 130);
  } else if (clean.length === 66) {
    const prefix = clean.slice(0, 2);
    const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
    const px = BigInt("0x" + clean.slice(2));
    const y2 = (px ** 3n + 7n) % P;

    let py = y2;
    let exp = (P + 1n) / 4n;
    let result = 1n;
    let base = py % P;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % P;
      exp >>= 1n;
      base = (base * base) % P;
    }
    py = result;

    const isOdd = prefix === "03";
    if ((py & 1n) !== (isOdd ? 1n : 0n)) {
      py = P - py;
    }

    x = px.toString(16).padStart(64, "0");
    y = py.toString(16).padStart(64, "0");
  } else {
    throw new Error(`Invalid pubkey length: ${clean.length}`);
  }

  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const Fr = poseidon.F;
  
  const STARK_FIELD_PRIME = BigInt("0x0800000000000011000000000000000000000000000000000000000000000001");
  const DOMAIN_TAG = BigInt("0x5341544b4559"); // "SATKEY"

  const hash = poseidon([Fr.e(BigInt("0x" + x)), Fr.e(BigInt("0x" + y)), Fr.e(DOMAIN_TAG)]);
  const bn254Salt = poseidon.F.toObject(hash) as bigint;
  
  return bn254Salt % STARK_FIELD_PRIME;
}

/**
 * Calculates the expected Starknet address for a contract deployment
 */
export function deriveExpectedAccountAddress(
  salt: bigint,
  classHash: string,
  constructorCalldata: string[]
): string {
  const address = starkHash.calculateContractAddressFromHash(
    num.toHex(salt),
    classHash,
    constructorCalldata,
    0 // deployer address (0 for UDC default logic)
  );
  return num.toHex(address);
}
