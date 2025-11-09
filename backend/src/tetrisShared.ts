// Shared Tetris Game Logic
// This module contains all the common game mechanics, constants, and helper functions
// used by tetrisGame.ts (local multiplayer), tetrisAI.ts (vs AI), and tetrisRemote.ts (remote multiplayer)

// Game constants
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const TICK_HZ = 60;
export const GRAVITY_TICKS = 30; // Initial gravity (pieces fall every 30 ticks = 0.5s)
export const MOVE_DELAY_INITIAL = 12;
export const MOVE_DELAY_REPEAT = 3;
export const GRAVITY_SPEED_MULTIPLIER = 0.9; // Speeds up by ~11% per line clear (like Pong's 1.1x)
export const MIN_GRAVITY_TICKS = 3; // Minimum speed cap (0.05s between falls)

// Tetromino shapes (standard Tetris pieces)
export const SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]]
};

export const SHAPE_KEYS = Object.keys(SHAPES) as Array<keyof typeof SHAPES>;

// Colors for each shape
export const COLORS = {
    I: '#00f0f0',
    O: '#f0f000',
    T: '#a000f0',
    S: '#00f000',
    Z: '#f00000',
    J: '#0000f0',
    L: '#f0a000'
};

// Type exports
export type ShapeType = keyof typeof SHAPES;
export type PlayerSide = 'player1' | 'player2';

export interface Piece {
    shape: number[][];
    type: ShapeType;
    x: number;
    y: number;
}

export interface PlayerState {
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

// Helper functions
export function createEmptyBoard(): number[][] {
    return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(0));
}

export function randomShape(): ShapeType {
    return SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)];
}

export function createPiece(type: ShapeType): Piece {
    return {
        shape: SHAPES[type].map(row => [...row]),
        type,
        x: Math.floor(BOARD_WIDTH / 2) - 1,
        y: 0
    };
}

export function rotatePiece(piece: Piece): Piece {
    const rotated = piece.shape[0].map((_, i) =>
        piece.shape.map(row => row[i]).reverse()
    );
    return { ...piece, shape: rotated };
}

export function checkCollision(board: number[][], piece: Piece, offsetX = 0, offsetY = 0): boolean {
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

export function mergePiece(board: number[][], piece: Piece): void {
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

export function clearLines(playerState: PlayerState, currentGravityTicks: number): { linesCleared: number, newGravityTicks: number } {
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
    
    // Apply speed increase when lines are cleared (just like Pong ball speed-up)
    let newGravityTicks = currentGravityTicks;
    if (linesCleared > 0) {
        newGravityTicks = Math.max(MIN_GRAVITY_TICKS, currentGravityTicks * GRAVITY_SPEED_MULTIPLIER);
    }
    
    return { linesCleared, newGravityTicks };
}

export function spawnNewPiece(playerState: PlayerState): void {
    const type = randomShape();
    playerState.currentPiece = createPiece(type);
    
    if (checkCollision(playerState.board, playerState.currentPiece)) {
        playerState.gameOver = true;
    }
}

// Core player update logic - used by all game modes
// Returns new gravity ticks if speed changed due to line clears
export function updatePlayer(playerState: PlayerState, currentGravityTicks: number): number {
    if (playerState.gameOver || !playerState.currentPiece) return currentGravityTicks;
    
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
        const result = clearLines(playerState, currentGravityTicks);
        spawnNewPiece(playerState);
        playerState.input.drop = false;
        playerState.dropPressed = false;
        return result.newGravityTicks;
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
    
    // Handle gravity (down movement) - use dynamic gravity speed
    const gravitySpeed = input.down ? 3 : currentGravityTicks;
    playerState.gravityCounter++;
    
    if (playerState.gravityCounter >= gravitySpeed) {
        playerState.gravityCounter = 0;
        
        if (!checkCollision(playerState.board, piece, 0, 1)) {
            piece.y++;
        } else {
            mergePiece(playerState.board, piece);
            const result = clearLines(playerState, currentGravityTicks);
            spawnNewPiece(playerState);
            return result.newGravityTicks;
        }
    }
    
    return currentGravityTicks;
}

// Helper to create a fresh PlayerState object
export function createPlayerState(): PlayerState {
    return {
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
    };
}

// Helper to reset a player state to initial values
export function resetPlayerState(playerState: PlayerState): void {
    playerState.board = createEmptyBoard();
    playerState.currentPiece = null;
    playerState.score = 0;
    playerState.linesCleared = 0;
    playerState.gameOver = false;
    playerState.alias = '';
    playerState.input = { left: false, right: false, down: false, rotate: false, drop: false };
    playerState.gravityCounter = 0;
    playerState.moveCounter = 0;
    playerState.lastMoveDirection = null;
    playerState.lastRotateState = false;
    playerState.dropPressed = false;
}

// Helper to create a snapshot for a player (for sending to clients)
export function createPlayerSnapshot(playerState: PlayerState) {
    return {
        board: playerState.board,
        currentPiece: playerState.currentPiece ? {
            shape: playerState.currentPiece.shape,
            type: playerState.currentPiece.type,
            x: playerState.currentPiece.x,
            y: playerState.currentPiece.y,
            color: COLORS[playerState.currentPiece.type]
        } : null,
        score: playerState.score,
        linesCleared: playerState.linesCleared,
        gameOver: playerState.gameOver,
        alias: playerState.alias
    };
}
