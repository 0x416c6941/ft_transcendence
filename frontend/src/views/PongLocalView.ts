import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { validateNickname } from '../utils/validators.js';

export default class PongLocalView extends AbstractView {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private socket: any = null;
    private snap: Snapshot | null = null;
    private input = { leftUp: false, leftDown: false, rightUp: false, rightDown: false };
    private animationFrameId: number | null = null;
    private gameActive: boolean = false;
    private roomId: string | null = null;
    private winner: 'left' | 'right' | null = null;
    private gameEnded: boolean = false;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
      <main class="flex-1 min-h-0 flex flex-col justify-center items-center bg-neutral-900 overflow-hidden">
        <div class="w-full max-w-[860px] mx-auto flex flex-col items-center justify-center">
          <h1 class="text-2xl font-bold text-white mb-3">Pong Battle</h1>

          <div class="bg-[#0f1220] rounded-lg border-2 border-neutral-700 shadow-lg p-3 mb-3">
            <canvas id="pong" width="640" height="360" class="rounded"></canvas>
          </div>

          <!-- Alias Input Overlay -->
          <div id="alias-overlay" class="hidden fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
            <div class="bg-neutral-700 p-8 rounded-xl shadow-2xl max-w-md w-full mx-4 border-2 border-neutral-600">
              <h2 class="text-2xl font-bold text-white mb-6 text-center">Enter Player Names</h2>
              
              <div class="space-y-4">
                <div>
                  <label for="left-alias" class="block text-sm font-semibold text-gray-300 mb-2">
                    Left Player (W/S)
                  </label>
                  <input 
                    id="left-alias" 
                    type="text" 
                    placeholder="Enter name..." 
                    maxlength="20"
                    class="w-full px-4 py-3 rounded-lg bg-neutral-800 text-white border-2 border-neutral-600 
                           focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400"
                  />
                </div>
                
                <div>
                  <label for="right-alias" class="block text-sm font-semibold text-gray-300 mb-2">
                    Right Player (Arrow Keys)
                  </label>
                  <input 
                    id="right-alias" 
                    type="text" 
                    placeholder="Enter name..." 
                    maxlength="20"
                    class="w-full px-4 py-3 rounded-lg bg-neutral-800 text-white border-2 border-neutral-600 
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

