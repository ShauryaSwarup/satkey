import {
  SignerInterface,
  Signature,
  num,
  DeclareSignerDetails,
  DeployAccountSignerDetails,
  TypedData,
  Call,
  InvocationsSignerDetails
} from "starknet";

export interface ProofInputs {
  pubkey: string;       // Bitcoin public key (hex)
  signature_r: string;  // ECDSA r component
  signature_s: string;  // ECDSA s component
  message_hash: string; // Hash of the Bitcoin auth message
  expiry: string;       // Expiry timestamp
  salt: string;         // Deterministic Starknet salt (hex)
  nonce?: string;        // Optional nonce (for signRaw)
}

export class SatKeySigner implements SignerInterface {
  private proverUrl: string;
  private btcProofInputs: ProofInputs;

  constructor(options: { proverUrl: string; btcProofInputs: ProofInputs }) {
    this.proverUrl = options.proverUrl;
    this.btcProofInputs = options.btcProofInputs;
  }

  public async getPubKey(): Promise<string> {
    // The salt acts as the deterministic public identifier for SatKey accounts
    return num.toHex(this.btcProofInputs.salt);
  }

  public async signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature> {
    // 1. Extract the nonce provided by Starknet.js for this transaction
    const nonce = transactionsDetail.nonce || 0;

    // 2. Call the prover service to generate a ZK proof for this specific nonce
    const response = await fetch(`${this.proverUrl}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: this.btcProofInputs.pubkey,
        signature_r: this.btcProofInputs.signature_r,
        signature_s: this.btcProofInputs.signature_s,
        message_hash: this.btcProofInputs.message_hash,
        expiry: this.btcProofInputs.expiry,
        nonce: num.toHex(nonce),
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Prover failed: ${error.error}`);
    }
    const { fullProof, publicSignals } = await response.json();
    console.log("Prover response - fullProof length:", fullProof.length, "publicSignals length:", publicSignals.length);
    // 3. Format according to SatKeyAccount's expected signature layout:
    // [proof_len, ...fullProof]
    // Note: We DO NOT append publicSignals because:
    // 1. The account contract only slices up to proof_len and gets public_inputs from the verifier's return value.
    // 2. publicSignals (like message_hash) can exceed the Starknet felt prime (252-bit limit) and cause RPC errors.
    return [
      num.toHex(fullProof.length),
      ...fullProof,
    ];
  }

  public async signRaw(hash: string): Promise<Signature> {
    // For SatKey, even raw signing requires a nonce for the ZK proof.
    // We use the one from btcProofInputs or default to 0.
    const nonce = this.btcProofInputs.nonce || "0";

    const response = await fetch(`${this.proverUrl}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: this.btcProofInputs.pubkey,
        signature_r: this.btcProofInputs.signature_r,
        signature_s: this.btcProofInputs.signature_s,
        message_hash: this.btcProofInputs.message_hash,
        expiry: this.btcProofInputs.expiry,
        nonce: num.toHex(nonce),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Prover failed: ${error.error}`);
    }

    const { fullProof, publicSignals } = await response.json();
    console.log("Prover response - fullProof length:", fullProof.length, "publicSignals length:", publicSignals.length);

    // Layout: [proof_len, ...fullProof]
    // Note: We DO NOT append publicSignals because they can exceed the Starknet felt prime (252-bit limit).
    return [
      num.toHex(fullProof.length),
      ...fullProof,
    ];
  }

  public async signMessage(typedData: TypedData, accountAddress: string): Promise<Signature> {
    throw new Error("signMessage not implemented for SatKeySigner — use signTransaction.");
  }

  public async signDeclareTransaction(details: DeclareSignerDetails): Promise<Signature> {
    throw new Error("signDeclareTransaction not supported by SatKeyAccount");
  }

  public async signDeployAccountTransaction(details: DeployAccountSignerDetails): Promise<Signature> {
    throw new Error("signDeployAccountTransaction not implemented. Use UDC deployment via /api/deploy.");
  }
}