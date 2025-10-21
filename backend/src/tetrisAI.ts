// Tetris AI Game Server Logic
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';

// Game constants
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const TICK_HZ = 60;
const GRAVITY_TICKS = 30;
const MOVE_DELAY_INITIAL = 12;
const MOVE_DELAY_REPEAT = 3;

// AI constants - simulate human reaction times and delays
const AI_THINK_DELAY = 15; // Delay before AI starts moving a new piece (~0.25 seconds)
const AI_MOVE_DELAY = 6; // Delay between moves (~0.1 seconds)
const AI_ROTATION_DELAY = 10; // Delay between rotations (~0.17 seconds)

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

interface AIState extends PlayerState {
    thinkCounter: number;
    targetX: number | null;
    targetRotation: number;
    currentRotation: number;
    moveDelay: number; // Ticks since last move
    rotateDelay: number; // Ticks since last rotation
    hasDecided: boolean; // Whether AI has made a decision for current piece
}

interface GameState {
    player: PlayerState;
    ai: AIState;
    started: boolean;
}

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

// Helper to get column heights
function getColumnHeights(board: number[][]): number[] {
    const heights: number[] = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
        let height = 0;
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            if (board[y][x]) {
                height = BOARD_HEIGHT - y;
                break;
            }
        }
        heights.push(height);
    }
    return heights;
}

// AI logic - simple column evaluation
function evaluatePosition(board: number[][], piece: Piece, rotation: number, targetX: number): number {
    // Create and position test piece
    let testPiece = { ...piece };
    for (let i = 0; i < rotation; i++) {
        testPiece = rotatePiece(testPiece);
    }
    testPiece.x = targetX;
    
    // Drop to bottom
    while (!checkCollision(board, testPiece, 0, 1)) {
        testPiece.y++;
    }
    
    if (checkCollision(board, testPiece)) return -10000;
    
    // Create test board
    const testBoard = board.map(row => [...row]);
    mergePiece(testBoard, testPiece);
    
    let score = 0;
    
    // Count holes and calculate heights in one pass
    const heights = getColumnHeights(testBoard);
    let holes = 0;
    
    for (let x = 0; x < BOARD_WIDTH; x++) {
        let foundBlock = false;
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            if (testBoard[y][x]) {
                foundBlock = true;
            } else if (foundBlock) {
                holes++;
            }
        }
    }
    
    // Calculate metrics
    const totalHeight = heights.reduce((sum, h) => sum + h, 0);
    const bumpiness = heights.slice(0, -1).reduce((sum, h, i) => sum + Math.abs(h - heights[i + 1]), 0);
    const completeLines = testBoard.filter(row => row.every(cell => cell !== 0)).length;
    
    // Apply scoring
    score -= holes * 50;
    score -= totalHeight * 2;
    score -= bumpiness * 5;
    score += completeLines * 100;
    
    return score;
}

function calculateAIMove(aiState: AIState): void {
    if (!aiState.currentPiece) return;
    
    // Evaluate all possible positions
    const positions: Array<{ x: number; rotation: number; score: number }> = [];
    
    for (let rotation = 0; rotation < 4; rotation++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const score = evaluatePosition(aiState.board, aiState.currentPiece, rotation, x);
            if (score > -10000) positions.push({ x, rotation, score });
        }
    }
    
    if (positions.length === 0) {
        aiState.targetX = aiState.currentPiece.x;
        aiState.targetRotation = 0;
        return;
    }
    
    // Pick move based on skill level
    positions.sort((a, b) => b.score - a.score);
    const rand = Math.random();
    
    const chosenMove = rand < 0.85 ? positions[0] // 85% best move
        : rand < 0.97 ? positions.slice(0, Math.min(3, positions.length))[Math.floor(Math.random() * Math.min(3, positions.length))] // 12% top 3
        : positions[Math.floor(Math.random() * positions.length)]; // 3% random
    
    aiState.targetX = chosenMove.x;
    aiState.targetRotation = chosenMove.rotation;
}

// Helper to reset AI for new piece
function resetAIForNewPiece(aiState: AIState): void {
    aiState.targetX = null;
    aiState.hasDecided = false;
    aiState.thinkCounter = 0;
    aiState.input.down = false;
}

