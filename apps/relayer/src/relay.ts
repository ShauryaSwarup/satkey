/**
 * relay.ts
 *
 * Packs a ZK proof + public signals into the Starknet signature array layout,
 * then submits an INVOKE transaction on behalf of a SatKey account.
 *
 * Signature layout (matches satkey_account.cairo __validate__):
 *   [proof_len, ...proof_felts, salt, message_hash_felt, nonce_felt, expiry_felt]
 *
 * BIG-ENDIAN ONLY: felt = bigint % STARK_FIELD_PRIME
 */

import { RpcProvider, Account, num } from "starknet";

const STARK_FIELD_PRIME = BigInt(
  "0x0800000000000011000000000000000000000000000000000000000000000001"
);

export interface RelayRequest {
  /** Hex-encoded raw proof bytes (0x-prefixed) from the prover service */
  proof: string;
  /** Array of 0x-prefixed felt hex strings: [salt, msg_hash, nonce, expiry] */
  publicSignals: string[];
  /** The SatKey account address to invoke */
  starknetAddress: string;
}

export interface RelayResult {
  transactionHash: string;
}

/**
 * Pack proof bytes (big-endian hex) into felt252 array.
 * Each 32-byte chunk → one felt (% STARK_FIELD_PRIME).
 */
function proofHexToFelts(proofHex: string): bigint[] {
  const hex = proofHex.startsWith("0x") ? proofHex.slice(2) : proofHex;
  // Pad to multiple of 64 hex chars (32 bytes)
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");

  const felts: bigint[] = [];
  for (let i = 0; i < padded.length; i += 64) {
    const chunk = padded.slice(i, i + 64);
    const n = BigInt("0x" + chunk);
    felts.push(n % STARK_FIELD_PRIME);
  }
  return felts;
}

/**
 * Builds the full signature span:
 *   [proof_len, ...proof_felts, salt, msg_hash, nonce, expiry]
 */
export function buildSignatureSpan(
  proofHex: string,
  publicSignals: string[]
): string[] {
  const proofFelts = proofHexToFelts(proofHex);
  const proofLen = proofFelts.length;

  const span: string[] = [
    num.toHex(proofLen),
    ...proofFelts.map((f) => num.toHex(f)),
    ...publicSignals, // [salt, msg_hash, nonce, expiry] — already 0x-prefixed felts
  ];

  return span;
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
  const signature = buildSignatureSpan(req.proof, req.publicSignals);

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
  const executeCalldata = [
    // Number of calls = 0 (auth-only tx for MVP)
    "0x0",
    // Signature span appended to calldata for the __execute__ entry
    ...signature,
  ];

  // Submit as a direct call to the SatKey account's __execute__ entrypoint
  // selector: keccak("__execute__")
  const executeTx = await relayerAccount.execute([
    {
      contractAddress: req.starknetAddress,
      entrypoint: "__execute__",
      calldata: executeCalldata,
    },
  ]);

  await provider.waitForTransaction(executeTx.transaction_hash);

  return { transactionHash: executeTx.transaction_hash };
}
