// Remote Pong Game Server Logic - for 1v1 invited matches
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import { saveGameRecord, GameRecord } from './utils/gameStats.js';

// Constants - matching TournamentPongGame
const WIDTH = 640;
const HEIGHT = 360;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 6;
const BALL_SIZE = 10;
const TICK_HZ = 60;
const WINNING_SCORE = 10;
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
    inputStates: Map<string, InputState>;
    countdownTimer: NodeJS.Timeout | null;
    gameInterval: NodeJS.Timeout | null;
    startedAt: Date | null;
}

type InputState = {
    up: boolean;
    down: boolean;
};

interface GameState {
    ball: { x: number; y: number; vx: number; vy: number };
    paddles: { leftY: number; rightY: number };
    score: { left: number; right: number };
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

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

function createGameState(): GameState {
    return {
        ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 4, vy: 3 },
        paddles: { leftY: HEIGHT / 2 - PADDLE_HEIGHT / 2, rightY: HEIGHT / 2 - PADDLE_HEIGHT / 2 },
        score: { left: 0, right: 0 },
    };
}

function resetBall(gameState: GameState, direction: 1 | -1): void {
    gameState.ball.x = WIDTH / 2;
    gameState.ball.y = HEIGHT / 2;
    gameState.ball.vx = 4 * direction;
    gameState.ball.vy = (Math.random() * 2 + 2) * (Math.random() < 0.5 ? -1 : 1);
}

function updatePaddles(room: RemoteRoom): void {
    if (!room.gameState) return;

    const leftInput = room.inputStates.get(room.player1?.socketId || '');
    const rightInput = room.inputStates.get(room.player2?.socketId || '');

    // Update left paddle
    if (leftInput?.up) room.gameState.paddles.leftY -= PADDLE_SPEED;
    if (leftInput?.down) room.gameState.paddles.leftY += PADDLE_SPEED;
    room.gameState.paddles.leftY = clamp(room.gameState.paddles.leftY, 0, HEIGHT - PADDLE_HEIGHT);

    // Update right paddle
    if (rightInput?.up) room.gameState.paddles.rightY -= PADDLE_SPEED;
    if (rightInput?.down) room.gameState.paddles.rightY += PADDLE_SPEED;
    room.gameState.paddles.rightY = clamp(room.gameState.paddles.rightY, 0, HEIGHT - PADDLE_HEIGHT);
}

const MAX_BOUNCE_ANGLE = Math.PI / 6;
const SPEED_MULTIPLIER = 1.1;

function updateGame(room: RemoteRoom): boolean {
    const gameState = room.gameState;
    if (!gameState) return false;

    // Update paddles based on input
    updatePaddles(room);

    // Move ball
    gameState.ball.x += gameState.ball.vx;
    gameState.ball.y += gameState.ball.vy;

    // Ball collisions with top/bottom walls
    if (gameState.ball.y <= 0 || gameState.ball.y >= HEIGHT - BALL_SIZE) {
        gameState.ball.vy *= -1;
        gameState.ball.y = clamp(gameState.ball.y, 0, HEIGHT - BALL_SIZE);
    }

    // Left paddle collision
    if (
        gameState.ball.x <= PADDLE_WIDTH &&
        gameState.ball.y + BALL_SIZE >= gameState.paddles.leftY &&
        gameState.ball.y <= gameState.paddles.leftY + PADDLE_HEIGHT
    ) {
        const paddleCenter = gameState.paddles.leftY + PADDLE_HEIGHT / 2;
        const ballCenter = gameState.ball.y + BALL_SIZE / 2;
        const deltaY = ballCenter - paddleCenter;
        const normalizedDelta = deltaY / (PADDLE_HEIGHT / 2);
        let bounceAngle = normalizedDelta * MAX_BOUNCE_ANGLE;
        const randomOffset = (Math.random() - 0.5) * 0.2;
        bounceAngle += randomOffset;
        bounceAngle = clamp(bounceAngle, -MAX_BOUNCE_ANGLE, MAX_BOUNCE_ANGLE);
        let speed = Math.sqrt(gameState.ball.vx ** 2 + gameState.ball.vy ** 2);
        speed *= SPEED_MULTIPLIER;
        gameState.ball.vx = speed * Math.cos(bounceAngle);
        gameState.ball.vy = speed * Math.sin(bounceAngle);
        gameState.ball.x = PADDLE_WIDTH;
    }

    // Right paddle collision
    if (
        gameState.ball.x + BALL_SIZE >= WIDTH - PADDLE_WIDTH &&
        gameState.ball.y + BALL_SIZE >= gameState.paddles.rightY &&
        gameState.ball.y <= gameState.paddles.rightY + PADDLE_HEIGHT
    ) {
        const paddleCenter = gameState.paddles.rightY + PADDLE_HEIGHT / 2;
        const ballCenter = gameState.ball.y + BALL_SIZE / 2;
        const deltaY = ballCenter - paddleCenter;
        const normalizedDelta = deltaY / (PADDLE_HEIGHT / 2);
        let bounceAngle = normalizedDelta * MAX_BOUNCE_ANGLE;
        const randomOffset = (Math.random() - 0.5) * 0.2;
        bounceAngle += randomOffset;
        bounceAngle = clamp(bounceAngle, -MAX_BOUNCE_ANGLE, MAX_BOUNCE_ANGLE);
        let speed = Math.sqrt(gameState.ball.vx ** 2 + gameState.ball.vy ** 2);
        speed *= SPEED_MULTIPLIER;
        gameState.ball.vx = -speed * Math.cos(bounceAngle);
        gameState.ball.vy = speed * Math.sin(bounceAngle);
        gameState.ball.x = WIDTH - PADDLE_WIDTH - BALL_SIZE;
    }

    // Handle goals
    if (gameState.ball.x < 0) {
        gameState.score.right += 1;
        resetBall(gameState, 1);
    } else if (gameState.ball.x > WIDTH - BALL_SIZE) {
        gameState.score.left += 1;
        resetBall(gameState, -1);
    }

    // Check for game end
    return gameState.score.left >= WINNING_SCORE || gameState.score.right >= WINNING_SCORE;
}

