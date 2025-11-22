// Tetris Remote Game Server Logic - for authenticated remote multiplayer
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import {
    TICK_HZ,
    GRAVITY_TICKS,
    PlayerState,
    PlayerSide,
    createPlayerState,
    resetPlayerState,
    spawnNewPiece,
    updatePlayer,
    createPlayerSnapshot
} from './tetrisShared.js';
import { saveGameRecord, GameRecord } from './utils/gameStats.js';

const COUNTDOWN_SECONDS = 3;

interface RemotePlayer {
    socketId: string;
    userId: number;
    displayName: string;
}

interface RemoteRoom {
    id: string;
    player1: RemotePlayer | null;
    player2: RemotePlayer | null;
    status: 'waiting' | 'countdown' | 'playing' | 'finished';
    gameState: GameState | null;
    countdownTimer: NodeJS.Timeout | null;
    gameInterval: NodeJS.Timeout | null;
    startedAt: Date | null;
    gameSaved?: boolean;
}

interface GameState {
    player1: PlayerState;
    player2: PlayerState;
    started: boolean;
    currentGravityTicks: number;
}

// Store active rooms
const rooms = new Map<string, RemoteRoom>();

async function getDisplayName(fastify: FastifyInstance, userId: number): Promise<string> {
    return new Promise((resolve) => {
        fastify.sqlite.get('SELECT display_name FROM users WHERE id = ?', [userId], (err: Error | null, row: any) => {
            if (err || !row) resolve('Player');
            else resolve(row.display_name);
        });
    });
}

function createGameState(): GameState {
    return {
        player1: createPlayerState(),
        player2: createPlayerState(),
        started: false,
        currentGravityTicks: GRAVITY_TICKS
    };
}

function resetGame(room: RemoteRoom): void {
    if (!room.gameState) return;
    resetPlayerState(room.gameState.player1);
    resetPlayerState(room.gameState.player2);
    room.gameState.started = false;
    room.gameState.currentGravityTicks = GRAVITY_TICKS;
}

function step(room: RemoteRoom): void {
    if (!room.gameState || !room.gameState.started) return;
    
    // Update both players and collect new gravity speed
    const newGravityP1 = updatePlayer(room.gameState.player1, room.gameState.currentGravityTicks);
    const newGravityP2 = updatePlayer(room.gameState.player2, room.gameState.currentGravityTicks);
    
    // Use the minimum (fastest) gravity from either player's line clears
    room.gameState.currentGravityTicks = Math.min(newGravityP1, newGravityP2);
}

function updateGame(room: RemoteRoom): boolean {
    if (!room.gameState) return false;
    
    step(room);
    
    // Check if game should end
    return room.gameState.player1.gameOver || room.gameState.player2.gameOver;
}

function startCountdown(room: RemoteRoom, io: Server, fastify: FastifyInstance): void {
    if (!room.player1 || !room.player2) return;

    room.status = 'countdown';
    let countdown = COUNTDOWN_SECONDS;

    io.to(room.id).emit('remote_tetris_match_announced', {
        player1: room.player1.displayName,
        player2: room.player2.displayName,
        countdown: countdown
    });

    room.countdownTimer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            if (room.countdownTimer) {
                clearInterval(room.countdownTimer);
                room.countdownTimer = null;
            }
            startGame(room, io, fastify);
        }
    }, 1000);
}

function startGame(room: RemoteRoom, io: Server, fastify: FastifyInstance): void {
    room.status = 'playing';
    room.gameState = createGameState();
    room.gameState.started = true;
    room.startedAt = new Date();
    room.gameSaved = false;

    // Set player aliases
    if (room.player1) room.gameState.player1.alias = room.player1.displayName;
    if (room.player2) room.gameState.player2.alias = room.player2.displayName;

    // Spawn initial pieces
    spawnNewPiece(room.gameState.player1);
    spawnNewPiece(room.gameState.player2);

    io.to(room.id).emit('remote_tetris_match_started', {
        player1Alias: room.gameState.player1.alias,
        player2Alias: room.gameState.player2.alias
    });

    room.gameInterval = setInterval(async () => {
        if (!room.gameState) return;

        const gameEnded = updateGame(room);

        // Send game state snapshot
        const snapshot = {
            player1: createPlayerSnapshot(room.gameState.player1),
            player2: createPlayerSnapshot(room.gameState.player2),
            started: room.gameState.started
        };
        
        io.to(room.id).emit('remote_tetris_game_state', snapshot);

        // Check for winner
        if (gameEnded && !room.gameSaved) {
            room.gameSaved = true;
            await endGame(room, io, fastify);
        }
    }, 1000 / TICK_HZ);

    fastify.log.info(`Remote tetris game started in room ${room.id}: ${room.gameState.player1.alias} vs ${room.gameState.player2.alias}`);
}

