// Tetris AI Game Server Logic
import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import {
    BOARD_WIDTH,
    BOARD_HEIGHT,
    TICK_HZ,
    GRAVITY_TICKS,
    MOVE_DELAY_INITIAL,
    MOVE_DELAY_REPEAT,
    PlayerState,
    Piece,
    ShapeType,
    createPlayerState,
    resetPlayerState,
    spawnNewPiece,
    createPiece,
    rotatePiece,
    checkCollision,
    mergePiece,
    clearLines,
    createPlayerSnapshot,
    updatePlayer as updatePlayerShared
} from './tetrisShared.js';
import { saveGameRecord, isSocketAuthenticated, GameRecord } from './utils/gameStats.js';
import { validateGameAlias } from './utils/validation.js';
import { verifyToken } from './utils/jwt.js';

// AI constants - simulate human reaction times and delays
const AI_THINK_DELAY = 15; // Delay before AI starts moving a new piece (~0.25 seconds)
const AI_MOVE_DELAY = 6; // Delay between moves (~0.1 seconds)
const AI_ROTATION_DELAY = 10; // Delay between rotations (~0.17 seconds)

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

// AI-specific helper functions
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

const state: GameState = {
    player: createPlayerState(),
    ai: {
        ...createPlayerState(),
        alias: 'AI',
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
let currentGameRecord: Partial<GameRecord> | null = null;

// Helper to reset AI-specific state
function resetAIState(aiState: AIState): void {
    resetPlayerState(aiState);
    aiState.alias = 'AI';
    aiState.thinkCounter = 0;
    aiState.targetX = null;
    aiState.targetRotation = 0;
    aiState.currentRotation = 0;
    aiState.moveDelay = 0;
    aiState.rotateDelay = 0;
    aiState.hasDecided = false;
}

function resetGame(): void {
    resetPlayerState(state.player);
    resetAIState(state.ai);
    state.started = false;
}

function step(): void {
    if (!state.started) return;
    
    updatePlayerShared(state.player);
    updateAI(state.ai);
}

export function setupTetrisAI(fastify: FastifyInstance, io: Server): void {
    const tetrisAINamespace = io.of('/tetris-ai');
    
    // Optional JWT Authentication middleware - allows both authenticated and non-authenticated users
    tetrisAINamespace.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.cookie
                ?.split(';')
                .find((row: string) => row.trim().startsWith('accessToken='))
                ?.split('=')[1];
            
            if (token) {
                const decoded = verifyToken(token);
                if (decoded?.userId && decoded?.username) {
                    (socket as any).userId = decoded.userId;
                    (socket as any).username = decoded.username;
                }
            }
            next();
        } catch (error) {
            next();
        }
    });
    
    tetrisAINamespace.on('connection', async (socket: Socket) => {
        fastify.log.info(`Tetris AI player connected: ${socket.id}`);
        
        const isAuthenticated = isSocketAuthenticated(socket);
        const userId = isAuthenticated ? (socket as any).userId : null;
        
        // Get display name if authenticated
        let displayName: string | null = null;
        if (userId) {
            displayName = await new Promise<string>((resolve) => {
                fastify.sqlite.get('SELECT display_name FROM users WHERE id = ?', [userId], (err: Error | null, row: any) => {
                    if (err || !row) resolve('Player');
                    else resolve(row.display_name);
                });
            });
        }
        
        socket.emit('role', { side: 'player' });
        socket.emit('auth_status', { isAuthenticated, displayName });
        
        socket.on('set_alias', async (data: { alias?: string }) => {
            let playerName: string;
            let playerIsUser = false;
            
            if (isAuthenticated && userId && displayName) {
                playerName = displayName;
                playerIsUser = true;
            } else {
                if (!data.alias) {
                    socket.emit('validation_error', { code: 'missing_alias', field: 'alias', message: 'Alias required' });
                    return;
                }
                const validation = validateGameAlias(data.alias);
                if (!validation.valid) {
                    socket.emit('validation_error', { code: 'invalid_alias', field: 'alias', message: validation.error });
                    return;
                }
                playerName = validation.value;
            }
            
            state.player.alias = playerName;
            
            if (!state.started) {
                state.started = true;
                spawnNewPiece(state.player);
                spawnNewPiece(state.ai);
                
                currentGameRecord = {
                    game_name: 'Tetris AI',
                    started_at: new Date().toISOString(),
                    player1_name: playerName,
                    player1_is_user: playerIsUser,
                    player2_name: state.ai.alias,
                    player2_is_user: false
                };
                
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
        
        socket.on('disconnect', async () => {
            fastify.log.info(`Tetris AI player disconnected: ${socket.id}`);
            
            if (state.started && currentGameRecord) {
                // Save game record on disconnect
                currentGameRecord.finished_at = new Date().toISOString();
                currentGameRecord.winner = undefined; // No winner on disconnect
                currentGameRecord.data = JSON.stringify({
                    reason: 'player_disconnected',
                    player: {
                        alias: state.player.alias,
                        score: state.player.score,
                        linesCleared: state.player.linesCleared
                    },
                    ai: {
                        alias: state.ai.alias,
                        score: state.ai.score,
                        linesCleared: state.ai.linesCleared
                    }
                });
                
                await saveGameRecord(fastify, currentGameRecord as GameRecord);
                currentGameRecord = null;
                
                resetGame();
                tetrisAINamespace.emit('game_ended', { reason: 'player_disconnected' });
            }
        });
    });
    
    if (!gameInterval) {
        gameInterval = setInterval(async () => {
            step();
            
            const snapshot = {
                player: createPlayerSnapshot(state.player),
                ai: createPlayerSnapshot(state.ai),
                started: state.started
            };
            
            tetrisAINamespace.emit('game_state', snapshot);
            
            if (state.started && (state.player.gameOver || state.ai.gameOver) && currentGameRecord) {
                const winner = state.player.gameOver ? state.ai.alias : state.player.alias;
                
                // Capture the record and clear it immediately to prevent duplicate saves
                const recordToSave = currentGameRecord;
                currentGameRecord = null;
                
                recordToSave.finished_at = new Date().toISOString();
                recordToSave.winner = winner;
                recordToSave.data = JSON.stringify({
                    reason: 'game_over',
                    winner: winner,
                    player: {
                        alias: state.player.alias,
                        score: state.player.score,
                        linesCleared: state.player.linesCleared,
                        gameOver: state.player.gameOver
                    },
                    ai: {
                        alias: state.ai.alias,
                        score: state.ai.score,
                        linesCleared: state.ai.linesCleared,
                        gameOver: state.ai.gameOver
                    }
                });
                
                await saveGameRecord(fastify, recordToSave as GameRecord);
                
                tetrisAINamespace.emit('game_ended', { reason: 'game_over', winner });
                resetGame();
            }
        }, 1000 / TICK_HZ);
    }
    
    fastify.log.info('Tetris AI game server initialized');
}
