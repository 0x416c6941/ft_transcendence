import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';
import { gameStateManager } from '../gameStateManager.js';
import { isUIInputFocused } from '../utils/gameInputHelpers.js';

/**
 * @class TetrisRemoteView
 * Tetris game view for two remote authenticated players.
 * Can only be accessed through Router after game invite acceptance.
 */
export default class TetrisRemoteView extends AbstractView {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private socket = io;
    private gameState: GameSnapshot | null = null;
    private mySide: 'player1' | 'player2' | null = null;
    private animationFrameId: number | null = null;
    private roomId: string | null = null;
    
    // Key state tracking (single player controls based on assigned side)
    private keys = { left: false, right: false, down: false, rotate: false, drop: false };

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
        // Extract roomId from URL query parameter
        this.roomId = queryParams.get('invite') || queryParams.get('roomId');
        
        if (!this.roomId) {
            console.error('No roomId provided in URL');
        }
    }

    async getHtml(): Promise<string> {
        return `
            <main class="flex-1 min-h-0 flex flex-col bg-gray-800 p-4">
                <div class="flex justify-between items-center mb-4">
                    <h1 class="text-3xl font-bold text-white">Tetris - Remote Battle</h1>
                    <button id="leave-btn" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors">
                        Leave Game
                    </button>
                </div>

                <div class="flex-1 bg-gray-900 rounded-lg shadow-lg flex flex-col items-center justify-center relative p-4" id="game-container">
                    <div id="match-info" class="w-full text-center text-white mb-3 hidden">
                        <div class="bg-black bg-opacity-70 inline-block px-6 py-2 rounded-lg">
                            <span id="player1-name" class="font-bold text-blue-400 text-lg">Player 1</span>
                            <span class="text-gray-300 mx-2">vs</span>
                            <span id="player2-name" class="font-bold text-gray-100 text-lg">Player 2</span>
                        </div>
                    </div>
                    <div id="waiting-message" class="text-gray-500 text-xl text-center">
                        <p>Waiting for opponent to join...</p>
                    </div>
                    <div class="hidden" id="canvas-wrapper">
                        <div class="flex gap-6 justify-center">
                            <!-- Player 1 Board -->
                            <div class="flex flex-col items-center">
                                <div class="bg-gray-700 px-4 py-2 rounded-t-lg border-2 border-b-0 border-gray-600">
                                    <div class="text-gray-300 text-sm">
                                        <span class="font-semibold">Score:</span> <span id="player1-score" class="text-yellow-400 font-bold">0</span>
                                    </div>
                                    <div class="text-gray-300 text-sm">
                                        <span class="font-semibold">Lines:</span> <span id="player1-lines" class="text-green-400 font-bold">0</span>
                                    </div>
                                </div>
                                <canvas id="tetris-player1" width="300" height="600" 
                                        class="border-2 border-gray-600 bg-black shadow-lg rounded-b-lg"></canvas>
                            </div>

                            <!-- Player 2 Board -->
                            <div class="flex flex-col items-center">
                                <div class="bg-gray-700 px-4 py-2 rounded-t-lg border-2 border-b-0 border-gray-600">
                                    <div class="text-gray-300 text-sm">
                                        <span class="font-semibold">Score:</span> <span id="player2-score" class="text-yellow-400 font-bold">0</span>
                                    </div>
                                    <div class="text-gray-300 text-sm">
                                        <span class="font-semibold">Lines:</span> <span id="player2-lines" class="text-green-400 font-bold">0</span>
                                    </div>
                                </div>
                                <canvas id="tetris-player2" width="300" height="600" 
                                        class="border-2 border-gray-600 bg-black shadow-lg rounded-b-lg"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        `;
    }

    setDocumentTitle(): void {
        document.title = APP_NAME.concat(' - Remote Tetris Battle');
    }

    setup(): void {
        this.setupSocketListeners();
        this.setupButtons();
        this.setupKeyboardControls();
        this.animationFrameId = requestAnimationFrame(this.loop);
        
        // Join the game room
        if (this.roomId) {
            this.socket.emit('remote_tetris_join', { roomId: this.roomId });
        } else {
            alert('No room ID provided');
            this.router.navigate('/');
        }
    }

    private setupSocketListeners(): void {
        this.socket.on('remote_tetris_room_state', (data: { room: any }) => {
            if (data.room.player1 && data.room.player2 && data.room.status === 'waiting') {
                document.getElementById('waiting-message')?.classList.add('hidden');
            }
        });

        this.socket.on('remote_tetris_error', (data: { message: string }) => {
            alert(data.message || 'Failed to join game');
            this.router.navigate('/');
        });

        this.socket.on('remote_tetris_match_announced', (data: { player1: string; player2: string; countdown: number }) => {
            ['match-info', 'canvas-wrapper', 'waiting-message'].forEach(id => 
                document.getElementById(id)?.classList.add('hidden')
            );
            this.showCountdownOverlay(`${data.player1} vs ${data.player2}`, data.countdown || 3);
        });

        this.socket.on('remote_tetris_match_started', (data: { player1Alias: string; player2Alias: string }) => {
            this.removeOverlay();
            this.startGame(data.player1Alias, data.player2Alias);
        });

        this.socket.on('remote_tetris_game_state', (snapshot: GameSnapshot) => {
            this.gameState = snapshot;
        });

        this.socket.on('remote_tetris_match_ended', (data: { winner?: string }) => {
            this.showMatchResult(data.winner || 'Nobody');
        });

        this.socket.on('connect_error', (err: Error) => {
            alert('Failed to connect: ' + err.message);
            this.router.navigate('/');
        });
    }

    private startGame(player1Name: string, player2Name: string): void {
        document.getElementById('player1-name')!.textContent = player1Name;
        document.getElementById('player2-name')!.textContent = player2Name;
        document.getElementById('match-info')?.classList.remove('hidden');
        document.getElementById('canvas-wrapper')?.classList.remove('hidden');
        document.getElementById('waiting-message')?.classList.add('hidden');
        gameStateManager.setInGame('tetris-remote');
        this.removeOverlay();
    }

    private showCountdownOverlay(matchText: string, countdown: number): void {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        let overlay = document.getElementById('countdown-overlay') as HTMLDivElement;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'countdown-overlay';
            overlay.className = 'absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-10 rounded-lg';
            gameContainer.appendChild(overlay);
        }

        overlay.innerHTML = `<div class="text-white text-center">
            <div class="text-3xl font-bold mb-4">${matchText}</div>
            <div class="text-7xl font-bold" id="countdown-number">${countdown}</div>
        </div>`;

        let currentCount = countdown;
        const countdownInterval = setInterval(() => {
            const countdownNumber = document.getElementById('countdown-number');
            if (!countdownNumber) return clearInterval(countdownInterval);
            
            if (--currentCount > 0) {
                countdownNumber.textContent = currentCount.toString();
            } else {
                countdownNumber.textContent = 'GO!';
                clearInterval(countdownInterval);
            }
        }, 1000);
    }

    private removeOverlay(): void {
        const overlay = document.getElementById('countdown-overlay');
        if (overlay) overlay.remove();
    }

    private showMatchResult(winner: string): void {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-20 rounded-lg';
        overlay.innerHTML = `<div class="text-white text-center">
            <div class="text-6xl font-bold mb-4">🏆</div>
            <div class="text-3xl font-bold mb-2">${winner} Wins!</div>
            <div class="text-lg text-gray-300 mt-4">Returning to home in 5 seconds...</div>
        </div>`;
        gameContainer.appendChild(overlay);

        setTimeout(() => this.router.navigate('/'), 5000);
    }

    private setupButtons(): void {
        document.getElementById('leave-btn')?.addEventListener('click', () => this.router.navigate('/'));
    }

    private setupKeyboardControls(): void {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    cleanup(): void {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

        ['remote_tetris_room_state', 'remote_tetris_error', 'remote_tetris_match_announced',
         'remote_tetris_match_started', 'remote_tetris_game_state', 'remote_tetris_match_ended', 
         'connect_error'].forEach(event => this.socket.off(event));

        if (this.roomId) this.socket.emit('remote_tetris_leave', { roomId: this.roomId });
        if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
        
        // Clear game state
        gameStateManager.setOutOfGame();
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (isUIInputFocused()) return;
        const key = e.key.toLowerCase();
        const keyMap: Record<string, keyof typeof this.keys> = {
            'arrowleft': 'left', 'arrowright': 'right', 'arrowdown': 'down',
            'arrowup': 'rotate', ' ': 'drop'
        };
        
        if (keyMap[key] && !this.keys[keyMap[key]]) {
            this.keys[keyMap[key]] = true;
            this.sendInput();
            if (key.startsWith('arrow') || key === ' ') e.preventDefault();
        }
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (isUIInputFocused()) return;
        const key = e.key.toLowerCase();
        const keyMap: Record<string, keyof typeof this.keys> = {
            'arrowleft': 'left', 'arrowright': 'right', 'arrowdown': 'down',
            'arrowup': 'rotate', ' ': 'drop'
        };
        
        if (keyMap[key]) {
            this.keys[keyMap[key]] = false;
            this.sendInput();
            if (key.startsWith('arrow') || key === ' ') e.preventDefault();
        }
    };

    private sendInput(): void {
        if (!this.roomId) return;
        this.socket?.emit('remote_tetris_input', { roomId: this.roomId, keys: this.keys });
    }

    private loop = (): void => {
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.loop);
    };

    private draw(): void {
        if (!this.gameState) return;

        this.drawPlayerBoard('player1', this.gameState.player1);
        this.drawPlayerBoard('player2', this.gameState.player2);

        // Update scores
        ['player1', 'player2'].forEach(player => {
            const state = this.gameState![player as 'player1' | 'player2'];
            const scoreEl = document.getElementById(`${player}-score`);
            const linesEl = document.getElementById(`${player}-lines`);
            if (scoreEl) scoreEl.textContent = state.score.toString();
            if (linesEl) linesEl.textContent = state.linesCleared.toString();
        });
    }

    private drawPlayerBoard(player: 'player1' | 'player2', state: PlayerSnapshot): void {
        const canvas = document.getElementById(`tetris-${player}`) as HTMLCanvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cellSize = 30;
        const [boardWidth, boardHeight] = [10, 20];

        // Clear and draw grid
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1;
        for (let i = 0; i <= boardHeight; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * cellSize);
            ctx.lineTo(boardWidth * cellSize, i * cellSize);
            ctx.stroke();
        }
        for (let i = 0; i <= boardWidth; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cellSize, 0);
            ctx.lineTo(i * cellSize, boardHeight * cellSize);
            ctx.stroke();
        }

        // Helper to draw a cell with shine
        const drawCell = (x: number, y: number, color: string) => {
            ctx.fillStyle = color;
            ctx.fillRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, cellSize - 4);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, 8);
        };

        // Draw placed blocks
        const blockColor = player === 'player1' ? '#ec4899' : '#06b6d4';
        state.board.forEach((row, y) => {
            row.forEach((cell, x) => {
                if (cell) drawCell(x, y, blockColor);
            });
        });

        // Draw current piece
        if (state.currentPiece) {
            const { shape, x: px, y: py, color } = state.currentPiece;
            shape.forEach((row, y) => {
                row.forEach((cell, x) => {
                    if (cell) drawCell(px + x, py + y, color);
                });
            });
        }

        // Draw game over overlay
        if (state.gameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
        }
    }
}

// Type definitions
type GameSnapshot = {
    player1: PlayerSnapshot;
    player2: PlayerSnapshot;
    started: boolean;
};

type PlayerSnapshot = {
    board: number[][];
    currentPiece: {
        shape: number[][];
        type: string;
        x: number;
        y: number;
        color: string;
    } | null;
    score: number;
    linesCleared: number;
    gameOver: boolean;
    alias: string;
};
