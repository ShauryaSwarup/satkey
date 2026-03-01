# SatKey — Bitcoin-to-Starknet Identity Protocol

**One-click Bitcoin → Starknet. No seed phrase. No bridge friction.**

SatKey lets your users authenticate on Starknet using only their Bitcoin wallet. They connect, sign once, and get a deterministic Starknet account — ready to trade, stake, and use DeFi on Ethereum's most powerful L2.

---

## The Problem

Bitcoin holders face a painful choice:

| Option | Problem |
|--------|---------|
| **Create a new wallet** | Seed phrase management, lost keys, friction |
| **Use a bridge** | Centralized custodians, long wait times, trust assumptions |
| **Multi-sig wrappers** | Complexity, higher gas costs, coordination overhead |

**SatKey solves this**: Prove Bitcoin ownership without exposing the private key. Your users' Bitcoin wallet *becomes* their Starknet identity.

---

## Why SatKey?

### For Users

- **Zero New Secrets**: Use your existing Bitcoin wallet — no seed phrase to lose
- **Instant Account**: Starknet account deploys automatically on first use
- **Deterministic Address**: Same Bitcoin key → same Starknet address. Every time.
- **Native Security**: Your Bitcoin key never leaves your wallet or gets exposed

### For Developers

- **Simple Integration**: Standard REST API. No ZK expertise required.
- **Gas Sponsorship**: Optional AVNU Paymaster integration for gasfree or gasless transactions
- **Battle-Tested Primitives**: Noir + Barretenberg for ZK, Starknet for execution, Garaga for on-chain verification
- **Deterministic Deployment**: Predictable account addresses — plan your UX around known addresses

### For Products

- **Bitcoin First**: Tap into the largest crypto user base without forcing wallet migration
- **Unified Identity**: One key across chains — BTC for ownership, Starknet for execution
- **Custody-Free**: No middlemen. No bridges to hack. Your users own their assets.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY                                      │
└─────────────────────────────────────────────────────────────────────────────┘

  1. CONNECT        2. SIGN           3. PROVE           4. DEPLOY      5. TRANSACT
     Bitcoin           Auth              ZK                 Starknet        Starknet
     Wallet           Message           Proof              Account         Normally

  ┌──────────┐    ┌──────────┐     ┌──────────┐      ┌──────────┐    ┌──────────┐
  │ Xverse / │───▶│ Sign    │────▶│ Generate │─────▶│ Deploy   │───▶│ Use      │
  │ Leather  │    │ message │     │ proof    │      │ account  │    │ Starknet │
  └──────────┘    └──────────┘     └──────────┘      └──────────┘    └──────────┘
       │                                    │                 │                
       │                                    ▼                 │                
       │                             ┌──────────────┐          │                
       │                             │   Prover     │          │                
       │                             │   Service    │          │                
       │                             │ (Noir + bb)  │          │                
       │                             └──────────────┘          │                
       │                                                      │                
       └──────────────────────────────────────────────────────┘                
                                    Relayer                                      
```

### Step-by-Step

1. **Connect Bitcoin Wallet**: User connects via Xverse or Leather (sats-connect)
2. **Sign Authentication Message**: User signs a message with nonce + expiry
3. **Generate ZK Proof**: Server generates proof verifying the ECDSA signature — **without seeing the private key**
4. **Deploy Account**: Relayer deploys a deterministic Starknet account bound to the Bitcoin public key
5. **Use Starknet**: User signs Starknet transactions with their Bitcoin wallet

---

## Use Cases

### DeFi Protocols
- Accept BTC as collateral without wrapping
- Let Bitcoin holders access leverage, lending, and trading

### NFT Marketplaces
- Bitcoin-native collectibles meet Starknet liquidity
- One wallet for both chains

### Gaming
- Play-to-earn with Bitcoin as the identity layer
- No onboarding friction

### Identity & Reputation
- Bitcoin as a sybil-resistant identity primitive
- On-chain reputation attached to BTC holdings

---

## Technical Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            SATKEY ARCHITECTURE                              │
└──────────────────────────────────────────────────────────────────────────────┘

  Bitcoin          Frontend           Prover             Relayer           Starknet
  Wallet          (Next.js)          (Noir)            (Starknet)         Network

     │                │                  │                  │                │
     │ Connect        │                  │                  │                │
     │───────────────▶│                  │                  │                │
     │                │                  │                  │                │
     │ Sign auth      │                  │                  │                │
     │ message        │                  │                  │                │
     │───────────────▶│                  │                  │                │
     │                │                  │                  │                │
     │                │ POST /prove      │                  │                │
     │                │ (pubkey, sig)    │                  │                │
     │                │─────────────────▶│                  │                │
     │                │                  │                  │                │
     │                │      ┌───────────┴───────────┐    │                │
     │                │      │  1. Execute circuit   │    │                │
     │                │      │  2. Generate witness  │    │                │
     │                │      │  3. Run bb prove      │    │                │
     │                │      └───────────┬───────────┘    │                │
     │                │                  │                  │                │
     │                │◀─────────────────│                  │                │
     │                │ (proof, public   │                  │                │
     │                │  signals)        │                  │                │
     │                │                  │                  │                │
     │                │                  │ POST /deploy     │                │
     │                │                  │ (proof, signals) │                │
     │                │                  │─────────────────▶│                │
     │                │                  │                  │                │
     │                │                  │        ┌──────────┴──────────┐    │
     │                │                  │        │  1. Derive salt    │    │
     │                │                  │        │  2. Deploy via    │    │
     │                │                  │        │     UDC            │    │
     │                │                  │        └──────────┬──────────┘    │
     │                │                  │                   │               │
     │                │                  │◀──────────────────│               │
     │                │                  │    (account addr) │               │
     │                │                  │                   │               │
     │◀───────────────│◀─────────────────│◀──────────────────│               │
     │ (success)      │ (account addr)   │                   │               │
```

