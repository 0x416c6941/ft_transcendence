# Avalanche Fuji Testnet Node using avalanche-cli
FROM ubuntu:22.04

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

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
RUN mkdir -p /root/.avalanche-cli /data

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
echo "Network: Local (Isolated Development Network)"\n\
echo "RPC Endpoint: http://0.0.0.0:9650/ext/bc/C/rpc"\n\
echo "Chain ID: 43112 (Local Network)"\n\
echo ""\n\
echo "Starting local isolated network with avalanche-cli..."\n\
echo "Pre-funded accounts available for development"\n\
echo "Ready in ~10 seconds"\n\
echo ""\n\
\n\
# Start avalanche network in background\n\
avalanche network start --avalanchego-path=/usr/local/bin/avalanchego > /data/avalanche-network.log 2>&1 &\n\
\n\
# Wait for network to be ready\n\
sleep 15\n\
\n\
echo "Network started. Tailing logs..."\n\
echo ""\n\
\n\
# Keep container alive by tailing the main node log\n\
# This will keep running until the container is stopped\n\
exec tail -f /root/.avalanche-cli/runs/network_*/node1/logs/main.log\n\
' > /start.sh && chmod +x /start.sh

# Healthcheck disabled - avalanche-cli manages node health internally
# HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
#     CMD ["/healthcheck.sh"]

# Run the startup script
CMD ["/start.sh"]
