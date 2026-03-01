/**
 * SATKEY Authentication Circuit
 *
 * Proves:
 *   1. The prover knows a secp256k1 private key whose public key is (pubkey_x, pubkey_y).
 *   2. That private key produced (sig_r, sig_s) over `message_hash`.
 *   3. Derives a deterministic Starknet salt from the pubkey via Poseidon.
 *
 * Private inputs (witness):  pubkey_x, pubkey_y, sig_r, sig_s
 * Public  inputs:             message_hash, nonce, expiry
 * Public  outputs:            [salt, message_hash_field, nonce, expiry]
 *
 * BIG-ENDIAN felt encoding:
 *   felt = sum of byte[i] * 256^(31-i)  for i in 0..31
 */

use dep::std::ecdsa_secp256k1;
use dep::poseidon;

// Domain separation tag: ASCII "SATKEY" big-endian = 0x5341544b4559
global DOMAIN_TAG: Field = 0x5341544b4559;

/// Pack a 32-byte big-endian array into a single Field element.
/// Split into two 16-byte halves to avoid accumulation overflow.
fn bytes32_to_field(bytes: [u8; 32]) -> Field {
    let mut hi: Field = 0;
    let mut lo: Field = 0;
    for i in 0..16 {
        hi = hi * 256 + (bytes[i] as Field);
    }
    for i in 16..32 {
        lo = lo * 256 + (bytes[i] as Field);
    }
    // 2^128 as a felt literal
    let two128: Field = 0x100000000000000000000000000000000;
    hi * two128 + lo
}

fn main(
    // Private inputs (witness) -- no pub prefix = private
    pubkey_x: [u8; 32],
    pubkey_y: [u8; 32],
    sig_r: [u8; 32],
    sig_s: [u8; 32],
    // Public inputs
    message_hash: pub [u8; 32],
    nonce: pub Field,
    expiry: pub Field,
) -> pub [Field; 4] {
    // Step 1: Verify secp256k1 ECDSA
    // Build 64-byte compact signature: r (32) || s (32)
    let mut signature: [u8; 64] = [0; 64];
    for i in 0..32 {
        signature[i] = sig_r[i];
        signature[32 + i] = sig_s[i];
    }

    let is_valid = ecdsa_secp256k1::verify_signature(
        pubkey_x,
        pubkey_y,
        signature,
        message_hash,
    );
    assert(is_valid, "Invalid secp256k1 ECDSA signature");

    // Step 2: Derive Starknet salt via Poseidon(x_felt, y_felt, DOMAIN_TAG)
    let x_felt = bytes32_to_field(pubkey_x);
    let y_felt = bytes32_to_field(pubkey_y);

    // poseidon::bn254::hash_3 takes [Field; 3] and returns Field
    let salt = poseidon::poseidon::bn254::hash_3([x_felt, y_felt, DOMAIN_TAG]);

    // Step 3: Encode message_hash as a single Field (big-endian, 32 bytes)
    let message_hash_field = bytes32_to_field(message_hash);

    // Return public signals: [salt, message_hash_field, nonce, expiry]
    // Matches prover service and Cairo verifier expectations.
    [salt, message_hash_field, nonce, expiry]
}
