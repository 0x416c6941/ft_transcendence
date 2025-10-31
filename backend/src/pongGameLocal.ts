import { FastifyInstance } from 'fastify';
import { Server, Socket, Namespace } from 'socket.io';

//CONSTANTS
const WIDTH = 640;
const HEIGHT = 360;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 6;
const BALL_SIZE = 10;
const TICK_HZ = 60;
const WINNING_SCORE = 10;

//TYPES
// Game state types
type InputState = { leftUp: boolean; leftDown: boolean; rightUp: boolean; rightDown: boolean };
type GameState = {
    ball: { x: number; y: number; vx: number; vy: number };
    paddles: { leftY: number; rightY: number };
    score: { left: number; right: number };
};
type Snapshot = {
    width: number;
    height: number;
    paddles: { leftY: number; rightY: number };
    ball: { x: number; y: number };
    score: { left: number; right: number };
    leftAlias: string;
    rightAlias: string;
};

// Room types
type RoomStatus = 'waiting' | 'in_progress' | 'finished';
interface Room {
    id: string;
    player: string; // socket.id
    status: RoomStatus;
    gameState: GameState;
    input: InputState;
    gameActive: boolean;
    leftAlias: string;
    rightAlias: string;
}

//HELPERS
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

// Helper to deep-clone the initial game state so each room gets its own nested objects.
function createGameState(): GameState {
    return {
        ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 4, vy: 3 },
        paddles: { leftY: HEIGHT / 2 - PADDLE_HEIGHT / 2, rightY: HEIGHT / 2 - PADDLE_HEIGHT / 2 },
        score: { left: 0, right: 0 },
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
    room.gameState.ball.vy = (Math.random() * 2 + 2) * (Math.random() < 0.5 ? -1 : 1);
}

function makeSnapshot(room: Room): Snapshot {
    return {
        width: WIDTH,
        height: HEIGHT,
        paddles: room.gameState.paddles,
        ball: { x: room.gameState.ball.x, y: room.gameState.ball.y },
        score: room.gameState.score,
        leftAlias: room.leftAlias,
        rightAlias: room.rightAlias,
    };
}

//ROOMS
const rooms = new Map<string, Room>();

function createLocalRoom(playerId: string): Room {
    const id = 'local_' + Date.now().toString() + Math.random().toString(36).slice(2, 9);
    const room: Room = {
        id,
        player: playerId,
        status: 'waiting',
        gameState: createGameState(),
        input: { leftUp: false, leftDown: false, rightUp: false, rightDown: false },
        gameActive: false,
        leftAlias: '',
        rightAlias: '',
    };
    rooms.set(id, room);
    return room;
}

function leaveLocalRoom(roomId: string, playerId: string): void {
    const room = rooms.get(roomId);
    if (!room || room.player !== playerId) return;
    rooms.delete(roomId);
}

