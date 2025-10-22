// Pong Game Server Logic
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import * as bcrypt from 'bcrypt';

const WIDTH = 640;
const HEIGHT = 360;
const paddleWidth = 12;
const paddleHeight = 80;
const paddleSpeed = 6;
const ballSize = 10;
const TICK_HZ = 60; // game loop runs 60 times/sec
const WINNING_SCORE = 10;

// Game state types
type Side = 'left' | 'right' | 'spectator';
type InputState = { up: boolean; down: boolean };
type GameState = {
    ball: { x: number; y: number; vx: number; vy: number };
    paddles: { leftY: number; rightY: number };
    score: { left: number; right: number };
};
type ReadyState = {
    left: boolean;
    right: boolean;
};

// Room types
type RoomStatus = 'waiting' | 'in_progress' | 'finished';
interface Room {
    id: string;
    name: string;
    passwordHash: string;
    maxPlayers: number;
    owner: string; // socket.id
    players: string[]; // socket.id, max 2 active
    spectators: string[]; // socket.id
    status: RoomStatus;
    gameState: GameState;
    readyState: ReadyState;
    gameActive: boolean;
    playersMap: Map<string, { side: Side; input: InputState }>; // per room
}

// Initial game state
const initialGameState: GameState = {
    ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 4, vy: 3 },
    paddles: { leftY: HEIGHT / 2 - paddleHeight / 2, rightY: HEIGHT / 2 - paddleHeight / 2 },
    score: { left: 0, right: 0 },
};

// Ready state tracking
const initialReadyState: ReadyState = {
    left: false,
    right: false,
};

// Rooms storage
const rooms = new Map<string, Room>();

// Helper functions
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

function getRoomList() {
    return Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        status: room.status,
        players: room.players.length,
        spectators: room.spectators.length
    }));
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

// Stop the game and notify clients
function stopGame(room: Room, io: Server): void {
    room.gameActive = false;
    room.status = 'finished';
    io.to(room.id).emit('game_stopped');
    io.to(room.id).emit('ready_state', room.readyState);
}

// Reassign roles to spectators if a side is free
function reassignRoles(room: Room, io: Server): void {
    const currentSides = Array.from(room.playersMap.values()).map(p => p.side);
    const freeSides: Side[] = (['left', 'right'] as const).filter(side => !currentSides.includes(side));
    for (const side of freeSides) {
        const spectatorId = room.spectators.shift();
        if (spectatorId) {
            room.playersMap.get(spectatorId)!.side = side;
            room.players.push(spectatorId);
            room.readyState[side as 'left' | 'right'] = false;
            io.to(spectatorId).emit('role', { side });
        }
    }
    io.to(room.id).emit('ready_state', room.readyState);
}

// Room management functions
async function createRoom(name: string, password: string, maxPlayers: number, owner: string): Promise<Room> {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9); // simple unique id
    const passwordHash = await bcrypt.hash(password, 10);
    const room: Room = {
        id,
        name,
        passwordHash,
        maxPlayers,
        owner,
        players: [owner],
        spectators: [],
        status: 'waiting',
        gameState: {
            ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 4, vy: 3 },
            paddles: { leftY: HEIGHT / 2 - paddleHeight / 2, rightY: HEIGHT / 2 - paddleHeight / 2 },
            score: { left: 0, right: 0 },
        },
        readyState: { left: false, right: false },
        gameActive: false,
        playersMap: new Map([[owner, { side: 'left', input: { up: false, down: false } }]])
    };
    rooms.set(id, room);
    return room;
}

async function joinRoom(roomId: string, password: string, playerId: string): Promise<{ success: boolean; room?: Room }> {
    const room = rooms.get(roomId);
    if (!room) return { success: false };
    const isValidPassword = await bcrypt.compare(password, room.passwordHash);
    if (!isValidPassword) return { success: false };
    const totalParticipants = room.players.length + room.spectators.length;
    if (totalParticipants >= room.maxPlayers) return { success: false }; // If the limit is reached, do not add a new participant
    if (room.players.length >= 2) { // Assuming max 2 active players for Pong
        room.spectators.push(playerId);
        room.playersMap!.set(playerId, { side: 'spectator', input: { up: false, down: false } });
    } else {
        room.players.push(playerId);
        const side: Side = room.players.length === 1 ? 'left' : 'right';
        room.playersMap!.set(playerId, { side, input: { up: false, down: false } });
    }
    return { success: true, room };
}

function leaveRoom(roomId: string, playerId: string): void {
    const room = rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(id => id !== playerId);
    room.spectators = room.spectators.filter(id => id !== playerId);
    room.playersMap!.delete(playerId);
    if (room.players.length === 0 && room.spectators.length === 0) {
        rooms.delete(roomId);
    } else if (room.owner === playerId) {
        room.owner = room.players[0] || room.spectators[0];
    }
}

