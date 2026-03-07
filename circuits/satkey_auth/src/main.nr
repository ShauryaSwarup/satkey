// src/main.nr
use dep::poseidon;

/**
 * SATKEY Stateless ZK Login Circuit (Poseidon)
 *
 * Public inputs:
 *   pubkey_x
 *   pubkey_y
 *   nonce
 *   expiry
 *
 * Public outputs:
 *   [salt, commitment]
 */

global DOMAIN_TAG: Field = 0x5341544b4559; // "SATKEY"

fn bytes32_to_fields(bytes: [u8;32]) -> [Field; 2] {
    // split 32 bytes into two 16-byte chunks for hashing
    let mut hi: Field = 0;
    let mut lo: Field = 0;
    for i in 0..16 {
        hi = hi * 256 + (bytes[i] as Field);
    }
    for i in 16..32 {
        lo = lo * 256 + (bytes[i] as Field);
    }
    [hi, lo]
}

fn main(
    pubkey_x: pub [u8;32],
    pubkey_y: pub [u8;32],
    nonce:    pub Field,
    expiry:   pub Field
) -> pub [Field; 2] {

    // split pubkey into field parts
    let px = bytes32_to_fields(pubkey_x);
    let py = bytes32_to_fields(pubkey_y);

    // Poseidon hash for salt
    let salt = poseidon::poseidon::bn254::hash_5([px[0], px[1], py[0], py[1], DOMAIN_TAG]);

    // Poseidon hash for session commitment
    let commitment = poseidon::poseidon::bn254::hash_4([salt, nonce, expiry, salt]); // salt twice to mix

    [salt, commitment]
}