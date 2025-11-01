import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

/**
 * @class TetrisView
 * Tetris game view for two players on the same keyboard.
 */
export default class TetrisView extends AbstractView {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private socket: any = null;
    private gameState: GameSnapshot | null = null;
    private mySide: 'player1' | 'player2' | null = null;
    private animationFrameId: number | null = null;
    
    // Key state tracking
    private keys = {
        // Player 1: WASD + Q for rotate, E for drop
        player1: { left: false, right: false, down: false, rotate: false, drop: false },
        // Player 2: Arrow keys + O for rotate, P for drop
        player2: { left: false, right: false, down: false, rotate: false, drop: false }
    };

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
            <main class="min-h-screen flex flex-col items-center bg-gray-800 py-8 overflow-x-hidden">
                <div class="w-full max-w-[1200px] mx-auto px-5 flex flex-col items-center">
                    <h1 class="text-4xl font-bold text-white mb-8 text-center tracking-wider">
                        TETRIS BATTLE
                    </h1>
                    
                    <!-- Alias Setup Button (shown before game starts) -->
                    <div id="start-section" class="mb-6">
                        <button id="alias-game-btn" 
                                class="px-8 py-4 bg-blue-600 hover:bg-blue-700 
                                       text-white text-xl font-bold rounded-lg shadow-lg transition-colors">
                            START GAME
                        </button>
                    </div>

                    <!-- Alias Input Overlay -->
                    <div id="alias-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
                        <div class="bg-gray-700 p-8 rounded-xl shadow-2xl max-w-md w-full mx-4 border-2 border-gray-600">
                            <h2 class="text-2xl font-bold text-white mb-6 text-center">Enter Player Names</h2>
                            
                            <div class="space-y-4">
                                <div>
                                    <label for="player1-alias" class="block text-sm font-semibold text-gray-300 mb-2">
                                        Player 1 (WASD + Q to rotate, E to drop)
                                    </label>
                                    <input 
                                        id="player1-alias" 
                                        type="text" 
                                        placeholder="Enter name..." 
                                        maxlength="15"
                                        class="w-full px-4 py-3 rounded-lg bg-gray-800 text-white border-2 border-gray-600 
                                               focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400"
                                    />
                                </div>
                                
                                <div>
                                    <label for="player2-alias" class="block text-sm font-semibold text-gray-300 mb-2">
                                        Player 2 (Arrow Keys + O to rotate, P to drop)
                                    </label>
                                    <input 
                                        id="player2-alias" 
                                        type="text" 
                                        placeholder="Enter name..." 
                                        maxlength="15"
                                        class="w-full px-4 py-3 rounded-lg bg-gray-800 text-white border-2 border-gray-600 
                                               focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400"
                                    />
                                </div>
                                
                                <p id="alias-error" class="text-red-400 text-sm font-semibold hidden">
                                    Both names must contain at least one non-whitespace character
                                </p>
                                
                                <div class="flex gap-3 mt-6">
                                    <button 
                                        id="save-alias-btn" 
                                        class="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 
                                               text-white font-bold rounded-lg shadow-lg transition-colors">
                                        SAVE
                                    </button>
                                    <button 
                                        id="cancel-alias-btn" 
                                        class="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 
                                               text-white font-bold rounded-lg shadow-lg transition-colors">
                                        CANCEL
                                    </button>
                                </div>
                            </div>
                        </div>
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
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 w-full max-w-3xl">
                        <div class="bg-gray-700 p-5 rounded-lg shadow-lg border border-gray-600">
                            <h3 class="text-lg font-bold text-white mb-3">Player 1 Controls</h3>
                            <div class="text-gray-300 text-sm space-y-1">
                                <p><span class="font-bold text-white">A / D</span> - Move Left/Right</p>
                                <p><span class="font-bold text-white">S</span> - Soft Drop</p>
                                <p><span class="font-bold text-white">Q</span> - Rotate</p>
                                <p><span class="font-bold text-white">E</span> - Hard Drop</p>
                            </div>
                        </div>

                        <div class="bg-gray-700 p-5 rounded-lg shadow-lg border border-gray-600">
                            <h3 class="text-lg font-bold text-white mb-3">Player 2 Controls</h3>
                            <div class="text-gray-300 text-sm space-y-1">
                                <p><span class="font-bold text-white">← / →</span> - Move Left/Right</p>
                                <p><span class="font-bold text-white">↓</span> - Soft Drop</p>
                                <p><span class="font-bold text-white">O</span> - Rotate</p>
                                <p><span class="font-bold text-white">P</span> - Hard Drop</p>
                            </div>
                        </div>
                    </div>

