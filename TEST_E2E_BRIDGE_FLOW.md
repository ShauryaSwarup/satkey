# End-to-End Bridge Flow Integration Test
**Purpose**: Validate the complete ZK proof nonce format fix across frontend → prover → verifier → Cairo account

**Status**: Ready for execution with Bitcoin wallet + Starknet testnet

---

## Test Scenario 1: Single Transaction (Nonce 0 → 1)

### Prerequisites
- Bitcoin wallet connected (Xverse/Leather)
- Bitcoin account has sufficient sats
- Starknet testnet account deployed with SatKey
- Prover service running on `http://localhost:3001`
- Relayer service configured for testnet

### Expected Nonce Flow
```
Tx 1: Fetch nonce (0) → Message "login:0:1234567890" → Proof generated → Account validates → Nonce increments to 1
```

### Step-by-Step Test

#### Phase 1: Message Format Validation (Frontend)
1. **Location**: `apps/frontend/components/Bridge/BridgeFlow.tsx:244` (executeSwap)
   ```typescript
   const nonceValue = await provider.getNonceForAddress(starknetAddress);
   const currentNonce = BigInt(nonceValue).toString();  // Must be decimal string
   ```
   **Expected**: `currentNonce = "0"` (not "0x0")
   **Validate**: Check browser console for exact nonce value

2. **Pass to SatKeySigner**: `btcProofInputs: { nonce: currentNonce, ... }`
   **Expected**: Nonce passed as decimal string "0"

#### Phase 2: Message Reconstruction (SatKeySigner)
1. **Location**: `apps/frontend/models/SatKeySigner.ts:41-45` (signTransaction)
   ```typescript
   const nonceStr = typeof nonce === 'bigint' || typeof nonce === 'number' ? nonce.toString() : nonce;
   const message = `login:${nonceStr}:${this.btcProofInputs.expiry}`;
   // Expected: message = "login:0:1234567890"
   ```
   **Validate**: Add console.log to verify exact message format
   ```typescript
   console.log("Message to sign:", message);
   ```
   **Expected Output**: `Message to sign: login:0:1234567890`

#### Phase 3: Prover Validation
1. **Location**: Prover receives POST /prove request
   **Expected Request**:
   ```json
   {
     "pubkey": "02...",
     "address": "bc1q...",
     "message": "login:0:1234567890",
     "signature": "...",
     "nonce": "0",
     "expiry": "1234567890"
   }
   ```

2. **Message Validation**: `apps/prover/src/server.ts:84`
   ```typescript
   const expectedMessage = `login:${nonce}:${expiry}`;  // "login:0:1234567890"
   if (message !== expectedMessage) {
     return res.status(400).json({ error: "Message does not match expected login format" });
   }
   ```
   **Expected**: Message format matches exactly
   **If fails**: Check for hex conversion: "login:0x0:..." would not match

3. **Proof Generation**
   **Expected Output**:
   ```json
   {
     "fullProof": [...],
     "publicSignals": [
       "0x...",  // salt (index 0)
       "0x...",  // message_hash (index 1)
       "0x...",  // nonce (index 2) = 0
       "0x..."   // expiry (index 3)
     ]
   }
   ```
   **Validate**: Browser console should show: `Prover response - fullProof length: X, publicSignals length: 4`

#### Phase 4: Cairo Account Validation
1. **Location**: `chain/src/satkey_account.cairo:142-150` (__validate__)
   
2. **Proof Parsing**:
   ```cairo
   let nonce = signature[1 + proof_len + 2];  // index 64 in public signals
   ```
   **Expected**: nonce extracted = 0

3. **Replay Protection Check**:
   ```cairo
   assert(self.nonce.read() == nonce, 'Nonce mismatch');
   ```
   **Expected**: Contract nonce (0) matches proof nonce (0) ✓

4. **Proof Verification**: Garaga verifier verifies proof
   **Expected**: Verification succeeds

5. **Nonce Increment**:
   ```cairo
   self.nonce.write(current_nonce + 1);
   ```
   **Expected**: After transaction, contract nonce becomes 1

---

## Test Scenario 2: Replay Attack Prevention (Transaction 2)

### Expected Nonce Flow
```
Tx 2: Fetch nonce (1) → Message "login:1:1234567890" → NEW proof generated → Account validates → Nonce increments to 2
Tx 1 proof CANNOT be reused: old proof has nonce 0, account now expects nonce 1
```

### Step-by-Step Test

#### Immediate After Transaction 1 Success

