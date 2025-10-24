// Pong Game Local Server Logic
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';

const WIDTH = 640;
const HEIGHT = 360;
const paddleWidth = 12;
const paddleHeight = 80;
const paddleSpeed = 6;
const ballSize = 10;
const TICK_HZ = 60; // game loop runs 60 times/sec
const WINNING_SCORE = 10;

// Game state types
type InputState = { leftUp: boolean; leftDown: boolean; rightUp: boolean; rightDown: boolean };
type GameState = {
    ball: { x: number; y: number; vx: number; vy: number };
    paddles: { leftY: number; rightY: number };
    score: { left: number; right: number };
};

// Room types
type RoomStatus = 'waiting' | 'in_progress' | 'finished';
interface Room {
    id: string;
    player: string; // socket.id, only one player
    status: RoomStatus;
    gameState: GameState;
    input: InputState;
    gameActive: boolean;
}

// Initial game state
const initialGameState: GameState = {
    ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 4, vy: 3 },
    paddles: { leftY: HEIGHT / 2 - paddleHeight / 2, rightY: HEIGHT / 2 - paddleHeight / 2 },
    score: { left: 0, right: 0 },
};

// Initial input state
const initialInputState: InputState = {
    leftUp: false,
    leftDown: false,
    rightUp: false,
    rightDown: false,
};

// Rooms storage
const rooms = new Map<string, Room>();

// Helper functions
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

// Reset ball to center after a goal
function resetBall(room: Room, direction: 1 | -1): void {
    room.gameState.ball.x = WIDTH / 2;
    room.gameState.ball.y = HEIGHT / 2;
    room.gameState.ball.vx = 4 * direction;
    room.gameState.ball.vy = (Math.random() * 2 + 2) * (Math.random() < 0.5 ? -1 : 1);
}

// Reset game state to initial values
function resetGameState(room: Room): void {
    room.gameState.score.left = 0;
    room.gameState.score.right = 0;
    room.gameState.ball.x = WIDTH / 2;
    room.gameState.ball.y = HEIGHT / 2;
    room.gameState.ball.vx = 4;
    room.gameState.ball.vy = 3;
    room.gameState.paddles.leftY = HEIGHT / 2 - paddleHeight / 2;
    room.gameState.paddles.rightY = HEIGHT / 2 - paddleHeight / 2;
}

// Stop the game and notify client
function stopGame(room: Room, io: Server): void {
    room.gameActive = false;
    room.status = 'finished';
    io.to(room.id).emit('game_stopped');
}

// Room management functions
function createLocalRoom(playerId: string): Room {
    const id = 'local_' + Date.now().toString() + Math.random().toString(36).substr(2, 9); // unique id for local
    const room: Room = {
        id,
        player: playerId,
        status: 'waiting',
        gameState: { ...initialGameState },
        input: { ...initialInputState },
        gameActive: false,
    };
    rooms.set(id, room);
    return room;
}

function joinLocalRoom(roomId: string, playerId: string): { success: boolean; room?: Room } {
    const room = rooms.get(roomId);
    if (!room || room.player !== playerId) return { success: false };
    return { success: true, room };
}

function leaveLocalRoom(roomId: string, playerId: string): void {
    const room = rooms.get(roomId);
    if (!room || room.player !== playerId) return;
    rooms.delete(roomId);
}