// Update game state - one step of physics
function step(room: Room, io: Server): void {
    // Update paddles based on input
    for (const [, { side, input }] of room.playersMap) {
        if (side === 'left') {
            if (input.up) room.gameState.paddles.leftY -= paddleSpeed;
            if (input.down) room.gameState.paddles.leftY += paddleSpeed;
            room.gameState.paddles.leftY = clamp(room.gameState.paddles.leftY, 0, HEIGHT - paddleHeight);
        } else if (side === 'right') {
            if (input.up) room.gameState.paddles.rightY -= paddleSpeed;
            if (input.down) room.gameState.paddles.rightY += paddleSpeed;
            room.gameState.paddles.rightY = clamp(room.gameState.paddles.rightY, 0, HEIGHT - paddleHeight);
        }
    }

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
        room.readyState.left = false;
        room.readyState.right = false;
        io.to(room.id).emit('ready_state', room.readyState);
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

// Set up Pong game
export function setupPongGame(fastify: FastifyInstance, io: Server): void {

    io.on('connection', (socket: Socket) => {
        socket.on('create_room', async (data: { name: string; password: string; maxPlayers: number }) => {
            // Leave previous room if any
            if (socket.data.roomId) {
                leaveRoom(socket.data.roomId, socket.id);
                socket.leave(socket.data.roomId);
            }
            const room = await createRoom(data.name, data.password, data.maxPlayers, socket.id);
            socket.join(room.id);
            socket.data.roomId = room.id;
            socket.emit('room_created', { roomId: room.id });
            io.emit('rooms_list', getRoomList());
        });

        socket.on('join_room', async (data: { roomId: string; password: string }) => {
            // Leave previous room if any
            if (socket.data.roomId) {
                leaveRoom(socket.data.roomId, socket.id);
                socket.leave(socket.data.roomId);
            }
            const result = await joinRoom(data.roomId, data.password, socket.id);
            if (result.success) {
                socket.join(result.room!.id);
                socket.data.roomId = result.room!.id;
                const room = result.room!;
                const mySide = room.playersMap.get(socket.id)?.side;
                socket.emit('room_joined', {
                    id: room.id,
                    name: room.name,
                    status: room.status,
                    players: room.players.length,
                    spectators: room.spectators.length,
                    mySide,
                    score: room.gameState.score,
                    readyState: room.readyState
                });
                // Send current state to the new player
                socket.emit('role', { side: mySide });
                socket.emit('ready_state', room.readyState);
                if (room.gameActive) {
                    socket.emit('game_state', {
                        width: WIDTH,
                        height: HEIGHT,
                        paddles: room.gameState.paddles,
                        ball: { x: room.gameState.ball.x, y: room.gameState.ball.y },
                        score: room.gameState.score,
                    });
                }
                io.emit('rooms_list', getRoomList());
            } else {
                socket.emit('room_join_failed', { reason: 'Invalid room or password' });
            }
        });

        socket.on('leave_room', (data: { roomId: string }) => {
            leaveRoom(data.roomId, socket.id);
            socket.leave(data.roomId);
            socket.data.roomId = undefined;
            socket.emit('room_left');
            io.emit('rooms_list', getRoomList());
        });

        socket.on('list_rooms', () => {
            socket.emit('rooms_list', getRoomList());
        });

        socket.on('request_state', (data?: { roomId?: string }) => {
            if (!data || !data.roomId) return;
            const room = rooms.get(data.roomId);
            if (!room) return;
            // Check if socket is in the room
            if (!room.players.includes(socket.id) && !room.spectators.includes(socket.id)) return;
            socket.emit('role', { side: room.playersMap.get(socket.id)?.side });
            socket.emit('ready_state', room.readyState);
        });

        socket.on('player_ready', (data: { roomId: string; side: Side; ready: boolean }) => {
            const room = rooms.get(data.roomId);
            if (!room) return;
            // Check if socket is in the room
            if (!room.players.includes(socket.id) && !room.spectators.includes(socket.id)) return;
            const player = room.playersMap.get(socket.id);
            if (!player || data.side === 'spectator') {
                return;
            }
            if (player.side !== data.side) {
                return;
            }

            room.readyState[data.side] = data.ready;
            io.to(room.id).emit('ready_state', room.readyState);

            // Check if both players are ready
            if (room.readyState.left && room.readyState.right && !room.gameActive) {
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
            }
        });

        socket.on('input', (data: { roomId: string } & Partial<InputState>) => {
            const room = rooms.get(data.roomId);
            if (!room) return;
            // Check if socket is in the room
            if (!room.players.includes(socket.id) && !room.spectators.includes(socket.id)) return;
            const player = room.playersMap.get(socket.id);
            if (!player) return;
            if (player.side === 'spectator') return;
            if (!room.gameActive) return;

            player.input.up = !!data.up;
            player.input.down = !!data.down;
        });

        socket.on('disconnect', () => {
            // Find room where player is
            for (const room of rooms.values()) {
                if (room.players.indexOf(socket.id) !== -1 || room.spectators.indexOf(socket.id) !== -1) {
                    socket.leave(room.id);
                    const player = room.playersMap.get(socket.id);
                    if (player && (player.side === 'left' || player.side === 'right')) {
                        room.readyState[player.side] = false;
                        resetGameState(room);
                        stopGame(room, io);
                        setTimeout(() => reassignRoles(room, io), 100);
                    }
                    leaveRoom(room.id, socket.id);
                    socket.data.roomId = undefined;
                    io.emit('rooms_list', getRoomList());
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

    fastify.log.info('Pong game server initialized');
}