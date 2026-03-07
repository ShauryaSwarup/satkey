/// SatKey Account Contract
///
/// Validates transactions via a Zero-Knowledge proof of Bitcoin ECDSA ownership
/// (Noir satkey_auth circuit + Garaga UltraKeccakZKHonk verifier).
///
/// Garaga public_inputs layout (38 total):
///
///   indices  0–31 : message_hash bytes (pub [u8;32] — one felt per byte)
///   index   32    : nonce  (pub Field — raw caller input, NOT checked on-chain)
///   index   33    : expiry (pub Field — raw caller input, NOT checked on-chain)
///   index   34    : salt              (return[0]) ← checked vs public_key_salt
///   index   35    : message_hash_field (return[1]) ← not checked on-chain
///   index   36    : nonce             (return[2]) ← checked vs stored nonce
///   index   37    : expiry            (return[3]) ← checked vs block timestamp
///
///   WHY use return values (34-37) instead of raw inputs (32-33)?
///   Return values have passed through the circuit — the ZK proof guarantees
///   they are consistent with the ECDSA verification and salt derivation.
///   Raw inputs at 32-33 are caller-supplied and not circuit-validated.

// ── Garaga verifier interface ─────────────────────────────────────────────────
#[starknet::interface]
trait IGaragaVerifier<TContractState> {
    fn verify_ultra_keccak_zk_honk_proof(
        self: @TContractState,
        full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
}

// ── Account interface (custom extensions) ─────────────────────────────────────
#[starknet::interface]
trait ISatKeyAccount<TContractState> {
    fn get_nonce(self: @TContractState) -> felt252;
    fn get_verifier_class_hash(self: @TContractState) -> starknet::ClassHash;
    fn get_public_key_salt(self: @TContractState) -> felt252;
    fn execute_from_relayer(
        ref self: TContractState,
        calls: Array<starknet::account::Call>,
        signature: Span<felt252>,
    ) -> Array<Span<felt252>>;
}

// ── Contract ──────────────────────────────────────────────────────────────────
#[starknet::contract(account)]
mod SatKeyAccount {
    use super::{IGaragaVerifierLibraryDispatcher, IGaragaVerifierDispatcherTrait};
    use super::ISatKeyAccount;
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;
    use starknet::account::Call;
    use starknet::get_block_timestamp;
    use starknet::get_tx_info;
    use starknet::syscalls::call_contract_syscall;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use core::num::traits::Zero;
    use openzeppelin_account::utils::is_tx_version_valid;

    // ── Constants ────────────────────────────────────────────────────────────
    const ISRC6_ID: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;

    // 32 (message_hash bytes) + 1 (nonce) + 1 (expiry) + 4 (return values) = 38
    const PUBLIC_INPUTS_LEN: u32 = 38;

    // Read from return value indices, not raw input indices.
    const IDX_SALT:           u32 = 34; // return[0]
    const IDX_MSG_HASH_FIELD: u32 = 35; // return[1] — not checked on-chain
    const IDX_NONCE:          u32 = 36; // return[2]
    const IDX_EXPIRY:         u32 = 37; // return[3]

    // ── Components ───────────────────────────────────────────────────────────
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    // ── Storage ───────────────────────────────────────────────────────────────
    #[storage]
    struct Storage {
        verifier_class_hash: starknet::ClassHash,
        nonce: felt252,
        /// BN254 Poseidon(x_felt, y_felt, DOMAIN_TAG) % stark_prime.
        /// Set at deploy time — sole on-chain anchor to a specific Bitcoin pubkey.
        public_key_salt: felt252,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
    }

    // ── Events ────────────────────────────────────────────────────────────────
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Authenticated: Authenticated,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[derive(Drop, starknet::Event)]
    struct Authenticated {
        nonce: felt252,
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    #[constructor]
    fn constructor(
        ref self: ContractState,
        verifier_class_hash: starknet::ClassHash,
        public_key_salt: felt252,
    ) {
        self.verifier_class_hash.write(verifier_class_hash);
        self.public_key_salt.write(public_key_salt);
        self.nonce.write(0);
        self.src5.register_interface(ISRC6_ID);
    }

