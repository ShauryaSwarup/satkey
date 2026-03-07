// ── Garaga verifier interface
// ─────────────────────────────────────────────────
#[starknet::interface]
trait IGaragaVerifier<TContractState> {
    fn verify_ultra_keccak_zk_honk_proof(
        self: @TContractState, full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
}

// ── SatKeyAccount interface
// ─────────────────────────────────────────────────
#[starknet::interface]
trait ISatKeyAccount<TContractState> {
    fn get_nonce(self: @TContractState) -> felt252;
    fn get_verifier_class_hash(self: @TContractState) -> starknet::ClassHash;
    fn get_public_key_salt(self: @TContractState) -> felt252;
    fn execute_from_relayer(
        ref self: TContractState, calls: Array<starknet::account::Call>, signature: Span<felt252>,
    ) -> Array<Span<felt252>>;
}

// ── SatKeyAccount contract
// ─────────────────────────────────────────────────
//
// KEY DESIGN DECISION — Why ZK verification lives in __execute__, NOT __validate__:
//
//   StarkNet enforces a strict gas cap on the __validate__ entry point.
//   It is designed only for lightweight checks (e.g. ECDSA scalar multiplication).
//   Running a full UltraKeccakZKHonk proof in __validate__ always panics with
//   "Out of gas", regardless of the fee you attach to the transaction.
//
//   Solution: __validate__ performs a minimal sanity check (non-empty signature),
//   then __execute__ does the full ZK proof verification BEFORE dispatching calls.
//   If verification fails, __execute__ panics and all state changes are reverted.
//   The sequencer may still charge a small fee for the failed __execute__, but
//   the account state (nonce, storage) remains intact — this is the accepted
//   trade-off for ZK-based accounts on StarkNet today.
//
//   See also: starknet-edu/starknet-privacy-toolkit badge_contract pattern.
//
// Noir circuit public input layout (Barretenberg declaration order + return values):
//
//   pubkey_x: pub [u8;32]  → indices  0 ..= 31   (32 felt252s, one per byte)
//   pubkey_y: pub [u8;32]  → indices 32 ..= 63   (32 felt252s, one per byte)
//   nonce:    pub Field    → index   64
//   expiry:   pub Field    → index   65
//   -- return [Field; 2] --
//   salt        (return[0]) → index  66   poseidon(px[0],px[1],py[0],py[1],DOMAIN_TAG)
//   commitment  (return[1]) → index  67   poseidon(salt, nonce, expiry, salt)  [not stored]
//
//   Total public inputs: 68
//
#[starknet::contract(account)]
mod SatKeyAccount {
    use super::IGaragaVerifierDispatcherTrait;
use core::num::traits::Zero;
    use openzeppelin_account::utils::is_tx_version_valid;
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;
    use starknet::account::Call;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::syscalls::call_contract_syscall;
    use starknet::{get_block_timestamp, get_tx_info};
    use super::{IGaragaVerifierLibraryDispatcher, ISatKeyAccount};

    const ISRC6_ID: felt252 = 0x2ceccef7f994940b3962a6c67e0ba4fcd37df7d131417c604f91e03caecc1cd;

    // ── Public input indices
    const PUBLIC_INPUTS_LEN: u32 = 68;
    const IDX_NONCE: u32 = 64;
    const IDX_EXPIRY: u32 = 65;
    const IDX_SALT: u32 = 66;
    // IDX_COMMITMENT = 67 is implicitly validated by the ZK proof itself.

    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        verifier_class_hash: starknet::ClassHash,
        nonce: felt252,
        /// poseidon(pubkey_x_hi, pubkey_x_lo, pubkey_y_hi, pubkey_y_lo, DOMAIN_TAG)
        /// computed off-chain at registration and supplied to the constructor.
        /// Matches circuit return[0] = salt.
        public_key_salt: felt252,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
    }

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

    // ── ISRC6 / AccountContract implementation
    // ────────────────────────────────────────────────────────────────────────
    //
    //  __validate__  →  CHEAP: only checks that a non-empty signature was supplied.
    //                   Heavy ZK proof verification is intentionally deferred to
    //                   __execute__ to stay within StarkNet's validate gas cap.
    //
    //  __execute__   →  Calls _verify_and_check() FIRST, before touching any state
    //                   or dispatching calls.  If verification fails the whole tx
    //                   reverts (nonce is not incremented, calls are not executed).
    //
    // ────────────────────────────────────────────────────────────────────────

    #[abi(embed_v0)]
    impl AccountContractImpl of starknet::account::AccountContract<ContractState> {
        /// Lightweight gate — just confirm a signature blob was attached.
        /// Full ZK verification happens in __execute__ due to the validate gas cap.
        fn __validate__(ref self: ContractState, calls: Array<Call>) -> felt252 {
            assert(is_tx_version_valid(), 'Invalid tx version');
            let sig = get_tx_info().unbox().signature;
            // Minimal check: proof must be non-empty.
            // The ZK verifier will reject malformed proofs inside __execute__.
            assert(!sig.is_empty(), 'Empty signature');
            starknet::VALIDATED
        }