### System Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | Next.js + sats-connect | Wallet connection, message signing, flow orchestration |
KT|| **Prover** | Node.js + Noir + Barretenberg | Generates ZK proofs from Bitcoin signatures |
RK|| **ZK Circuit** | Noir (1.0.0-beta.16) | Proves ECDSA validity + derives Starknet salt |
WQ|| **Verifier** | Cairo + Garaga (1.0.1) | On-chain proof verification |
| **Relayer** | Node.js + Starknet.js | Account deployment + transaction execution |
| **Account** | Cairo (SatKeyAccount) | Custom Starknet account using ZK for auth |

---

## Technical Deep Dive

### Frontend

The frontend handles wallet connection and message signing.

**Wallet Integration**:
- Uses `sats-connect` for Xverse/Leather compatibility
- Extracts payment address (BIP-44, not ordinals/Taproot)
- Signs BIP-322 styled auth message

**Auth Flow** (`ZkAuthFlow.tsx`):
```typescript
// 1. Connect wallet
const { address, publicKey } = await connect();

// 2. Build auth message with nonce + expiry
const message = JSON.stringify({
  domain: "satkey",
  nonce: Date.now().toString(),
  expiry: (Date.now() + 3600000).toString(), // 1 hour
  action: "authenticate"
});

// 3. Sign with Bitcoin wallet
const signature = await wallet.signMessage(message);

// 4. Send to prover
const { proof, publicSignals } = await fetch(`${PROVER_URL}/prove`, {
  method: "POST",
  body: JSON.stringify({ pubkey: publicKey, ...signature, message_hash, ... })
});
```

**Key Files**:
- `apps/frontend/components/Auth/ZkAuthFlow.tsx`
- `apps/frontend/providers/AuthProvider.tsx`
- `packages/crypto/src/index.ts` — Bitcoin message hashing utilities

---

### Prover Service

The prover generates ZK proofs. It's a thin API layer over the Noir circuit + Barretenberg.

**Technology Stack**:
- Node.js + Express
- Noir 1.0.0-beta.16 (circuit compilation)
- Barretenberg 3.0.0-nightly.20251104 (proof generation)

#### API Endpoints

##### POST /prove

Generates a ZK proof verifying a valid ECDSA signature.

**Request**:
```typescript
{
  pubkey: "02/03..." | "04...",     // Compressed/uncompressed hex
  signature_r: "0x...",              // r component, big-endian
  signature_s: "0x...",              // s component, low-s normalized
  message_hash: "0x...",             // Double-SHA256 of Bitcoin Signed Message
  nonce: "1234567890",               // Unix timestamp string
  expiry: "1234567890300000"        // Future timestamp
}
```

**Response**:
```typescript
{
  proof: "0x...",              // ZK proof bytes (hex)
  publicSignals: [             // 4 fields
    "0x...", // salt (Poseidon hash of pubkey)
    "0x...", // message_hash
    "0x...", // nonce
    "0x..."  // expiry
  ]
}
```

**How It Works**:
1. Receive signature components from frontend
2. Format inputs as Prover.toml
3. Run `nargo execute` to generate witness
4. Run `bb prove_ultra_keccak_honk` to generate proof
5. Parse and return proof + public signals

**Key Files**:
- `apps/prover/src/server.ts` — Express API
- `apps/prover/src/proof.ts` — Barretenberg integration
- `apps/prover/src/witness.ts` — Circuit input preparation

