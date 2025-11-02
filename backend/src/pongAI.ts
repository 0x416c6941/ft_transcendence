import { FastifyInstance } from 'fastify';
import { Server, Socket, Namespace } from 'socket.io';
import { saveGameRecord, isSocketAuthenticated, GameRecord } from './utils/gameStats.js';

//CONSTANTS
const WIDTH = 640;
const HEIGHT = 360;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 6;
const BALL_SIZE = 10;
const TICK_HZ = 60;
const WINNING_SCORE = 10;
const AI_DECISION_INTERVAL_MS = 1000;
const MAX_BOUNCE_ANGLE = Math.PI / 6;
const SPEED_MULTIPLIER = 1.1;

//TYPES
// Game state types
type InputState = { up: boolean; down: boolean };
type GameState = {
    ball: { x: number; y: number; vx: number; vy: number };
    paddles: { playerY: number; aiY: number };
    score: { player: number; ai: number };
};
type Snapshot = {
    width: number;
    height: number;
    paddles: { playerY: number; aiY: number };
    ball: { x: number; y: number };
    score: { player: number; ai: number };
    playerAlias: string;
};

// Room types
type RoomStatus = 'waiting' | 'in_progress' | 'finished';
interface Room {
    id: string;
    player: string; // socket.id
    status: RoomStatus;
    gameState: GameState;
    playerInput: InputState;
    aiInput: InputState;
    aiTargetY: number | null;
    aiDecisionMade: boolean;
    gameActive: boolean;
    playerAlias: string;
    currentGameRecord?: GameRecord;
}

//HELPERS
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

// Helper to deep-clone the initial game state so each room gets its own nested objects.
function createGameState(): GameState {
    return {
        ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 4, vy: 3 },
        paddles: { playerY: HEIGHT / 2 - PADDLE_HEIGHT / 2, aiY: HEIGHT / 2 - PADDLE_HEIGHT / 2 },
        score: { player: 0, ai: 0 },
    };
}

function resetGameState(room: Room): void {
    room.gameState = createGameState();
}

// Reset ball to center after a goal
function resetBall(room: Room, direction: 1 | -1): void {
    room.gameState.ball.x = WIDTH / 2;
    room.gameState.ball.y = HEIGHT / 2;
    room.gameState.ball.vx = 4 * direction;
    room.gameState.ball.vy = (Math.random() * 2 + 2) * (Math.random() < 0.5 ? -1 : 1);//2-4
}

function makeSnapshot(room: Room): Snapshot {
    return {
        width: WIDTH,
        height: HEIGHT,
        paddles: room.gameState.paddles,
        ball: { x: room.gameState.ball.x, y: room.gameState.ball.y },
        score: room.gameState.score,
        playerAlias: room.playerAlias,
    };
}

//AI LOGIC
function predictBallYAtAI(room: Room): number {
    const targetX = WIDTH - PADDLE_WIDTH - BALL_SIZE; // x where AI paddle hits
    let { x, y, vx, vy } = room.gameState.ball;

    // Simulate forward with reflections on top/bottom
    const maxSteps = 2000;
    for (let i = 0; i < maxSteps; i++) {
        x += vx;
        y += vy;

        // reflect off top/bottom
        if (y <= 0 || y >= HEIGHT - BALL_SIZE) {
            vy = -vy;
            y = clamp(y, 0, HEIGHT - BALL_SIZE);
        }
        // If ball crosses targetX (AI side), return predicted center Y
        if (x >= targetX) return y + BALL_SIZE / 2 + (Math.random() - 0.5) * 120;
    }
    // Fallback: center of screen
    return HEIGHT / 2;
}

function makeAIDecision(room: Room): void {
    const { vx } = room.gameState.ball;
    // If the ball is moving away from the AI, stop moving and clear target
    if (vx <= 0) {
        room.aiDecisionMade = false;
        room.aiTargetY = null;
        room.aiInput = { up: false, down: false };
        return;
    }

    // If already made a decision for this ball approach, don't recalculate
    if (room.aiDecisionMade) return;

    // Ball is moving toward the AI, predict intercept
    let predictedY = predictBallYAtAI(room);

    predictedY = clamp(predictedY, PADDLE_HEIGHT / 2, HEIGHT - PADDLE_HEIGHT / 2);
    room.aiTargetY = predictedY;
    room.aiDecisionMade = true;

    const paddleCenter = room.gameState.paddles.aiY + PADDLE_HEIGHT / 2;
    const diff = predictedY - paddleCenter;

    //AI starts moving up/down only if the difference between the target and the center of the paddle is more than 6 pixels
    const threshold = 6;
    room.aiInput.up = diff < -threshold;
    room.aiInput.down = diff > threshold;
}

//ROOMS
const rooms = new Map<string, Room>();

