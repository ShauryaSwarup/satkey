#!/usr/bin/env bash
# deploy-devnet.sh — Deploy SatKey contracts to starknet-devnet-rs
#
# Prerequisites:
#   1. Docker running with starknet-devnet-rs:
#      docker run -p 5050:5050 shardlabs/starknet-devnet-rs:0.7.2 --seed 0
#   2. sncast in PATH (from starknet-foundry)
#   3. Both satkey_verifier/ and chain/ projects built with `scarb build`
#
# Usage:
#   ./scripts/deploy-devnet.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Config ────────────────────────────────────────────────────────────────────
RPC_URL="${STARKNET_RPC_URL:-http://localhost:5050}"

# Devnet account #0 (seed 0)
ACCOUNT_ADDRESS="0x064b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691"
PRIVATE_KEY="0x71d7bb07b9a64f6f78ac4c816aff4da9"
ACCOUNT_NAME="devnet-deployer"

SNCAST="$HOME/.local/bin/sncast"
ACCOUNTS_FILE="$PROJECT_ROOT/.sncast_accounts.json"

echo "╔══════════════════════════════════════════════╗"
echo "║  SatKey Devnet Deployment                    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "RPC: $RPC_URL"
echo "Deployer: $ACCOUNT_ADDRESS"
echo ""

# ── Step 0: Check devnet is running ──────────────────────────────────────────
echo "⏳ Checking devnet..."
if ! curl -s "$RPC_URL/is_alive" > /dev/null 2>&1; then
  echo "❌ Devnet not running. Start it with:"
  echo "   docker run -p 5050:5050 shardlabs/starknet-devnet-rs:0.7.2 --seed 0"
  exit 1
fi
echo "✅ Devnet is alive"
echo ""

# ── Step 0.5: Import devnet account into sncast ────────────────────────────
echo "⏳ Importing devnet account..."
# Remove existing account entry if present
"$SNCAST" --accounts-file "$ACCOUNTS_FILE" \
  account delete --name "$ACCOUNT_NAME" --network-name devnet 2>/dev/null || true

"$SNCAST" --accounts-file "$ACCOUNTS_FILE" \
  account import \
  --url "$RPC_URL" \
  --name "$ACCOUNT_NAME" \
  --address "$ACCOUNT_ADDRESS" \
  --private-key "$PRIVATE_KEY" \
  --type oz \
  --silent 2>&1

echo "✅ Account imported as '$ACCOUNT_NAME'"
echo ""

# ── Step 1: Check contracts are built ────────────────────────────────────────
VERIFIER_SIERRA="$PROJECT_ROOT/satkey_verifier/target/dev/satkey_verifier_UltraKeccakZKHonkVerifier.contract_class.json"
ACCOUNT_SIERRA="$PROJECT_ROOT/chain/target/dev/satkey_account_SatKeyAccount.contract_class.json"

if [ ! -f "$VERIFIER_SIERRA" ]; then
  echo "❌ Verifier Sierra file not found: $VERIFIER_SIERRA"
  echo "   Run: cd satkey_verifier && scarb build"
  echo "   Available files:"
  ls -la "$PROJECT_ROOT/satkey_verifier/target/dev/" 2>/dev/null || echo "   (directory not found)"
  exit 1
fi
echo "✅ Verifier contract built"

if [ ! -f "$ACCOUNT_SIERRA" ]; then
  echo "❌ Account Sierra file not found: $ACCOUNT_SIERRA"
  echo "   Run: cd chain && scarb build"
  exit 1
fi
echo "✅ Account contract built"
echo ""

# ── Step 2: Declare verifier contract ────────────────────────────────────────
echo "⏳ Declaring verifier contract..."
VERIFIER_DECLARE=$(cd "$PROJECT_ROOT/satkey_verifier" && "$SNCAST" \
  --url "$RPC_URL" \
  --accounts-file "$ACCOUNTS_FILE" \
  --account "$ACCOUNT_NAME" \
  --wait \
  declare \
  --contract-name UltraKeccakZKHonkVerifier 2>&1) || true

echo "$VERIFIER_DECLARE"

# Extract class hash
VERIFIER_CLASS_HASH=$(echo "$VERIFIER_DECLARE" | grep -oE "class_hash: 0x[0-9a-fA-F]+" | head -1 | cut -d' ' -f2)
if [ -z "$VERIFIER_CLASS_HASH" ]; then
  # Maybe already declared — try to extract from error
  VERIFIER_CLASS_HASH=$(echo "$VERIFIER_DECLARE" | grep -oE "0x[0-9a-fA-F]{60,}" | head -1)
