import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { JsonRpcProvider, Wallet, Contract, FetchRequest } from 'ethers';
import { authenticateToken } from '../middleware/auth.js';
import fs from 'fs';

let contract: Contract | null = null;
let provider: JsonRpcProvider | null = null;

// Initialize blockchain connection
async function initBlockchain() {
	try {
		// Read contract info from avalanche container's mounted volume
		const contractAddress = fs.readFileSync('/data/contract-address.txt', 'utf-8').trim();
		const contractAbi = JSON.parse(fs.readFileSync('/data/contract-abi.json', 'utf-8'));
		
		// Read private key from Docker secret
		if (!process.env.BACKEND_BLOCKCHAIN_PRIVATE_KEY_PATH) {
			throw new Error('BACKEND_BLOCKCHAIN_PRIVATE_KEY_PATH environment variable is not set');
		}
		const privateKey = fs.readFileSync(process.env.BACKEND_BLOCKCHAIN_PRIVATE_KEY_PATH, 'utf-8').trim();
		
		// Connect to avalanche RPC (internal docker network)
		// Custom FetchRequest to set Host header that Avalanche expects
		const fetchReq = new FetchRequest('http://ft_transcendence-avalanche-fuji:9650/ext/bc/C/rpc');
		fetchReq.setHeader('Host', '127.0.0.1:9650');
		
		provider = new JsonRpcProvider(fetchReq, {
			chainId: 43112,
			name: 'Avalanche Local'
		}, {
			staticNetwork: true
		});
		
		// Use pre-funded account from secret
		const wallet = new Wallet(privateKey, provider);
		
		contract = new Contract(contractAddress, contractAbi, wallet);
		
		console.log('✅ Blockchain initialized with contract:', contractAddress);
		return true;
	} catch (error) {
		console.error('Failed to initialize blockchain:', error);
		return false;
	}
}

export default async function blockchainRoutes(fastify: FastifyInstance) {
	// Initialize on startup
	await initBlockchain();
	
	// Save tournament to blockchain
	fastify.post('/api/blockchain/tournament/:uuid', {
		preHandler: authenticateToken
	}, async (request, reply) => {
		try {
			if (!contract) {
				return reply.code(503).send({ error: 'Blockchain not available' });
			}
			
			const { uuid } = request.params as { uuid: string };
			
			// Check if tournament already exists - prevent overwriting
			try {
				const exists = await contract.tournamentExists(uuid);
				if (exists) {
					return reply.code(409).send({ error: 'Tournament already saved to blockchain' });
				}
			} catch (checkError) {
				console.warn('Could not check tournament existence, proceeding with save:', checkError);
			}
			
			const data = JSON.stringify(request.body);
			
			console.log(`💾 Saving tournament ${uuid} to blockchain...`);
			
			const tx = await contract.saveTournament(uuid, data);
			await tx.wait();
			
			console.log(`✅ Tournament ${uuid} saved to blockchain`);
			
			return reply.send({ success: true, transactionHash: tx.hash });
		} catch (error: any) {
			console.error('Failed to save to blockchain:', error);
			// Map on-chain revert reason to HTTP 409 (conflict) for duplicate saves.
			const msg = error?.message || '';
			if (msg.includes('Tournament already exists') || msg.includes('already exists')) {
				return reply.code(409).send({ error: 'Tournament already saved to blockchain' });
			}
			return reply.code(500).send({ error: msg });
		}
	});
	
	// Get tournament from blockchain
	fastify.get('/api/blockchain/tournament/:uuid', {
		preHandler: authenticateToken
	}, async (request, reply) => {
		try {
			if (!contract) {
				return reply.code(503).send({ error: 'Blockchain not available' });
			}
			
			const { uuid } = request.params as { uuid: string };
			
			console.log(`📖 Reading tournament ${uuid} from blockchain...`);
			
			const data = await contract.getTournament(uuid);
			
			if (!data) {
				return reply.code(404).send({ error: 'Tournament not found on blockchain' });
			}
			
			console.log(`✅ Tournament ${uuid} loaded from blockchain`);
			
			return reply.send(JSON.parse(data));
		} catch (error: any) {
			console.error('Failed to read from blockchain:', error);
			return reply.code(500).send({ error: error.message });
		}
	});
	
	// Check if tournament exists on blockchain
	fastify.get('/api/blockchain/tournament/:uuid/exists', {
		preHandler: authenticateToken
	}, async (request, reply) => {
		try {
			if (!contract) {
				return reply.send({ exists: false, available: false });
			}
			
			const { uuid } = request.params as { uuid: string };
			
			try {
				const exists = await contract.tournamentExists(uuid);
				return reply.send({ exists, available: true });
			} catch (contractError: any) {
				// If contract call fails, assume it doesn't exist
				console.warn(`Contract call failed for ${uuid}:`, contractError.message);
				return reply.send({ exists: false, available: true });
			}
		} catch (error: any) {
			console.error('Failed to check tournament existence:', error);
			return reply.send({ exists: false, available: false });
		}
	});
}
