// Tetris Game Server Logic
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';

// Game constants
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const TICK_HZ = 60; // Game updates 60 times per second (matching Pong)
const GRAVITY_TICKS = 30; // Pieces fall every 30 ticks (twice per second at 60 Hz)
const MOVE_DELAY_INITIAL = 12; // Initial delay before repeat (0.2 seconds at 60 Hz)
const MOVE_DELAY_REPEAT = 3; // Delay between repeats (0.05 seconds at 60 Hz)
const ROTATE_DELAY = 10; // Delay between rotations (0.167 seconds at 60 Hz)

// Tetromino shapes (standard Tetris pieces)
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

// Colors for each shape
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
    gravityCounter: number; // Ticks since last gravity drop
    moveCounter: number; // Ticks since last horizontal move
    lastMoveDirection: 'left' | 'right' | null; // Track which direction was last moved
    lastRotateState: boolean; // Track previous rotate key state
    dropPressed: boolean; // Track if drop was already processed
}

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

// Player tracking
const players = new Map<string, PlayerInfo>();
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
                
                if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
                    return true;
                }
                if (newY >= 0 && board[newY][newX]) {
                    return true;
                }
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
            y++; // Check this row again
        }
    }
    
    if (linesCleared > 0) {
        playerState.linesCleared += linesCleared;
        // Score: 100 for 1 line, 300 for 2, 500 for 3, 800 for 4
        const points = [0, 100, 300, 500, 800][linesCleared] || 800;
        playerState.score += points;
    }
    
    return linesCleared;
}

function spawnNewPiece(playerState: PlayerState): void {
    const type = randomShape();
    playerState.currentPiece = createPiece(type);
    
    // Check if new piece collides immediately (game over)
    if (checkCollision(playerState.board, playerState.currentPiece)) {
        playerState.gameOver = true;
    }
}

function updatePlayer(playerState: PlayerState, input: PlayerInfo['input']): void {
    if (playerState.gameOver || !playerState.currentPiece) return;
    
    const piece = playerState.currentPiece;
    
    // Handle rotation - one press = one rotation
    if (input.rotate && !playerState.lastRotateState) {
        const rotated = rotatePiece(piece);
        if (!checkCollision(playerState.board, rotated)) {
            playerState.currentPiece = rotated;
        }
    }
    playerState.lastRotateState = input.rotate;
    
    // Handle horizontal movement with delay
    const currentDirection = input.left ? 'left' : input.right ? 'right' : null;
    
    if (currentDirection) {
        // If direction changed, reset counter
        if (currentDirection !== playerState.lastMoveDirection) {
            playerState.moveCounter = 0;
            playerState.lastMoveDirection = currentDirection;
        }
        
        // Determine if we should move this tick
        const shouldMove = playerState.moveCounter === 0 || 
                          (playerState.moveCounter >= MOVE_DELAY_INITIAL && 
                           (playerState.moveCounter - MOVE_DELAY_INITIAL) % MOVE_DELAY_REPEAT === 0);
        
        if (shouldMove) {
            if (currentDirection === 'left' && !checkCollision(playerState.board, piece, -1, 0)) {
                piece.x--;
            } else if (currentDirection === 'right' && !checkCollision(playerState.board, piece, 1, 0)) {
                piece.x++;
            }
        }
        
        playerState.moveCounter++;
    } else {
        // No movement keys pressed, reset
        playerState.moveCounter = 0;
        playerState.lastMoveDirection = null;
    }
    
    // Handle drop (instant fall) - only on key press transition
    if (input.drop && !playerState.dropPressed) {
        while (!checkCollision(playerState.board, piece, 0, 1)) {
            piece.y++;
        }
        playerState.dropPressed = true;
        // Piece has landed after hard drop
        mergePiece(playerState.board, piece);
        clearLines(playerState);
        spawnNewPiece(playerState);
        playerState.gravityCounter = 0;
        return;
    } else if (!input.drop) {
        playerState.dropPressed = false;
    }
    
    // Handle soft drop (faster fall)
    if (input.down) {
        if (!checkCollision(playerState.board, piece, 0, 1)) {
            piece.y++;
            playerState.score += 1; // Bonus for soft drop
            playerState.gravityCounter = 0; // Reset gravity timer
        } else {
            // Piece has landed
            mergePiece(playerState.board, piece);
            clearLines(playerState);
            spawnNewPiece(playerState);
            playerState.gravityCounter = 0;
        }
        return;
    }
    
    // Normal gravity
    playerState.gravityCounter++;
    if (playerState.gravityCounter >= GRAVITY_TICKS) {
        playerState.gravityCounter = 0;
        
        if (!checkCollision(playerState.board, piece, 0, 1)) {
            piece.y++;
        } else {
            // Piece has landed
            mergePiece(playerState.board, piece);
            clearLines(playerState);
            spawnNewPiece(playerState);
        }
    }
}

function step(): void {
    if (!state.started) return;
    
    // Update both players using their input from state (for local multiplayer)
    updatePlayer(state.player1, state.player1.input);
    updatePlayer(state.player2, state.player2.input);
}

function resetGame(): void {
    state.player1.board = createEmptyBoard();
    state.player1.score = 0;
    state.player1.linesCleared = 0;
    state.player1.gameOver = false;
    state.player1.currentPiece = null;
    state.player1.input = { left: false, right: false, down: false, rotate: false, drop: false };
    state.player1.gravityCounter = 0;
    state.player1.moveCounter = 0;
    state.player1.lastMoveDirection = null;
    state.player1.lastRotateState = false;
    state.player1.dropPressed = false;
    
    state.player2.board = createEmptyBoard();
    state.player2.score = 0;
    state.player2.linesCleared = 0;
    state.player2.gameOver = false;
    state.player2.currentPiece = null;
    state.player2.input = { left: false, right: false, down: false, rotate: false, drop: false };
    state.player2.gravityCounter = 0;
    state.player2.moveCounter = 0;
    state.player2.lastMoveDirection = null;
    state.player2.lastRotateState = false;
    state.player2.dropPressed = false;
    
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
        socket.on('set_aliases', (data: { alias1: string; alias2: string }) => {
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
        socket.on('disconnect', () => {
            fastify.log.info(`Tetris player disconnected: ${socket.id}`);
            players.delete(socket.id);
            
            // If a player disconnects, stop the game
            if (state.started) {
                resetGame();
                tetrisNamespace.emit('game_ended', { reason: 'player_disconnected' });
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
            
            tetrisNamespace.emit('game_state', snapshot);
            
            // Check if game should end
            if (state.started && (state.player1.gameOver || state.player2.gameOver)) {
                const winner = state.player1.gameOver ? state.player2.alias : state.player1.alias;
                tetrisNamespace.emit('game_ended', { reason: 'game_over', winner });
                resetGame();
            }
        }, 1000 / TICK_HZ);
    }
    
    fastify.log.info('Tetris game server initialized');
}