          <div class="text-white text-sm text-center">
            <p>Left Player: W/S | Right Player: Arrow Up/Down</p>
          </div>
        </div>
      </main>
    `;
  }    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Local Pong`;
    }

    private handleBackClick = (): void => {
        if (this.roomId) this.socket?.emit('leave_local_room', { roomId: this.roomId });
        this.router.navigate('/');
    };

    private handleStartClick = (): void => {
        if (!this.roomId) return;
        const overlay = document.getElementById('alias-overlay');
        overlay?.classList.remove('hidden');
        (document.getElementById('left-alias') as HTMLInputElement)?.focus();
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        let changed = false;
        if (e.key === 'ArrowUp' && !this.input.leftUp) { this.input.leftUp = true; changed = true; }
        if (e.key === 'ArrowDown' && !this.input.leftDown) { this.input.leftDown = true; changed = true; }
        if (e.key === 'w' && !this.input.rightUp) { this.input.rightUp = true; changed = true; }
        if (e.key === 's' && !this.input.rightDown) { this.input.rightDown = true; changed = true; }
        if (changed) this.sendInput();
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        let changed = false;
        if (e.key === 'ArrowUp' && this.input.leftUp) { this.input.leftUp = false; changed = true; }
        if (e.key === 'ArrowDown' && this.input.leftDown) { this.input.leftDown = false; changed = true; }
        if (e.key === 'w' && this.input.rightUp) { this.input.rightUp = false; changed = true; }
        if (e.key === 's' && this.input.rightDown) { this.input.rightDown = false; changed = true; }
        if (changed) this.sendInput();
    };

    private setupOverlayButtons(): void {
        const overlay = document.getElementById('alias-overlay');
        const leftAliasInput = document.getElementById('left-alias') as HTMLInputElement;
        const rightAliasInput = document.getElementById('right-alias') as HTMLInputElement;
        const errorMsg = document.getElementById('alias-error');
        const saveBtn = document.getElementById('save-alias-btn') as HTMLButtonElement;

        const handleValidation = () => {
            const leftAlias = leftAliasInput.value.trim();
            const rightAlias = rightAliasInput.value.trim();
            const leftResult = validateNickname(leftAlias);
            const rightResult = validateNickname(rightAlias);

            let finalError: string | null = null;
            if (!leftResult.status) {
                finalError = `Left Player: ${leftResult.err_msg}`;
            } else if (!rightResult.status) {
                finalError = `Right Player: ${rightResult.err_msg}`;
            } else if (leftAlias === rightAlias) {
                finalError = 'Player names must be different.';
            }

            errorMsg!.textContent = finalError || '';
            if (finalError) {
                errorMsg?.classList.remove('hidden');
                saveBtn.disabled = true;
                saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                errorMsg?.classList.add('hidden');
                saveBtn.disabled = false;
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        };

        leftAliasInput?.addEventListener('input', handleValidation);
        rightAliasInput?.addEventListener('input', handleValidation);
        
        saveBtn?.addEventListener('click', () => {
            handleValidation(); // Run validation one last time before submitting
            if (saveBtn.disabled) return;

            overlay?.classList.add('hidden');
            this.socket?.emit('start_local_game', { 
                roomId: this.roomId, 
                leftAlias: leftAliasInput.value.trim(), 
                rightAlias: rightAliasInput.value.trim() 
            });
        });

        document.getElementById('cancel-alias-btn')?.addEventListener('click', () => {
            overlay?.classList.add('hidden');
        });

        // Initial validation check
        handleValidation();
    }

    setup(): void {
        this.socket = (window as any).io(window.location.origin + '/pong-local', {
            path: '/api/socket.io/'
        });
        this.socket.emit('create_local_room');

        this.canvas = document.getElementById('pong') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d');

        document.getElementById('back-button')?.addEventListener('click', this.handleBackClick);
        document.getElementById('start-button')?.addEventListener('click', this.handleStartClick);

        this.socket.on('local_room_created', (data: { roomId: string }) => {
            this.roomId = data.roomId;
            this.updateStartButton();
        });

        this.socket.on('game_stopped', () => {
            this.snap = null;
            this.gameActive = false;
            this.winner = null;
            this.gameEnded = false;
            this.updateStartButton();
        });

        this.socket.on('game_end', ({ winner }: { winner: 'left' | 'right' }) => {
            this.winner = winner;
            this.gameActive = false;
            this.gameEnded = true;
            this.updateStartButton();
        });

        this.socket.on('game_state', (data: Snapshot) => {
            this.snap = data;
            this.gameActive = true;
            if (this.gameEnded) {
                this.gameEnded = false;
                this.winner = null;
            }
            this.updateStartButton();
        });

        this.socket.on('validation_error', ({ field, message }: { field: string, message: string }) => {
            const errorMsg = document.getElementById('alias-error');
            const overlay = document.getElementById('alias-overlay');
            if (errorMsg && overlay) {
                errorMsg.textContent = `Server error on ${field}: ${message}`;
                errorMsg.classList.remove('hidden');
                overlay.classList.remove('hidden');
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
            this.socket.off('local_room_created');
            this.socket.off('game_state');
            this.socket.off('game_stopped');
            this.socket.off('game_end');
            this.socket.emit('leave_local_room', { roomId: this.roomId });
            this.socket.disconnect();
            this.socket = null;
        }

        // stop loop
        if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    }

    // Send input to server
    private sendInput(): void {
        if (!this.roomId) return;
        if (!this.gameActive) return;
        this.socket?.emit('local_input', { roomId: this.roomId, ...this.input });
    }

    // Game rendering loop
    private loop = (): void => {
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.loop);
    };

    private updateStartButton(): void {
        const startButton = document.getElementById('start-button');
        if (!startButton) return;

        if (this.gameActive) {
            startButton.style.display = 'none';
            return;
        }

        startButton.style.display = 'block';
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

        // Draw player aliases
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        if (this.snap.leftAlias) this.ctx.fillText(this.snap.leftAlias, 80, 25);
        if (this.snap.rightAlias) this.ctx.fillText(this.snap.rightAlias, WIDTH - 80, 25);

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
        this.ctx.fillRect(0, this.snap.paddles.leftY, paddleWidth, paddleHeight);
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.shadowColor = '#94a3b8';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(WIDTH - paddleWidth, this.snap.paddles.rightY, paddleWidth, paddleHeight);
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
        this.ctx.fillText(this.snap.score.left.toString(), WIDTH / 2 - 40, 40);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(':', WIDTH / 2, 40);
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillText(this.snap.score.right.toString(), WIDTH / 2 + 40, 40);

        // show winner if game ended
        if (this.gameEnded && this.winner && this.snap) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
            this.ctx.fillStyle = '#000000';
            this.ctx.font = 'bold 48px Arial';
            const winnerAlias = this.winner === 'left' ? this.snap.leftAlias : this.snap.rightAlias;
            this.ctx.fillText(`${winnerAlias} WINS!`, WIDTH / 2, HEIGHT / 2);
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Press Start Game for a rematch', WIDTH / 2, HEIGHT / 2 + 60);
        }
    }
}

type Snapshot = {
    width: number;
    height: number;
    paddles: { leftY: number; rightY: number };
    ball: { x: number; y: number };
    score: { left: number; right: number };
    leftAlias: string;
    rightAlias: string;
};
