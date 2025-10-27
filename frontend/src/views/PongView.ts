import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';

export default class PongView extends AbstractView {
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private socket: any = null;
    private snap: Snapshot | null = null;
    private mySide: 'left' | 'right' | 'spectator' = 'spectator';
    private gameReadyState = { left: false, right: false };
    private input = { up: false, down: false };
    private animationFrameId: number | null = null;
    private gameActive: boolean = false;
    private roomId: string | null = null;
    private winner: 'left' | 'right' | null = null;
    private gameEnded: boolean = false;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
        this.roomId = queryParams.get('roomId');
    }

    async getHtml(): Promise<string> {
        return `
      <main class="flex-1 min-h-0 flex flex-col justify-center items-center bg-neutral-900 overflow-hidden">
        <div class="w-full max-w-[860px] mx-auto flex flex-col items-center justify-center">
          <h1 class="text-2xl font-bold text-white mb-3">Transcendence Pong</h1>

          <div class="bg-[#0f1220] rounded-lg border-2 border-neutral-700 shadow-lg p-3 mb-3">
            <canvas id="pong" width="640" height="360" class="rounded"></canvas>
          </div>

          <div class="flex flex-row items-center justify-center gap-4 mb-3">
            <button id="start-button" class="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg transition-colors font-medium">
              Ready to Play
            </button>
            <button id="back-button" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-lg transition-colors font-medium">
              Back to Home
            </button>
          </div>
        </div>
      </main>
    `;
    }

    setDocumentTitle(): void {
        document.title = APP_NAME.concat(' - Pong Game');
    }

    private handleBackClick = (): void => {
        if (this.roomId) this.socket?.emit('leave_room', { roomId: this.roomId });
        this.router.navigate('/rooms/join');
    };

    private handleStartClick = (): void => {
        if (this.mySide === 'spectator' || !this.roomId) return;
        const current = this.mySide === 'left' ? this.gameReadyState.left : this.gameReadyState.right;
        this.socket?.emit('player_ready', { roomId: this.roomId, side: this.mySide, ready: !current });
    };

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowUp' && !this.input.up) { this.input.up = true; this.sendInput(); }
        if (e.key === 'ArrowDown' && !this.input.down) { this.input.down = true; this.sendInput(); }
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowUp' && this.input.up) { this.input.up = false; this.sendInput(); }
        if (e.key === 'ArrowDown' && this.input.down) { this.input.down = false; this.sendInput(); }
    };

    setup(): void {
        // require roomId
        if (!this.roomId) {
            this.router.navigate('/rooms/join');
            return;
        }

        this.socket = io;
        this.socket.emit('request_state', { roomId: this.roomId });

        this.canvas = document.getElementById('pong') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d');

        document.getElementById('back-button')?.addEventListener('click', this.handleBackClick);
        document.getElementById('start-button')?.addEventListener('click', this.handleStartClick);

        this.socket.on('game_stopped', () => {
            this.snap = null;
            this.gameActive = false;
            this.gameReadyState = { left: false, right: false };
            this.winner = null;
            this.gameEnded = false;
            this.updateStartButton();
        });

        this.socket.on('game_end', ({ winner }: { winner: 'left' | 'right' }) => {
            console.log('Game ended, winner:', winner);
            console.log('Setting winner to:', winner);
            this.winner = winner;
            console.log('Winner set to:', this.winner);
            this.gameActive = false;
            this.gameEnded = true;
            this.gameReadyState = { left: false, right: false };
            this.updateStartButton();
        });

        this.socket.on('role', (data: { side: 'left' | 'right' | 'spectator' }) => {
            this.mySide = data.side;
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

        this.socket.on('ready_state', (data: { left: boolean; right: boolean }) => {
            this.gameReadyState = data;
            // Do not enable gameActive based on ready_state — start confirms game_state
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
            this.socket.off('role');
            this.socket.off('game_state');
            this.socket.off('ready_state');
            this.socket.off('game_stopped');
            this.socket.off('game_end');
            // just in case, correctly leave the room when leaving the page
            if (this.roomId) this.socket.emit('leave_room', { roomId: this.roomId });
            this.socket = null;
        }

        // stop loop
        if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    }

    // Send input to server
    private sendInput(): void {
        if (!this.roomId || this.mySide === 'spectator') return;
        // can not check gameActive — server ignores, but save traffic:
        if (!this.gameActive) return;
        this.socket?.emit('input', { roomId: this.roomId, ...this.input });
    }

    // Game rendering loop
    private loop = (): void => {
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.loop);
    };

    private updateStartButton(): void {
        const startButton = document.getElementById('start-button');
        if (!startButton) return;

        // hide if spectator or match is going
        if (this.mySide === 'spectator' || this.gameActive) {
            startButton.style.display = 'none';
            return;
        }

        startButton.style.display = 'block';
        const myReady = this.mySide === 'left' ? this.gameReadyState.left : this.gameReadyState.right;

        startButton.textContent = myReady ? 'Waiting...' : 'Ready to Play';
        startButton.classList.toggle('bg-yellow-600', myReady);
        startButton.classList.toggle('hover:bg-yellow-700', myReady);
        startButton.classList.toggle('bg-green-600', !myReady);
        startButton.classList.toggle('hover:bg-green-700', !myReady);
    }

    private draw(): void {
        console.log('Draw called, winner:', this.winner, 'snap:', !!this.snap, 'gameActive:', this.gameActive);
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

            if (this.mySide === 'spectator') {
                this.ctx.fillText('You are a spectator. Waiting for players…', WIDTH / 2, HEIGHT / 2);
            } else {
                const myReady = this.mySide === 'left' ? this.gameReadyState.left : this.gameReadyState.right;
                const oppReady = this.mySide === 'left' ? this.gameReadyState.right : this.gameReadyState.left;
                if (!myReady) this.ctx.fillText('Press "Ready to Play"', WIDTH / 2, HEIGHT / 2);
                else if (!oppReady) this.ctx.fillText('Waiting for opponent…', WIDTH / 2, HEIGHT / 2);
                else this.ctx.fillText('Starting…', WIDTH / 2, HEIGHT / 2);
            }
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
        if (this.gameEnded && this.winner) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
            this.ctx.fillStyle = '#000000';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.fillText(`${this.winner.toUpperCase()} WINS!`, WIDTH / 2, HEIGHT / 2);
            this.ctx.font = '24px Arial';
            this.ctx.fillText('Press Ready to Play for a rematch', WIDTH / 2, HEIGHT / 2 + 60);
        }
    }
}

type Snapshot = {
    width: number;
    height: number;
    paddles: { leftY: number; rightY: number };
    ball: { x: number; y: number };
    score: { left: number; right: number };
};