function updateAI(aiState: AIState): void {
    if (aiState.gameOver || !aiState.currentPiece) return;
    
    const piece = aiState.currentPiece;
    
    // Wait before making a decision (simulate thinking time)
    if (!aiState.hasDecided) {
        aiState.thinkCounter++;
        if (aiState.thinkCounter >= AI_THINK_DELAY) {
            calculateAIMove(aiState);
            aiState.currentRotation = 0;
            aiState.hasDecided = true;
            aiState.rotateDelay = 0;
            aiState.moveDelay = 0;
        }
    }
    
    // Execute the plan with realistic delays
    if (aiState.hasDecided && aiState.targetX !== null && aiState.targetRotation !== null) {
        // Rotate to target
        if (aiState.currentRotation < aiState.targetRotation) {
            aiState.rotateDelay++;
            if (aiState.rotateDelay >= AI_ROTATION_DELAY) {
                const rotated = rotatePiece(piece);
                if (!checkCollision(aiState.board, rotated)) {
                    aiState.currentPiece = rotated;
                    aiState.currentRotation++;
                    aiState.rotateDelay = 0;
                }
            }
        }
        // Move horizontally
        else if (piece.x !== aiState.targetX) {
            aiState.moveDelay++;
            if (aiState.moveDelay >= AI_MOVE_DELAY) {
                const dx = piece.x < aiState.targetX ? 1 : -1;
                if (!checkCollision(aiState.board, piece, dx, 0)) {
                    piece.x += dx;
                    aiState.moveDelay = 0;
                }
            }
        }
        // Decide on soft drop (15% chance)
        else if (piece.x === aiState.targetX && aiState.currentRotation === aiState.targetRotation) {
            if (aiState.thinkCounter === AI_THINK_DELAY) {
                aiState.input.down = Math.random() < 0.15;
            }
        }
    }
    
    // Handle soft drop
    if (aiState.input.down) {
        if (!checkCollision(aiState.board, piece, 0, 1)) {
            piece.y++;
            aiState.score += 1;
            aiState.gravityCounter = 0;
        } else {
            mergePiece(aiState.board, piece);
            clearLines(aiState);
            spawnNewPiece(aiState);
            resetAIForNewPiece(aiState);
        }
        return;
    }
    
    // Normal gravity
    aiState.gravityCounter++;
    if (aiState.gravityCounter >= GRAVITY_TICKS) {
        aiState.gravityCounter = 0;
        
        if (!checkCollision(aiState.board, piece, 0, 1)) {
            piece.y++;
        } else {
            mergePiece(aiState.board, piece);
            clearLines(aiState);
            spawnNewPiece(aiState);
            resetAIForNewPiece(aiState);
        }
    }
}

function updatePlayer(playerState: PlayerState, input: PlayerState['input']): void {
    if (playerState.gameOver || !playerState.currentPiece) return;
    
    const piece = playerState.currentPiece;
    
    // Handle rotation
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
        if (currentDirection !== playerState.lastMoveDirection) {
            playerState.moveCounter = 0;
            playerState.lastMoveDirection = currentDirection;
        }
        
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
        playerState.moveCounter = 0;
        playerState.lastMoveDirection = null;
    }
    
    // Handle drop
    if (input.drop && !playerState.dropPressed) {
        while (!checkCollision(playerState.board, piece, 0, 1)) {
            piece.y++;
        }
        playerState.dropPressed = true;
        mergePiece(playerState.board, piece);
        clearLines(playerState);
        spawnNewPiece(playerState);
        playerState.gravityCounter = 0;
        return;
    } else if (!input.drop) {
        playerState.dropPressed = false;
    }
    
    // Handle soft drop
    if (input.down) {
        if (!checkCollision(playerState.board, piece, 0, 1)) {
            piece.y++;
            playerState.score += 1;
            playerState.gravityCounter = 0;
        } else {
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
            mergePiece(playerState.board, piece);
            clearLines(playerState);
            spawnNewPiece(playerState);
        }
    }
}