1. **Frontend Fetches New Nonce**:
   ```typescript
   const nonceValue = await provider.getNonceForAddress(starknetAddress);
   const currentNonce = BigInt(nonceValue).toString();  // Should be "1"
   ```
   **Validate**: Verify browser logs show `currentNonce = "1"`

2. **Attempt Replay (SHOULD FAIL)**:
   - Try to execute same transaction with old proof (from Tx 1)
   - Old proof has nonce = 0
   - Cairo contract checks: `assert(0 == 1, 'Nonce mismatch')` → **PANIC**
   - **Expected**: Transaction rejected with nonce mismatch error

3. **Execute Transaction 2 (NEW PROOF)**:
   - Generate new message: `login:1:1234567890`
   - SatKeySigner creates new proof with nonce 1
   - Prover validates message format matches: `login:1:1234567890`
   - Cairo account validates: `assert(1 == 1, 'Nonce mismatch')` ✓
   - **Expected**: Transaction succeeds

4. **Verify Nonce Incremented**:
   ```typescript
   const finalNonce = await provider.getNonceForAddress(starknetAddress);
   ```
   **Expected**: finalNonce = "2"

---

## Test Scenario 3: Expiry Validation

### Expected Behavior
```
Tx with expiry in past → Cairo account checks expiry > block.timestamp → FAILS
Tx with expiry in future → Cairo account checks expiry > block.timestamp → PASSES
```

### Step-by-Step Test

1. **Create Proof with Past Expiry**:
   - Set expiry = 1704067200 (2024-01-01 in past)
   - Generate proof with nonce 2
   - Message: `login:2:1704067200`

2. **Attempt Transaction (SHOULD FAIL)**:
   - Cairo account checks:
   ```cairo
   assert(expiry > get_block_timestamp(), 'Proof expired');
   ```
   - block.timestamp > 1704067200 → **PANIC**
   - **Expected**: Transaction rejected with "Proof expired"

3. **Create Proof with Future Expiry**:
   - Set expiry = future timestamp (e.g., 24 hours from now)
   - Generate proof with nonce 2
   - Execute transaction
   - **Expected**: Transaction succeeds

---

## Test Scenario 4: Salt Binding

### Expected Behavior
```
Account deployed with salt A
Proof generated for salt A → Validates ✓
Proof generated for salt B → Validates ✗ (different Bitcoin pubkey)
```

### Step-by-Step Test

1. **Verify Account Salt on Deployment**:
   ```typescript
   const account = new Account(provider, starknetAddress, starknetSigner);
   const salt = await account.getPublicKeySalt();
   ```
   **Expected**: salt = Poseidon(bitcoin_pubkey_x, bitcoin_pubkey_y, DOMAIN_TAG)

2. **Cairo Contract Checks Salt**:
   ```cairo
   assert(self.public_key_salt.read() == salt, 'Salt mismatch');
   ```
   **Expected**: Proof salt matches stored account salt

3. **Wrong Salt (SHOULD FAIL)**:
   - Modify proof to use different salt (simulate different Bitcoin key)
   - Cairo contract checks: `assert(account_salt == proof_salt, 'Salt mismatch')` → **PANIC**
   - **Expected**: Transaction rejected with "Salt mismatch"

---

## Debug Checklist

### If "deserialization failed" error appears:
- [ ] Check prover console for "Message does not match expected login format"
- [ ] Verify frontend console shows correct message: `login:0:1234567890` (not `login:0x0:...`)
- [ ] Check `SatKeySigner.ts` line 41: nonce conversion to decimal string
- [ ] Verify `BridgeFlow.tsx` line 244: currentNonce is decimal string, not hex

### If "Nonce mismatch" error appears:
- [ ] Check Cairo account expects nonce at index 64 in public signals
- [ ] Verify prover includes nonce in public signals output
- [ ] Confirm contract nonce was incremented after previous transaction
- [ ] Check block explorer: contract state shows nonce incremented

### If "Proof expired" error appears:
- [ ] Verify expiry timestamp is in future (> current block timestamp)
- [ ] Check Cairo account line: `assert(expiry > get_block_timestamp(), 'Proof expired')`
- [ ] Regenerate proof with new expiry (24 hours from now)

### If "Salt mismatch" error appears:
- [ ] Verify Bitcoin pubkey matches the one used for account deployment
- [ ] Check Poseidon hash calculation: `salt = poseidon(px_hi, px_lo, py_hi, py_lo, DOMAIN_TAG)`
- [ ] Confirm stored account salt matches proof salt

