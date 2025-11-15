import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { saveGameRecord, GameRecord } from './utils/gameStats.js';
import { validateRoomName, validateRoomPassword } from './utils/validation.js';

// Tournament database functions
async function saveTournamentStart(room: Room, fastify: FastifyInstance): Promise<void> {
    return new Promise((resolve, reject) => {
        (fastify as any).sqlite.run(
            'INSERT INTO tournaments (uuid, started_at, player_count, game_type) VALUES (?, ?, ?, ?)',
            [room.tournamentUuid, new Date().toISOString(), room.players.length, 'Pong'],
            function (this: any, err: Error | null) {
                if (err) {
                    fastify.log.error(err, 'Failed to save tournament start');
                    reject(err);
                } else {
                    room.tournamentDbId = this.lastID;
                    fastify.log.info(`Pong tournament ${room.tournamentUuid} saved with ID ${this.lastID}`);
                    resolve();
                }
            }
        );
    });
}

async function saveTournamentEnd(room: Room, winner: string, fastify: FastifyInstance): Promise<void> {
    if (!room.tournamentDbId) return;
    
    return new Promise((resolve, reject) => {
        (fastify as any).sqlite.run(
            'UPDATE tournaments SET finished_at = ?, winner = ? WHERE id = ?',
            [new Date().toISOString(), winner, room.tournamentDbId],
            (err: Error | null) => {
                if (err) {
                    fastify.log.error(err, 'Failed to save tournament end');
                    reject(err);
                } else {
                    fastify.log.info(`Pong tournament ${room.tournamentDbId} finished. Winner: ${winner}`);
                    resolve();
                }
            }
        );
    });
}