function createAIRoom(playerId: string): Room {
    const id = 'ai_' + Date.now().toString() + Math.random().toString(36).slice(2, 9);
    const room: Room = {
        id,
        player: playerId,
        status: 'waiting',
        gameState: createGameState(),
        playerInput: { up: false, down: false },
        aiInput: { up: false, down: false },
        aiTargetY: null,
        aiDecisionMade: false,
        gameActive: false,
        playerAlias: '',
    };
    rooms.set(id, room);
    return room;
}

function leaveAIRoom(roomId: string, playerId: string): void {
    const room = rooms.get(roomId);
    if (!room || room.player !== playerId) return;
    rooms.delete(roomId);
}

//GAME LOOP
// Update game state - one step of physics
async function step(room: Room, ns: Namespace, fastify: FastifyInstance): Promise<void> {
    // Player movement
    if (room.playerInput.up) room.gameState.paddles.playerY -= PADDLE_SPEED;
    if (room.playerInput.down) room.gameState.paddles.playerY += PADDLE_SPEED;
    room.gameState.paddles.playerY = clamp(room.gameState.paddles.playerY, 0, HEIGHT - PADDLE_HEIGHT);

    // AI movement
    if (room.aiInput.up) room.gameState.paddles.aiY -= PADDLE_SPEED;
    if (room.aiInput.down) room.gameState.paddles.aiY += PADDLE_SPEED;
    room.gameState.paddles.aiY = clamp(room.gameState.paddles.aiY, 0, HEIGHT - PADDLE_HEIGHT);

    //Stop AI if reached target
    const paddleCenter = room.gameState.paddles.aiY + PADDLE_HEIGHT / 2;
    if (room.aiTargetY !== null && Math.abs(room.aiTargetY - paddleCenter) <= 6) { //the paddle is already close enough to consider the target achieved
        room.aiInput = { up: false, down: false };
        room.aiTargetY = null;
    }

    // Move ball
    const ball = room.gameState.ball;
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Ball collisions with top/bottom
    if (ball.y <= 0 || ball.y >= HEIGHT - BALL_SIZE) {
        ball.vy *= -1;
        ball.y = clamp(ball.y, 0, HEIGHT - BALL_SIZE);
    }

    // Player paddle collision
    if (
        room.gameState.ball.x <= PADDLE_WIDTH &&
        room.gameState.ball.y + BALL_SIZE >= room.gameState.paddles.playerY &&
        room.gameState.ball.y <= room.gameState.paddles.playerY + PADDLE_HEIGHT
    ) {
        const paddleCenter = room.gameState.paddles.playerY + PADDLE_HEIGHT / 2;
        const ballCenter = room.gameState.ball.y + BALL_SIZE / 2;
        const deltaY = ballCenter - paddleCenter;
        const normalizedDelta = deltaY / (PADDLE_HEIGHT / 2);
        let bounceAngle = normalizedDelta * MAX_BOUNCE_ANGLE;
        const randomOffset = (Math.random() - 0.5) * 0.2;
        bounceAngle += randomOffset;
        bounceAngle = clamp(bounceAngle, -MAX_BOUNCE_ANGLE, MAX_BOUNCE_ANGLE);
        let speed = Math.sqrt(room.gameState.ball.vx ** 2 + room.gameState.ball.vy ** 2);
        speed *= SPEED_MULTIPLIER;
        room.gameState.ball.vx = speed * Math.cos(bounceAngle);
        room.gameState.ball.vy = speed * Math.sin(bounceAngle);
        room.gameState.ball.x = PADDLE_WIDTH;
    }

    // AI paddle collision
    if (
        room.gameState.ball.x + BALL_SIZE >= WIDTH - PADDLE_WIDTH &&
        room.gameState.ball.y + BALL_SIZE >= room.gameState.paddles.aiY &&
        room.gameState.ball.y <= room.gameState.paddles.aiY + PADDLE_HEIGHT
    ) {
        const paddleCenter = room.gameState.paddles.aiY + PADDLE_HEIGHT / 2;
        const ballCenter = room.gameState.ball.y + BALL_SIZE / 2;
        const deltaY = ballCenter - paddleCenter;
        const normalizedDelta = deltaY / (PADDLE_HEIGHT / 2);
        let bounceAngle = normalizedDelta * MAX_BOUNCE_ANGLE;
        const randomOffset = (Math.random() - 0.5) * 0.2;
        bounceAngle += randomOffset;
        bounceAngle = clamp(bounceAngle, -MAX_BOUNCE_ANGLE, MAX_BOUNCE_ANGLE);
        let speed = Math.sqrt(room.gameState.ball.vx ** 2 + room.gameState.ball.vy ** 2);
        speed *= SPEED_MULTIPLIER;
        room.gameState.ball.vx = -speed * Math.cos(bounceAngle);
        room.gameState.ball.vy = speed * Math.sin(bounceAngle);
        room.gameState.ball.x = WIDTH - PADDLE_WIDTH - BALL_SIZE;
    }    // Goals
    if (ball.x < 0) {
        room.gameState.score.ai++;
        resetBall(room, 1);
    } else if (ball.x > WIDTH - BALL_SIZE) {
        room.gameState.score.player++;
        resetBall(room, -1);
    }

    ns.to(room.id).emit('game_state', makeSnapshot(room));

    // Game end
    if (room.gameState.score.player >= WINNING_SCORE || room.gameState.score.ai >= WINNING_SCORE) {
        room.gameActive = false;
        room.status = 'finished';
        const winner = room.gameState.score.player >= WINNING_SCORE ? 'player' : 'ai';
        ns.to(room.id).emit('game_end', { winner });
        
        // Save game record
        if (room.currentGameRecord) {
            room.currentGameRecord.finished_at = new Date().toISOString();
            room.currentGameRecord.winner = winner === 'player' ? room.currentGameRecord.player1_name : 'AI';
            room.currentGameRecord.data = JSON.stringify({
                finalScore: room.gameState.score,
                winner,
            });
            await saveGameRecord(fastify, room.currentGameRecord);
        }
        
        return;
    }
}