async function endGame(room: RemoteRoom, io: Server, fastify: FastifyInstance): Promise<void> {
    if (room.gameInterval) {
        clearInterval(room.gameInterval);
        room.gameInterval = null;
    }

    if (!room.gameState || !room.player1 || !room.player2) return;

    const winner = room.gameState.player1.gameOver ? room.player2.displayName : room.player1.displayName;
    room.status = 'finished';

    io.to(room.id).emit('remote_tetris_match_ended', { winner });

    // Save game record
    const gameRecord: GameRecord = {
        game_name: 'Tetris Remote',
        started_at: room.startedAt?.toISOString() || new Date().toISOString(),
        finished_at: new Date().toISOString(),
        player1_name: room.player1.displayName,
        player1_is_user: true,
        player2_name: room.player2.displayName,
        player2_is_user: true,
        winner: winner,
        data: JSON.stringify({
            reason: 'game_over',
            winner: winner,
            player1: {
                alias: room.gameState.player1.alias,
                score: room.gameState.player1.score,
                linesCleared: room.gameState.player1.linesCleared,
                gameOver: room.gameState.player1.gameOver
            },
            player2: {
                alias: room.gameState.player2.alias,
                score: room.gameState.player2.score,
                linesCleared: room.gameState.player2.linesCleared,
                gameOver: room.gameState.player2.gameOver
            }
        })
    };

    try {
        await saveGameRecord(fastify, gameRecord);
        fastify.log.info(`Remote tetris game saved: ${room.player1.displayName} vs ${room.player2.displayName}, winner: ${winner}`);
    } catch (error) {
        fastify.log.error({ err: error }, 'Failed to save remote tetris game record');
    }

    // Clean up room after a delay
    setTimeout(() => {
        rooms.delete(room.id);
        fastify.log.info(`Remote tetris room ${room.id} cleaned up`);
    }, 10000);
}