async function linkGameToTournament(room: Room, gameId: number, fastify: FastifyInstance): Promise<void> {
    if (!room.tournamentDbId) return;
    
    room.gameIds.push(gameId);
    
    return new Promise((resolve, reject) => {
        (fastify as any).sqlite.run(
            'INSERT INTO tournament_games (tournament_id, game_id) VALUES (?, ?)',
            [room.tournamentDbId, gameId],
            (err: Error | null) => {
                if (err) {
                    fastify.log.error(err, 'Failed to link game to tournament');
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}


//CONSTANTS
const WIDTH = 640;
const HEIGHT = 360;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_SPEED = 6;
const BALL_SIZE = 10;
const TICK_HZ = 60;
const WINNING_SCORE = 10;
const MAX_PLAYERS = 10;
const MAX_BOUNCE_ANGLE = Math.PI / 6;
const SPEED_MULTIPLIER = 1.1;

//TYPES
// Game state types
type RoomStatus = 'waiting' | 'in_progress' | 'finished';

type InputState = {
    up: boolean;
    down: boolean;
};

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
};

// Room types
interface Player {
    socketId: string;
    userId: number;
    displayName: string;
    isReady: boolean;
    isEliminated: boolean;
}

interface Room {
    id: string;
    name: string;
    passwordHash: string;
    creator: string;
    players: Player[];
    status: RoomStatus;
    gameActive: boolean;
    currentPlayer1: string | null;
    currentPlayer2: string | null;
    currentGameState: GameState | null;
    currentMatchStartedAt: string | null;
    tournamentDbId: number | null;
    tournamentUuid: string;
    gameIds: number[];
}

//GLOBAL STATE
const rooms = new Map<string, Room>();
const roomsByName = new Map<string, string>(); // name -> roomId
const gameStates = new Map<string, GameState>(); // roomId -> gameState
const gameLoops = new Map<string, ReturnType<typeof setInterval>>(); // roomId -> interval
const playerInputs = new Map<string, InputState>(); // key: `${roomId}:${socketId}`

//HELPERS
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

function createSnapshot(roomId: string): Snapshot | null {
    const room = rooms.get(roomId);
    if (!room?.currentGameState) return null;

    return {
        width: WIDTH,
        height: HEIGHT,
        paddles: room.currentGameState.paddles,
        ball: { x: room.currentGameState.ball.x, y: room.currentGameState.ball.y },
        score: room.currentGameState.score,
    };
}

//GAME LOGIC
function updatePaddles(roomId: string, leftUp: boolean, leftDown: boolean, rightUp: boolean, rightDown: boolean): void {
    const gameState = gameStates.get(roomId);
    if (!gameState) return;

    // Update left paddle
    if (leftUp) gameState.paddles.leftY -= PADDLE_SPEED;
    if (leftDown) gameState.paddles.leftY += PADDLE_SPEED;
    gameState.paddles.leftY = clamp(gameState.paddles.leftY, 0, HEIGHT - PADDLE_HEIGHT);

    // Update right paddle
    if (rightUp) gameState.paddles.rightY -= PADDLE_SPEED;
    if (rightDown) gameState.paddles.rightY += PADDLE_SPEED;
    gameState.paddles.rightY = clamp(gameState.paddles.rightY, 0, HEIGHT - PADDLE_HEIGHT);
}

function emitGameState(roomId: string, io: Server): void {
    const snapshot = createSnapshot(roomId);
    if (snapshot) {
        io.to(roomId).emit('game_state', snapshot);
    }
}

function step(roomId: string, io: Server): boolean {
    const gameState = gameStates.get(roomId);
    if (!gameState) return false;

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

    emitGameState(roomId, io);

    // Check for game end
    if (gameState.score.left >= WINNING_SCORE || 
        gameState.score.right >= WINNING_SCORE) {
        const winner = gameState.score.left >= WINNING_SCORE ? 'left' : 'right';
        io.to(roomId).emit('game_end', { winner });
        return true; // Game ended
    }

    return false; // Game continues
}

//ROOM MANAGEMENT
async function getDisplayName(fastify: FastifyInstance, userId: number): Promise<string | null> {
    return await new Promise((resolve) => {
        (fastify as any).sqlite.get('SELECT display_name FROM users WHERE id = ?', [userId], (err: Error | null, row: any) => {
            if (err || !row || !row.display_name) return resolve(null);
            resolve(row.display_name as string);
        });
    });
}

async function createRoom(name: string, password: string, creatorSocket: Socket, fastify: FastifyInstance): Promise<{ success: boolean; roomId?: string; error?: string }> {
    if (roomsByName.has(name)) {
        return { success: false, error: 'Room with this name already exists' };
    }

    const roomId = Date.now().toString() + Math.random().toString(36).slice(2, 9);
    const passwordHash = password ? await bcrypt.hash(password, 10) : '';

    const creatorUserId = (creatorSocket as any).userId;
    const creatorDisplay = (await getDisplayName(fastify, creatorUserId)) || (creatorSocket as any).username || 'Player';

    const creatorPlayer: Player = {
        socketId: creatorSocket.id,
        userId: creatorUserId,
        displayName: creatorDisplay,
        isReady: false,
        isEliminated: false,
    };

    const room: Room = {
        id: roomId,
        name,
        passwordHash,
        creator: creatorSocket.id,
        players: [creatorPlayer],
        status: 'waiting',
        gameActive: false,
        currentPlayer1: null,
        currentPlayer2: null,
        currentGameState: null,
        currentMatchStartedAt: null,
        tournamentDbId: null,
        tournamentUuid: randomUUID(),
        gameIds: [],
    };

    rooms.set(roomId, room);
    roomsByName.set(name, roomId);

    return { success: true, roomId };
}

async function joinRoom(name: string, password: string, playerSocket: Socket, fastify: FastifyInstance): Promise<{ success: boolean; roomId?: string; error?: string }> {
    const roomId = roomsByName.get(name);
    if (!roomId) {
        return { success: false, error: 'Room not found' };
    }

    const room = rooms.get(roomId);
    if (!room) {
        return { success: false, error: 'Room not found' };
    }

    if (room.status === 'in_progress') {
        return { success: false, error: 'Room is in progress' };
    }
    if (room.status === 'finished') {
        return { success: false, error: 'Tournament has finished' };
    }

    if (room.passwordHash) {
        const isValidPassword = await bcrypt.compare(password, room.passwordHash);
        if (!isValidPassword) {
            return { success: false, error: 'Invalid password' };
        }
    }

    if (room.players.length >= MAX_PLAYERS) {
        return { success: false, error: 'Room is full' };
    }

    // Check if player already joined by socketId (reconnection case)
    const existingPlayer = room.players.find(p => p.socketId === playerSocket.id);
    if (existingPlayer) {
        return { success: true, roomId };
    }

    const playerUserId = (playerSocket as any).userId;
    
    // Check if this user is already in the tournament (prevent duplicate entries from multiple tabs)
    const duplicateUser = room.players.find(p => p.userId === playerUserId);
    if (duplicateUser) {
        return { success: false, error: 'You have already joined this tournament' };
    }

    const playerDisplay = (await getDisplayName(fastify, playerUserId)) || (playerSocket as any).username || 'Player';

    const newPlayer: Player = {
        socketId: playerSocket.id,
        userId: playerUserId,
        displayName: playerDisplay,
        isReady: false,
        isEliminated: false,
    };

    room.players.push(newPlayer);
    return { success: true, roomId };
}

function getRoom(roomId: string): Room | undefined {
    return rooms.get(roomId);
}

function setPlayerReady(roomId: string, socketId: string, ready: boolean): boolean {
    const room = rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) return false;

    player.isReady = ready;
    return true;
}

function removePlayer(socketId: string): { roomId: string; room: Room } | null {
    for (const [roomId, room] of rooms) {
        const playerIndex = room.players.findIndex(p => p.socketId === socketId);
        if (playerIndex !== -1) {
            room.players.splice(playerIndex, 1);

            if (room.players.length === 0) {
                roomsByName.delete(room.name);
                rooms.delete(roomId);
                return null;
            }

            if (room.creator === socketId && room.players.length > 0) {
                room.creator = room.players[0].socketId;
            }

            return { roomId, room };
        }
    }
    return null;
}

function setPlayerInput(roomId: string, socketId: string, up: boolean, down: boolean): void {
    const key = `${roomId}:${socketId}`;
    playerInputs.set(key, { up, down });
}

function getPlayerInput(roomId: string, socketId: string): InputState {
    const key = `${roomId}:${socketId}`;
    return playerInputs.get(key) || { up: false, down: false };
}

function clearPlayerInputs(roomId: string): void {
    const keysToDelete: string[] = [];
    playerInputs.forEach((_, key) => {
        if (key.startsWith(`${roomId}:`)) {
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(key => playerInputs.delete(key));
}

function getRoomsList(): Array<{ name: string; playerCount: number; maxPlayers: number; hasPassword: boolean; status: string }> {
    const roomsList: Array<{ name: string; playerCount: number; maxPlayers: number; hasPassword: boolean; status: string }> = [];

    rooms.forEach(room => {
        if (room.status === 'waiting') {
            roomsList.push({
                name: room.name,
                playerCount: room.players.length,
                maxPlayers: MAX_PLAYERS,
                hasPassword: !!room.passwordHash,
                status: room.status
            });
        }
    });

    return roomsList;
}

//TOURNAMENT LOGIC
function destroyRoom(roomId: string, io: Server): void {
    const room = rooms.get(roomId);
    if (!room) return;

    stopMatch(roomId);
    clearPlayerInputs(roomId);

    io.to(roomId).emit('tournament_room_destroyed', {
        message: 'Tournament has ended and room is closing'
    });

    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
        socketsInRoom.forEach((socketId: string) => {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.leave(roomId);
            }
        });
    }

    roomsByName.delete(room.name);
    rooms.delete(roomId);
}

function canStartTournament(roomId: string): boolean {
    const room = rooms.get(roomId);
    if (!room || room.players.length < 2) return false;
    return room.players.every(p => p.isReady);
}

function selectRandomPlayers(roomId: string): { player1: string; player2: string } | null {
    const room = rooms.get(roomId);
    if (!room) return null;

    const activePlayers = room.players.filter(p => !p.isEliminated);
    if (activePlayers.length < 2) return null;

    const shuffled = activePlayers.sort(() => Math.random() - 0.5);
    return {
        player1: shuffled[0].socketId,
        player2: shuffled[1].socketId
    };
}

// Select players (if not already selected) and start the game loop
function startMatch(roomId: string, io: Server, fastify: FastifyInstance): boolean {
    const room = rooms.get(roomId);
    if (!room) return false;

    // If players were preselected (e.g., after announcement), use them; otherwise select now
    const players = (room.currentPlayer1 && room.currentPlayer2)
        ? { player1: room.currentPlayer1, player2: room.currentPlayer2 }
        : selectRandomPlayers(roomId);
    if (!players) return false;

    const gameState = createGameState();
    gameStates.set(roomId, gameState);
    
    room.currentPlayer1 = players.player1;
    room.currentPlayer2 = players.player2;
    room.currentGameState = gameState;
    room.currentMatchStartedAt = new Date().toISOString();

    room.gameActive = true;

    const gameLoop = setInterval(async () => {
        if (!room.gameActive || !room.currentPlayer1 || !room.currentPlayer2) {
            stopMatch(roomId);
            return;
        }

        const player1 = room.currentPlayer1;
        const player2 = room.currentPlayer2;
        if (!player1 || !player2) {
            stopMatch(roomId);
            return;
        }

        const player1Input = getPlayerInput(roomId, player1);
        const player2Input = getPlayerInput(roomId, player2);

        updatePaddles(roomId, player1Input.up, player1Input.down, player2Input.up, player2Input.down);

        const gameEnded = step(roomId, io);
        if (gameEnded) {
            await handleMatchEnd(roomId, io, fastify);
        }
    }, 1000 / TICK_HZ);

    gameLoops.set(roomId, gameLoop);
    return true;
}

function stopMatch(roomId: string): void {
    const gameLoop = gameLoops.get(roomId);
    if (gameLoop) {
        clearInterval(gameLoop);
        gameLoops.delete(roomId);
    }

    gameStates.delete(roomId);

    const room = rooms.get(roomId);
    if (room) {
        room.gameActive = false;
    }
}

async function handleMatchEnd(roomId: string, io: Server, fastify: FastifyInstance): Promise<void> {
    const room = rooms.get(roomId);
    const gameState = gameStates.get(roomId);
    if (!room || !room.currentPlayer1 || !room.currentPlayer2 || !gameState) return;

    // Save match result to database
    const p1 = room.players.find(p => p.socketId === room.currentPlayer1);
    const p2 = room.players.find(p => p.socketId === room.currentPlayer2);
    const leftWon = gameState.score.left > gameState.score.right;
    const winnerName = leftWon ? (p1?.displayName || 'Player 1') : (p2?.displayName || 'Player 2');

    if (room.currentMatchStartedAt && p1 && p2) {
        const gameRecord: GameRecord = {
            game_name: 'Pong Tournament',
            started_at: room.currentMatchStartedAt,
            finished_at: new Date().toISOString(),
            player1_name: p1.displayName,
            player1_is_user: true,
            player2_name: p2.displayName,
            player2_is_user: true,
            winner: winnerName
        };

        // Save game record asynchronously
        saveGameRecord(fastify, gameRecord)
            .then(async (gameId) => {
                if (room.tournamentDbId && gameId) {
                    await linkGameToTournament(room, gameId, fastify);
                }
            })
            .catch(error => {
                fastify.log.error(error, 'Failed to save tournament match record');
            });
    }

    stopMatch(roomId);

    const loserSocketId = leftWon ? room.currentPlayer2 : room.currentPlayer1;

    const loser = room.players.find(p => p.socketId === loserSocketId);
    if (loser) {
        loser.isEliminated = true;
    }

    const activePlayers = room.players.filter(p => !p.isEliminated);
    if (activePlayers.length === 1) {
        room.status = 'finished';
        room.currentPlayer1 = null;
        room.currentPlayer2 = null;
        room.currentGameState = null;
        room.currentMatchStartedAt = null;

        const winner = activePlayers[0];
        
        // Save tournament end to database
        await saveTournamentEnd(room, winner.displayName, fastify);
        
        io.to(roomId).emit('tournament_finished', {
            winner: winner.displayName,
            room: {
                id: room.id,
                name: room.name,
                creator: room.creator,
                players: room.players,
                status: room.status,
            }
        });

        setTimeout(() => destroyRoom(roomId, io), 10000);
    } else {
        room.currentPlayer1 = null;
        room.currentPlayer2 = null;
        room.currentGameState = null;
        room.currentMatchStartedAt = null;

        io.to(roomId).emit('match_ended', {
            loser: loser?.displayName,
            room: {
                id: room.id,
                name: room.name,
                creator: room.creator,
                players: room.players,
                status: room.status,
            }
        });

        // Announce next match immediately and start after countdown
        announceAndScheduleMatch(roomId, io, fastify, 3000, false);
    }
}

// Announces upcoming match, shows who plays who, then starts after delayMs
function announceAndScheduleMatch(roomId: string, io: Server, fastify: FastifyInstance, delayMs: number = 3000, isFirstMatch: boolean = false): boolean {
    const room = rooms.get(roomId);
    if (!room) return false;

    const players = selectRandomPlayers(roomId);
    if (!players) return false;

    // Set current players so startMatch uses them
    room.currentPlayer1 = players.player1;
    room.currentPlayer2 = players.player2;

    const p1 = room.players.find(p => p.socketId === players.player1);
    const p2 = room.players.find(p => p.socketId === players.player2);

    io.to(roomId).emit('match_announced', {
        room: {
            id: room.id,
            name: room.name,
            creator: room.creator,
            players: room.players,
            status: room.status,
        },
        player1: { socketId: players.player1, displayName: p1?.displayName || 'Player 1' },
        player2: { socketId: players.player2, displayName: p2?.displayName || 'Player 2' },
        countdown: Math.ceil(delayMs / 1000)
    });

    setTimeout(() => {
        const started = startMatch(roomId, io, fastify);
        if (started) {
            const payload = {
                room: {
                    id: room.id,
                    name: room.name,
                    creator: room.creator,
                    players: room.players,
                    status: room.status,
                    currentMatch: {
                        player1: room.currentPlayer1,
                        player2: room.currentPlayer2,
                        gameState: room.currentGameState
                    },
                }
            };

            // Keep backward compatibility: emit tournament_started for the first match
            if (isFirstMatch) {
                io.to(roomId).emit('tournament_started', payload);
            }
            // Emit a generic match_started for all matches
            io.to(roomId).emit('match_started', payload);
        } else {
            io.to(roomId).emit('tournament_error', { error: 'Failed to start match' });
        }
    }, delayMs);

    return true;
}

//SERVER SETUP
export function setupTournamentPong(fastify: FastifyInstance, io: Server): void {
    io.on('connection', (socket: Socket) => {
        socket.on('get_tournament_rooms', (callback: (rooms: Array<{ name: string; playerCount: number; maxPlayers: number; hasPassword: boolean; status: string }>) => void) => {
            callback(getRoomsList());
        });

        socket.on('enter_tournament_room', async (data: { name: string; password: string }, callback: (result: { success: boolean; roomId?: string; error?: string }) => void) => {
            try {
                const nameValidation = validateRoomName(data.name);
                if (!nameValidation.valid) {
                    callback({ success: false, error: `Invalid room name: ${nameValidation.error}` });
                    return;
                }
                const passwordValidation = validateRoomPassword(data.password);
                if (!passwordValidation.valid) {
                    callback({ success: false, error: `Invalid password: ${passwordValidation.error}` });
                    return;
                }

                const name = nameValidation.value;
                const password = passwordValidation.value;

                const joinResult = await joinRoom(name, password || '', socket, fastify);

                if (joinResult.success && joinResult.roomId) {
                    socket.join(joinResult.roomId);
                    const room = getRoom(joinResult.roomId);

                    callback({ success: true, roomId: joinResult.roomId });

                    io.to(joinResult.roomId).emit('tournament_room_state', {
                        room: {
                            id: room!.id,
                            name: room!.name,
                            creator: room!.creator,
                            players: room!.players,
                            status: room!.status,
                        }
                    });
                } else if (joinResult.error === 'Room not found') {
                    const createResult = await createRoom(name, password || '', socket, fastify);

                    if (createResult.success && createResult.roomId) {
                        socket.join(createResult.roomId);
                        const room = getRoom(createResult.roomId);

                        callback({ success: true, roomId: createResult.roomId });

                        socket.emit('tournament_room_state', {
                            room: {
                                id: room!.id,
                                name: room!.name,
                                creator: room!.creator,
                                players: room!.players,
                                status: room!.status,
                            }
                        });
                    } else {
                        callback({ success: false, error: createResult.error });
                    }
                } else {
                    callback({ success: false, error: joinResult.error });
                }
            } catch (error) {
                fastify.log.error({ error }, 'Error entering tournament room');
                callback({ success: false, error: 'Server error' });
            }
        });

        socket.on('tournament_set_ready', (data: { roomId: string; ready: boolean }) => {
            const { roomId, ready } = data;

            if (setPlayerReady(roomId, socket.id, ready)) {
                const room = getRoom(roomId);
                io.to(roomId).emit('tournament_room_state', {
                    room: {
                        id: room!.id,
                        name: room!.name,
                        creator: room!.creator,
                        players: room!.players,
                        status: room!.status,
                    }
                });
            }
        });

        socket.on('tournament_start', async (data: { roomId: string }) => {
            const { roomId } = data;
            const room = getRoom(roomId);

            if (!room) return;

            if (room.creator !== socket.id) {
                socket.emit('tournament_error', { error: 'Only creator can start the tournament' });
                return;
            }

            if (!canStartTournament(roomId)) {
                socket.emit('tournament_error', { error: 'All players must be ready (minimum 2 players)' });
                return;
            }

            room.status = 'in_progress';
            
            // Save tournament start to database
            await saveTournamentStart(room, fastify);
            
            // Announce first match and start after a visible 3s countdown
            const scheduled = announceAndScheduleMatch(roomId, io, fastify, 3000, true);
            if (!scheduled) {
                socket.emit('tournament_error', { error: 'Failed to schedule match' });
            }
        });

        socket.on('leave_tournament_room', (data: { roomId: string }) => {
            const { roomId } = data;
            socket.leave(roomId);

            const result = removePlayer(socket.id);
            if (result) {
                const { room } = result;
                io.to(roomId).emit('tournament_room_state', {
                    room: {
                        id: room.id,
                        name: room.name,
                        creator: room.creator,
                        players: room.players,
                        status: room.status,
                    }
                });
            }
        });

        socket.on('tournament_player_input', (data: { roomId: string; up: boolean; down: boolean }) => {
            const { roomId, up, down } = data;
            setPlayerInput(roomId, socket.id, up, down);
        });

        socket.on('disconnect', () => {
            const result = removePlayer(socket.id);
            if (result) {
                const { roomId, room } = result;
                io.to(roomId).emit('tournament_room_state', {
                    room: {
                        id: room.id,
                        name: room.name,
                        creator: room.creator,
                        players: room.players,
                        status: room.status,
                    }
                });
            }
        });
    });
}