function stopGame(room: Room, ns: Namespace): void {
    room.gameActive = false;
    room.status = 'finished';
    ns.to(room.id).emit('game_stopped');
}

//SERVER SETUP
export function setupPongAI(fastify: FastifyInstance, io: Server): void {
    const ns = io.of('/pong-ai');

    ns.on('connection', (socket: Socket) => {
        socket.on('create_ai_room', () => {
            // Leave previous room if any
            if (socket.data.roomId) {
                leaveAIRoom(socket.data.roomId, socket.id);
                socket.leave(socket.data.roomId);
                socket.data.roomId = undefined;
            }
            const room = createAIRoom(socket.id);
            socket.join(room.id);
            socket.data.roomId = room.id;
            socket.emit('ai_room_created', { roomId: room.id });
        });

        socket.on('leave_ai_room', () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            leaveAIRoom(roomId, socket.id);
            socket.leave(roomId);
            socket.data.roomId = undefined;
            socket.emit('ai_room_left');
        });

        socket.on('start_ai_game', async (data: { playerAlias: string }) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room || room.player !== socket.id || room.gameActive) return;

            room.playerAlias = data.playerAlias;
            room.gameActive = true;
            room.status = 'in_progress';
            resetGameState(room);
            
            // Initialize game record
            const playerIsUser = await isSocketAuthenticated(socket);
            let playerName = room.playerAlias;
            if (playerIsUser && (socket as any).username) {
                playerName = (socket as any).username;
            }
            
            room.currentGameRecord = {
                game_name: 'pong-ai',
                started_at: new Date().toISOString(),
                player1_name: playerName,
                player1_is_user: playerIsUser,
                player2_name: 'AI',
                player2_is_user: false,
            };

            ns.to(room.id).emit('game_state', makeSnapshot(room));
        });

        socket.on('input', (data: Partial<InputState>) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room || room.player !== socket.id || !room.gameActive) return;

            room.playerInput.up = !!data.up;
            room.playerInput.down = !!data.down;
        });

        socket.on('disconnect', async () => {
            for (const room of rooms.values()) {
                if (room.player === socket.id) {
                    socket.leave(room.id);
                    
                    // Save game record if game was active
                    if (room.gameActive && room.currentGameRecord) {
                        room.currentGameRecord.finished_at = new Date().toISOString();
                        room.currentGameRecord.winner = 'N/A';
                        room.currentGameRecord.data = JSON.stringify({
                            finalScore: room.gameState.score,
                            reason: 'Player disconnected',
                        });
                        await saveGameRecord(fastify, room.currentGameRecord);
                    }
                    
                    stopGame(room, ns);
                    leaveAIRoom(room.id, socket.id);
                    socket.data.roomId = undefined;
                    break;
                }
            }
        });
    });

    //SCHEDULERS
    // Global AI decision scheduler: run makeAIDecision once per second for all active rooms
    const aiScheduler = setInterval(() => {
        for (const room of rooms.values()) {
            if (room.gameActive) {
                try {
                    makeAIDecision(room);
                } catch (err) {
                    fastify.log.error({ err }, 'AI decision error');
                }
            }
        }
    }, AI_DECISION_INTERVAL_MS);

    const tickScheduler = setInterval(async () => {
        for (const room of rooms.values()) {
            if (!room.gameActive) continue;
            step(room, ns, fastify);
        }
    }, 1000 / TICK_HZ);

}