        /// Full ZK proof verification happens here, before any state mutation.
        fn __execute__(ref self: ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
            assert(starknet::get_caller_address().is_zero(), 'Caller must be protocol');
            assert(is_tx_version_valid(), 'Invalid tx version');

            // ── ZK verification (moved here from __validate__ to avoid gas cap) ──
            let sig = get_tx_info().unbox().signature;
            self._verify_and_check(sig);
            // ─────────────────────────────────────────────────────────────────────

            let current_nonce = self.nonce.read();
            self.nonce.write(current_nonce + 1);
            self.emit(Authenticated { nonce: current_nonce });

            let mut results: Array<Span<felt252>> = ArrayTrait::new();
            for call in calls {
                results
                    .append(
                        call_contract_syscall(call.to, call.selector, call.calldata)
                            .expect('Call failed'),
                    );
            }
            results
        }

        fn __validate_declare__(self: @ContractState, class_hash: felt252) -> felt252 {
            core::panic_with_felt252('Declare not supported')
        }
    }

    // ── is_valid_signature (camelCase + snake_case)
    // ─────────────────────────────────────────────

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

    // ── ISatKeyAccount implementation
    // ───────────────────────────────

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
            ref self: ContractState, calls: Array<Call>, signature: Span<felt252>,
        ) -> Array<Span<felt252>> {
            self._verify_and_check(signature);
            let current_nonce = self.nonce.read();
            self.nonce.write(current_nonce + 1);
            self.emit(Authenticated { nonce: current_nonce });
            let mut results: Array<Span<felt252>> = ArrayTrait::new();
            for call in calls {
                results
                    .append(
                        call_contract_syscall(call.to, call.selector, call.calldata)
                            .expect('Call failed'),
                    );
            }
            results
        }
    }

    // ── Internal helpers
    // ────────────────────────────────────────────

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Panicking path used by __execute__ and execute_from_relayer.
        fn _verify_and_check(self: @ContractState, signature: Span<felt252>) {
            let public_inputs = self._do_verify(signature);
            self._check_public_inputs(public_inputs);
        }

        /// Non-panicking path used by is_valid_signature.
        fn _try_verify_and_check(self: @ContractState, signature: Span<felt252>) -> bool {
            let verifier = IGaragaVerifierLibraryDispatcher {
                class_hash: self.verifier_class_hash.read(),
            };
            let public_inputs = match verifier.verify_ultra_keccak_zk_honk_proof(signature) {
                Result::Ok(inputs) => inputs,
                Result::Err(_) => { return false; },
            };

            if public_inputs.len() != PUBLIC_INPUTS_LEN {
                return false;
            }

            let stark_prime: u256 =
                0x0800000000000011000000000000000000000000000000000000000000000001_u256;

            let sig_salt: Option<felt252> = (*public_inputs.at(IDX_SALT) % stark_prime).try_into();
            let sig_nonce: Option<felt252> = (*public_inputs.at(IDX_NONCE) % stark_prime)
                .try_into();
            let sig_expiry: Option<felt252> = (*public_inputs.at(IDX_EXPIRY) % stark_prime)
                .try_into();

            let (salt, nonce, expiry) = match (sig_salt, sig_nonce, sig_expiry) {
                (Option::Some(s), Option::Some(n), Option::Some(e)) => (s, n, e),
                _ => { return false; },
            };

            if nonce != self.nonce.read() {
                return false;
            }

            let expiry_u64: Option<u64> = expiry.try_into();
            match expiry_u64 {
                Option::Some(e) => { if e <= get_block_timestamp() {
                    return false;
                } },
                Option::None => { return false; },
            }

            if salt != self.public_key_salt.read() {
                return false;
            }

            true
        }

        /// Call the Garaga library verifier. Panics with the verifier's own error felt.
        fn _do_verify(self: @ContractState, proof: Span<felt252>) -> Span<u256> {
            let verifier = IGaragaVerifierLibraryDispatcher {
                class_hash: self.verifier_class_hash.read(),
            };
            match verifier.verify_ultra_keccak_zk_honk_proof(proof) {
                Result::Ok(inputs) => inputs,
                Result::Err(err) => core::panic_with_felt252(err),
            }
        }

        /// Verify the decoded public inputs against stored state.
        fn _check_public_inputs(self: @ContractState, public_inputs: Span<u256>) {
            assert(public_inputs.len() == PUBLIC_INPUTS_LEN, 'Wrong public inputs length');

            let stark_prime: u256 =
                0x0800000000000011000000000000000000000000000000000000000000000001_u256;

            let sig_salt: felt252 = (*public_inputs.at(IDX_SALT) % stark_prime)
                .try_into()
                .expect('salt overflow');

            let sig_nonce: felt252 = (*public_inputs.at(IDX_NONCE) % stark_prime)
                .try_into()
                .expect('nonce overflow');

            let sig_expiry: felt252 = (*public_inputs.at(IDX_EXPIRY) % stark_prime)
                .try_into()
                .expect('expiry overflow');

            // 1. Nonce replay protection
            assert(sig_nonce == self.nonce.read(), 'Nonce mismatch');

            // 2. Proof freshness
            let expiry_u64: u64 = sig_expiry.try_into().expect('expiry cast failed');
            assert(expiry_u64 > get_block_timestamp(), 'Proof expired');

            // 3. Public key binding
            assert(sig_salt == self.public_key_salt.read(), 'Salt mismatch');
        }
    }
}