const state: GameState = {
    player: {
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
    ai: {
        board: createEmptyBoard(),
        currentPiece: null,
        score: 0,
        linesCleared: 0,
        gameOver: false,
        alias: 'AI',
        input: { left: false, right: false, down: false, rotate: false, drop: false },
        gravityCounter: 0,
        moveCounter: 0,
        lastMoveDirection: null,
        lastRotateState: false,
        dropPressed: false,
        thinkCounter: 0,
        targetX: null,
        targetRotation: 0,
        currentRotation: 0,
        moveDelay: 0,
        rotateDelay: 0,
        hasDecided: false
    },
    started: false
};

let gameInterval: NodeJS.Timeout | null = null;

// Helper to reset player state
function resetPlayerState(playerState: PlayerState): void {
    playerState.board = createEmptyBoard();
    playerState.score = 0;
    playerState.linesCleared = 0;
    playerState.gameOver = false;
    playerState.currentPiece = null;
    playerState.input = { left: false, right: false, down: false, rotate: false, drop: false };
    playerState.gravityCounter = 0;
    playerState.moveCounter = 0;
    playerState.lastMoveDirection = null;
    playerState.lastRotateState = false;
    playerState.dropPressed = false;
}

function resetGame(): void {
    resetPlayerState(state.player);
    resetPlayerState(state.ai);
    
    // Reset AI-specific fields
    state.ai.thinkCounter = 0;
    state.ai.targetX = null;
    state.ai.targetRotation = 0;
    state.ai.currentRotation = 0;
    state.ai.moveDelay = 0;
    state.ai.rotateDelay = 0;
    state.ai.hasDecided = false;
    
    state.started = false;
}

function step(): void {
    if (!state.started) return;
    
    updatePlayer(state.player, state.player.input);
    updateAI(state.ai);
}

export function setupTetrisAI(fastify: FastifyInstance, io: Server): void {
    const tetrisAINamespace = io.of('/tetris-ai');
    
    tetrisAINamespace.on('connection', (socket: Socket) => {
        fastify.log.info(`Tetris AI player connected: ${socket.id}`);
        
        socket.emit('role', { side: 'player' });
        
        socket.on('set_alias', (data: { alias: string }) => {
            const alias = data.alias.trim();
            if (!alias) return;
            
            state.player.alias = alias;
            
            if (!state.started) {
                state.started = true;
                spawnNewPiece(state.player);
                spawnNewPiece(state.ai);
                
                tetrisAINamespace.emit('game_started', {
                    playerAlias: state.player.alias,
                    aiAlias: state.ai.alias
                });
            }
        });
        
        socket.on('input', (data: { keys: Partial<PlayerState['input']> }) => {
            if (data.keys.left !== undefined) state.player.input.left = data.keys.left;
            if (data.keys.right !== undefined) state.player.input.right = data.keys.right;
            if (data.keys.down !== undefined) state.player.input.down = data.keys.down;
            if (data.keys.rotate !== undefined) state.player.input.rotate = data.keys.rotate;
            if (data.keys.drop !== undefined) state.player.input.drop = data.keys.drop;
        });
        
        socket.on('disconnect', () => {
            fastify.log.info(`Tetris AI player disconnected: ${socket.id}`);
            
            if (state.started) {
                resetGame();
                tetrisAINamespace.emit('game_ended', { reason: 'player_disconnected' });
            }
        });
    });
    
    if (!gameInterval) {
        gameInterval = setInterval(() => {
            step();
            
            const snapshot = {
                player: {
                    board: state.player.board,
                    currentPiece: state.player.currentPiece ? {
                        shape: state.player.currentPiece.shape,
                        type: state.player.currentPiece.type,
                        x: state.player.currentPiece.x,
                        y: state.player.currentPiece.y,
                        color: COLORS[state.player.currentPiece.type]
                    } : null,
                    score: state.player.score,
                    linesCleared: state.player.linesCleared,
                    gameOver: state.player.gameOver,
                    alias: state.player.alias
                },
                ai: {
                    board: state.ai.board,
                    currentPiece: state.ai.currentPiece ? {
                        shape: state.ai.currentPiece.shape,
                        type: state.ai.currentPiece.type,
                        x: state.ai.currentPiece.x,
                        y: state.ai.currentPiece.y,
                        color: COLORS[state.ai.currentPiece.type]
                    } : null,
                    score: state.ai.score,
                    linesCleared: state.ai.linesCleared,
                    gameOver: state.ai.gameOver,
                    alias: state.ai.alias
                },
                started: state.started
            };
            
            tetrisAINamespace.emit('game_state', snapshot);
            
            if (state.started && (state.player.gameOver || state.ai.gameOver)) {
                const winner = state.player.gameOver ? state.ai.alias : state.player.alias;
                tetrisAINamespace.emit('game_ended', { reason: 'game_over', winner });
                resetGame();
            }
        }, 1000 / TICK_HZ);
    }
    
    fastify.log.info('Tetris AI game server initialized');
}
