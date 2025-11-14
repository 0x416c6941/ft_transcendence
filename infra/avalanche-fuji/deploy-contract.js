#!/usr/bin/env node

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const solc = require('solc');

// Configuration
const RPC_URL = process.env.AVALANCHE_RPC || 'http://localhost:9650/ext/bc/C/rpc';

// Read private key from Docker secret
const privateKeyPath = process.env.AVALANCHE_BLOCKCHAIN_PRIVATE_KEY_PATH;
if (!privateKeyPath) {
    console.error('❌ AVALANCHE_BLOCKCHAIN_PRIVATE_KEY_PATH environment variable is not set');
    process.exit(1);
}

let PRIVATE_KEY;
try {
    PRIVATE_KEY = fs.readFileSync(privateKeyPath, 'utf8').trim();
} catch (error) {
    console.error('❌ Failed to read private key from:', privateKeyPath);
    console.error(error);
    process.exit(1);
}

const CONTRACT_ADDRESS_FILE = path.join(__dirname, 'contract-address.txt');
const CONTRACT_ABI_FILE = path.join(__dirname, 'contract-abi.json');
const PERSISTENT_CONTRACT_ADDRESS_FILE = '/root/.avalanche-cli/data/contract-address.txt';
const PERSISTENT_CONTRACT_ABI_FILE = '/root/.avalanche-cli/data/contract-abi.json';

async function main() {
    console.log('🔗 Connecting to Avalanche local network...');
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('📝 Deployer address:', wallet.address);
    
    // Check if contract already deployed (check persistent volume first)
    if (fs.existsSync(PERSISTENT_CONTRACT_ADDRESS_FILE)) {
        const existingAddress = fs.readFileSync(PERSISTENT_CONTRACT_ADDRESS_FILE, 'utf8').trim();
        console.log('✅ Contract already deployed at:', existingAddress);
        // Copy to local directory for consistency
        fs.copyFileSync(PERSISTENT_CONTRACT_ADDRESS_FILE, CONTRACT_ADDRESS_FILE);
        if (fs.existsSync(PERSISTENT_CONTRACT_ABI_FILE)) {
            fs.copyFileSync(PERSISTENT_CONTRACT_ABI_FILE, CONTRACT_ABI_FILE);
        }
        return;
    }
    
    // Compile contract
    console.log('🔨 Compiling contract...');
    const contractPath = path.join(__dirname, 'TournamentStorage.sol');
    const source = fs.readFileSync(contractPath, 'utf8');
    
    const input = {
        language: 'Solidity',
        sources: {
            'TournamentStorage.sol': { content: source }
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode']
                }
            }
        }
    };
    
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
        const errors = output.errors.filter(e => e.severity === 'error');
        if (errors.length > 0) {
            console.error('❌ Compilation errors:');
            errors.forEach(e => console.error(e.formattedMessage));
            process.exit(1);
        }
    }
    
    const contract = output.contracts['TournamentStorage.sol']['TournamentStorage'];
    const abi = contract.abi;
    const bytecode = contract.evm.bytecode.object;
    
    // Deploy contract
    console.log('🚀 Deploying contract...');
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const deployedContract = await factory.deploy();
    await deployedContract.waitForDeployment();
    
    const address = await deployedContract.getAddress();
    console.log('✅ Contract deployed at:', address);
    
    // Save address and ABI
    fs.writeFileSync(CONTRACT_ADDRESS_FILE, address);
    fs.writeFileSync(CONTRACT_ABI_FILE, JSON.stringify(abi, null, 2));
    
    console.log('💾 Contract info saved to:', CONTRACT_ADDRESS_FILE);
    console.log('📋 ABI saved to:', CONTRACT_ABI_FILE);
}

main().catch(error => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
});
