import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

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

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
      <main class="h-screen flex flex-col items-center justify-center bg-neutral-900 overflow-hidden">
        <div class="w-full max-w-[860px] mx-auto flex flex-col items-center justify-center">
          <h1 class="text-2xl font-bold text-white mb-3">Pong vs AI - ${APP_NAME}</h1>

          <div class="bg-[#0f1220] rounded-lg border-2 border-neutral-700 shadow-lg p-3 mb-3">
            <canvas id="pong" width="640" height="360" class="rounded"></canvas>
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
        this.socket?.emit('start_ai_game');
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        let changed = false;
        if (e.key === 'ArrowUp' && !this.input.up) { this.input.up = true; changed = true; }
        if (e.key === 'ArrowDown' && !this.input.down) { this.input.down = true; changed = true; }
        if (changed) this.sendInput();
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        let changed = false;
        if (e.key === 'ArrowUp' && this.input.up) { this.input.up = false; changed = true; }
        if (e.key === 'ArrowDown' && this.input.down) { this.input.down = false; changed = true; }
        if (changed) this.sendInput();
    };

    setup(): void {
        this.socket = (window as any).io(window.location.origin + '/pong-ai', {
            path: '/api/socket.io/'
        });

        this.canvas = document.getElementById('pong') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d');

        document.getElementById('back-button')?.addEventListener('click', this.handleBackClick);
        document.getElementById('start-button')?.addEventListener('click', this.handleStartClick);

        this.socket.on('connect', () => {
            this.socket.emit('create_ai_room');
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
        const startButton = document.getElementById('start-button');
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
        if (this.gameEnded && this.winner) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
            this.ctx.fillStyle = '#000000';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.fillText(`${this.winner.toUpperCase()} WINS!`, WIDTH / 2, HEIGHT / 2);
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
};