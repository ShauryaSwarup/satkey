# SatKey Architecture & Workflow

## Overview

SatKey provides **one-click Bitcoin → Starknet identity**. Users connect their Bitcoin wallet and get a deterministic Starknet account — no seed phrase required.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Bitcoin   │     │   Frontend  │     │  Prover API │     │  Starknet   │
│   Wallet    │────▶│   (Next.js) │────▶│  (Noir ZK)  │────▶│  Network    │
│ (Xverse/    │     │             │     │             │     │             │
│  Leather)   │     │ - ZkAuthFlow│     │ - witness   │     │ - Account   │
│             │     │ - message   │     │ - prove     │     │ - Verifier  │
└─────────────┘     │   signing   │     │ - bb prove  │     │ - Bridge    │
                    └─────────────┘     └─────────────┘     └─────────────┘
                           │                    │                    │
                           │  Every TX uses     │                    │
                           │  ZK proof as       │                    │
                           │  signature ────────┼───────────────────▶│
                           │                    │                    │
                    ┌──────▼──────────────────────────────────────────┐
                    │  ZK Proof = Bitcoin Identity on Starknet       │
                    │  • Deploy account    → ZK proof signature      │
                    │  • Bridge BTC        → ZK proof signature      │
                    │  • Stake/Unstake     → ZK proof signature      │
                    │  • Any transaction   → ZK proof signature      │
                    └────────────────────────────────────────────────┘
```

**Key Concept**: Every Starknet transaction from a SatKey account uses a ZK proof as the signature. This proves the Bitcoin wallet owner authorized the action without exposing the private key.

## Current Flow (as implemented)

### Phase 1: ZK Authentication (DONE ✅)

```
User Wallet          Frontend                 Prover
    │                    │                        │
    │ 1. Connect BTC     │                        │
    │◀───────────────────│                        │
    │                    │                        │
    │ 2. Sign message    │                        │
    │   (BIP-322)        │                        │
    │───────────────────▶│                        │
    │                    │                        │
    │                    │ 3. POST /prove         │
    │                    │ (pubkey, r, s, hash)   │
    │                    │───────────────────────▶│
    │                    │                        │
    │                    │   4. Generate ZK proof │
    │                    │   (Noir circuit)       │
    │                    │◀───────────────────────│
    │                    │                        │
    │ 5. Auth success    │                        │
    │   + store proof    │                        │
    │◀───────────────────│                        │
    │                    │                        │
```

**What happens:**

1. User connects Bitcoin wallet (Xverse/Leather via sats-connect)
2. Frontend extracts **payment address** pubkey (NOT ordinals/Taproot)
3. User signs auth message with nonce/expiry
4. Frontend computes **Bitcoin Signed Message hash** (double SHA-256)
5. Frontend normalizes signature to **low-s** format
6. Prover generates ZK proof of valid ECDSA secp256k1 signature
7. Frontend stores proof + public signals in state

### Phase 2: Account Deployment (DONE ✅)

```
Frontend                 Relayer                Starknet
    │                       │                      │
    │ 1. POST /deploy-account                      │
    │   { proof, pubkey,    │                      │
    │     publicSignals }   │                      │
    │──────────────────────▶│                      │
    │                       │                      │
    │                       │ 2. Derive salt       │
    │                       │    (Poseidon hash)   │
    │                       │                      │
    │                       │ 3. Deploy account    │
    │                       │    via UDC           │
    │                       │─────────────────────▶│
    │                       │                      │
    │ 4. Return Starknet    │                      │
    │    account address    │                      │
    │◀──────────────────────│                      │
    │                       │                      │
```

**What happens:**

1. Immediately after ZK auth, frontend sends proof to relayer
2. Relayer derives deterministic salt from BTC pubkey via Poseidon
3. Relayer deploys SatKeyAccount contract via Universal Deployer Contract (UDC)
4. Constructor receives verifier contract address + salt
5. Frontend displays the deployed Starknet account address

### Phase 3: Bridge BTC (NOT YET IMPLEMENTED)

```
User Wallet          Bridge              Frontend
    │                  │                    │
    │ 1. Initiate      │                    │
    │   bridge         │                    │
    │─────────────────▶│                    │
    │                  │                    │
    │ 2. Send BTC to   │                    │
    │   deposit addr   │                    │
    │─────────────────▶│ (wait confirmations)
    │                  │                    │
    │                  │ 3. Mint sBTC to    │
    │                  │   SatKey account   │
    │                  │───────────────────▶│
```

### Phase 4: Stake (NOT YET IMPLEMENTED)

```
Frontend              Relayer               Starknet
    │                  │                    │
    │ 1. Initiate stake│                    │
    │─────────────────▶│                    │
    │                  │                    │
    │                  │ 2. Execute stake   │
    │                  │    (with ZK proof  │
    │                  │     as signature)  │
    │                  │───────────────────▶│
    │                  │                    │
    │                  │ 3. Verifier checks │
    │                  │    proof on-chain  │
    │                  │◀───────────────────│