fi

if [ -z "$VERIFIER_CLASS_HASH" ]; then
  echo "❌ Failed to declare verifier"
  echo "$VERIFIER_DECLARE"
  exit 1
fi
echo "✅ Verifier class hash: $VERIFIER_CLASS_HASH"
echo ""

# ── Step 3: Deploy verifier contract ─────────────────────────────────────────
echo "⏳ Deploying verifier contract..."
VERIFIER_DEPLOY=$("$SNCAST" \
  --url "$RPC_URL" \
  --accounts-file "$ACCOUNTS_FILE" \
  --account "$ACCOUNT_NAME" \
  --wait \
  deploy \
  --class-hash "$VERIFIER_CLASS_HASH" 2>&1) || true

echo "$VERIFIER_DEPLOY"

VERIFIER_ADDRESS=$(echo "$VERIFIER_DEPLOY" | grep -oE "contract_address: 0x[0-9a-fA-F]+" | head -1 | cut -d' ' -f2)
if [ -z "$VERIFIER_ADDRESS" ]; then
  VERIFIER_ADDRESS=$(echo "$VERIFIER_DEPLOY" | grep -oE "0x[0-9a-fA-F]{60,}" | head -1)
fi

if [ -z "$VERIFIER_ADDRESS" ]; then
  echo "❌ Failed to deploy verifier"
  echo "$VERIFIER_DEPLOY"
  exit 1
fi
echo "✅ Verifier deployed at: $VERIFIER_ADDRESS"
echo ""

# ── Step 4: Declare SatKey account contract ──────────────────────────────────
echo "⏳ Declaring SatKey account contract..."
ACCOUNT_DECLARE=$(cd "$PROJECT_ROOT/chain" && "$SNCAST" \
  --url "$RPC_URL" \
  --accounts-file "$ACCOUNTS_FILE" \
  --account "$ACCOUNT_NAME" \
  --wait \
  declare \
  --contract-name SatKeyAccount 2>&1) || true

echo "$ACCOUNT_DECLARE"

SATKEY_CLASS_HASH=$(echo "$ACCOUNT_DECLARE" | grep -oE "class_hash: 0x[0-9a-fA-F]+" | head -1 | cut -d' ' -f2)
if [ -z "$SATKEY_CLASS_HASH" ]; then
  SATKEY_CLASS_HASH=$(echo "$ACCOUNT_DECLARE" | grep -oE "0x[0-9a-fA-F]{60,}" | head -1)
fi

if [ -z "$SATKEY_CLASS_HASH" ]; then
  echo "❌ Failed to declare SatKey account"
  echo "$ACCOUNT_DECLARE"
  exit 1
fi
echo "✅ SatKey account class hash: $SATKEY_CLASS_HASH"
echo ""

# ── Step 5: Output summary ──────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════╗"
echo "║  Deployment Complete!                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "VERIFIER_ADDRESS=$VERIFIER_ADDRESS"
echo "SATKEY_CLASS_HASH=$SATKEY_CLASS_HASH"
echo ""
echo "Copy these to apps/relayer/.env:"
echo ""
echo "  STARKNET_RPC_URL=$RPC_URL"
echo "  RELAYER_ADDRESS=$ACCOUNT_ADDRESS"
echo "  RELAYER_PRIVATE_KEY=$PRIVATE_KEY"
echo "  SATKEY_CLASS_HASH=$SATKEY_CLASS_HASH"
echo "  VERIFIER_ADDRESS=$VERIFIER_ADDRESS"
echo ""

# ── Write .env file ─────────────────────────────────────────────────────────
ENV_FILE="$PROJECT_ROOT/apps/relayer/.env"
cat > "$ENV_FILE" <<EOF
# Auto-generated by deploy-devnet.sh
STARKNET_RPC_URL=$RPC_URL
RELAYER_ADDRESS=$ACCOUNT_ADDRESS
RELAYER_PRIVATE_KEY=$PRIVATE_KEY
SATKEY_CLASS_HASH=$SATKEY_CLASS_HASH
VERIFIER_ADDRESS=$VERIFIER_ADDRESS
EOF
echo "✅ Written to $ENV_FILE"