// Update game state - one step of physics
function step(room: Room, io: Server): void {
    // Update paddles based on input
    if (room.input.leftUp) room.gameState.paddles.leftY -= paddleSpeed;
    if (room.input.leftDown) room.gameState.paddles.leftY += paddleSpeed;
    room.gameState.paddles.leftY = clamp(room.gameState.paddles.leftY, 0, HEIGHT - paddleHeight);

    if (room.input.rightUp) room.gameState.paddles.rightY -= paddleSpeed;
    if (room.input.rightDown) room.gameState.paddles.rightY += paddleSpeed;
    room.gameState.paddles.rightY = clamp(room.gameState.paddles.rightY, 0, HEIGHT - paddleHeight);

    // Move ball
    room.gameState.ball.x += room.gameState.ball.vx;
    room.gameState.ball.y += room.gameState.ball.vy;

    // Ball collisions with top/bottom
    if (room.gameState.ball.y <= 0 || room.gameState.ball.y >= HEIGHT - ballSize) {
        room.gameState.ball.vy *= -1;
        room.gameState.ball.y = clamp(room.gameState.ball.y, 0, HEIGHT - ballSize);
    }

    // Left paddle collision
    if (
        room.gameState.ball.x <= paddleWidth &&
        room.gameState.ball.y + ballSize >= room.gameState.paddles.leftY &&
        room.gameState.ball.y <= room.gameState.paddles.leftY + paddleHeight
    ) {
        room.gameState.ball.vx = Math.abs(room.gameState.ball.vx);
        room.gameState.ball.x = paddleWidth;
    }

    // Right paddle collision
    if (
        room.gameState.ball.x + ballSize >= WIDTH - paddleWidth &&
        room.gameState.ball.y + ballSize >= room.gameState.paddles.rightY &&
        room.gameState.ball.y <= room.gameState.paddles.rightY + paddleHeight
    ) {
        room.gameState.ball.vx = -Math.abs(room.gameState.ball.vx);
        room.gameState.ball.x = WIDTH - paddleWidth - ballSize;
    }

    // Goals
    if (room.gameState.ball.x < 0) {
        room.gameState.score.right += 1;
        resetBall(room, 1);
    } else if (room.gameState.ball.x > WIDTH - ballSize) {
        room.gameState.score.left += 1;
        resetBall(room, -1);
    }

    // Check for game end
    if (room.gameState.score.left >= WINNING_SCORE || room.gameState.score.right >= WINNING_SCORE) {
        // Emit final game state with the winning score
        const finalSnapshot = {
            width: WIDTH,
            height: HEIGHT,
            paddles: room.gameState.paddles,
            ball: { x: room.gameState.ball.x, y: room.gameState.ball.y },
            score: room.gameState.score,
        };
        io.to(room.id).emit('game_state', finalSnapshot);
        room.gameActive = false;
        room.status = 'finished';
        io.to(room.id).emit('game_end', { winner: room.gameState.score.left >= WINNING_SCORE ? 'left' : 'right' });
        return;
    }

    // Emit game state if game is still active
    const snapshot = {
        width: WIDTH,
        height: HEIGHT,
        paddles: room.gameState.paddles,
        ball: { x: room.gameState.ball.x, y: room.gameState.ball.y },
        score: room.gameState.score,
    };
    io.to(room.id).emit('game_state', snapshot);
}

// Set up Pong Local game
export function setupPongGameLocal(fastify: FastifyInstance, io: Server): void {

    io.on('connection', (socket: Socket) => {
        socket.on('create_local_room', () => {
            // Leave previous room if any
            if (socket.data.roomId) {
                leaveLocalRoom(socket.data.roomId, socket.id);
                socket.leave(socket.data.roomId);
            }
            const room = createLocalRoom(socket.id);
            socket.join(room.id);
            socket.data.roomId = room.id;
            socket.emit('local_room_created', { roomId: room.id });
            socket.emit('local_room_joined', {
                id: room.id,
                status: room.status,
                score: room.gameState.score
            });
        });

        socket.on('leave_local_room', (data: { roomId: string }) => {
            leaveLocalRoom(data.roomId, socket.id);
            socket.leave(data.roomId);
            socket.data.roomId = undefined;
            socket.emit('local_room_left');
        });

        socket.on('start_local_game', (data: { roomId: string }) => {
            const room = rooms.get(data.roomId);
            if (!room || room.player !== socket.id) return;
            if (room.gameActive) return;
            room.gameActive = true;
            room.status = 'in_progress';
            resetGameState(room);
            const snapshot = {
                width: WIDTH,
                height: HEIGHT,
                paddles: room.gameState.paddles,
                ball: { x: room.gameState.ball.x, y: room.gameState.ball.y },
                score: room.gameState.score,
            };
            io.to(room.id).emit('game_state', snapshot);
        });

        socket.on('local_input', (data: { roomId: string } & Partial<InputState>) => {
            const room = rooms.get(data.roomId);
            if (!room || room.player !== socket.id) return;
            if (!room.gameActive) return;

            room.input.leftUp = !!data.leftUp;
            room.input.leftDown = !!data.leftDown;
            room.input.rightUp = !!data.rightUp;
            room.input.rightDown = !!data.rightDown;
        });

        socket.on('disconnect', () => {
            // Find room where player is
            for (const room of rooms.values()) {
                if (room.player === socket.id) {
                    socket.leave(room.id);
                    stopGame(room, io);
                    leaveLocalRoom(room.id, socket.id);
                    socket.data.roomId = undefined;
                    break;
                }
            }
        });
    });

    setInterval(() => {
        for (const room of rooms.values()) {
            if (room.gameActive) {
                step(room, io);
            }
        }
    }, 1000 / TICK_HZ);

    fastify.log.info('Pong local game server initialized');
}