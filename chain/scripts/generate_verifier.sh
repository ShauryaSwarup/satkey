#!/usr/bin/env bash
# generate_verifier.sh
#
# Generates a Cairo verifier contract from the Noir circuit's verification key
# using the Garaga SDK (https://github.com/keep-starknet-strange/garaga).
#
# Prerequisites:
#   pip install garaga
#   bb write_vk -b <circuit.json> -o <vk.bin>   (run after bb prove smoke test)
#
# Usage:
#   bash chain/scripts/generate_verifier.sh
#
# Output:
#   chain/src/verifier.cairo  — Garaga-generated UltraHonk verifier

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CIRCUIT_DIR="$REPO_ROOT/circuits/satkey_auth/target"
VK_PATH="$CIRCUIT_DIR/vk.bin"
OUT_DIR="$REPO_ROOT/chain/src"
OUT_FILE="$OUT_DIR/verifier.cairo"

echo "[garaga] Using VK: $VK_PATH"
echo "[garaga] Output: $OUT_FILE"

if [ ! -f "$VK_PATH" ]; then
  echo "ERROR: vk.bin not found at $VK_PATH"
  echo "Run: bb write_vk -b $CIRCUIT_DIR/satkey_auth.json -o $VK_PATH"
  exit 1
fi

mkdir -p "$OUT_DIR"

# Generate Cairo verifier using Garaga CLI
# --system ultra_keccak_honk matches the Barretenberg prover default
garaga gen \
  --system ultra_keccak_honk \
  --vk "$VK_PATH" \
  --output "$OUT_FILE"

echo "[garaga] Verifier written to $OUT_FILE"
echo ""
echo "Next steps:"
echo "  1. Review $OUT_FILE — look for the contract name to use in SatKey account."
echo "  2. Add $OUT_FILE to chain/Scarb.toml (it will be auto-included from src/)."
echo "  3. Build: cd chain && scarb build"
echo "  4. Deploy verifier first, then deploy SatKeyAccount with verifier address + salt."
