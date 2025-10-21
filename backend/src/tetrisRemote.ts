// Tetris Remote Game Server Logic - for authenticated remote multiplayer
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import { verifyToken } from './utils/jwt.js';

// Game constants
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const TICK_HZ = 60;
const GRAVITY_TICKS = 30;
const MOVE_DELAY_INITIAL = 12;
const MOVE_DELAY_REPEAT = 3;
const ROTATE_DELAY = 10;

// Tetromino shapes
const SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
};

const SHAPE_KEYS = Object.keys(SHAPES) as Array<keyof typeof SHAPES>;

const COLORS = {
    I: '#00f0f0',
    O: '#f0f000',
    T: '#a000f0',
    S: '#00f000',
    Z: '#f00000',
    J: '#0000f0',
    L: '#f0a000'
};

type ShapeType = keyof typeof SHAPES;
type PlayerSide = 'player1' | 'player2';

interface Piece {
    shape: number[][];
    type: ShapeType;
    x: number;
    y: number;
}

interface PlayerState {
    board: number[][];
    currentPiece: Piece | null;
    score: number;
    linesCleared: number;
    gameOver: boolean;
    alias: string;
    input: { left: boolean; right: boolean; down: boolean; rotate: boolean; drop: boolean };
    gravityCounter: number;
    moveCounter: number;
    lastMoveDirection: 'left' | 'right' | null;
    lastRotateState: boolean;
    dropPressed: boolean;
}

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
    player1: {
        board: createEmptyBoard(),
        currentPiece: null,
        score: 0,
        linesCleared: 0,
        gameOver: false,
        alias: '',
        input: { left: false, right: false, down: false, rotate: false, drop: false },
        gravityCounter: 0,
        moveCounter: 0,
        lastMoveDirection: null,
        lastRotateState: false,
        dropPressed: false
    },
    player2: {
        board: createEmptyBoard(),
        currentPiece: null,
        score: 0,
        linesCleared: 0,
        gameOver: false,
        alias: '',
        input: { left: false, right: false, down: false, rotate: false, drop: false },
        gravityCounter: 0,
        moveCounter: 0,
        lastMoveDirection: null,
        lastRotateState: false,
        dropPressed: false
    },
    started: false
};

// Player tracking - only 2 players allowed
const players = new Map<string, RemotePlayer>();
let gameInterval: NodeJS.Timeout | null = null;

// Helper functions
function createEmptyBoard(): number[][] {
    return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0));
}

function randomShape(): ShapeType {
    return SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
}

function createPiece(type: ShapeType): Piece {
    return {
        shape: SHAPES[type].map(row => [...row]),
        type,
        x: Math.floor(BOARD_WIDTH / 2) - 1,
        y: 0
    };
}

function rotatePiece(piece: Piece): Piece {
    const rotated = piece.shape[0].map((_, i) =>
        piece.shape.map(row => row[i]).reverse()
    );
    return { ...piece, shape: rotated };
}

function checkCollision(board: number[][], piece: Piece, offsetX = 0, offsetY = 0): boolean {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                const newX = piece.x + x + offsetX;
                const newY = piece.y + y + offsetY;
                
                if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) return true;
                if (newY >= 0 && board[newY][newX]) return true;
            }
        }
    }
    return false;
}

function mergePiece(board: number[][], piece: Piece): void {
    for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
            if (piece.shape[y][x]) {
                const boardY = piece.y + y;
                const boardX = piece.x + x;
                if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
                    board[boardY][boardX] = 1;
                }
            }
        }
    }
}

function clearLines(playerState: PlayerState): number {
    let linesCleared = 0;
    
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
        if (playerState.board[y].every(cell => cell !== 0)) {
            playerState.board.splice(y, 1);
            playerState.board.unshift(Array(BOARD_WIDTH).fill(0));
            linesCleared++;
            y++;
        }
    }
    
    if (linesCleared > 0) {
        playerState.linesCleared += linesCleared;
        const points = [0, 100, 300, 500, 800][linesCleared] || 800;
        playerState.score += points;
    }
    
    return linesCleared;
}

function spawnNewPiece(playerState: PlayerState): void {
    const type = randomShape();
    playerState.currentPiece = createPiece(type);
    
    if (checkCollision(playerState.board, playerState.currentPiece)) {
        playerState.gameOver = true;
    }
}

function resetGame(): void {
    state.player1.board = createEmptyBoard();
    state.player1.currentPiece = null;
    state.player1.score = 0;
    state.player1.linesCleared = 0;
    state.player1.gameOver = false;
    state.player1.alias = '';
    state.player1.input = { left: false, right: false, down: false, rotate: false, drop: false };
    state.player1.gravityCounter = 0;
    state.player1.moveCounter = 0;
    state.player1.lastMoveDirection = null;
    state.player1.lastRotateState = false;
    state.player1.dropPressed = false;
    
    state.player2.board = createEmptyBoard();
    state.player2.currentPiece = null;
    state.player2.score = 0;
    state.player2.linesCleared = 0;
    state.player2.gameOver = false;
    state.player2.alias = '';
    state.player2.input = { left: false, right: false, down: false, rotate: false, drop: false };
    state.player2.gravityCounter = 0;
    state.player2.moveCounter = 0;
    state.player2.lastMoveDirection = null;
    state.player2.lastRotateState = false;
    state.player2.dropPressed = false;
    
    state.started = false;
    players.clear();
}

