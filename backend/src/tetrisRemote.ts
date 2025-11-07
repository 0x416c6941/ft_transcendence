// Tetris Remote Game Server Logic - for authenticated remote multiplayer
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import { verifyToken } from './utils/jwt.js';
import {
    TICK_HZ,
    PlayerState,
    PlayerSide,
    createPlayerState,
    resetPlayerState,
    spawnNewPiece,
    updatePlayer,
    createPlayerSnapshot
} from './tetrisShared.js';
import { saveGameRecord, GameRecord } from './utils/gameStats.js';

interface GameState {
    player1: PlayerState;
    player2: PlayerState;
    started: boolean;
}

interface RemotePlayer {
    socketId: string;
    userId: number;
    username: string;
    side: PlayerSide;
}

// Game state
const state: GameState = {
    player1: createPlayerState(),
    player2: createPlayerState(),
    started: false
};

// Player tracking - only 2 players allowed
const players = new Map<string, RemotePlayer>();
let gameInterval: NodeJS.Timeout | null = null;
let currentGameRecord: Partial<GameRecord> | null = null;

function resetGame(): void {
    resetPlayerState(state.player1);
    resetPlayerState(state.player2);
    state.started = false;
    players.clear();
}

function step(): void {
    if (!state.started) return;
    
    updatePlayer(state.player1);
    updatePlayer(state.player2);
}

export function setupTetrisRemote(fastify: FastifyInstance, io: Server): void {
    const tetrisRemoteNamespace = io.of('/tetris-remote');
    
    // JWT Authentication middleware
    tetrisRemoteNamespace.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.cookie
                ?.split(';')
                .find((row: string) => row.trim().startsWith('accessToken='))
                ?.split('=')[1];
            
            if (!token) return next(new Error('Authentication required'));
            
            const decoded = await verifyToken(token);
            if (!decoded?.userId || !decoded?.username) {
                return next(new Error('Invalid token'));
            }
            
            // Attach user info to socket
            (socket as any).userId = decoded.userId;
            (socket as any).username = decoded.username;
            next();
        } catch (error) {
            next(new Error('Authentication failed'));
        }
    });
    
	tetrisRemoteNamespace.on('connection', (socket: Socket) => {
		const userId = (socket as any).userId;
		const username = (socket as any).username;
		
		fastify.log.info(`Tetris Remote player connected: ${username} (${userId}), current players: ${players.size}`);
		
		// Check if this user is already in the game (reconnection)
		const existingPlayer = Array.from(players.values()).find(p => p.userId === userId);
		if (existingPlayer) {
			// Remove old socket entry and add new one (reconnection)
			players.delete(existingPlayer.socketId);
			fastify.log.info(`Player ${username} reconnecting, removing old socket ${existingPlayer.socketId}`);
		}
		
		// Check if game is full (and user is not reconnecting)
		if (players.size >= 2 && !existingPlayer) {
			fastify.log.warn(`Game is full, rejecting ${username}`);
			socket.emit('connection_error', { message: 'Game is full' });
			socket.disconnect();
			return;
		}        // Assign player side
        const side: PlayerSide = players.size === 0 ? 'player1' : 'player2';
        players.set(socket.id, { socketId: socket.id, userId, username, side });
        
        // Set player alias to username
        state[side].alias = username;
        
        // Notify player of their role
        socket.emit('role_assigned', { side });
        
        // Start game if both players are connected
        if (players.size === 2 && !state.started) {
            state.started = true;
            spawnNewPiece(state.player1);
            spawnNewPiece(state.player2);
            
            // Initialize game record (both players are authenticated users in remote game)
            currentGameRecord = {
                game_name: 'Tetris Remote',
                started_at: new Date().toISOString(),
                player1_name: state.player1.alias,
                player1_is_user: true,
                player2_name: state.player2.alias,
                player2_is_user: true
            };
            
            tetrisRemoteNamespace.emit('game_started', {
                player1Alias: state.player1.alias,
                player2Alias: state.player2.alias
            });
            
            fastify.log.info(`Tetris Remote game started: ${state.player1.alias} vs ${state.player2.alias}`);
        }
        
        // Handle input - each socket only controls their assigned player
        socket.on('input', (data: { keys: Partial<PlayerState['input']> }) => {
            const player = players.get(socket.id);
            if (!player) return;
            
            const targetPlayer = state[player.side];
            
            if (data.keys.left !== undefined) targetPlayer.input.left = data.keys.left;
            if (data.keys.right !== undefined) targetPlayer.input.right = data.keys.right;
            if (data.keys.down !== undefined) targetPlayer.input.down = data.keys.down;
            if (data.keys.rotate !== undefined) targetPlayer.input.rotate = data.keys.rotate;
            if (data.keys.drop !== undefined) targetPlayer.input.drop = data.keys.drop;
        });
        
        // Handle disconnect
        socket.on('disconnect', async () => {
            fastify.log.info(`Tetris Remote player disconnected: ${username}`);
            players.delete(socket.id);
            
            // If a player disconnects during game, end it
            if (state.started && currentGameRecord) {
                // Save game record on disconnect
                currentGameRecord.finished_at = new Date().toISOString();
                currentGameRecord.data = JSON.stringify({
                    reason: 'player_disconnected',
                    player1: {
                        alias: state.player1.alias,
                        score: state.player1.score,
                        linesCleared: state.player1.linesCleared
                    },
                    player2: {
                        alias: state.player2.alias,
                        score: state.player2.score,
                        linesCleared: state.player2.linesCleared
                    }
                });
                
                await saveGameRecord(fastify, currentGameRecord as GameRecord);
                currentGameRecord = null;
                
                resetGame();
                tetrisRemoteNamespace.emit('game_ended', { reason: 'player_disconnected' });
            }
        });
    });
    
    // Game loop
    if (!gameInterval) {
        gameInterval = setInterval(async () => {
            step();
            
            // Create snapshot for clients
            const snapshot = {
                player1: createPlayerSnapshot(state.player1),
                player2: createPlayerSnapshot(state.player2),
                started: state.started
            };
            
            tetrisRemoteNamespace.emit('game_state', snapshot);
            
            // Check if game should end
            if (state.started && (state.player1.gameOver || state.player2.gameOver)) {
                const winner = state.player1.gameOver ? state.player2.alias : state.player1.alias;
                
                // Save game record
                if (currentGameRecord) {
                    currentGameRecord.finished_at = new Date().toISOString();
                    currentGameRecord.winner = winner;
                    currentGameRecord.data = JSON.stringify({
                        reason: 'game_over',
                        winner: winner,
                        player1: {
                            alias: state.player1.alias,
                            score: state.player1.score,
                            linesCleared: state.player1.linesCleared,
                            gameOver: state.player1.gameOver
                        },
                        player2: {
                            alias: state.player2.alias,
                            score: state.player2.score,
                            linesCleared: state.player2.linesCleared,
                            gameOver: state.player2.gameOver
                        }
                    });
                    
                    await saveGameRecord(fastify, currentGameRecord as GameRecord);
                    currentGameRecord = null;
                }
                
                tetrisRemoteNamespace.emit('game_ended', { reason: 'game_over', winner });
                resetGame();
            }
        }, 1000 / TICK_HZ);
    }
    
    fastify.log.info('Tetris Remote game server initialized');
}
