import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

/**
 * @class TetrisAIView
 * Tetris game view - Player vs AI.
 */
export default class TetrisAIView extends AbstractView {
    private socket: any = null;
    private gameState: GameSnapshot | null = null;
    private animationFrameId: number | null = null;
    
    // Key state tracking
    private keys = {
        left: false,
        right: false,
        down: false,
        rotate: false,
        drop: false
    };

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
            <main class="min-h-screen flex flex-col items-center bg-gray-800 py-8 overflow-x-hidden">
                <div class="w-full max-w-[1200px] mx-auto px-5 flex flex-col items-center">
                    <h1 class="text-4xl font-bold text-white mb-8 text-center tracking-wider">
                        TETRIS vs AI
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
                            <h2 class="text-2xl font-bold text-white mb-6 text-center">Enter Your Name</h2>
                            
                            <div class="space-y-4">
                                <div>
                                    <label for="player-alias" class="block text-sm font-semibold text-gray-300 mb-2">
                                        Your Name
                                    </label>
                                    <input 
                                        id="player-alias" 
                                        type="text" 
                                        placeholder="Enter name..." 
                                        maxlength="15"
                                        class="w-full px-4 py-3 rounded-lg bg-gray-800 text-white border-2 border-gray-600 
                                               focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400"
                                    />
                                </div>
                                
                                <p id="alias-error" class="text-red-400 text-sm font-semibold hidden">
                                    Name must contain at least one non-whitespace character
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
                        <!-- Player Board -->
                        <div class="flex flex-col items-center">
                            <div class="bg-gray-700 px-6 py-3 rounded-t-lg border-2 border-b-0 border-gray-600">
                                <h3 id="player-name" class="text-xl font-bold text-white">You</h3>
                                <div class="text-gray-300 text-sm mt-1">
                                    <span class="font-semibold">Score:</span> <span id="player-score" class="text-yellow-400 font-bold">0</span>
                                </div>
                                <div class="text-gray-300 text-sm">
                                    <span class="font-semibold">Lines:</span> <span id="player-lines" class="text-green-400 font-bold">0</span>
                                </div>
                            </div>
                            <canvas id="tetris-player" width="300" height="600" 
                                    class="border-2 border-gray-600 bg-black shadow-lg rounded-b-lg"></canvas>
                        </div>

                        <!-- AI Board -->
                        <div class="flex flex-col items-center">
                            <div class="bg-gray-700 px-6 py-3 rounded-t-lg border-2 border-b-0 border-gray-600">
                                <h3 id="ai-name" class="text-xl font-bold text-white">AI</h3>
                                <div class="text-gray-300 text-sm mt-1">
                                    <span class="font-semibold">Score:</span> <span id="ai-score" class="text-yellow-400 font-bold">0</span>
                                </div>
                                <div class="text-gray-300 text-sm">
                                    <span class="font-semibold">Lines:</span> <span id="ai-lines" class="text-green-400 font-bold">0</span>
                                </div>
                            </div>
                            <canvas id="tetris-ai" width="300" height="600" 
                                    class="border-2 border-gray-600 bg-black shadow-lg rounded-b-lg"></canvas>
                        </div>
                    </div>

                    <!-- Game Over Message -->
                    <div id="game-over" class="hidden mb-6 p-6 bg-red-600 rounded-lg shadow-lg border-2 border-red-700">
                        <h2 class="text-3xl font-bold text-white text-center mb-2">GAME OVER!</h2>
                        <p id="winner-text" class="text-xl text-white text-center font-semibold"></p>
                    </div>

