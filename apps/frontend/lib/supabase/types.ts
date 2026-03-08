/**
 * Represents an active (or historical) cross-chain swap persisted in Supabase.
 * Mirrors the `active_swaps` table schema.
 */
export type ActiveSwap = {
  /** Bitcoin public key hex identifying the initiating wallet */
  btc_pubkey: string;
  /** Bitcoin transaction ID on the source chain */
  tx_id: string;
  /** Swap input amount as a string (BTC or STRK depending on direction) */
  amount: string;
  /** Input amount without fees */
  input_amount: string;
  /** Output amount the user receives */
  output_amount: string;
  /** Swap fee amount */
  fee: string;
  /** Starknet address of the recipient */
  starknet_address: string;
  /** Number of bitcoin confirmations received so far */
  confirmations: number;
  /** Current swap state (matches SpvFromBTCSwapState enum values) */
  swap_state: number;
  /** Quote expiry as UNIX millisecond timestamp */
  quote_expiry: number;
  /** ISO-8601 timestamp when the swap was created */
  created_at: string;
  /** ISO-8601 timestamp when the swap was last updated */
  updated_at: string;
  /** Swap direction indicating the source and destination chains */
  swap_type: "STRK_TO_BTC" | "BTC_TO_STRK";
};