export function setupTetrisRemote(fastify: FastifyInstance, io: Server): void {
    io.on('connection', (socket: Socket) => {
        socket.on('remote_tetris_join', async (data: { roomId: string }) => {
            const userId = (socket as any).userId;
            const username = (socket as any).username;

            if (!userId || !username) {
                socket.emit('remote_tetris_error', { message: 'Authentication required' });
                return;
            }

            const displayName = await getDisplayName(fastify, userId);
            const playersInGame = (fastify as any).playersInGame as Map<number, { gameType: string; roomId: string }>;

            let room = rooms.get(data.roomId);

            // Create room if it doesn't exist
            if (!room) {
                room = {
                    id: data.roomId,
                    player1: {
                        socketId: socket.id,
                        userId: userId,
                        displayName: displayName
                    },
                    player2: null,
                    status: 'waiting',
                    gameState: null,
                    countdownTimer: null,
                    gameInterval: null,
                    startedAt: null
                };
                rooms.set(data.roomId, room);
                socket.join(data.roomId);
                
                // Track player in game
                playersInGame.set(userId, { gameType: 'tetris_remote', roomId: data.roomId });
                
                io.to(data.roomId).emit('remote_tetris_room_state', { room });
                
                fastify.log.info(`Remote tetris room created: ${data.roomId} by ${displayName}`);
            } else if (!room.player2) {
                // Join as player 2
                room.player2 = {
                    socketId: socket.id,
                    userId: userId,
                    displayName: displayName
                };
                socket.join(data.roomId);
                
                // Track player in game
                playersInGame.set(userId, { gameType: 'tetris_remote', roomId: data.roomId });

                io.to(data.roomId).emit('remote_tetris_room_state', { room });

                fastify.log.info(`Player 2 joined remote tetris room: ${data.roomId} - ${displayName}`);

                // Start countdown since both players are present
                startCountdown(room, io, fastify);
            } else {
                socket.emit('remote_tetris_error', { message: 'Room is full' });
            }
        });

        socket.on('remote_tetris_input', (data: { roomId: string; keys: Partial<PlayerState['input']> }) => {
            const room = rooms.get(data.roomId);
            if (!room || !room.gameState || room.status !== 'playing') return;

            // Determine which player this socket controls
            let targetPlayer: PlayerState | null = null;
            if (room.player1 && socket.id === room.player1.socketId) {
                targetPlayer = room.gameState.player1;
            } else if (room.player2 && socket.id === room.player2.socketId) {
                targetPlayer = room.gameState.player2;
            }

            if (!targetPlayer) return;

            // Update input state
            if (data.keys.left !== undefined) targetPlayer.input.left = data.keys.left;
            if (data.keys.right !== undefined) targetPlayer.input.right = data.keys.right;
            if (data.keys.down !== undefined) targetPlayer.input.down = data.keys.down;
            if (data.keys.rotate !== undefined) targetPlayer.input.rotate = data.keys.rotate;
            if (data.keys.drop !== undefined) targetPlayer.input.drop = data.keys.drop;
        });

        socket.on('remote_tetris_leave', async (data: { roomId: string }) => {
            const room = rooms.get(data.roomId);
            const playersInGame = (fastify as any).playersInGame as Map<number, { gameType: string; roomId: string }>;
            
            if (!room) return;
            
            // Remove both players from playersInGame map
            if (room.player1) playersInGame.delete(room.player1.userId);
            if (room.player2) playersInGame.delete(room.player2.userId);

            // If game is active and not already finished/saved, end it
            if (room.status === 'playing' && room.gameState) {
                // Determine winner (the player who didn't leave)
                let winner = 'Nobody';
                if (room.player1 && socket.id !== room.player1.socketId) {
                    winner = room.player1.displayName;
                } else if (room.player2 && socket.id !== room.player2.socketId) {
                    winner = room.player2.displayName;
                }

                // Save game record with disconnect reason
                if (room.player1 && room.player2 && room.startedAt) {
                    const gameRecord: GameRecord = {
                        game_name: 'Tetris Remote',
                        started_at: room.startedAt.toISOString(),
                        finished_at: new Date().toISOString(),
                        player1_name: room.player1.displayName,
                        player1_is_user: true,
                        player2_name: room.player2.displayName,
                        player2_is_user: true,
                        winner: winner !== 'Nobody' ? winner : undefined,
                        data: JSON.stringify({
                            reason: 'player_left',
                            winner: winner
                        })
                    };

                    try {
                        await saveGameRecord(fastify, gameRecord);
                    } catch (error) {
                        fastify.log.error({ err: error }, 'Failed to save game record on leave');
                    }
                }

                io.to(room.id).emit('remote_tetris_match_ended', { winner, reason: 'player_left' });
            }

            // Clean up
            if (room.countdownTimer) clearInterval(room.countdownTimer);
            if (room.gameInterval) clearInterval(room.gameInterval);
            rooms.delete(data.roomId);

            socket.leave(data.roomId);
            fastify.log.info(`Player left remote tetris room: ${data.roomId}`);
        });

        socket.on('disconnect', async () => {
            const playersInGame = (fastify as any).playersInGame as Map<number, { gameType: string; roomId: string }>;
            
            // Find and clean up any rooms this socket was in
            for (const [roomId, room] of rooms.entries()) {
                if ((room.player1 && room.player1.socketId === socket.id) ||
                    (room.player2 && room.player2.socketId === socket.id)) {
                    
                    // Remove both players from playersInGame map
                    if (room.player1) playersInGame.delete(room.player1.userId);
                    if (room.player2) playersInGame.delete(room.player2.userId);
                    
                    // If game is active and not already finished/saved, end it
                    if (room.status === 'playing' && room.gameState) {
                        let winner = 'Nobody';
                        if (room.player1 && socket.id !== room.player1.socketId) {
                            winner = room.player1.displayName;
                        } else if (room.player2 && socket.id !== room.player2.socketId) {
                            winner = room.player2.displayName;
                        }

                        // Save game record
                        if (room.player1 && room.player2 && room.startedAt) {
                            const gameRecord: GameRecord = {
                                game_name: 'Tetris Remote',
                                started_at: room.startedAt.toISOString(),
                                finished_at: new Date().toISOString(),
                                player1_name: room.player1.displayName,
                                player1_is_user: true,
                                player2_name: room.player2.displayName,
                                player2_is_user: true,
                                winner: winner !== 'Nobody' ? winner : undefined,
                                data: JSON.stringify({
                                    reason: 'player_disconnected',
                                    winner: winner
                                })
                            };

                            try {
                                await saveGameRecord(fastify, gameRecord);
                            } catch (error) {
                                fastify.log.error({ err: error }, 'Failed to save game record on disconnect');
                            }
                        }

                        io.to(room.id).emit('remote_tetris_match_ended', { winner, reason: 'player_disconnected' });
                    }

                    // Clean up
                    if (room.countdownTimer) clearInterval(room.countdownTimer);
                    if (room.gameInterval) clearInterval(room.gameInterval);
                    rooms.delete(roomId);
                    
                    fastify.log.info(`Player disconnected from remote tetris room: ${roomId}`);
                }
            }
        });
    });

    fastify.log.info('Tetris Remote game server initialized');
}