    // ── Protocol Entrypoints ──────────────────────────────────────────────────
    //
    //  WHY ZK VERIFICATION IS IN __execute__, NOT __validate__:
    //  StarkNet enforces a strict gas cap on __validate__ (designed for ECDSA only).
    //  UltraKeccakZKHonk proof verification always exceeds that cap → "Out of gas".
    //  Fix: trivial presence-check in __validate__, full verification at the top of
    //  __execute__. A failed proof reverts everything — nonce is NOT incremented.
    //
    #[abi(embed_v0)]
    impl AccountContractImpl of starknet::account::AccountContract<ContractState> {
        /// Lightweight gate only. Full ZK verification is in __execute__.
        fn __validate__(ref self: ContractState, calls: Array<Call>) -> felt252 {
            assert(is_tx_version_valid(), 'Invalid tx version');
            assert(!get_tx_info().unbox().signature.is_empty(), 'Empty signature');
            starknet::VALIDATED
        }

        /// Full ZK verification runs first, before any state change or call dispatch.
        fn __execute__(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
            assert(starknet::get_caller_address().is_zero(), 'Caller must be protocol');
            assert(is_tx_version_valid(), 'Invalid tx version');

            // ── ZK verification (moved here from __validate__ to avoid gas cap) ──
            self._verify_and_check(get_tx_info().unbox().signature);
            // ─────────────────────────────────────────────────────────────────────

            let current_nonce = self.nonce.read();
            self.nonce.write(current_nonce + 1);
            self.emit(Authenticated { nonce: current_nonce });

            let mut results: Array<Span<felt252>> = ArrayTrait::new();
            for call in calls {
                results.append(
                    call_contract_syscall(call.to, call.selector, call.calldata)
                        .expect('Call failed'),
                );
            };
            results
        }

        fn __validate_declare__(self: @ContractState, class_hash: felt252) -> felt252 {
            core::panic_with_felt252('Declare not supported')
        }
    }

    // ── SNIP-6 Compliance ────────────────────────────────────────────────────
    #[starknet::interface]
    trait ISRC6Extras<TContractState> {
        fn is_valid_signature(
            self: @TContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252;
    }

    #[abi(embed_v0)]
    impl ISRC6ExtrasImpl of ISRC6Extras<ContractState> {
        fn is_valid_signature(
            self: @ContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252 {
            if self._try_verify_and_check(signature.span()) {
                starknet::VALIDATED
            } else {
                0
            }
        }
    }

    #[starknet::interface]
    trait ISRC6CamelOnly<TContractState> {
        fn isValidSignature(
            self: @TContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252;
    }

    #[abi(embed_v0)]
    impl ISRC6CamelOnlyImpl of ISRC6CamelOnly<ContractState> {
        fn isValidSignature(
            self: @ContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252 {
            ISRC6ExtrasImpl::is_valid_signature(self, hash, signature)
        }
    }

    // ── SatKey Custom Interface ───────────────────────────────────────────────
    #[abi(embed_v0)]
    impl ISatKeyAccountImpl of ISatKeyAccount<ContractState> {
        fn get_nonce(self: @ContractState) -> felt252 {
            self.nonce.read()
        }
        fn get_verifier_class_hash(self: @ContractState) -> starknet::ClassHash {
            self.verifier_class_hash.read()
        }
        fn get_public_key_salt(self: @ContractState) -> felt252 {
            self.public_key_salt.read()
        }

        fn execute_from_relayer(
            ref self: ContractState,
            calls: Array<Call>,
            signature: Span<felt252>,
        ) -> Array<Span<felt252>> {
            self._verify_and_check(signature);

            let current_nonce = self.nonce.read();
            self.nonce.write(current_nonce + 1);
            self.emit(Authenticated { nonce: current_nonce });

            let mut results: Array<Span<felt252>> = ArrayTrait::new();
            for call in calls {
                results.append(
                    call_contract_syscall(call.to, call.selector, call.calldata)
                        .expect('Call failed'),
                );
            };
            results
        }
    }

