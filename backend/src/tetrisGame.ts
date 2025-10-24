// Tetris Game Server Logic
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
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
import { saveGameRecord, isSocketAuthenticated, GameRecord } from './utils/gameStats.js';

interface GameState {
    player1: PlayerState;
    player2: PlayerState;
    started: boolean;
}

interface PlayerInfo {
    side: PlayerSide | null;
    alias: string;
    input: { left: boolean; right: boolean; down: boolean; rotate: boolean; drop: boolean };
}

// Game state
const state: GameState = {
    player1: createPlayerState(),
    player2: createPlayerState(),
    started: false
};

// Player tracking
const players = new Map<string, PlayerInfo>();
let gameInterval: NodeJS.Timeout | null = null;
let currentGameRecord: Partial<GameRecord> | null = null;

function step(): void {
    if (!state.started) return;
    
    // Update both players using their input from state (for local multiplayer)
    updatePlayer(state.player1);
    updatePlayer(state.player2);
}

function resetGame(): void {
    resetPlayerState(state.player1);
    resetPlayerState(state.player2);
    state.started = false;
}

export function setupTetrisGame(fastify: FastifyInstance, io: Server): void {
    const tetrisNamespace = io.of('/tetris');
    
    tetrisNamespace.on('connection', (socket: Socket) => {
        fastify.log.info(`Tetris player connected: ${socket.id}`);
        
        // Determine player role
        const existingPlayers = Array.from(players.values());
        const hasPlayer1 = existingPlayers.some(p => p.side === 'player1');
        const hasPlayer2 = existingPlayers.some(p => p.side === 'player2');
        
        let side: PlayerSide | null = null;
        if (!hasPlayer1) {
            side = 'player1';
        } else if (!hasPlayer2) {
            side = 'player2';
        }
        
        players.set(socket.id, {
            side,
            alias: '',
            input: { left: false, right: false, down: false, rotate: false, drop: false }
        });
        
        socket.emit('role', { side });
        
        // Handle alias setup - receives both player aliases at once for local multiplayer
        socket.on('set_aliases', async (data: { alias1: string; alias2: string }) => {
            const player = players.get(socket.id);
            if (!player) return;
            
            const alias1 = data.alias1.trim();
            const alias2 = data.alias2.trim();
            if (!alias1 || !alias2) return;
            
            // Set both aliases
            state.player1.alias = alias1;
            state.player2.alias = alias2;
            
            // Mark the controlling player as having both aliases
            player.alias = alias1; // Mark as set
            
            // Start the game immediately for local multiplayer
            if (!state.started) {
                state.started = true;
                spawnNewPiece(state.player1);
                spawnNewPiece(state.player2);
                
                // Initialize game record
                // For local 2-player game, check if the single socket is authenticated
                // Both players share the same authentication status
                const isAuthenticated = isSocketAuthenticated(socket);
                currentGameRecord = {
                    game_name: 'Tetris Local',
                    started_at: new Date().toISOString(),
                    player1_name: state.player1.alias,
                    player1_is_user: isAuthenticated,
                    player2_name: state.player2.alias,
                    player2_is_user: isAuthenticated
                };
                
                tetrisNamespace.emit('game_started', {
                    player1Alias: state.player1.alias,
                    player2Alias: state.player2.alias
                });
            }
        });
        
        // Handle input - for local multiplayer, accept inputs for both players
        socket.on('input', (data: { player: 'player1' | 'player2', keys: Partial<PlayerInfo['input']> }) => {
            // For local multiplayer, any connected client can control both players
            const targetPlayer = data.player === 'player1' ? state.player1 : state.player2;
            
            if (data.keys.left !== undefined) targetPlayer.input.left = data.keys.left;
            if (data.keys.right !== undefined) targetPlayer.input.right = data.keys.right;
            if (data.keys.down !== undefined) targetPlayer.input.down = data.keys.down;
            if (data.keys.rotate !== undefined) targetPlayer.input.rotate = data.keys.rotate;
            if (data.keys.drop !== undefined) targetPlayer.input.drop = data.keys.drop;
        });
        
        // Handle disconnect
        socket.on('disconnect', async () => {
            fastify.log.info(`Tetris player disconnected: ${socket.id}`);
            players.delete(socket.id);
            
            // If a player disconnects, stop the game
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
                tetrisNamespace.emit('game_ended', { reason: 'player_disconnected' });
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
            
            tetrisNamespace.emit('game_state', snapshot);
            
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
                
                tetrisNamespace.emit('game_ended', { reason: 'game_over', winner });
                resetGame();
            }
        }, 1000 / TICK_HZ);
    }
    
    fastify.log.info('Tetris game server initialized');
}