function updatePlayer(playerState: PlayerState): void {
    if (playerState.gameOver || !playerState.currentPiece) return;
    
    const piece = playerState.currentPiece;
    const input = playerState.input;
    
    // Handle rotation (edge-triggered)
    if (input.rotate && !playerState.lastRotateState) {
        const rotated = rotatePiece(piece);
        if (!checkCollision(playerState.board, rotated)) {
            playerState.currentPiece = rotated;
        }
    }
    playerState.lastRotateState = input.rotate;
    
    // Handle instant drop
    if (input.drop && !playerState.dropPressed) {
        playerState.dropPressed = true;
        while (!checkCollision(playerState.board, piece, 0, 1)) {
            piece.y++;
        }
        mergePiece(playerState.board, piece);
        clearLines(playerState);
        spawnNewPiece(playerState);
        playerState.input.drop = false;
        playerState.dropPressed = false;
        return;
    }
    if (!input.drop) {
        playerState.dropPressed = false;
    }
    
    // Handle horizontal movement with delay
    const currentDirection = input.left ? 'left' : input.right ? 'right' : null;
    
    if (currentDirection !== playerState.lastMoveDirection) {
        playerState.moveCounter = 0;
        playerState.lastMoveDirection = currentDirection;
    }
    
    if (currentDirection) {
        if (playerState.moveCounter === 0 || playerState.moveCounter >= MOVE_DELAY_INITIAL) {
            const offset = currentDirection === 'left' ? -1 : 1;
            if (!checkCollision(playerState.board, piece, offset, 0)) {
                piece.x += offset;
            }
            
            if (playerState.moveCounter >= MOVE_DELAY_INITIAL) {
                playerState.moveCounter = MOVE_DELAY_INITIAL - MOVE_DELAY_REPEAT;
            }
        }
        playerState.moveCounter++;
    }
    
    // Handle gravity (down movement)
    const gravitySpeed = input.down ? 3 : GRAVITY_TICKS;
    playerState.gravityCounter++;
    
    if (playerState.gravityCounter >= gravitySpeed) {
        playerState.gravityCounter = 0;
        
        if (!checkCollision(playerState.board, piece, 0, 1)) {
            piece.y++;
        } else {
            mergePiece(playerState.board, piece);
            clearLines(playerState);
            spawnNewPiece(playerState);
        }
    }
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
                ?.split('; ')
                .find((row: string) => row.startsWith('accessToken='))
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
        
        fastify.log.info(`Tetris Remote player connected: ${username} (${userId})`);
        
        // Check if game is full
        if (players.size >= 2) {
            socket.emit('connection_error', { message: 'Game is full' });
            socket.disconnect();
            return;
        }
        
        // Assign player side
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
        socket.on('disconnect', () => {
            fastify.log.info(`Tetris Remote player disconnected: ${username}`);
            players.delete(socket.id);
            
            // If a player disconnects during game, end it
            if (state.started) {
                resetGame();
                tetrisRemoteNamespace.emit('game_ended', { reason: 'player_disconnected' });
            }
        });
    });
    
    // Game loop
    if (!gameInterval) {
        gameInterval = setInterval(() => {
            step();
            
            // Create snapshot for clients
            const snapshot = {
                player1: {
                    board: state.player1.board,
                    currentPiece: state.player1.currentPiece ? {
                        shape: state.player1.currentPiece.shape,
                        type: state.player1.currentPiece.type,
                        x: state.player1.currentPiece.x,
                        y: state.player1.currentPiece.y,
                        color: COLORS[state.player1.currentPiece.type]
                    } : null,
                    score: state.player1.score,
                    linesCleared: state.player1.linesCleared,
                    gameOver: state.player1.gameOver,
                    alias: state.player1.alias
                },
                player2: {
                    board: state.player2.board,
                    currentPiece: state.player2.currentPiece ? {
                        shape: state.player2.currentPiece.shape,
                        type: state.player2.currentPiece.type,
                        x: state.player2.currentPiece.x,
                        y: state.player2.currentPiece.y,
                        color: COLORS[state.player2.currentPiece.type]
                    } : null,
                    score: state.player2.score,
                    linesCleared: state.player2.linesCleared,
                    gameOver: state.player2.gameOver,
                    alias: state.player2.alias
                },
                started: state.started
            };
            
            tetrisRemoteNamespace.emit('game_state', snapshot);
            
            // Check if game should end
            if (state.started && (state.player1.gameOver || state.player2.gameOver)) {
                const winner = state.player1.gameOver ? state.player2.alias : state.player1.alias;
                tetrisRemoteNamespace.emit('game_ended', { reason: 'game_over', winner });
                resetGame();
            }
        }, 1000 / TICK_HZ);
    }
    
    fastify.log.info('Tetris Remote game server initialized');
}
