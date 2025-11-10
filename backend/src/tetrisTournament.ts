import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { validateRoomName, validateRoomPassword } from './utils/validation.js';
import { saveGameRecord, GameRecord } from './utils/gameStats.js';
import {
    TICK_HZ,
    GRAVITY_TICKS,
    PlayerState,
    createPlayerState,
    spawnNewPiece,
    updatePlayer
} from './tetrisShared.js';

const COUNTDOWN_SECONDS = 3;
const GAME_UPDATE_RATE = 1000 / 60; // 60 FPS

interface TournamentPlayer {
    socketId: string;
    userId: number;
    displayName: string;
    isReady: boolean;
    isEliminated: boolean;
}

interface TournamentMatch {
    player1: string; // socketId
    player2: string; // socketId
    winner: string | null;
}

interface GameState {
    player1: PlayerState;
    player2: PlayerState;
    started: boolean;
    currentGravityTicks: number;
}

interface TournamentRoom {
    id: string;
    name: string;
    passwordHash: string;
    creator: string; // socketId
    players: TournamentPlayer[];
    status: 'waiting' | 'in_progress' | 'finished';
    currentMatch: TournamentMatch | null;
    gameState: GameState | null;
    gameInterval: ReturnType<typeof setInterval> | null;
    countdownTimer: ReturnType<typeof setInterval> | null;
    currentMatchStartedAt: string | null;
    tournamentDbId: number | null;
    tournamentUuid: string;
    gameIds: number[];
}

const rooms = new Map<string, TournamentRoom>();
const roomsByName = new Map<string, string>(); // name -> roomId

async function saveTournamentStart(room: TournamentRoom, fastify: FastifyInstance): Promise<void> {
    return new Promise((resolve, reject) => {
        (fastify as any).sqlite.run(
            'INSERT INTO tournaments (uuid, started_at, player_count, game_type) VALUES (?, ?, ?, ?)',
            [room.tournamentUuid, new Date().toISOString(), room.players.length, 'Tetris'],
            function (this: any, err: Error | null) {
                if (err) {
                    fastify.log.error(err, 'Failed to save tournament start');
                    reject(err);
                } else {
                    room.tournamentDbId = this.lastID;
                    fastify.log.info(`Tetris tournament ${room.tournamentUuid} saved with ID ${this.lastID}`);
                    resolve();
                }
            }
        );
    });
}

async function saveTournamentEnd(room: TournamentRoom, winner: string, fastify: FastifyInstance): Promise<void> {
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
                    fastify.log.info(`Tetris tournament ${room.tournamentDbId} finished. Winner: ${winner}`);
                    resolve();
                }
            }
        );
    });
}

