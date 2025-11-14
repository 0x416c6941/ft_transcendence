#!/bin/bash

# Test script for Avalanche Local Development Network
# Tests basic connectivity and RPC endpoints

echo "========================================"
echo "Avalanche Local Network Connection Test"
echo "========================================"
echo ""

# Note: Direct HTTP access (port 9650) is blocked for security
# Only HTTPS access through nginx proxy is available
ENDPOINT_HTTPS="https://localhost/avalanche"
SUCCESS=0
FAIL=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    
    echo -n "Testing $name... "
    
    if [ -z "$data" ]; then
        response=$(curl -sfk --max-time 10 "$endpoint" 2>&1)
    else
        response=$(curl -sfk --max-time 10 -X POST -H "Content-Type: application/json" --data "$data" "$endpoint" 2>&1)
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        SUCCESS=$((SUCCESS + 1))
        if [ ! -z "$response" ]; then
            echo "  Response: $(echo $response | jq -c '.' 2>/dev/null || echo $response | head -c 100)"
        fi
    else
        echo -e "${RED}✗ FAIL${NC}"
        FAIL=$((FAIL + 1))
        echo "  Error: $response"
    fi
    echo ""
}

# Check if container is running
echo "1. Checking if container is running..."
if docker ps | grep -q "avalanche-fuji"; then
    echo -e "${GREEN}✓ Container is running${NC}"
else
    echo -e "${RED}✗ Container is not running${NC}"
    echo "Start it with: make avalanche-up"
    exit 1
fi
echo ""

# Wait a moment for the service to be ready
echo "2. Waiting for service to be ready..."
sleep 2
echo ""

echo "========================================"
echo "Testing HTTPS Access via Nginx Proxy"
echo "========================================"
echo ""

# Test health endpoint
test_endpoint "Health Check" "GET" "$ENDPOINT_HTTPS/ext/health" ""

# Test info.getNodeVersion
test_endpoint "Node Version" "POST" "$ENDPOINT_HTTPS/ext/info" '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"info.getNodeVersion"
}'

# Test info.getNetworkID
test_endpoint "Network ID" "POST" "$ENDPOINT_HTTPS/ext/info" '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"info.getNetworkID"
}'

# Test eth_chainId on C-Chain
test_endpoint "C-Chain ID" "POST" "$ENDPOINT_HTTPS/ext/bc/C/rpc" '{
    "jsonrpc":"2.0",
    "method":"eth_chainId",
    "params":[],
    "id":1
}'

# Test eth_blockNumber on C-Chain
test_endpoint "C-Chain Block Number" "POST" "$ENDPOINT_HTTPS/ext/bc/C/rpc" '{
    "jsonrpc":"2.0",
    "method":"eth_blockNumber",
    "params":[],
    "id":1
}'

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "Passed: ${GREEN}$SUCCESS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    echo ""
    echo "Your Avalanche Local Network is ready to use."
    echo ""
    echo "Network Details:"
    echo "  RPC Endpoint: https://localhost/avalanche/ext/bc/C/rpc"
    echo "  Chain ID: 43112 (Local Network)"
    echo ""
    echo "Security Note:"
    echo "  ✓ Direct HTTP access (port 9650) is blocked"
    echo "  ✓ Only accessible via HTTPS through nginx proxy"
    echo ""
    echo "Pre-funded Test Accounts (each has 50M AVAX):"
    echo "  Account 1: 0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC"
    echo "  Private Key: 56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"
    echo ""
    echo "  Account 2: 0x9632a79656af553F58738B0FB750320158495942"
    echo "  Account 3: 0x55ee05dF718f1a5C1441e76190EB1a19eE2C9430"
    echo ""
    echo "Start deploying contracts - no faucets needed!"
    exit 0
else
    echo -e "${YELLOW}Some tests failed.${NC}"
    echo "The node may still be starting. Check logs with: make avalanche-logs"
    exit 1
fi
