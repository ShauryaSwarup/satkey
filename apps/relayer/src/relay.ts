/**
 * relay.ts
 *
 * Packs a ZK proof + public signals into the Starknet signature array layout,
 * then submits an INVOKE transaction on behalf of a SatKey account.
 *
 * Signature layout (matches satkey_account.cairo __validate__):
 *   [...fullProof_felts]
 *
 * BIG-ENDIAN ONLY: felt = bigint % STARK_FIELD_PRIME
 */

import { RpcProvider, Account, num } from "starknet";

export interface RelayRequest {
  /** Array of felt252 hex strings containing the FullProof (ZKHonkProof + MSM/KZG hints) */
  fullProof: string[];
  /** Array of 0x-prefixed felt hex strings: [salt, msg_hash, nonce, expiry] */
  publicSignals: string[];
  /** The SatKey account address to invoke */
  starknetAddress: string;
}

export interface RelayResult {
  transactionHash: string;
}


 /**
 * Builds the full signature span:
 * For Garaga verifier, the signature is just the FullProof serialized struct.
 * We also don't need to append publicSignals separately because they are checked
 * against the verifier output inside the contract.
 */
export function buildSignatureSpan(
  fullProof: string[]
): string[] {
  // fullProof is already an array of felt252 hex strings
  return fullProof;
}

/**
 * Submit a relay transaction.
 * The relayer account pays gas; the SatKey account contract authorises via ZK proof.
 */
export async function submitRelayTransaction(
  req: RelayRequest
): Promise<RelayResult> {
  const rpcUrl =
    process.env.STARKNET_RPC_URL ||
    "http://localhost:5050";
  const relayerAddress = process.env.RELAYER_ADDRESS;
  const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;

  if (!relayerAddress || !relayerPrivateKey) {
    throw new Error(
      "Missing RELAYER_ADDRESS or RELAYER_PRIVATE_KEY in environment"
    );
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const relayerAccount = new Account(provider, relayerAddress, relayerPrivateKey);

  // Build the custom signature for the SatKey account
  const signature = buildSignatureSpan(req.fullProof);
  // The SatKey account address is the target of the outer invoke
  // We construct a "meta-transaction": relayer calls SatKey.__execute__
  // with the ZK proof as signature.
  //
  // In practice with Starknet INVOKE v3, we build a transaction where:
  //   - sender = SatKey account address (validated by ZK proof in __validate__)
  //   - signature = packed proof + public signals
  //
  // The relayer serves as the fee-paying account; here we use a different approach:
  // We call the account's __execute__ directly from the relayer's account,
  // passing the proof in calldata for the SatKey account to verify.
  //
  // Production approach: Use Starknet's INVOKE v3 with the SatKey account as sender.
  // The relayer must be authorised (e.g., via paymaster) or the user pre-funds the account.

  // For MVP: relayer invokes a "relay" function on the SatKey account contract.
  // The SatKey account verifies the proof internally.

  // Submit as a direct call to the SatKey account's execute_from_relayer entrypoint
  // This bypasses the caller == 0 check and validates the signature natively
  const executeTx = await relayerAccount.execute([
    {
      contractAddress: req.starknetAddress,
      entrypoint: "execute_from_relayer",
      calldata: [
        // Number of calls = 0 (auth-only tx for MVP)
        "0x0",
        // Signature length
        num.toHex(signature.length),
        // Signature felts
        ...signature,
      ],
    },
  ]);

  await provider.waitForTransaction(executeTx.transaction_hash);

  return { transactionHash: executeTx.transaction_hash };
}
