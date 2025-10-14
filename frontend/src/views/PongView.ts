import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';

/**
 * @class PongView
 * Pong game view.
 */
export default class PongView extends AbstractView {
    /**
     * @property {HTMLCanvasElement | null} canvas
     * @private
     * Canvas element for the Pong game
     */
    private canvas: HTMLCanvasElement | null = null;

    /**
     * @property {CanvasRenderingContext2D | null} ctx
     * @private
     * Canvas rendering context
     */
    private ctx: CanvasRenderingContext2D | null = null;

    /**
     * @property {any} socket
     * @private
     * Socket.IO connection
     */
    private socket: any = null;

    /**
     * @property {Snapshot | null} snap
     * @private
     * Latest game state snapshot received from server
     */
    private snap: Snapshot | null = null;

    /**
     * @property {string} mySide
     * @private
     * Player's assigned role: 'left', 'right', or 'spectator'
     */
    private mySide: 'left' | 'right' | 'spectator' = 'spectator';

    /**
     * @property {object} input
     * @private
     * Current input state
     */
    private input = { up: false, down: false };

    /**
     * @property {number} animationFrameId
     * @private
     * ID of the animation frame for cleaning up
     */
    private animationFrameId: number | null = null;

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
          
          <div class="flex flex-row items-center justify-center mb-3">
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
        // Initialize canvas
        this.canvas = document.getElementById('pong') as HTMLCanvasElement;
        if (!this.canvas) {
            console.error('Canvas not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');

        // Set up back button
        document.getElementById('back-button')?.addEventListener('click', () => {
            this.router.navigate('/');
        });

        this.socket = io;

        // Socket.IO event handlers

        this.socket.on('role', (data: { side: 'left' | 'right' | 'spectator' }) => {
            this.mySide = data.side;
            console.log('my side:', this.mySide);
        });

        this.socket.on('game_state', (data: Snapshot) => {
            this.snap = data;
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


        if (this.socket) {
            this.socket.off('role');
            this.socket.off('game_state');
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
    private draw(): void {
        if (!this.snap || !this.ctx || !this.canvas) return;

        const WIDTH = this.canvas.width;
        const HEIGHT = this.canvas.height;

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