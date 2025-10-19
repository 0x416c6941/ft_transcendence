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
    private gameReadyState = {
        left: false,
        right: false
    };
    private input = { up: false, down: false };
    private animationFrameId: number | null = null;
    private gameActive: boolean = false;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
      <main class="h-screen flex flex-col items-center justify-center bg-neutral-900 overflow-hidden">
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

    setup(): void {
        this.socket = io;
        this.socket.emit('request_state');
        this.canvas = document.getElementById('pong') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d');
        document.getElementById('back-button')?.addEventListener('click', () => {
            this.router.navigate('/');
        });
        const startButton = document.getElementById('start-button');
        if (startButton) {
            startButton.addEventListener('click', this.handleStartClick);
        }
        
        this.socket.on('game_stopped', () => {
            if (this.ctx) {
                this.ctx.clearRect(0, 0, this.canvas?.width || 0, this.canvas?.height || 0);
            }
            this.snap = null;
            this.gameActive = false;
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
        });

        this.socket.on('ready_state', (data: { left: boolean, right: boolean }) => {
            this.gameReadyState = data;
            this.gameActive = data.left && data.right;
            this.updateStartButton();
        });

        // Set up keyboard input handlers
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        // Start the game loop
        this.animationFrameId = requestAnimationFrame(this.loop);
    }



    cleanup(): void {
        // Remove event listeners
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

        // Remove UI event handlers
        document.getElementById('back-button')?.removeEventListener('click', () => {
            this.router.navigate('/');
        });


        // Remove start button event listener
        document.getElementById('start-button')?.removeEventListener('click', this.handleStartClick);

        if (this.socket) {
            this.socket.off('role');
            this.socket.off('game_state');
            this.socket.off('ready_state');
            this.socket.off('game_stopped');
            this.socket = null;
        }

        // Stop animation loop
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    // Keyboard input handlers
    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowUp') {
            if (!this.input.up) {
                this.input.up = true;
                this.sendInput();
            }
        }
        if (e.key === 'ArrowDown') {
            if (!this.input.down) {
                this.input.down = true;
                this.sendInput();
            }
        }
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowUp') {
            if (this.input.up) {
                this.input.up = false;
                this.sendInput();
            }
        }
        if (e.key === 'ArrowDown') {
            if (this.input.down) {
                this.input.down = false;
                this.sendInput();
            }
        }
    };

    // Send input to server
    private sendInput(): void {
        this.socket?.emit('input', this.input);
    }

    // Game rendering loop
    private loop = (): void => {
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.loop);
    };

    // Draw the game state
    private handleStartClick = (): void => {
        if (this.mySide === 'spectator') {
            return;
        }

        const currentState = this.mySide === 'left' ? this.gameReadyState.left : this.gameReadyState.right;
        this.socket?.emit('player_ready', { side: this.mySide, ready: !currentState });
    };

    private updateStartButton(): void {
        const startButton = document.getElementById('start-button');
        if (!startButton) return;


        if (this.mySide === 'spectator' || (this.gameReadyState.left && this.gameReadyState.right)) {
            startButton.style.display = 'none';
            return;
        }

        startButton.style.display = 'block';
        const myReadyState = this.mySide === 'left' ? this.gameReadyState.left : this.gameReadyState.right;

        startButton.textContent = myReadyState ? 'Waiting...' : 'Ready to Play';
        startButton.classList.toggle('bg-yellow-600', myReadyState);
        startButton.classList.toggle('hover:bg-yellow-700', myReadyState);
        startButton.classList.toggle('bg-green-600', !myReadyState);
        startButton.classList.toggle('hover:bg-green-700', !myReadyState);
    }

    private draw(): void {
        if (!this.ctx || !this.canvas) return;

        const WIDTH = this.canvas.width;
        const HEIGHT = this.canvas.height;

        if (!this.gameActive || !this.snap) {
            this.ctx.fillStyle = '#0f1220';
            this.ctx.fillRect(0, 0, WIDTH, HEIGHT);

            this.ctx.strokeStyle = '#1e293b';
            this.ctx.lineWidth = 4;
            this.ctx.strokeRect(0, 0, WIDTH, HEIGHT);
            return;
        }

        // Background
        this.ctx.fillStyle = '#0f1220';
        this.ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Draw border around the field
        this.ctx.strokeStyle = '#1e293b';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, WIDTH, HEIGHT);

        // Center dashed line
        this.ctx.strokeStyle = '#334155';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([8, 8]);
        this.ctx.beginPath();
        this.ctx.moveTo(WIDTH / 2, 0);
        this.ctx.lineTo(WIDTH / 2, HEIGHT);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Center circle
        this.ctx.strokeStyle = '#334155';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(WIDTH / 2, HEIGHT / 2, 35, 0, Math.PI * 2);
        this.ctx.stroke();

        // Paddles
        const paddleWidth = 12;
        const paddleHeight = 80;

        // Left paddle (blue)
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.shadowColor = '#60a5fa';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(0, this.snap.paddles.leftY, paddleWidth, paddleHeight);

        // Right paddle (white)
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.shadowColor = '#94a3b8';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(WIDTH - paddleWidth, this.snap.paddles.rightY, paddleWidth, paddleHeight);

        // Reset shadow for other elements
        this.ctx.shadowBlur = 0;

        // Ball with a glow effect
        const ballSize = 10;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = '#f8fafc';
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.ctx.arc(this.snap.ball.x + ballSize / 2, this.snap.ball.y + ballSize / 2, ballSize / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // Draw score on canvas
        this.ctx.font = "bold 32px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#ffffff";
        this.ctx.shadowColor = "#60a5fa";
        this.ctx.shadowBlur = 10;

        // Left score
        this.ctx.fillStyle = "#3b82f6";
        this.ctx.fillText(this.snap.score.left.toString(), WIDTH / 2 - 40, 40);

        // Separator
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillText(":", WIDTH / 2, 40);

        // Right score
        this.ctx.fillStyle = "#f8fafc";
        this.ctx.fillText(this.snap.score.right.toString(), WIDTH / 2 + 40, 40);

        this.ctx.shadowBlur = 0;
    }
}

// Game state type definitions
type Snapshot = {
    width: number;
    height: number;
    paddles: { leftY: number; rightY: number };
    ball: { x: number; y: number };
    score: { left: number; right: number };
};