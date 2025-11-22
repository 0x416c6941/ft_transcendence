import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { validateNickname } from '../utils/validators.js';
import { gameStateManager } from '../gameStateManager.js';
import { isUIInputFocused } from '../utils/gameInputHelpers.js';

export default class PongAIView extends AbstractView {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private socket: any = null;
    private snap: Snapshot | null = null;
    private input = { up: false, down: false };
    private animationFrameId: number | null = null;
    private gameActive: boolean = false;
    private winner: 'player' | 'ai' | null = null;
    private gameEnded: boolean = false;
    private isAuthenticated: boolean = false;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
      <main class="h-screen flex flex-col items-center justify-center bg-neutral-900 overflow-hidden">
        <div class="w-full max-w-[860px] mx-auto flex flex-col items-center justify-center">
          <h1 class="text-2xl font-bold text-white mb-3">Pong vs AI</h1>

          <div class="bg-[#0f1220] rounded-lg border-2 border-neutral-700 shadow-lg p-3 mb-3">
            <canvas id="pong" width="640" height="360" class="rounded"></canvas>
          </div>

          <!-- Alias Input Overlay -->
          <div id="alias-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
            <div class="bg-neutral-700 p-8 rounded-xl shadow-2xl max-w-md w-full mx-4 border-2 border-neutral-600">
              <h2 class="text-2xl font-bold text-white mb-6 text-center">Enter Your Name</h2>
              
              <div class="space-y-4">
                <div>
                  <label for="player-alias" class="block text-sm font-semibold text-gray-300 mb-2">
                    Player Name
                  </label>
                  <input 
                    id="player-alias" 
                    type="text" 
                    placeholder="Enter your name..." 
                    maxlength="20"
                    class="w-full px-4 py-3 rounded-lg bg-neutral-800 text-white border-2 border-neutral-600 
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
                           text-white font-bold rounded-lg shadow-lg transition-colors opacity-50 cursor-not-allowed"
                    disabled>
                    SAVE
                  </button>
                  <button 
                    id="cancel-alias-btn" 
                    class="flex-1 px-6 py-3 bg-neutral-600 hover:bg-neutral-700 
                           text-white font-bold rounded-lg shadow-lg transition-colors">
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-row items-center justify-center gap-4 mb-3">
            <button id="start-button" class="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg transition-colors font-medium">
              Start Game
            </button>
            <button id="back-button" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg transition-colors font-medium">
              Back to Home
            </button>
          </div>