### If prover doesn't generate proof:
- [ ] Check prover service is running: `curl http://localhost:3001/health`
- [ ] Verify Noir and Barretenberg binaries are in PATH
- [ ] Check prover logs for circuit execution errors
- [ ] Verify `/tmp/satkey-prove-*` working directories exist

### If signature verification fails:
- [ ] Check Bitcoin address format (should be bech32, not legacy)
- [ ] Verify signed message matches exactly: `login:${nonce}:${expiry}`
- [ ] Check Bitcoin signature is base64 encoded
- [ ] Verify signature was from payment address (BIP-44), not ordinals/Taproot

---

## Success Criteria (All Must Pass)

✅ **Phase 1: Single Transaction**
- [ ] Message format correct: `login:0:1234567890` (decimal nonce)
- [ ] Prover generates proof successfully
- [ ] Cairo account validates proof
- [ ] Transaction executes
- [ ] Nonce increments to 1 on-chain

✅ **Phase 2: Replay Prevention**
- [ ] Second transaction fetches nonce = 1
- [ ] New proof generated with nonce 1
- [ ] Old proof (nonce 0) rejected on-chain
- [ ] New transaction succeeds
- [ ] Nonce increments to 2

✅ **Phase 3: Expiry Validation**
- [ ] Proof with future expiry succeeds
- [ ] Proof with past expiry rejected with "Proof expired"

✅ **Phase 4: Salt Binding**
- [ ] Proof salt matches account salt
- [ ] Wrong salt rejected with "Salt mismatch"

✅ **Phase 5: Bitcoin Signature**
- [ ] Signature verification succeeds for correct address
- [ ] Signature verification fails for wrong address

---

## Live Testing Commands

### Monitor Prover Service
```bash
# In one terminal
curl http://localhost:3001/health
# Should see: {"status":"ok","service":"satkey-prover"}
```

### Monitor Cairo Account Nonce
```bash
# Fetch account nonce via starkli
starkli --account YOUR_ACCOUNT call 0x... get_nonce
# Should see: "0" for fresh account, "1" after first tx, etc.
```

### Check Proof in Transaction Signature
```bash
# View transaction via block explorer
# Look at call signature array
# First element should be proof length (large number)
# Element at index (1 + proof_len + 2) should be nonce
```

### Monitor Prover Logs
```bash
# In prover terminal, should see:
# "Prover response - fullProof length: X publicSignals length: 4"
# This confirms proof was generated successfully
```

---

## Files Modified in This Release

| File | Change | Impact |
|------|--------|--------|
| `apps/frontend/models/SatKeySigner.ts:41` | Nonce to decimal string (not hex) | Fixes message format mismatch |
| `apps/frontend/models/SatKeySigner.ts:77` | Nonce hex-to-decimal conversion | Handles raw hex nonce input |
| `apps/frontend/components/Bridge/BridgeFlow.tsx:244` | Fetch current nonce from contract | Prevents stale nonce reuse |
| `apps/frontend/components/Bridge/BridgeFlow.tsx:406` | Fetch current nonce from contract | Prevents stale nonce reuse |
| `docs/WORKFLOW.md` | Added Phase 3: Bridge Operations & Nonce Handling | Documentation update |

---

## Root Cause Analysis

**Bug**: "deserialization failed" panic when submitting bridge transactions

**Root Cause Chain**:
1. `SatKeySigner.ts` converted nonce to hex using `num.toHex(nonce)`
2. This created message: `login:0x0:1234567890` instead of `login:0:1234567890`
3. Prover validates exact format at `server.ts:84`: `expectedMessage = login:${nonce}:${expiry}`
4. Message didn't match → Prover rejected proof generation
5. Frontend received error but sent invalid proof to verifier anyway
6. Cairo verifier couldn't deserialize invalid proof → "deserialization failed" panic

**Solution**: Convert nonce to decimal string in all code paths:
- `signTransaction`: `nonce.toString()` for number/bigint, keep as-is for string
- `signRaw`: Handle hex prefix with `BigInt(nonce).toString()`, else keep as-is
- `BridgeFlow`: Always pass decimal string from `BigInt(nonceValue).toString()`

**Prevention**: Type system now ensures decimal string format at each boundary.

---

## Commit References
- `9c4655f`: Fix BridgeFlow syntax + WORKFLOW.md documentation
- `3952fdf`: Critical fix for nonce decimal string format (ROOT CAUSE FIX)

