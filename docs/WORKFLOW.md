# SatKey Architecture & Workflow

## Overview

SatKey provides **one-click Bitcoin → Starknet identity**. Users connect their Bitcoin wallet and get a deterministic Starknet account — no seed phrase required.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Bitcoin   │     │   Frontend  │     │  Prover API │     │  Starknet   │
│   Wallet    │────▶│   (Next.js) │────▶│  (Backend)  │────▶│  Network    │
│ (Xverse/    │     │             │     │             │     │             │
│  Leather)   │     │ - ZkAuthFlow│     │ - verify sig│     │ - Account   │
│             │     │ - message   │     │ - witness   │     │ - Verifier  │
└─────────────┘     │   signing   │     │ - Noir ZK   │     │ - Bridge    │
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

**Key Concept**: Every Starknet transaction from a SatKey account uses a ZK proof as the signature. This proves the Bitcoin wallet owner authorized the action.

## Current Flow (New Workflow)

### Phase 1: ZK Authentication & Verification

```
User Wallet          Frontend                 Prover Backend
    │                    │                        │
    │ 1. Connect BTC     │                        │
    │◀───────────────────│                        │
    │                    │                        │
    │ 2. Sign message:   │                        │
    │ "login:<nonce>:    │                        │
    │  <expiry>"         │                        │
    │───────────────────▶│                        │
    │                    │                        │
    │                    │ 3. POST /prove         │
    │                    │ (pubkey, addr,         │
    │                    │  msg, sig, nonce,      │
    │                    │  expiry)               │
    │                    │───────────────────────▶│
    │                    │                        │
    │                    │ 4. Verify Bitcoin Sig  │
    │                    │ (BIP-322/ECDSA/Schnorr)│
    │                    │                        │
    │                    │ 5. Extract pubkey coords
    │                    │                        │
    │                    │ 6. Generate ZK Proof   │
    │                    │ (Noir Circuit computes │
    │                    │  salt & commitment)    │
    │                    │◀───────────────────────│
    │                    │                        │
    │ 7. Auth success    │                        │
    │   + store proof    │                        │
    │◀───────────────────│                        │
    │                    │                        │
```

**What happens:**

1. User connects Bitcoin wallet (Xverse/Leather via sats-connect)
2. Frontend requests signature for `login:<nonce>:<expiry>`
3. User signs auth message. This signature is specifically tied to the Starknet nonce.
4. Frontend sends signature, address, pubkey, message, nonce, and expiry to the Prover Backend.
5. **Backend Server verifies the Bitcoin signature** using `bitcoinjs-message`.
6. Backend computes Noir inputs (`pubkey_x`, `pubkey_y`, `nonce`, `expiry`).
7. Noir circuit generates a proof that output `salt = Poseidon(pubkey)` and `commitment = Poseidon(salt, nonce, expiry, salt)`.
8. Frontend stores proof + public signals in state.

### Phase 2: Account Deployment

```
Frontend                 Relayer API            Starknet
    │                       │                      │
    │ 1. POST /api/deploy                          │
    │   { proof, pubkey,    │                      │
    │     salt }            │                      │
    │──────────────────────▶│                      │
    │                       │                      │
    │                       │ 2. Deploy account    │
    │                       │    via UDC           │
    │                       │─────────────────────▶│
    │                       │                      │
    │ 3. Return Starknet    │                      │
    │    account address    │                      │
    │◀──────────────────────│                      │
    │                       │                      │
```

**What happens:**

1. Immediately after ZK auth, frontend sends proof to relayer
2. Relayer deploys SatKeyAccount contract via Universal Deployer Contract (UDC) using AVNU Paymaster.
3. Constructor receives verifier contract address + salt.
4. Frontend displays the deployed Starknet account address.

## Key Implementation Details

### Bitcoin Signature Verification

```typescript
// Backend Server verifies the signature natively
const expectedMessage = `login:${nonce}:${expiry}`;
const isValid = bitcoinMessage.verify(message, address, signature);
if (!isValid) throw new Error("Invalid signature");
```

### ZK Circuit (Noir)

The Noir circuit NO LONGER performs ECDSA signature verification. It simply computes:

```rust
let salt = poseidon::poseidon::bn254::hash_5([px[0], px[1], py[0], py[1], DOMAIN_TAG]);
let commitment = poseidon::poseidon::bn254::hash_4([salt, nonce, expiry, salt]);
```

### Account Address Derivation

```typescript
// Deterministic address generation
address = starknet.calculateContractAddress(salt, classHash, [verifierClassHash, salt]);
```

### Prover Request

```typescript
{
  pubkey: "02/03..." || "04...",   // compressed/uncompressed hex
  address: "bc1q...",              // Bitcoin address
  message: "login:0:1234567890",   // Expected message format
  signature: "...",                // Base64 signature from wallet
  nonce: "0",                      // Starknet transaction nonce
  expiry: "1234567890"             // Expiry timestamp
}
```

### Phase 3: Bridge Operations & Nonce Handling

**When executing bridge operations (BTC ↔ STRK swaps):**

1. **Fetch current contract nonce** before signing any transaction
   - Code: `const nonceValue = await provider.getNonceForAddress(starknetAddress);`
   - Why: The nonce may have incremented since account deployment or previous transactions
   - The Bitcoin wallet signature is reusable (signed during initial auth), but the **proof must be generated with the CURRENT nonce** to prevent replay attacks

2. **Pass current nonce to SatKeySigner** (not auth nonce)
   - Code: `btcProofInputs: { nonce: currentNonce }` (not `authCredentials.nonce`)
   - SatKeySigner reconstructs message as: `login:${currentNonce}:${expiry}`
   - Prover generates fresh proof with current nonce in public signals at index 64

3. **Starknet account validates proof against current nonce**
   - Account checks: `assert(proof.nonce == self.nonce.read(), 'Nonce mismatch')`
   - After validation succeeds, account increments nonce for next transaction

4. **This cycle repeats for every transaction**
   - Fetch nonce → Pass to signer → Generate proof → Execute → Nonce increments
   - Old proofs cannot be replayed: nonce has already advanced on-chain

**Critical Files:**
- `apps/frontend/components/Bridge/BridgeFlow.tsx:244` (executeSwap nonce fetch)
- `apps/frontend/components/Bridge/BridgeFlow.tsx:406` (handleManualClaim nonce fetch)
- `apps/frontend/models/SatKeySigner.ts:35-68` (signTransaction reconstructs message with current nonce)
- `chain/src/satkey_account.cairo` (contract validates nonce at index 64)

## Starknet Contract Architecture

### Garaga Verifier Contract
Generated by `garaga gen` — verifies UltraKeccakZKHonk proofs on-chain.

### SatKey Account Contract
Custom Starknet account that uses the Garaga verifier for signature validation.
Transaction signatures contain the ZK proof + public signals.
The account's `__validate__` calls the verifier contract to check the proof on-chain, and importantly:
1. Replay Protection: `assert(sig_nonce == self.nonce.read())`
2. Expiry Check: `assert(sig_expiry > get_block_timestamp())`
3. Binding Check: `assert(sig_salt == self.public_key_salt.read())`

## Notes
- **Deploy after auth**: Account deployment happens immediately after ZK authentication.
- **Nonce-bound signatures**: Because the Starknet contract enforces `sig_nonce == self.nonce`, every new transaction requires the user to sign a new `login:<nonce>:<expiry>` message to obtain a new ZK proof.
