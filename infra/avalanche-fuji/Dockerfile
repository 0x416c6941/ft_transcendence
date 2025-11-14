# Avalanche Fuji Testnet Node using avalanche-cli
FROM ubuntu:22.04
LABEL ft_transcendence.stage="run"

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18 (required for ethers v6)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Install avalanche-cli
# Using the latest stable release
ARG AVALANCHE_CLI_VERSION=v1.8.4
RUN curl -sSfL https://raw.githubusercontent.com/ava-labs/avalanche-cli/main/scripts/install.sh | sh -s -- -b /usr/local/bin ${AVALANCHE_CLI_VERSION}

# Download AvalancheGo binary directly
ARG AVALANCHEGO_VERSION=v1.11.11
RUN wget -q https://github.com/ava-labs/avalanchego/releases/download/${AVALANCHEGO_VERSION}/avalanchego-linux-amd64-${AVALANCHEGO_VERSION}.tar.gz \
    && tar -xzf avalanchego-linux-amd64-${AVALANCHEGO_VERSION}.tar.gz \
    && mv avalanchego-${AVALANCHEGO_VERSION}/avalanchego /usr/local/bin/ \
    && rm -rf avalanchego-*

# Create directories for Avalanche data and config
RUN mkdir -p /root/.avalanche-cli /root/.avalanche-cli/data /app

# Copy contract deployment files
COPY TournamentStorage.sol /app/
COPY deploy-contract.js /app/
COPY package.json /app/

# Install node dependencies
WORKDIR /app
RUN npm install

# Set working directory
WORKDIR /root

# Expose RPC ports
# 9650 - Standard Avalanche API port
EXPOSE 9650

# Create healthcheck script
RUN echo '#!/bin/sh\n\
# Check if avalanchego process is running\n\
if ! pgrep -f avalanchego > /dev/null; then\n\
    exit 1\n\
fi\n\
# Check if API is responding (with timeout)\n\
if ! curl -sf --max-time 5 http://localhost:9650/ext/health > /dev/null 2>&1; then\n\
    exit 1\n\
fi\n\
exit 0' > /healthcheck.sh && chmod +x /healthcheck.sh

# Create startup script that uses avalanche-cli
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "========================================"\n\
echo "Starting Avalanche LOCAL Network"\n\
echo "========================================"\n\
echo ""\n\
echo "Network: Local (Persistent Development Network)"\n\
echo "RPC Endpoint: http://0.0.0.0:9650/ext/bc/C/rpc"\n\
echo "Chain ID: 43112 (Local Network)"\n\
echo ""\n\
\n\
# Check if this is first run\n\
if [ ! -d "/root/.avalanche-cli/db" ]; then\n\
    echo "First run - initializing persistent blockchain..."\n\
else\n\
    echo "Resuming from existing blockchain state..."\n\
fi\n\
echo ""\n\
\n\
echo "Starting local network with avalanche-cli..."\n\
echo "Pre-funded accounts available for development"\n\
echo "Ready in ~10 seconds"\n\
echo ""\n\
\n\
# Check if there are stale network directories from previous runs\n\
EXISTING_NETWORKS=$(ls -1d /root/.avalanche-cli/runs/network_* 2>/dev/null | wc -l)\n\
\n\
if [ "$EXISTING_NETWORKS" -gt "0" ]; then\n\
    echo "Found $EXISTING_NETWORKS stale network(s) from previous runs"\n\
    echo "Cleaning up to start fresh..."\n\
    avalanche network clean > /dev/null 2>&1 || true\n\
fi\n\
\n\
# Start avalanche network in background\n\
avalanche network start --avalanchego-path=/usr/local/bin/avalanchego > /root/.avalanche-cli/data/network.log 2>&1 &\n\
\n\
# Wait for network to be ready\n\
sleep 15\n\
\n\
# Deploy contract if not already deployed\n\
echo "Checking smart contract..."\n\
cd /app\n\
\n\
# Check if contract address file exists and if contract has bytecode\n\
NEED_DEPLOY=true\n\
if [ -f /root/.avalanche-cli/data/contract-address.txt ]; then\n\
    CONTRACT_ADDR=$(cat /root/.avalanche-cli/data/contract-address.txt)\n\
    echo "Found existing contract address: $CONTRACT_ADDR"\n\
    echo "Verifying contract bytecode..."\n\
    \n\
    # Use curl to check if contract has bytecode\n\
    BYTECODE=$(curl -s -X POST http://localhost:9650/ext/bc/C/rpc \\\n\
        -H "Content-Type: application/json" \\\n\
        -d "{\\"jsonrpc\\":\\"2.0\\",\\"method\\":\\"eth_getCode\\",\\"params\\":[\\"$CONTRACT_ADDR\\",\\"latest\\"],\\"id\\":1}" \\\n\
        | grep -o "\\"result\\":\\"0x[^\\"]*\\"" | cut -d\\" -f4)\n\
    \n\
    if [ "$BYTECODE" != "0x" ] && [ -n "$BYTECODE" ]; then\n\
        echo "✅ Contract has bytecode - using existing deployment"\n\
        NEED_DEPLOY=false\n\
    else\n\
        echo "⚠️  Contract has no bytecode - blockchain was reset, redeploying..."\n\
    fi\n\
fi\n\
\n\
if [ "$NEED_DEPLOY" = true ]; then\n\
    echo "Deploying smart contract..."\n\
    AVALANCHE_RPC="http://localhost:9650/ext/bc/C/rpc" node deploy-contract.js\n\
    if [ -f contract-address.txt ]; then\n\
        cp contract-address.txt /root/.avalanche-cli/data/\n\
        cp contract-abi.json /root/.avalanche-cli/data/\n\
        echo "Contract deployed and saved to /root/.avalanche-cli/data/"\n\
    fi\n\
fi\n\
\n\
echo "Network started. Tailing logs..."\n\
echo ""\n\
\n\
# Keep container alive by tailing the main node log\n\
exec tail -f /root/.avalanche-cli/runs/network_*/node1/logs/main.log\n\
' > /start.sh && chmod +x /start.sh

# Healthcheck disabled - avalanche-cli manages node health internally
# HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
#     CMD ["/healthcheck.sh"]

# Run the startup script
CMD ["/start.sh"]