VN|**Build Workflow** (in `circuits/satkey_auth`):
```bash
# 1. Compile the Noir circuit
nargo build

# 2. Generate witness (outputs satkey_auth.gz)
nargo execute

# 3. Generate proof with Barretenberg
bb prove -s ultra_honk --oracle_hash keccak -b ./target/satkey_auth.json -w ./target/satkey_auth.gz -o ./target --write_vk -v

# 4. Generate Cairo verifier contracts with Garaga
garaga gen --system ultra_keccak_zk_honk --vk target/vk --project-name satkey_verifier

# 5. Generate calldata for testing (outputs starkli format)
garaga calldata --system ultra_keccak_zk_honk --vk ./target/vk --proof ./target/proof --public-inputs ./target/public_inputs --format starkli > ../calldata.txt

# 6. Build the Cairo verifier contract
cd satkey_verifier
scarb build
```

**Versions that work:**
| Tool | Version |
|------|--------|
| bb | 3.0.0-nightly.20251104 |
| nargo | 1.0.0-beta.16 |
| garaga | 1.0.1 |
| scarb | 2.14.0 |

---

### ZK Circuit

The circuit proves: *"I know a Bitcoin private key that signed this message."*

**What It Proves**:

1. **ECDSA Verification**: The signature (r, s) is valid for (pubkey_x, pubkey_y) over message_hash
2. **Salt Derivation**: The pubkey is bound to a deterministic Starknet account via Poseidon
3. **Public Outputs**: `[salt, message_hash_field, nonce, expiry]`

**Circuit Source** (`circuits/satkey_auth/src/main.nr`):

```noir
fn main(
    // Private inputs (witness) — never revealed
    pubkey_x: [u8; 32],
    pubkey_y: [u8; 32],
    sig_r: [u8; 32],
    sig_s: [u8; 32],
    
    // Public inputs
    message_hash: pub [u8; 32],
    nonce: pub Field,
    expiry: pub Field,
) -> pub [Field; 4] {
    
    // 1. Verify ECDSA secp256k1 signature
    let mut signature: [u8; 64] = [0; 64];
    // ... assemble r || s
    let is_valid = ecdsa_secp256k1::verify_signature(
        pubkey_x, pubkey_y, signature, message_hash
    );
    assert(is_valid, "Invalid secp256k1 ECDSA signature");

    // 2. Derive Starknet salt via Poseidon
    let salt = poseidon::bn254::hash_3([x_felt, y_felt, DOMAIN_TAG]);

    // 3. Return public signals
    [salt, message_hash_field, nonce, expiry]
}
```

**Private vs Public**:

| Input | Visibility | Purpose |
|-------|------------|---------|
| `pubkey_x`, `pubkey_y` | **Private** | Bitcoin public key coordinates |
| `sig_r`, `sig_s` | **Private** | ECDSA signature components |
| `message_hash` | Public | Hash of signed message |
| `nonce`, `expiry` | Public | Timestamps |
| `salt` | **Public output** | Deterministic account address |

**Why UltraKeccakHonk?**

- Fast proof generation (sub-second)
- Small proof size (~1KB)
- Native Garaga support for on-chain verification
- Battle-tested in Aztec Protocol

**Key Files**:
- `circuits/satkey_auth/src/main.nr` — Circuit source
- `circuits/satkey_auth/Nargo.toml` — Circuit config
- `circuits/satkey_auth/target/` — Compiled artifacts

---

### Relayer

The relayer handles Starknet account deployment and transaction execution.

**Responsibilities**:
1. **Account Deployment**: Derive salt from Bitcoin pubkey, deploy via UDC
2. **Transaction Execution**: Execute user calls with the ZK proof as signature
3. **Fee Management**: Handle STRK payments or integrate AVNU Paymaster

#### POST /deploy-account

**Request**:
```typescript
{
  proof: "0x...",
  publicSignals: ["0x...", "0x...", "0x...", "0x..."],
  pubkey: "02..."
}
```

**Response**:
```typescript
{
  account_address: "0x...",
  salt: "0x..."
}
```

#### POST /execute

**Request**:
```typescript
{
  to: "0x...",
  selector: "transfer",
  calldata: ["0x...", "0x..."],
  proof: "0x...",
  publicSignals: ["0x...", "0x...", "0x...", "0x..."]
}
```

**Key Files**:
- `apps/relayer/src/server.ts` — API server
- `apps/relayer/src/deploy.ts` — Account deployment logic
- `apps/relayer/src/relay.ts` — Transaction execution

---

### Starknet Contracts

#### SatKeyAccount

A custom Starknet account that uses ZK proofs for authentication.

**Signature Layout**:
```
[proof_len, proof_felt_0, ..., proof_felt_n, salt, msg_hash, nonce, expiry]
```

