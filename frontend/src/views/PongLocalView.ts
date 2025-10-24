import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';

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
      <main class="h-screen flex flex-col items-center justify-center bg-neutral-900 overflow-hidden">
        <div class="w-full max-w-[860px] mx-auto flex flex-col items-center justify-center">
          <h1 class="text-2xl font-bold text-white mb-3">Local Pong - ${APP_NAME}</h1>
          
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
            <p>Left Player: Arrow Up/Down</p>
            <p>Right Player: W/S</p>
          </div>
        </div> 
      </main>
    `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Local Pong`;
    }

    private handleBackClick = (): void => {
        if (this.roomId) this.socket?.emit('leave_local_room', { roomId: this.roomId });
        this.router.navigate('/');
    };

    private handleStartClick = (): void => {
        if (!this.roomId) return;
        this.socket?.emit('start_local_game', { roomId: this.roomId });
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

    setup(): void {
        console.log('PongLocalView setup called');
        this.socket = io;
        console.log('Emitting create_local_room');
        this.socket.emit('create_local_room');

        this.canvas = document.getElementById('pong') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d');

        document.getElementById('back-button')?.addEventListener('click', this.handleBackClick);
        document.getElementById('start-button')?.addEventListener('click', this.handleStartClick);

        this.socket.on('local_room_created', (data: { roomId: string }) => {
            console.log('local_room_created received:', data.roomId);
            this.roomId = data.roomId;
            console.log('Room joined, roomId:', this.roomId);
            this.updateStartButton();
        });

        // Remove join listener
        // this.socket.on('local_room_joined', ...);

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
            // this.socket.off('local_room_joined');
            this.socket.off('game_state');
            this.socket.off('game_stopped');
            this.socket.off('game_end');
            if (this.roomId) this.socket.emit('leave_local_room', { roomId: this.roomId });
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
};