async function linkGameToTournament(room: TournamentRoom, gameId: number, fastify: FastifyInstance): Promise<void> {
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

async function getDisplayName(fastify: FastifyInstance, userId: number): Promise<string | null> {
    return await new Promise((resolve) => {
        (fastify as any).sqlite.get('SELECT display_name FROM users WHERE id = ?', [userId], (err: Error | null, row: any) => {
            if (err || !row || !row.display_name) return resolve(null);
            resolve(row.display_name as string);
        });
    });
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

async function createRoom(name: string, password: string, creatorSocket: Socket, fastify: FastifyInstance): Promise<{ success: boolean; roomId?: string; error?: string }> {
    if (roomsByName.has(name)) {
        return { success: false, error: 'Room with this name already exists' };
    }

    const roomId = `tetris-tournament-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = password ? await bcrypt.hash(password, 10) : '';

    const creatorUserId = (creatorSocket as any).userId;
    const creatorDisplay = (await getDisplayName(fastify, creatorUserId)) || (creatorSocket as any).username || 'Player';

    const creatorPlayer: TournamentPlayer = {
        socketId: creatorSocket.id,
        userId: creatorUserId,
        displayName: creatorDisplay,
        isReady: false,
        isEliminated: false
    };

    const room: TournamentRoom = {
        id: roomId,
        name,
        passwordHash,
        creator: creatorSocket.id,
        players: [creatorPlayer],
        status: 'waiting',
        currentMatch: null,
        gameState: null,
        gameInterval: null,
        countdownTimer: null,
        currentMatchStartedAt: null,
        tournamentDbId: null,
        tournamentUuid: randomUUID(),
        gameIds: []
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

    if (room.players.length >= 10) {
        return { success: false, error: 'Room is full' };
    }

    const existingPlayer = room.players.find(p => p.socketId === playerSocket.id);
    if (existingPlayer) {
        return { success: true, roomId };
    }

    const playerUserId = (playerSocket as any).userId;
    const playerDisplay = (await getDisplayName(fastify, playerUserId)) || (playerSocket as any).username || 'Player';

    const newPlayer: TournamentPlayer = {
        socketId: playerSocket.id,
        userId: playerUserId,
        displayName: playerDisplay,
        isReady: false,
        isEliminated: false
    };

    room.players.push(newPlayer);

    return { success: true, roomId };
}

function getRoomsList(): Array<{ name: string; playerCount: number; maxPlayers: number; hasPassword: boolean; status: string }> {
    const roomsList: Array<{ name: string; playerCount: number; maxPlayers: number; hasPassword: boolean; status: string }> = [];

    rooms.forEach(room => {
        if (room.status === 'waiting') {
            roomsList.push({
                name: room.name,
                playerCount: room.players.length,
                maxPlayers: 10,
                hasPassword: !!room.passwordHash,
                status: room.status
            });
        }
    });

    return roomsList;
}

export function setupTetrisTournamentHandlers(io: Server, fastify: FastifyInstance): void {
    io.on('connection', (socket: Socket) => {
        socket.on('tetris_tournament_set_ready', (data: { roomId: string; ready: boolean }) => {
            const room = rooms.get(data.roomId);
            if (!room || room.status !== 'waiting') return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (player) {
                player.isReady = data.ready;
                io.to(data.roomId).emit('tetris_tournament_room_state', { room: getClientSafeRoom(room) });
            }
        });

        socket.on('tetris_tournament_start', async (data: { roomId: string }) => {
            const room = rooms.get(data.roomId);
            if (!room) return;

            if (socket.id !== room.creator) {
                socket.emit('tetris_tournament_error', { error: 'Only creator can start the tournament' });
                return;
            }

            if (!canStartTournament(data.roomId)) {
                socket.emit('tetris_tournament_error', { error: 'All players must be ready (minimum 2 players)' });
                return;
            }

            room.status = 'in_progress';
            
            // Save tournament start to DB
            await saveTournamentStart(room, fastify);

            io.to(data.roomId).emit('tetris_tournament_started', { room: getClientSafeRoom(room) });
            
            // Start first match with random pairing
            const success = announceAndScheduleMatch(data.roomId, io, fastify, 3000, true);
            if (!success) {
                socket.emit('tetris_tournament_error', { error: 'Failed to schedule match' });
            }
        });

        socket.on('tetris_tournament_player_input', (data: { roomId: string; left: boolean; right: boolean; down: boolean; rotate: boolean; drop: boolean }) => {
            const room = rooms.get(data.roomId);
            if (!room || !room.currentMatch || !room.gameState) return;

            const isPlayer1 = socket.id === room.currentMatch.player1;
            const isPlayer2 = socket.id === room.currentMatch.player2;

            if (isPlayer1) {
                room.gameState.player1.input = { left: data.left, right: data.right, down: data.down, rotate: data.rotate, drop: data.drop };
            } else if (isPlayer2) {
                room.gameState.player2.input = { left: data.left, right: data.right, down: data.down, rotate: data.rotate, drop: data.drop };
            }
        });

        socket.on('leave_tetris_tournament_room', (data: { roomId: string }) => {
            handlePlayerLeave(socket, data.roomId, io, fastify);
        });

        socket.on('disconnect', () => {
            rooms.forEach((room, roomId) => {
                if (room.players.some(p => p.socketId === socket.id)) {
                    handlePlayerLeave(socket, roomId, io, fastify);
                }
            });
        });

        socket.on('get_tetris_tournament_rooms', (callback: (rooms: Array<{ name: string; playerCount: number; maxPlayers: number; hasPassword: boolean; status: string }>) => void) => {
            callback(getRoomsList());
        });

        socket.on('enter_tetris_tournament_room', async (data: { name: string; password: string }, callback: (result: { success: boolean; roomId?: string; error?: string }) => void) => {
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
                    const room = rooms.get(joinResult.roomId);

                    callback({ success: true, roomId: joinResult.roomId });

                    io.to(joinResult.roomId).emit('tetris_tournament_room_state', {
                        room: getClientSafeRoom(room!)
                    });
                } else if (joinResult.error === 'Room not found') {
                    const createResult = await createRoom(name, password || '', socket, fastify);

                    if (createResult.success && createResult.roomId) {
                        socket.join(createResult.roomId);
                        const room = rooms.get(createResult.roomId);

                        callback({ success: true, roomId: createResult.roomId });

                        socket.emit('tetris_tournament_room_state', {
                            room: getClientSafeRoom(room!)
                        });
                    } else {
                        callback({ success: false, error: createResult.error });
                    }
                } else {
                    callback({ success: false, error: joinResult.error });
                }
            } catch (error) {
                fastify.log.error({ error }, 'Error entering tetris tournament room');
                callback({ success: false, error: 'Server error' });
            }
        });
    });
}

function announceAndScheduleMatch(roomId: string, io: Server, fastify: FastifyInstance, delayMs: number = 3000, isFirstMatch: boolean = false): boolean {
    const room = rooms.get(roomId);
    if (!room) return false;

    const players = selectRandomPlayers(roomId);
    if (!players) return false;

    // Set current match players
    room.currentMatch = {
        player1: players.player1,
        player2: players.player2,
        winner: null
    };

    const p1 = room.players.find(p => p.socketId === players.player1);
    const p2 = room.players.find(p => p.socketId === players.player2);

    io.to(roomId).emit('tetris_match_announced', {
        room: getClientSafeRoom(room),
        player1: { socketId: players.player1, displayName: p1?.displayName || 'Player 1' },
        player2: { socketId: players.player2, displayName: p2?.displayName || 'Player 2' },
        countdown: Math.ceil(delayMs / 1000)
    });

    setTimeout(() => {
        startMatch(room, io, fastify);
    }, delayMs);

    return true;
}

async function startMatch(room: TournamentRoom, io: Server, fastify: FastifyInstance): Promise<void> {
    if (!room.currentMatch) return;

    room.gameState = {
        player1: createPlayerState(),
        player2: createPlayerState(),
        started: true,
        currentGravityTicks: GRAVITY_TICKS
    };

    spawnNewPiece(room.gameState.player1);
    spawnNewPiece(room.gameState.player2);

    // Record match start time for database
    room.currentMatchStartedAt = new Date().toISOString();

    io.to(room.id).emit('tetris_match_started', { room: getClientSafeRoom(room) });

    // Emit initial game state immediately so pieces appear
    io.to(room.id).emit('tetris_game_state', room.gameState);

    room.gameInterval = setInterval(async () => {
        if (!room.gameState || !room.currentMatch) return;

        const newGravityTicks1 = updatePlayer(room.gameState.player1, room.gameState.currentGravityTicks);
        const newGravityTicks2 = updatePlayer(room.gameState.player2, room.gameState.currentGravityTicks);

        // Use the minimum gravity ticks (faster speed applies to both)
        room.gameState.currentGravityTicks = Math.min(newGravityTicks1, newGravityTicks2);

        io.to(room.id).emit('tetris_game_state', room.gameState);

        // Check for game over
        if (room.gameState.player1.gameOver || room.gameState.player2.gameOver) {
            if (room.gameInterval) {
                clearInterval(room.gameInterval);
                room.gameInterval = null;
            }

            let loser: string;
            let winner: string;

            if (room.gameState.player1.gameOver) {
                loser = room.currentMatch.player1;
                winner = room.currentMatch.player2;
            } else {
                loser = room.currentMatch.player2;
                winner = room.currentMatch.player1;
            }

            room.currentMatch.winner = winner;

            const loserPlayer = room.players.find(p => p.socketId === loser);
            const winnerPlayer = room.players.find(p => p.socketId === winner);
            if (loserPlayer) loserPlayer.isEliminated = true;

            // Save match result to database
            if (room.currentMatchStartedAt && loserPlayer && winnerPlayer) {
                const player1State = room.gameState.player1;
                const player2State = room.gameState.player2;
                
                const gameRecord: GameRecord = {
                    game_name: 'Tetris Tournament',
                    started_at: room.currentMatchStartedAt,
                    finished_at: new Date().toISOString(),
                    player1_name: room.players.find(p => p.socketId === room.currentMatch!.player1)?.displayName || 'Player 1',
                    player1_is_user: true,
                    player2_name: room.players.find(p => p.socketId === room.currentMatch!.player2)?.displayName || 'Player 2',
                    player2_is_user: true,
                    winner: winnerPlayer.displayName,
                    data: JSON.stringify({
                        reason: 'game_over',
                        winner: winnerPlayer.displayName,
                        player1: {
                            alias: room.players.find(p => p.socketId === room.currentMatch!.player1)?.displayName || 'Player 1',
                            score: player1State.score,
                            linesCleared: player1State.linesCleared,
                            gameOver: player1State.gameOver
                        },
                        player2: {
                            alias: room.players.find(p => p.socketId === room.currentMatch!.player2)?.displayName || 'Player 2',
                            score: player2State.score,
                            linesCleared: player2State.linesCleared,
                            gameOver: player2State.gameOver
                        }
                    })
                };

                saveGameRecord(fastify, gameRecord)
                    .then(async (gameId) => {
                        if (room.tournamentDbId && gameId) {
                            await linkGameToTournament(room, gameId, fastify);
                        }
                    })
                    .catch(error => {
                        fastify.log.error(error, 'Failed to save tetris tournament match record');
                    });
            }

            io.to(room.id).emit('tetris_match_ended', {
                loser: loserPlayer?.displayName || 'Unknown',
                room: getClientSafeRoom(room)
            });

            room.gameState = null;
            room.gameState = null;
            room.currentMatch = null;

            // Check if tournament is over
            const activePlayers = room.players.filter(p => !p.isEliminated);
            if (activePlayers.length === 1) {
                // Tournament finished
                room.status = 'finished';
                
                // Save tournament end to database
                await saveTournamentEnd(room, activePlayers[0].displayName, fastify);
                
                io.to(room.id).emit('tetris_tournament_finished', {
                    winner: activePlayers[0].displayName,
                    room: getClientSafeRoom(room)
                });

                setTimeout(() => {
                    io.to(room.id).emit('tetris_tournament_room_destroyed', { message: 'Tournament ended' });
                    roomsByName.delete(room.name);
                    rooms.delete(room.id);
                }, 10000);
            } else {
                // Schedule next match
                setTimeout(() => {
                    announceAndScheduleMatch(room.id, io, fastify, 3000, false);
                }, 3000);
            }
        }
    }, GAME_UPDATE_RATE);
}

function handlePlayerLeave(socket: Socket, roomId: string, io: Server, fastify: FastifyInstance): void {
    const room = rooms.get(roomId);
    if (!room) return;

    socket.leave(roomId);

    if (socket.id === room.creator) {
        // Creator left - destroy room
        if (room.gameInterval) clearInterval(room.gameInterval);
        if (room.countdownTimer) clearInterval(room.countdownTimer);
        
        io.to(roomId).emit('tetris_tournament_room_destroyed', { message: 'Creator left' });
        roomsByName.delete(room.name);
        rooms.delete(roomId);
        return;
    }

    // Regular player left
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex !== -1) {
        room.players[playerIndex].isEliminated = true;

        if (room.currentMatch && (room.currentMatch.player1 === socket.id || room.currentMatch.player2 === socket.id)) {
            // Player in active match left
            if (room.gameInterval) clearInterval(room.gameInterval);
            if (room.countdownTimer) clearInterval(room.countdownTimer);

            const winner = room.currentMatch.player1 === socket.id ? room.currentMatch.player2 : room.currentMatch.player1;
            const loser = socket.id;
            room.currentMatch.winner = winner;

            const winnerPlayer = room.players.find(p => p.socketId === winner);
            const loserPlayer = room.players.find(p => p.socketId === loser);

            // Save match result to database (forfeit)
            if (room.currentMatchStartedAt && winnerPlayer && loserPlayer) {
                const gameRecord: GameRecord = {
                    game_name: 'Tetris Tournament',
                    started_at: room.currentMatchStartedAt,
                    finished_at: new Date().toISOString(),
                    player1_name: room.players.find(p => p.socketId === room.currentMatch!.player1)?.displayName || 'Player 1',
                    player1_is_user: true,
                    player2_name: room.players.find(p => p.socketId === room.currentMatch!.player2)?.displayName || 'Player 2',
                    player2_is_user: true,
                    winner: winnerPlayer.displayName,
                    data: JSON.stringify({
                        reason: 'player_left',
                        winner: winnerPlayer.displayName,
                        loser: loserPlayer.displayName
                    })
                };

                saveGameRecord(fastify, gameRecord)
                    .then(async (gameId) => {
                        if (room.tournamentDbId && gameId) {
                            await linkGameToTournament(room, gameId, fastify);
                        }
                    })
                    .catch(error => {
                        fastify.log.error(error, 'Failed to save tetris tournament match record (forfeit)');
                    });
            }

            io.to(roomId).emit('tetris_match_ended', {
                loser: room.players[playerIndex].displayName,
                room: getClientSafeRoom(room)
            });

            room.gameState = null;
            room.currentMatch = null;
            room.currentMatchStartedAt = null;

            // Check if tournament is over
            const activePlayers = room.players.filter(p => !p.isEliminated);
            if (activePlayers.length === 1) {
                // Tournament finished
                room.status = 'finished';
                io.to(room.id).emit('tetris_tournament_finished', {
                    winner: activePlayers[0].displayName,
                    room: getClientSafeRoom(room)
                });

                setTimeout(() => {
                    io.to(room.id).emit('tetris_tournament_room_destroyed', { message: 'Tournament ended' });
                    roomsByName.delete(room.name);
                    rooms.delete(room.id);
                }, 10000);
            } else {
                // Schedule next match
                setTimeout(() => {
                    announceAndScheduleMatch(roomId, io, fastify, 3000, false);
                }, 2000);
            }
        }

        io.to(roomId).emit('tetris_tournament_room_state', { room: getClientSafeRoom(room) });
    }
}

function getClientSafeRoom(room: TournamentRoom): any {
    return {
        id: room.id,
        name: room.name,
        creator: room.creator,
        players: room.players,
        status: room.status,
        currentMatch: room.currentMatch
    };
}