//GAME LOOP
// Update game state
function step(room: Room, ns: Namespace): void {
    // Update paddles based on input
    if (room.input.leftUp) room.gameState.paddles.leftY -= PADDLE_SPEED;
    if (room.input.leftDown) room.gameState.paddles.leftY += PADDLE_SPEED;
    room.gameState.paddles.leftY = clamp(room.gameState.paddles.leftY, 0, HEIGHT - PADDLE_HEIGHT);

    if (room.input.rightUp) room.gameState.paddles.rightY -= PADDLE_SPEED;
    if (room.input.rightDown) room.gameState.paddles.rightY += PADDLE_SPEED;
    room.gameState.paddles.rightY = clamp(room.gameState.paddles.rightY, 0, HEIGHT - PADDLE_HEIGHT);

    // Move ball
    room.gameState.ball.x += room.gameState.ball.vx;
    room.gameState.ball.y += room.gameState.ball.vy;

    // Ball collisions with top/bottom
    if (room.gameState.ball.y <= 0 || room.gameState.ball.y >= HEIGHT - BALL_SIZE) {
        room.gameState.ball.vy *= -1;
        room.gameState.ball.y = clamp(room.gameState.ball.y, 0, HEIGHT - BALL_SIZE);
    }

    // Left paddle collision
    if (
        room.gameState.ball.x <= PADDLE_WIDTH &&
        room.gameState.ball.y + BALL_SIZE >= room.gameState.paddles.leftY &&
        room.gameState.ball.y <= room.gameState.paddles.leftY + PADDLE_HEIGHT
    ) {
        room.gameState.ball.vx = Math.abs(room.gameState.ball.vx);
        room.gameState.ball.x = PADDLE_WIDTH;
    }

    // Right paddle collision
    if (
        room.gameState.ball.x + BALL_SIZE >= WIDTH - PADDLE_WIDTH &&
        room.gameState.ball.y + BALL_SIZE >= room.gameState.paddles.rightY &&
        room.gameState.ball.y <= room.gameState.paddles.rightY + PADDLE_HEIGHT
    ) {
        room.gameState.ball.vx = -Math.abs(room.gameState.ball.vx);
        room.gameState.ball.x = WIDTH - PADDLE_WIDTH - BALL_SIZE;
    }

    // Goals
    if (room.gameState.ball.x < 0) {
        room.gameState.score.right += 1;
        resetBall(room, 1);
    } else if (room.gameState.ball.x > WIDTH - BALL_SIZE) {
        room.gameState.score.left += 1;
        resetBall(room, -1);
    }

    ns.to(room.id).emit('game_state', makeSnapshot(room));

    // Game end
    if (room.gameState.score.left >= WINNING_SCORE || room.gameState.score.right >= WINNING_SCORE) {
        room.gameActive = false;
        room.status = 'finished';
        ns.to(room.id).emit('game_end', { winner: room.gameState.score.left >= WINNING_SCORE ? 'left' : 'right' });
        return;
    }
}

function stopGame(room: Room, ns: Namespace): void {
    room.gameActive = false;
    room.status = 'finished';
    ns.to(room.id).emit('game_stopped');
}

//SERVER SETUP
export function setupPongGameLocal(fastify: FastifyInstance, io: Server): void {
    const ns = io.of('/pong-local');
    ns.on('connection', (socket: Socket) => {
        socket.on('create_local_room', () => {
            // Leave previous room if any
            if (socket.data.roomId) {
                leaveLocalRoom(socket.data.roomId, socket.id);
                socket.leave(socket.data.roomId);
                socket.data.roomId = undefined;
            }
            const room = createLocalRoom(socket.id);
            socket.join(room.id);
            socket.data.roomId = room.id;
            socket.emit('local_room_created', { roomId: room.id });
        });

        socket.on('leave_local_room', () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            leaveLocalRoom(roomId, socket.id);
            socket.leave(roomId);
            socket.data.roomId = undefined;
            socket.emit('local_room_left');
        });

        socket.on('start_local_game', (data: { leftAlias: string; rightAlias: string }) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room || room.player !== socket.id) return;
            if (room.gameActive) return;
            room.leftAlias = data.leftAlias;
            room.rightAlias = data.rightAlias;
            room.gameActive = true;
            room.status = 'in_progress';
            resetGameState(room);

            ns.to(room.id).emit('game_state', makeSnapshot(room));
        });

        socket.on('local_input', (data: Partial<InputState>) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room || room.player !== socket.id || !room.gameActive) return;

            room.input.leftUp = !!data.leftUp;
            room.input.leftDown = !!data.leftDown;
            room.input.rightUp = !!data.rightUp;
            room.input.rightDown = !!data.rightDown;
        });

        socket.on('disconnect', () => {
            for (const room of rooms.values()) {
                if (room.player === socket.id) {
                    socket.leave(room.id);
                    stopGame(room, ns);
                    leaveLocalRoom(room.id, socket.id);
                    socket.data.roomId = undefined;
                    break;
                }
            }
        });
    });

    setInterval(() => {
        for (const room of rooms.values()) {
            if (!room.gameActive) continue;
            step(room, ns);
        }
    }, 1000 / TICK_HZ);
}