          <div class="text-white text-sm">
            <p>Player: Arrow Up/Down</p>
            <p>AI controls the right paddle</p>
          </div>
        </div>
      </main>
    `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Pong vs AI`;
    }

    private handleBackClick = (): void => {
        this.router.navigate('/');
    };

    private handleStartClick = (): void => {
        if (this.isAuthenticated) {
            this.socket?.emit('start_ai_game', {});
        } else {
            const overlay = document.getElementById('alias-overlay');
            overlay?.classList.remove('hidden');
            (document.getElementById('player-alias') as HTMLInputElement)?.focus();
        }
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (isUIInputFocused()) return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        let changed = false;
        if (e.key === 'ArrowUp' && !this.input.up) { this.input.up = true; changed = true; }
        if (e.key === 'ArrowDown' && !this.input.down) { this.input.down = true; changed = true; }
        if (changed) this.sendInput();
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (isUIInputFocused()) return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        let changed = false;
        if (e.key === 'ArrowUp' && this.input.up) { this.input.up = false; changed = true; }
        if (e.key === 'ArrowDown' && this.input.down) { this.input.down = false; changed = true; }
        if (changed) this.sendInput();
    };

    private setupOverlayButtons(): void {
        const overlay = document.getElementById('alias-overlay');
        const aliasInput = document.getElementById('player-alias') as HTMLInputElement;
        const errorMsg = document.getElementById('alias-error');
        const saveBtn = document.getElementById('save-alias-btn') as HTMLButtonElement;

        const handleValidation = () => {
            const result = validateNickname(aliasInput.value);
            if (result.status) {
                errorMsg?.classList.add('hidden');
                saveBtn.disabled = false;
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                errorMsg!.textContent = result.err_msg;
                errorMsg?.classList.remove('hidden');
                saveBtn.disabled = true;
                saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        };

         aliasInput?.addEventListener('input', handleValidation);
        
        saveBtn?.addEventListener('click', () => {
            handleValidation();
            if (saveBtn.disabled) return;

            overlay?.classList.add('hidden');
            this.socket?.emit('start_ai_game', { playerAlias: aliasInput.value.trim() });
        });

        document.getElementById('cancel-alias-btn')?.addEventListener('click', () => {
            overlay?.classList.add('hidden');
        });

        // Initial validation check in case the field is pre-filled
        handleValidation();
    }

    setup(): void {
        this.socket = (window as any).io(window.location.origin + '/pong-ai', {
            path: '/api/socket.io/',
            withCredentials: true
        });

        this.canvas = document.getElementById('pong') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d');

        document.getElementById('back-button')?.addEventListener('click', this.handleBackClick);
        document.getElementById('start-button')?.addEventListener('click', this.handleStartClick);

        this.socket.on('connect', () => {
            this.socket.emit('create_ai_room');
        });

        this.socket.on('auth_status', ({ isAuthenticated }: { isAuthenticated: boolean; displayName: string | null }) => {
            this.isAuthenticated = isAuthenticated;
        });

        this.socket.on('ai_room_created', () => {
            this.updateStartButton();
        });

        this.socket.on('game_stopped', () => {
            this.snap = null;
            this.gameActive = false;
            this.winner = null;
            this.gameEnded = false;
            this.updateStartButton();
        });

        this.socket.on('game_end', ({ winner }: { winner: 'player' | 'ai' }) => {
            this.winner = winner;
            this.gameActive = false;
            this.gameEnded = true;
            gameStateManager.setOutOfGame();
            this.updateStartButton();
        });

        this.socket.on('game_state', (data: Snapshot) => {
            this.snap = data;
            this.gameActive = true;
            if (this.gameEnded) {
                this.gameEnded = false;
                this.winner = null;
            }
            gameStateManager.setInGame('pong-ai');
            this.updateStartButton();
        });

        this.socket.on('validation_error', ({ message }: { message: string }) => {
            const errorMsg = document.getElementById('alias-error');
            const overlay = document.getElementById('alias-overlay');
            if (errorMsg && overlay) {
                errorMsg.textContent = `Server error: ${message}`;
                errorMsg.classList.remove('hidden');
                overlay.classList.remove('hidden');
                (document.getElementById('player-alias') as HTMLInputElement)?.focus();
            }
        });

        this.setupOverlayButtons();

        // keyboard
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        // render loop
        this.animationFrameId = requestAnimationFrame(this.loop);
    }

    cleanup(): void {
        // keyboard
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

        // UI
        document.getElementById('back-button')?.removeEventListener('click', this.handleBackClick);
        document.getElementById('start-button')?.removeEventListener('click', this.handleStartClick);

        // sockets
        if (this.socket) {
            this.socket.off('connect');
            this.socket.off('auth_status');
            this.socket.off('ai_room_created');
            this.socket.off('game_state');
            this.socket.off('game_stopped');
            this.socket.off('game_end');
            this.socket.emit('leave_ai_room');
            this.socket.disconnect();
            this.socket = null;
        }

        // stop loop
        if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
        
        // Clear game state
        gameStateManager.setOutOfGame();
    }

    // Send input to server
    private sendInput(): void {
        if (!this.gameActive) return;
        if (!this.socket || !this.socket.connected) return;
        this.socket?.emit('input', { ...this.input });
    }

    // Game rendering loop
    private loop = (): void => {
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.loop);
    };

    private updateStartButton(): void {
        const startButton = document.getElementById('start-button') as HTMLButtonElement;
        if (!startButton) return;

        if (this.gameActive) {
            startButton.style.display = 'none';
            return;
        }

        startButton.style.display = 'block';
        startButton.textContent = 'Start Game';
    }

    private draw(): void {
        if (!this.ctx || !this.canvas) return;
        const WIDTH = this.canvas.width;
        const HEIGHT = this.canvas.height;

        // background/frame
        this.ctx.fillStyle = '#0f1220';
        this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
        this.ctx.strokeStyle = '#1e293b';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, WIDTH, HEIGHT);

        // if no snapshot — draw hints and exit
        if (!this.snap) {
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Press Start Game to begin', WIDTH / 2, HEIGHT / 2);
            return;
        }

        // Draw player alias
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        if (this.snap.playerAlias) this.ctx.fillText(this.snap.playerAlias, 80, 25);
        this.ctx.fillText('AI', WIDTH - 80, 25);

        // Center dashed line
        this.ctx.strokeStyle = '#334155';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([8, 8]);
        this.ctx.beginPath();
        this.ctx.moveTo(WIDTH / 2, 0);
        this.ctx.lineTo(WIDTH / 2, HEIGHT);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.arc(WIDTH / 2, HEIGHT / 2, 35, 0, Math.PI * 2);
        this.ctx.stroke();

        // Paddles
        const paddleWidth = 12, paddleHeight = 80;
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.shadowColor = '#60a5fa';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(0, this.snap.paddles.playerY, paddleWidth, paddleHeight);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.shadowColor = '#f87171';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(WIDTH - paddleWidth, this.snap.paddles.aiY, paddleWidth, paddleHeight);
        this.ctx.shadowBlur = 0;

        // ball
        const ballSize = 10;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = '#f8fafc';
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.ctx.arc(this.snap.ball.x + ballSize / 2, this.snap.ball.y + ballSize / 2, ballSize / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // score
        this.ctx.font = 'bold 32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.fillText(this.snap.score.player.toString(), WIDTH / 2 - 40, 40);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(':', WIDTH / 2, 40);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillText(this.snap.score.ai.toString(), WIDTH / 2 + 40, 40);

        // show winner if game ended
        if (this.gameEnded && this.winner && this.snap) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
            this.ctx.fillStyle = '#000000';
            this.ctx.font = 'bold 48px Arial';
            const winnerAlias = this.winner === 'player' ? this.snap.playerAlias : 'AI';
            this.ctx.fillText(`${winnerAlias} WINS!`, WIDTH / 2, HEIGHT / 2);
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Press Start Game for a rematch', WIDTH / 2, HEIGHT / 2 + 60);
        }
    }
}

type Snapshot = {
    width: number;
    height: number;
    paddles: { playerY: number; aiY: number };
    ball: { x: number; y: number };
    score: { player: number; ai: number };
    playerAlias: string;
};