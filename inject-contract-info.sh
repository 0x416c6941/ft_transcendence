#!/bin/bash

# Inject contract address and ABI into blockchain.ts

CONTRACT_DIR="./infra/avalanche-fuji"
ADDRESS_FILE="$CONTRACT_DIR/contract-address.txt"
ABI_FILE="$CONTRACT_DIR/contract-abi.json"
TARGET_FILE="./frontend/src/blockchain.ts"
TEMPLATE_FILE="./frontend/src/blockchain.template.ts"

if [ ! -f "$ADDRESS_FILE" ] || [ ! -f "$ABI_FILE" ]; then
    echo "⚠️  Contract not deployed yet. Blockchain features will not work."
    echo "   Run 'make avalanche-up' to deploy the contract."
    exit 0
fi

CONTRACT_ADDRESS=$(cat "$ADDRESS_FILE")
CONTRACT_ABI=$(cat "$ABI_FILE")

# Replace placeholders in blockchain.ts
sed "s|__CONTRACT_ADDRESS__|$CONTRACT_ADDRESS|g" "$TARGET_FILE" | \
sed "s|__CONTRACT_ABI__|$CONTRACT_ABI|g" > "${TARGET_FILE}.tmp"

mv "${TARGET_FILE}.tmp" "$TARGET_FILE"

echo "✅ Blockchain contract info injected successfully"
echo "   Address: $CONTRACT_ADDRESS"