                    <!-- Controls Info -->
                    <div class="bg-gray-700 p-5 rounded-lg shadow-lg border border-gray-600 mb-6 max-w-md">
                        <h3 class="text-lg font-bold text-white mb-3 text-center">Your Controls</h3>
                        <div class="text-gray-300 text-sm space-y-1">
                            <p><span class="font-bold text-white">← / →</span> - Move Left/Right</p>
                            <p><span class="font-bold text-white">↓</span> - Soft Drop</p>
                            <p><span class="font-bold text-white">↑</span> - Rotate</p>
                            <p><span class="font-bold text-white">Space</span> - Hard Drop</p>
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
        document.title = APP_NAME.concat(' - Tetris vs AI');
    }

    setup(): void {
        this.setupSocket();
        this.setupButtons();
        this.setupKeyboardControls();
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    private setupSocket(): void {
        this.socket = (window as any).io(window.location.origin + '/tetris-ai', {
            path: '/api/socket.io/',
            withCredentials: true
        });

        this.socket.on('role', () => {
            // Single player, always playing
        });

        this.socket.on('game_started', (data: { playerAlias: string; aiAlias: string }) => {
            document.getElementById('player-name')!.textContent = data.playerAlias;
            document.getElementById('ai-name')!.textContent = data.aiAlias;
        });

        this.socket.on('game_state', (snapshot: GameSnapshot) => {
            this.gameState = snapshot;
        });

        this.socket.on('game_ended', (data: { reason: string; winner?: string }) => {
            const winnerText = document.getElementById('winner-text');
            if (winnerText) {
                winnerText.textContent = data.reason === 'game_over' && data.winner 
                    ? `${data.winner} WINS!` 
                    : 'Game disconnected';
            }
            document.getElementById('game-over')?.classList.remove('hidden');
            document.getElementById('start-section')?.classList.remove('hidden');
        });
    }

    private setupButtons(): void {
        const overlay = document.getElementById('alias-overlay');
        
        document.getElementById('alias-game-btn')?.addEventListener('click', () => {
            overlay?.classList.remove('hidden');
            (document.getElementById('player-alias') as HTMLInputElement)?.focus();
        });

        document.getElementById('cancel-alias-btn')?.addEventListener('click', () => {
            overlay?.classList.add('hidden');
        });

        document.getElementById('save-alias-btn')?.addEventListener('click', () => {
            const alias = (document.getElementById('player-alias') as HTMLInputElement)?.value.trim() || '';
            const errorMsg = document.getElementById('alias-error');

            if (!alias) {
                errorMsg?.classList.remove('hidden');
                return;
            }

            errorMsg?.classList.add('hidden');
            overlay?.classList.add('hidden');
            document.getElementById('start-section')?.classList.add('hidden');
            this.socket?.emit('set_alias', { alias });
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
        const keyMap: Record<string, keyof typeof this.keys> = {
            'arrowleft': 'left', 'arrowright': 'right', 'arrowdown': 'down',
            'arrowup': 'rotate', ' ': 'drop'
        };
        
        const action = keyMap[e.key.toLowerCase()];
        if (action && !this.keys[action]) {
            this.keys[action] = true;
            this.sendInput();
            e.preventDefault();
        }
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        const keyMap: Record<string, keyof typeof this.keys> = {
            'arrowleft': 'left', 'arrowright': 'right', 'arrowdown': 'down',
            'arrowup': 'rotate', ' ': 'drop'
        };
        
        const action = keyMap[e.key.toLowerCase()];
        if (action) {
            this.keys[action] = false;
            this.sendInput();
            e.preventDefault();
        }
    };

    private sendInput(): void {
        this.socket?.emit('input', { keys: this.keys });
    }

    private loop = (): void => {
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.loop);
    };

    private draw(): void {
        if (!this.gameState) return;

        this.drawBoard('player', this.gameState.player);
        this.drawBoard('ai', this.gameState.ai);

        // Update scores for both players
        ['player', 'ai'].forEach(player => {
            const state = this.gameState![player as 'player' | 'ai'];
            document.getElementById(`${player}-score`)!.textContent = state.score.toString();
            document.getElementById(`${player}-lines`)!.textContent = state.linesCleared.toString();
        });
    }

    private drawBoard(player: 'player' | 'ai', state: PlayerSnapshot): void {
        const canvas = document.getElementById(`tetris-${player}`) as HTMLCanvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cellSize = 30;
        const [boardWidth, boardHeight] = [10, 20];

        // Clear canvas
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw grid
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

        // Helper to draw a cell
        const drawCell = (x: number, y: number, color: string) => {
            ctx.fillStyle = color;
            ctx.fillRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, cellSize - 4);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, 8);
        };

        // Draw placed blocks and current piece
        const blockColor = player === 'player' ? '#3b82f6' : '#ef4444';
        state.board.forEach((row, y) => row.forEach((cell, x) => {
            if (cell) drawCell(x, y, blockColor);
        }));

        if (state.currentPiece) {
            const { shape, x: px, y: py, color } = state.currentPiece;
            shape.forEach((row, y) => row.forEach((cell, x) => {
                if (cell) drawCell(px + x, py + y, color);
            }));
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
    player: PlayerSnapshot;
    ai: PlayerSnapshot;
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