```

## Key Implementation Details

### Bitcoin Signed Message Hash

```typescript
// Frontend computes this hash to send to prover
const prefix = "\x18Bitcoin Signed Message:\n";
const fullMessage = prefix + varint(len) + message;
const hash = SHA256(SHA256(fullMessage)); // double SHA-256
```

### Low-s Normalization

Noir's `ecdsa_secp256k1::verify_signature` requires:

```typescript
s <= SECP256K1_ORDER / 2;
// If not, flip: s = ORDER - s
```

### Account Address Derivation

```typescript
salt = Poseidon(pubkey_x, pubkey_y, DOMAIN_TAG);
address = starknet.calculateContractAddress(salt, classHash, calldata);
// This is deterministic — same BTC key → same Starknet address
```

### Prover Input

```typescript
{
  pubkey: "02/03..." || "04...",   // compressed/uncompressed hex
  signature_r: "0x...",              // r component, big-endian
  signature_s: "0x...",              // s component (low-s normalized)
  message_hash: "0x...",             // double-SHA256 of Bitcoin Signed Message
  nonce: "1234567890",               // timestamp string
  expiry: "1234567890300000"         // future timestamp
}
```

### Prover Output

```typescript
{
  proof: "0x...",              // ZK proof bytes
  publicSignals: [             // 4 fields
    "0x...", // salt (Poseidon hash)
    "0x...", // message_hash
    "0x...", // nonce
    "0x..."  // expiry
  ]
}
```

## File Locations

| Component        | Path                                           |
| ---------------- | ---------------------------------------------- |
| Frontend Auth    | `apps/frontend/components/Auth/ZkAuthFlow.tsx` |
| Auth Provider    | `apps/frontend/providers/AuthProvider.tsx`     |
| Prover Server    | `apps/prover/src/server.ts`                    |
| Prover Logic     | `apps/prover/src/proof.ts`                     |
| Witness Gen      | `apps/prover/src/witness.ts`                   |
| Relayer Server   | `apps/relayer/src/server.ts`                   |
| Relayer Deploy   | `apps/relayer/src/deploy.ts`                   |
| Relayer Relay    | `apps/relayer/src/relay.ts`                    |
| Noir Circuit     | `circuits/satkey_auth/src/main.nr`             |
| Account Contract | `chain/src/satkey_account.cairo`               |
| Garaga Verifier  | `satkey_verifier/src/honk_verifier.cairo`      |
| Crypto Utils     | `packages/crypto/src/index.ts`                 |
| Deploy Script    | `scripts/deploy-devnet.sh`                     |

## Environment Variables

| Variable                        | Frontend | Prover | Relayer |
| ------------------------------- | -------- | ------ | ------- |
| `NEXT_PUBLIC_PROVER_URL`        | ✅       | -      | -       |
| `NEXT_PUBLIC_RELAYER_URL`       | ✅       | -      | -       |
| `STARKNET_RPC_URL`              | -        | -      | ✅      |
| `RELAYER_ADDRESS`               | -        | -      | ✅      |
| `RELAYER_PRIVATE_KEY`           | -        | -      | ✅      |
| `NEXT_PUBLIC_SATKEY_CLASS_HASH` | -        | -      | ✅      |
| `NEXT_PUBLIC_VERIFIER_CLASS_HASH`  | -        | -      | ✅      |

## Starknet Contract Architecture

### Garaga Verifier Contract

Generated by `garaga gen` — verifies UltraKeccakZKHonk proofs on-chain.

```cairo
#[starknet::interface]
pub trait IUltraKeccakZKHonkVerifier<TContractState> {
    fn verify_ultra_keccak_zk_honk_proof(
        self: @TContractState,
        full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
}
```

### SatKey Account Contract

Custom Starknet account that uses the Garaga verifier for signature validation.
Transaction signatures contain the ZK proof + public signals:

```
signature = [proof_len, ...proof_felts, salt, msg_hash, nonce, expiry]
```

The account's `__validate__` calls the verifier contract to check the proof on-chain.

## Notes

- **Deploy after auth**: Account deployment happens immediately after ZK authentication (not after bridging).
- **Payment address only**: Use `purpose === 'payment'` address, NOT ordinals (Taproot uses Schnorr, not ECDSA).
  JQ|- **bb output**: The prover binary outputs a directory with `proof` and `public_inputs` files, not a single file.
  ZY|- **Garaga build**: The verifier contract is ~100k+ lines of Cairo. `scarb build` takes 30-60+ minutes. Requires Scarb 2.14.0.
  VY|- **Bitcoin, not Ethereum**: All signing uses Bitcoin's ECDSA secp256k1 with Bitcoin Signed Message format.

## Working Versions

| Tool              | Version                |
| ----------------- | ---------------------- |
| bb (Barretenberg) | 3.0.0-nightly.20251104 |
| nargo             | 1.0.0-beta.16          |
| garaga            | 1.0.1                  |
| scarb             | 2.14.0                 |

## Complete Build Workflow

In directory `circuits/satkey_auth`:

```bash
# 1. Compile Noir circuit (outputs satkey_auth.json)
nargo build

# 2. Generate witness (outputs satkey_auth.gz)
nargo execute

# 3. Generate proof, vk, public inputs
bb prove -s ultra_honk --oracle_hash keccak -b ./target/satkey_auth.json -w ./target/satkey_auth.gz -o ./target --write_vk -v

# 4. Generate Cairo verifier contracts from vk
garaga gen --system ultra_keccak_zk_honk --vk target/vk --project-name satkey_verifier

# 5. Generate calldata for testing (starkli format)
garaga calldata --system ultra_keccak_zk_honk --vk ./target/vk --proof ./target/proof --public-inputs ./target/public_inputs --format starkli > ../calldata.txt

# 6. Build Cairo verifier contract
cd satkey_verifier
scarb build
```

The compiled verifier contract will be in `satkey_verifier/target/dev/.json`.