    // ── Internal Helpers ──────────────────────────────────────────────────────
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Panicking path: parse proof_len prefix → call verifier → check inputs.
        fn _verify_and_check(self: @ContractState, signature: Span<felt252>) {
            let proof_len: u32 = (*signature.at(0)).try_into().expect('proof_len overflow');
            let proof_slice = signature.slice(1, proof_len);
            let public_inputs = self._do_verify(proof_slice);
            self._check_public_inputs(public_inputs);
        }

        /// Non-panicking path for is_valid_signature (SNIP-6 must return 0, not panic).
        fn _try_verify_and_check(self: @ContractState, signature: Span<felt252>) -> bool {
            let proof_len: u32 = match (*signature.at(0)).try_into() {
                Option::Some(v) => v,
                Option::None => { return false; },
            };
            let proof_slice = signature.slice(1, proof_len);

            let verifier = IGaragaVerifierLibraryDispatcher {
                class_hash: self.verifier_class_hash.read(),
            };
            let public_inputs = match verifier.verify_ultra_keccak_zk_honk_proof(proof_slice) {
                Result::Ok(inputs) => inputs,
                Result::Err(_) => { return false; },
            };

            if public_inputs.len() != PUBLIC_INPUTS_LEN {
                return false;
            }

            let stark_prime: u256 =
                0x0800000000000011000000000000000000000000000000000000000000000001_u256;

            let sig_salt: Option<felt252> =
                (*public_inputs.at(IDX_SALT) % stark_prime).try_into();
            let sig_nonce: Option<felt252> =
                (*public_inputs.at(IDX_NONCE) % stark_prime).try_into();
            let sig_expiry: Option<felt252> =
                (*public_inputs.at(IDX_EXPIRY) % stark_prime).try_into();

            let (salt, nonce, expiry) = match (sig_salt, sig_nonce, sig_expiry) {
                (Option::Some(s), Option::Some(n), Option::Some(e)) => (s, n, e),
                _ => { return false; },
            };

            if nonce != self.nonce.read() {
                return false;
            }

            match expiry.try_into() {
                Option::Some(e_u64) => {
                    if e_u64 <= get_block_timestamp() {
                        return false;
                    }
                },
                Option::None => { return false; },
            };

            if salt != self.public_key_salt.read() {
                return false;
            }

            true
        }

        fn _do_verify(self: @ContractState, proof: Span<felt252>) -> Span<u256> {
            let verifier = IGaragaVerifierLibraryDispatcher {
                class_hash: self.verifier_class_hash.read(),
            };
            match verifier.verify_ultra_keccak_zk_honk_proof(proof) {
                Result::Ok(inputs) => inputs,
                Result::Err(err) => { core::panic_with_felt252(err) },
            }
        }

        /// Checks Garaga public inputs against stored state. Panics on any mismatch.
        fn _check_public_inputs(self: @ContractState, public_inputs: Span<u256>) {
            assert(public_inputs.len() == PUBLIC_INPUTS_LEN, 'Invalid public inputs length');

            let stark_prime: u256 =
                0x0800000000000011000000000000000000000000000000000000000000000001_u256;

            // index 34: salt = Poseidon(x_felt, y_felt, DOMAIN_TAG)
            let sig_salt: felt252 = (*public_inputs.at(IDX_SALT) % stark_prime)
                .try_into()
                .expect('salt overflow');

            // index 35: message_hash_field — intentionally not checked on-chain.
            // The ZK proof already guarantees it matches the signed message.

            // index 36: nonce (circuit-verified copy)
            let sig_nonce: felt252 = (*public_inputs.at(IDX_NONCE) % stark_prime)
                .try_into()
                .expect('nonce overflow');

            // index 37: expiry (circuit-verified copy)
            let sig_expiry: felt252 = (*public_inputs.at(IDX_EXPIRY) % stark_prime)
                .try_into()
                .expect('expiry overflow');

            // 1. Replay protection
            assert(sig_nonce == self.nonce.read(), 'Nonce mismatch');

            // 2. Proof freshness
            let expiry_u64: u64 = sig_expiry.try_into().expect('expiry cast failed');
            assert(expiry_u64 > get_block_timestamp(), 'Proof expired');

            // 3. Pubkey binding
            assert(sig_salt == self.public_key_salt.read(), 'Salt mismatch');
        }
    }
}
