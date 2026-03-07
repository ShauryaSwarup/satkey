-- Active Bitcoin to Starknet swaps table
CREATE TABLE active_swaps (
  btc_pubkey TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  input_amount TEXT NOT NULL,
  output_amount TEXT NOT NULL,
  fee TEXT NOT NULL,
  starknet_address TEXT NOT NULL,
  confirmations INTEGER DEFAULT 0,
  swap_state INTEGER NOT NULL,
  quote_expiry BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups by Starknet address
CREATE INDEX idx_active_swaps_starknet_address ON active_swaps(starknet_address);

-- Index for faster lookups by tx_id
CREATE INDEX idx_active_swaps_tx_id ON active_swaps(tx_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_active_swaps_updated_at
  BEFORE UPDATE ON active_swaps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
