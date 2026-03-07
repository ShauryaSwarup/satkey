use dep::poseidon::poseidon::bn254;
use dep::std::ecdsa_secp256k1;

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
    pubkey_x: [u8; 32],
    pubkey_y: [u8; 32],
    sig_r: [u8; 32],
    sig_s: [u8; 32],
    // Public inputs
    message_hash: pub [u8; 32],
    nonce: pub Field,
    expiry: pub Field,
) -> pub [Field; 4] {
    let mut signature: [u8; 64] = [0; 64];
    for i in 0..32 {
        signature[i] = sig_r[i];
        signature[32 + i] = sig_s[i];
    }

    let is_valid = ecdsa_secp256k1::verify_signature(pubkey_x, pubkey_y, signature, message_hash);
    assert(is_valid, "Invalid secp256k1 ECDSA signature");

    let x_felt = bytes32_to_field(pubkey_x);
    let y_felt = bytes32_to_field(pubkey_y);

    let salt = bn254::hash_3([x_felt, y_felt, DOMAIN_TAG]);

    let message_hash_field = bytes32_to_field(message_hash);

    [salt, message_hash_field, nonce, expiry]
}