                    <!-- Back Button -->
                    <div class="mt-4">
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
        document.title = APP_NAME.concat(' - Tetris Battle');
    }

    setup(): void {
        this.setupSocket();
        this.setupButtons();
        this.setupKeyboardControls();
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    private setupSocket(): void {
        this.socket = (window as any).io(window.location.origin + '/tetris', {
            path: '/api/socket.io/',
            withCredentials: true
        });

        this.socket.on('role', (data: { side: 'player1' | 'player2' | null }) => {
            this.mySide = data.side;
            if (!this.mySide) {
                alert('Game is full. Only 2 players can play at once.');
            }
        });

        this.socket.on('game_started', (data: { player1Alias: string; player2Alias: string }) => {
            ['player1', 'player2'].forEach(player => {
                const el = document.getElementById(`${player}-name`);
                if (el) el.textContent = data[`${player}Alias` as keyof typeof data];
            });
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
            document.getElementById('start-section')?.classList.remove('hidden');
        });
    }

    private setupButtons(): void {
        const overlay = document.getElementById('alias-overlay');
        
        document.getElementById('alias-game-btn')?.addEventListener('click', () => {
            overlay?.classList.remove('hidden');
            (document.getElementById('player1-alias') as HTMLInputElement)?.focus();
        });

        document.getElementById('cancel-alias-btn')?.addEventListener('click', () => {
            overlay?.classList.add('hidden');
        });

        document.getElementById('save-alias-btn')?.addEventListener('click', () => {
            const alias1 = (document.getElementById('player1-alias') as HTMLInputElement)?.value.trim() || '';
            const alias2 = (document.getElementById('player2-alias') as HTMLInputElement)?.value.trim() || '';
            const errorMsg = document.getElementById('alias-error');

            if (!alias1 || !alias2) {
                errorMsg?.classList.remove('hidden');
                return;
            }

            errorMsg?.classList.add('hidden');
            overlay?.classList.add('hidden');
            document.getElementById('start-section')?.classList.add('hidden');
            this.socket?.emit('set_aliases', { alias1, alias2 });
        });

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
            this.socket.off('role');
            this.socket.off('game_started');
            this.socket.off('game_state');
            this.socket.off('game_ended');
            this.socket.disconnect();
            this.socket = null;
        }

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        const key = e.key.toLowerCase();
        
        // Player 1 controls (WASD + Q/E)
        const p1Keys: Record<string, keyof typeof this.keys.player1> = {
            'a': 'left', 'd': 'right', 's': 'down', 'q': 'rotate', 'e': 'drop'
        };
        
        // Player 2 controls (Arrows + O/P)
        const p2Keys: Record<string, keyof typeof this.keys.player2> = {
            'arrowleft': 'left', 'arrowright': 'right', 'arrowdown': 'down', 'o': 'rotate', 'p': 'drop'
        };
        
        if (p1Keys[key] && !this.keys.player1[p1Keys[key]]) {
            this.keys.player1[p1Keys[key]] = true;
            this.sendInput('player1');
        } else if (p2Keys[key] && !this.keys.player2[p2Keys[key]]) {
            this.keys.player2[p2Keys[key]] = true;
            this.sendInput('player2');
            if (key.startsWith('arrow')) e.preventDefault();
        }
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        const key = e.key.toLowerCase();
        
        const p1Keys: Record<string, keyof typeof this.keys.player1> = {
            'a': 'left', 'd': 'right', 's': 'down', 'q': 'rotate', 'e': 'drop'
        };
        
        const p2Keys: Record<string, keyof typeof this.keys.player2> = {
            'arrowleft': 'left', 'arrowright': 'right', 'arrowdown': 'down', 'o': 'rotate', 'p': 'drop'
        };
        
        if (p1Keys[key]) {
            this.keys.player1[p1Keys[key]] = false;
            this.sendInput('player1');
        } else if (p2Keys[key]) {
            this.keys.player2[p2Keys[key]] = false;
            this.sendInput('player2');
            if (key.startsWith('arrow')) e.preventDefault();
        }
    };

    private sendInput(player: 'player1' | 'player2'): void {
        this.socket?.emit('input', { player, keys: this.keys[player] });
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
