import {
  SignerInterface,
  Signature,
  num,
  DeclareSignerDetails,
  DeployAccountSignerDetails,
  TypedData,
  Call,
  InvocationsSignerDetails,
} from "starknet";

export interface ProofInputs {
  pubkey: string;       // Bitcoin public key (hex)
  signature_r: string;  // ECDSA r component — valid for the nonce at construction time
  signature_s: string;  // ECDSA s component — valid for the nonce at construction time
  message_hash: string; // Hash of the Bitcoin auth message — nonce-specific, see note below
  expiry: string;       // Expiry timestamp baked into the signed message
  salt: string;         // Circuit-derived Poseidon fingerprint of pubkey (publicSignals[0])
  nonce?: string;       // Nonce this signature was created for (stored for signRaw)
}

// NOTE ON STALE SIGNATURES:
// The Bitcoin signature in ProofInputs was created over a message containing a specific
// nonce (e.g. "Nonce: 0"). If the on-chain account nonce advances, signTransaction will
// fail at the prover because the stored signature no longer matches the new message.
//
// The correct fix is to store a signing *capability* (a function that calls the wallet)
// rather than a static signature, and request a fresh signature on every transaction.
// This signer is designed for single-session use only (nonce stays constant).
// For multi-transaction sessions, wrap SatKeySigner and call the wallet per tx.

export class SatKeySigner implements SignerInterface {
  private proverUrl: string;
  private btcProofInputs: ProofInputs;

  constructor(options: { proverUrl: string; btcProofInputs: ProofInputs }) {
    this.proverUrl = options.proverUrl;
    this.btcProofInputs = options.btcProofInputs;
  }

  public async getPubKey(): Promise<string> {
    // FIX: salt is now correctly set to publicSignals[0] by ZkAuthFlow.
    // This is the circuit-derived Poseidon fingerprint of the pubkey — matches getPubKey
    // expectations and what the contract stores as public_key_salt.
    return num.toHex(this.btcProofInputs.salt);
  }

  public async signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature> {
    const nonce = transactionsDetail.nonce ?? 0;
    // Nonce must be decimal for the message string — the circuit receives it as a Field
    const nonceDecimal =
      typeof nonce === "bigint" || typeof nonce === "number"
        ? nonce.toString()
        : BigInt(nonce).toString();

    // FIX: Reconstruct the message using the CURRENT nonce, then recompute its hash.
    // The stored signature_r/s was signed over a message with a specific nonce baked in.
    // If the on-chain nonce has advanced, the stored sig/hash will no longer match —
    // the prover will reject it. For a proper multi-tx session, a fresh wallet signature
    // should be requested here. For now we detect the mismatch and throw early.
    const storedNonce = this.btcProofInputs.nonce ?? "0";
    const storedNonceDecimal =
      storedNonce.startsWith("0x")
        ? BigInt(storedNonce).toString()
        : storedNonce;

    if (nonceDecimal !== storedNonceDecimal) {
      throw new Error(
        `SatKeySigner: on-chain nonce (${nonceDecimal}) does not match the nonce this ` +
        `session was created for (${storedNonceDecimal}). ` +
        `A fresh Bitcoin signature is required for each new nonce. ` +
        `Re-authenticate via ZkAuthFlow to obtain updated credentials.`
      );
    }

    return this._callProver(nonceDecimal);
  }

  public async signRaw(hash: string): Promise<Signature> {
    // signRaw is used by is_valid_signature — it doesn't receive a live nonce from the SDK.
    // We use the stored nonce, which is only correct if the session nonce hasn't advanced.
    const nonce = this.btcProofInputs.nonce ?? "0";
    const nonceDecimal = nonce.startsWith("0x") ? BigInt(nonce).toString() : nonce;
    return this._callProver(nonceDecimal);
  }

  private async _callProver(nonceDecimal: string): Promise<Signature> {
    const response = await fetch(`${this.proverUrl}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: this.btcProofInputs.pubkey,
        signature_r: this.btcProofInputs.signature_r,
        signature_s: this.btcProofInputs.signature_s,
        message_hash: this.btcProofInputs.message_hash,
        expiry: this.btcProofInputs.expiry,
        nonce: nonceDecimal,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Prover failed: ${error.error}`);
    }

    const { fullProof, publicSignals } = await response.json();
    console.log(
      "Prover response — fullProof length:", fullProof.length,
      "| salt:", publicSignals[0],
      "| nonce:", publicSignals[2],
      "| expiry:", publicSignals[3],
    );

    // Signature format: [proof_len, ...fullProof]
    // publicSignals are NOT appended — the contract reads exactly proof_len felts
    // and receives public inputs from the Garaga verifier's return value directly.
    return [
      num.toHex(fullProof.length),
      ...fullProof,
    ];
  }

  public async signMessage(
    typedData: TypedData,
    accountAddress: string
  ): Promise<Signature> {
    throw new Error(
      "signMessage not implemented for SatKeySigner — use signTransaction."
    );
  }

  public async signDeclareTransaction(
    details: DeclareSignerDetails
  ): Promise<Signature> {
    throw new Error("signDeclareTransaction not supported by SatKeyAccount");
  }

  public async signDeployAccountTransaction(
    details: DeployAccountSignerDetails
  ): Promise<Signature> {
    throw new Error(
      "signDeployAccountTransaction not implemented. Use UDC deployment via /api/deploy."
    );
  }
}