**Validation Logic** (`satkey_account.cairo`):

```cairo
fn __validate__(ref self: ContractState, calls: Array<Call>) -> felt252 {
    let signature = get_tx_info().signature;
    
    // 1. Parse proof + public signals
    let proof_len = signature[0];
    let salt = signature[1 + proof_len];
    let nonce = signature[1 + proof_len + 2];
    let expiry = signature[1 + proof_len + 3];
    
    // 2. Replay protection: nonce must match
    assert(self.nonce.read() == nonce, 'Nonce mismatch');
    
    // 3. Freshness: expiry must be in future
    assert(expiry > get_block_timestamp(), 'Proof expired');
    
    // 4. Salt must match this account
    assert(self.public_key_salt.read() == salt, 'Salt mismatch');
    
    // 5. Verify ZK proof on-chain
    let verifier = IGaragaVerifierDispatcher {
        contract_address: self.verifier_address.read()
    };
    verifier.verify_ultra_keccak_zk_honk_proof(signature);
    
    starknet::VALIDATED
}
```

**Features**:
- SNIP-6 compliant
- Nonce-based replay protection
- Expiry-based freshness
- Per-account salt binding

---

#### Verifier Contract

Generated by **Garaga** from the Noir circuit. Verifies UltraKeccakHonk proofs on-chain.

**Interface**:
```cairo
fn verify_ultra_keccak_zk_honk_proof(
    full_proof_with_hints: Span<felt252>,
) -> Result<Span<u256>, felt252>;
```

**Deployment**:
```bash
cd circuits/satkey_auth/satkey_verifier
scarb build
garaga declare --network sepolia
garaga deploy --class-hash 0x... --network sepolia
```

**Key Files**:
- `satkey_verifier/src/honk_verifier.cairo` — Generated verifier
- `chain/src/satkey_account.cairo` — Account contract

---

## Security

### Cryptographic Guarantees

- **Private Key Never Exposed**: The ZK proof verifies signature knowledge without revealing the private key
- **Zero-Knowledge**: The verifier learns nothing about the private key — only that a valid signature exists
- **Deterministic**: Same Bitcoin key → same Starknet address (via Poseidon)

### Protocol Guarantees

- **Replay Protection**: Nonce ensures each proof can only be used once
- **Freshness**: Expiry timestamp prevents stale proof usage
- **Salt Binding**: Each Starknet account is bound to a specific Bitcoin public key

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Private key theft | Never transmitted; only signature proof |
| Proof replay | Nonce increments on each use |
| Stale proofs | Expiry timestamp enforced on-chain |
| Front-running | Per-account salt prevents address hijacking |

---

## Deployment

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Noir | 1.0.0-beta.16 | ZK circuit |
| Barretenberg | 3.0.0-nightly.20251104 | Proof generation |
| Garaga | 1.0.1 | Verifier generation |
| Scarb | 2.14.0 | Cairo compilation |
| Starkli | latest | Starknet CLI |

### Contract Compilation

```bash
# Verifier
cd circuits/satkey_auth/satkey_verifier
scarb build

# Account
cd chain
scarb build
```

### Starknet Sepolia

1. **Declare Verifier**:
   ```bash
   garaga declare --network sepolia
   ```

2. **Deploy Verifier**:
   ```bash
   garaga deploy --class-hash 0x... --network sepolia
   ```

3. **Declare Account**:
   ```bash
   sncast --account YOUR_ACCOUNT declare --contract-name SatKeyAccount
   ```

4. **Configure Relayer**: Set environment variables:
   - `VERIFIER_ADDRESS`
   - `SATKEY_CLASS_HASH`
   - `RELAYER_PRIVATE_KEY`
   - `STARKNET_RPC_URL`

See `docs/SEPOLIA_DEPLOYMENT.md` for detailed instructions.

---

## Environment Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `NEXT_PUBLIC_PROVER_URL` | Prover service URL | Frontend |
| `NEXT_PUBLIC_RELAYER_URL` | Relayer service URL | Frontend |
| `STARKNET_RPC_URL` | Starknet RPC endpoint | Relayer |
| `RELAYER_PRIVATE_KEY` | Deployer private key | Relayer |
| `SATKEY_CLASS_HASH` | Account class hash | Relayer |
| `VERIFIER_ADDRESS` | Verifier contract address | Relayer |
| `NARGO_BIN` | Path to nargo binary | Prover |
| `BB_BIN` | Path to bb binary | Prover |

---

## Gas Considerations

Starknet fees are paid in STRK.

You sponsor all transaction fees. User pays nothing.
---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint

# Test prover
cd apps/prover
node test_prove.mjs
```

---

## License

MIT
