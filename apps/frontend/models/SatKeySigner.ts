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
  pubkey: string;
  address: string;
  message: string;
  signature: string;
  expiry: string;
  salt: string;
  nonce?: string;
}

export class SatKeySigner implements SignerInterface {
  private proverUrl: string;
  private btcProofInputs: ProofInputs;

  constructor(options: { proverUrl: string; btcProofInputs: ProofInputs }) {
    this.proverUrl = options.proverUrl;
    this.btcProofInputs = options.btcProofInputs;
  }

  public async getPubKey(): Promise<string> {
    return num.toHex(this.btcProofInputs.salt);
  }

  public async signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature> {
    // Ensure nonce is a decimal string (not hex) for Bitcoin message signature verification
    const nonce = transactionsDetail.nonce || 0;
    const nonceStr = typeof nonce === 'bigint' || typeof nonce === 'number' ? nonce.toString() : nonce;

    // Reconstruct message with current nonce: login:${nonce}:${expiry}
    // CRITICAL: nonce must be DECIMAL STRING, not hex (e.g., "0" not "0x0")
    const message = `login:${nonceStr}:${this.btcProofInputs.expiry}`;

    const response = await fetch(`${this.proverUrl}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: this.btcProofInputs.pubkey,
        address: this.btcProofInputs.address,
        message,
        signature: this.btcProofInputs.signature,
        expiry: this.btcProofInputs.expiry,
        nonce: nonceStr,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Prover failed: ${error.error}`);
    }
    
    const { fullProof, publicSignals } = await response.json();
    console.log("Prover response - fullProof length:", fullProof.length, "publicSignals length:", publicSignals.length);
    
    return fullProof;
  }

  public async signRaw(hash: string): Promise<Signature> {
    // Ensure nonce is a decimal string (not hex)
    let nonce = this.btcProofInputs.nonce || "0";
    const nonceStr = nonce.startsWith('0x') ? BigInt(nonce).toString() : nonce;

    // Reconstruct message with current nonce: login:${nonce}:${expiry}
    // CRITICAL: nonce must be DECIMAL STRING, not hex (e.g., "0" not "0x0")
    const message = `login:${nonceStr}:${this.btcProofInputs.expiry}`;

    const response = await fetch(`${this.proverUrl}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: this.btcProofInputs.pubkey,
        address: this.btcProofInputs.address,
        message,
        signature: this.btcProofInputs.signature,
        expiry: this.btcProofInputs.expiry,
        nonce: nonceStr,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Prover failed: ${error.error}`);
    }

    const { fullProof, publicSignals } = await response.json();
    console.log("Prover response - fullProof length:", fullProof.length, "publicSignals length:", publicSignals.length);

    return fullProof;
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