function startCountdown(room: RemoteRoom, io: Server, fastify: FastifyInstance): void {
    if (!room.player1 || !room.player2) return;

    room.status = 'countdown';
    let countdown = COUNTDOWN_SECONDS;

    io.to(room.id).emit('remote_pong_match_announced', {
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
    room.startedAt = new Date();

    io.to(room.id).emit('remote_pong_match_started');

    room.gameInterval = setInterval(() => {
        if (!room.gameState) return;

        const gameEnded = updateGame(room);

        // Send game state snapshot
        io.to(room.id).emit('remote_pong_game_state', {
            width: WIDTH,
            height: HEIGHT,
            paddles: room.gameState.paddles,
            ball: { x: room.gameState.ball.x, y: room.gameState.ball.y },
            score: room.gameState.score
        });

        // Check for winner
        if (gameEnded) {
            endGame(room, io, fastify);
        }
    }, 1000 / TICK_HZ);
}

async function endGame(room: RemoteRoom, io: Server, fastify: FastifyInstance): Promise<void> {
    if (room.gameInterval) {
        clearInterval(room.gameInterval);
        room.gameInterval = null;
    }

    if (!room.gameState || !room.player1 || !room.player2) return;

    const winner = room.gameState.score.left >= WINNING_SCORE ? room.player1.displayName : room.player2.displayName;
    room.status = 'finished';

    io.to(room.id).emit('remote_pong_match_ended', { winner });

    // Save game record
    const gameRecord: GameRecord = {
        game_name: 'Pong Remote',
        started_at: room.startedAt?.toISOString() || new Date().toISOString(),
        finished_at: new Date().toISOString(),
        player1_name: room.player1.displayName,
        player1_is_user: true,
        player2_name: room.player2.displayName,
        player2_is_user: true,
        winner: winner,
        data: JSON.stringify({
            player1Score: room.gameState.score.left,
            player2Score: room.gameState.score.right
        })
    };

    try {
        await saveGameRecord(fastify, gameRecord);
        fastify.log.info(`Remote pong game saved: ${room.player1.displayName} vs ${room.player2.displayName}, winner: ${winner}`);
    } catch (error) {
        fastify.log.error({ err: error }, 'Failed to save remote pong game record');
    }

    // Clean up room after a delay
    setTimeout(() => {
        rooms.delete(room.id);
        fastify.log.info(`Remote pong room ${room.id} cleaned up`);
    }, 10000);
}

export function setupRemotePong(fastify: FastifyInstance, io: Server): void {
    io.on('connection', (socket: Socket) => {
        socket.on('remote_pong_join', async (data: { roomId: string }) => {
            const userId = (socket as any).userId;
            const username = (socket as any).username;

            if (!userId || !username) {
                socket.emit('remote_pong_error', { message: 'Authentication required' });
                return;
            }

            const displayName = await getDisplayName(fastify, userId);

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
                    inputStates: new Map(),
                    countdownTimer: null,
                    gameInterval: null,
                    startedAt: null
                };
                rooms.set(data.roomId, room);
                socket.join(data.roomId);
                
                // Initialize input state for player 1
                room.inputStates.set(socket.id, { up: false, down: false });
                
                io.to(data.roomId).emit('remote_pong_room_state', { room });
                
                fastify.log.info(`Remote pong room created: ${data.roomId} by ${displayName}`);
            } else if (!room.player2) {
                // Join as player 2
                room.player2 = {
                    socketId: socket.id,
                    userId: userId,
                    displayName: displayName
                };
                socket.join(data.roomId);

                // Initialize input state for player 2
                room.inputStates.set(socket.id, { up: false, down: false });

                io.to(data.roomId).emit('remote_pong_room_state', { room });

                fastify.log.info(`Player 2 joined remote pong room: ${data.roomId} - ${displayName}`);

                // Start countdown since both players are present
                startCountdown(room, io, fastify);
            } else {
                socket.emit('remote_pong_error', { message: 'Room is full' });
            }
        });

        socket.on('remote_pong_input', (data: { roomId: string; input: { up: boolean; down: boolean } }) => {
            const room = rooms.get(data.roomId);
            if (!room || !room.gameState || room.status !== 'playing') return;

            // Update input state for this socket
            const inputState = room.inputStates.get(socket.id);
            if (inputState) {
                inputState.up = data.input.up;
                inputState.down = data.input.down;
            }
        });

        socket.on('remote_pong_leave', async (data: { roomId: string }) => {
            const room = rooms.get(data.roomId);
            if (!room) return;

            // Mark the socket as having left intentionally
            (socket as any).intentionallyLeft = true;

            // If game is active, save and end it
            if (room.status === 'playing' && room.gameState && room.player1 && room.player2) {
                // Determine winner (the player who didn't leave)
                let winner = 'Nobody';
                let winnerPlayer = null;
                let leavingPlayer = null;
                
                if (room.player1 && socket.id !== room.player1.socketId) {
                    winner = room.player1.displayName;
                    winnerPlayer = room.player1;
                    leavingPlayer = room.player2;
                } else if (room.player2 && socket.id !== room.player2.socketId) {
                    winner = room.player2.displayName;
                    winnerPlayer = room.player2;
                    leavingPlayer = room.player1;
                }

                io.to(room.id).emit('remote_pong_match_ended', { winner });
                
                // Save game record
                if (winnerPlayer) {
                    const gameRecord: GameRecord = {
                        game_name: 'Pong Remote',
                        started_at: room.startedAt?.toISOString() || new Date().toISOString(),
                        finished_at: new Date().toISOString(),
                        player1_name: room.player1.displayName,
                        player1_is_user: true,
                        player2_name: room.player2.displayName,
                        player2_is_user: true,
                        winner: winner,
                        data: JSON.stringify({
                            player1Score: room.gameState.score.left,
                            player2Score: room.gameState.score.right,
                            reason: 'player_left',
                            left_player: leavingPlayer?.displayName
                        })
                    };

                    try {
                        await saveGameRecord(fastify, gameRecord);
                        fastify.log.info(`Remote pong game saved on leave: ${room.player1.displayName} vs ${room.player2.displayName}, winner: ${winner}`);
                    } catch (error) {
                        fastify.log.error({ err: error }, 'Failed to save remote pong game record on leave');
                    }
                }
            }

            // Clean up
            if (room.countdownTimer) clearInterval(room.countdownTimer);
            if (room.gameInterval) clearInterval(room.gameInterval);
            rooms.delete(data.roomId);

            socket.leave(data.roomId);
            fastify.log.info(`Player left remote pong room: ${data.roomId}`);
        });

        socket.on('disconnect', async () => {
            // If the player already left intentionally, don't process again
            if ((socket as any).intentionallyLeft) {
                return;
            }
            
            // Find and clean up any rooms this socket was in
            for (const [roomId, room] of rooms.entries()) {
                if ((room.player1 && room.player1.socketId === socket.id) ||
                    (room.player2 && room.player2.socketId === socket.id)) {
                    
                    // If game is active, end it and save the result
                    if (room.status === 'playing' && room.gameState) {
                        
                        let winner = 'Nobody';
                        let winnerPlayer = null;
                        let disconnectedPlayer = null;
                        
                        if (room.player1 && socket.id !== room.player1.socketId) {
                            winner = room.player1.displayName;
                            winnerPlayer = room.player1;
                            disconnectedPlayer = room.player2;
                        } else if (room.player2 && socket.id !== room.player2.socketId) {
                            winner = room.player2.displayName;
                            winnerPlayer = room.player2;
                            disconnectedPlayer = room.player1;
                        }

                        io.to(room.id).emit('remote_pong_match_ended', { winner });
                        
                        // Save game record if both players were present
                        if (room.player1 && room.player2 && winnerPlayer) {
                            const gameRecord: GameRecord = {
                                game_name: 'Pong Remote',
                                started_at: room.startedAt?.toISOString() || new Date().toISOString(),
                                finished_at: new Date().toISOString(),
                                player1_name: room.player1.displayName,
                                player1_is_user: true,
                                player2_name: room.player2.displayName,
                                player2_is_user: true,
                                winner: winner,
                                data: JSON.stringify({
                                    player1Score: room.gameState.score.left,
                                    player2Score: room.gameState.score.right,
                                    reason: 'player_disconnected',
                                    disconnected_player: disconnectedPlayer?.displayName
                                })
                            };

                            try {
                                await saveGameRecord(fastify, gameRecord);
                                fastify.log.info(`Remote pong game saved (disconnect): ${room.player1.displayName} vs ${room.player2.displayName}, winner: ${winner}`);
                            } catch (error) {
                                fastify.log.error({ err: error }, 'Failed to save remote pong game record on disconnect');
                            }
                        }
                    }

                    // Clean up
                    if (room.countdownTimer) clearInterval(room.countdownTimer);
                    if (room.gameInterval) clearInterval(room.gameInterval);
                    rooms.delete(roomId);
                    
                    fastify.log.info(`Player disconnected from remote pong room: ${roomId}`);
                }
            }
        });
    });

    fastify.log.info('Remote Pong game server initialized');
}
