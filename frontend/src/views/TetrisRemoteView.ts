import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

/**
 * @class TetrisRemoteView
 * Tetris game view for two remote authenticated players.
 * Can only be accessed through Router after game invite acceptance.
 */
export default class TetrisRemoteView extends AbstractView {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private socket: any = null;
    private gameState: GameSnapshot | null = null;
    private mySide: 'player1' | 'player2' | null = null;
    private animationFrameId: number | null = null;
    
    // Key state tracking (single player controls based on assigned side)
    private keys = { left: false, right: false, down: false, rotate: false, drop: false };

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
        
        // Verify access is legitimate (must be logged in with active socket)
        const hasSocket = !!(window as any).userSocket;
        if (!hasSocket) {
            // Redirect to home if accessed without proper authentication
            setTimeout(() => router.navigate('/'), 0);
        }
    }

    async getHtml(): Promise<string> {
        return `
            <main class="min-h-screen flex flex-col items-center bg-gray-800 py-8 overflow-x-hidden">
                <div class="w-full max-w-[1200px] mx-auto px-5 flex flex-col items-center">
                    <h1 class="text-4xl font-bold text-white mb-8 text-center tracking-wider">
                        REMOTE TETRIS BATTLE
                    </h1>
                    
                    <!-- Waiting for opponent message -->
                    <div id="waiting-section" class="mb-6 p-6 bg-gray-700 rounded-lg shadow-lg">
                        <p class="text-xl text-white text-center">Waiting for opponent to connect...</p>
                    </div>

                    <!-- Game Canvas Container -->
                    <div class="w-full flex gap-6 mb-6 justify-center flex-wrap">
                        <!-- Player 1 Board -->
                        <div class="flex flex-col items-center">
                            <div class="bg-gray-700 px-6 py-3 rounded-t-lg border-2 border-b-0 border-gray-600">
                                <h3 id="player1-name" class="text-xl font-bold text-white">Player 1</h3>
                                <div class="text-gray-300 text-sm mt-1">
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
                            <div class="bg-gray-700 px-6 py-3 rounded-t-lg border-2 border-b-0 border-gray-600">
                                <h3 id="player2-name" class="text-xl font-bold text-white">Player 2</h3>
                                <div class="text-gray-300 text-sm mt-1">
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

                    <!-- Game Over Message -->
                    <div id="game-over" class="hidden mb-6 p-6 bg-red-600 rounded-lg shadow-lg border-2 border-red-700">
                        <h2 class="text-3xl font-bold text-white text-center mb-2">GAME OVER!</h2>
                        <p id="winner-text" class="text-xl text-white text-center font-semibold"></p>
                    </div>

                    <!-- Controls Info -->
                    <div class="bg-gray-700 p-5 rounded-lg shadow-lg border border-gray-600 max-w-md">
                        <h3 class="text-lg font-bold text-white mb-3 text-center">Your Controls</h3>
                        <div class="text-gray-300 text-sm space-y-1">
                            <p><span class="font-bold text-white">← / →</span> - Move Left/Right</p>
                            <p><span class="font-bold text-white">↓</span> - Soft Drop</p>
                            <p><span class="font-bold text-white">↑</span> - Rotate</p>
                            <p><span class="font-bold text-white">Space</span> - Hard Drop</p>
                        </div>
                    </div>

                    <!-- Back Button -->
                    <div class="mt-6">
                        <button id="back-button" 
                                class="px-6 py-3 bg-gray-600 hover:bg-gray-700 
                                       text-white rounded-lg shadow-lg transition-colors font-semibold">
                            ← Back to Home
                        </button>
                    </div>
                </div>
            </main>
        `;
    }

    setDocumentTitle(): void {
        document.title = APP_NAME.concat(' - Remote Tetris Battle');
    }

    setup(): void {
        this.setupSocket();
        this.setupButtons();
        this.setupKeyboardControls();
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    private setupSocket(): void {
        this.socket = (window as any).io(window.location.origin + '/tetris-remote', {
            path: '/api/socket.io/',
            auth: {
                token: document.cookie.split(';')
                    .find(c => c.trim().startsWith('accessToken='))?.split('=')[1]
            }
        });

        this.socket.on('role_assigned', (data: { side: 'player1' | 'player2' | null }) => {
            this.mySide = data.side;
            if (!this.mySide) {
                alert('Game is full. Only 2 players can play at once.');
                this.router.navigate('/');
            }
        });

        this.socket.on('connection_error', (data: { message: string }) => {
            alert(data.message || 'Connection error occurred');
            this.router.navigate('/');
        });

        this.socket.on('game_started', (data: { player1Alias: string; player2Alias: string }) => {
            document.getElementById('waiting-section')?.classList.add('hidden');
            
            const p1El = document.getElementById('player1-name');
            const p2El = document.getElementById('player2-name');
            if (p1El) p1El.textContent = data.player1Alias;
            if (p2El) p2El.textContent = data.player2Alias;
        });

        this.socket.on('game_state', (snapshot: GameSnapshot) => {
            this.gameState = snapshot;
        });

        this.socket.on('game_ended', (data: { reason: string; winner?: string }) => {
            const gameOverDiv = document.getElementById('game-over');
            const winnerText = document.getElementById('winner-text');
            
            if (winnerText) {
                winnerText.textContent = data.reason === 'game_over' && data.winner 
                    ? `${data.winner} WINS!` 
                    : 'A player disconnected';
            }
            gameOverDiv?.classList.remove('hidden');
        });

        this.socket.on('connect_error', (err: Error) => {
            console.error('Connection error:', err.message);
            alert('Failed to connect to game server');
            this.router.navigate('/');
        });
    }

    private setupButtons(): void {
        document.getElementById('back-button')?.addEventListener('click', () => {
            this.router.navigate('/');
        });
    }

    private setupKeyboardControls(): void {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    cleanup(): void {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

        if (this.socket) {
            this.socket.off('role_assigned');
            this.socket.off('connection_error');
            this.socket.off('game_started');
            this.socket.off('game_state');
            this.socket.off('game_ended');
            this.socket.off('connect_error');
            this.socket.disconnect();
            this.socket = null;
        }

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
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
        if (!this.mySide) return;
        this.socket?.emit('input', { keys: this.keys });
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
