import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';

interface RemotePlayer {
    socketId: string;
    userId: number;
    displayName: string;
}

interface RemoteRoomData {
    id: string;
    player1: RemotePlayer | null;
    player2: RemotePlayer | null;
    status: string;
}

export default class PongRemoteView extends AbstractView {
    private socket = io;
    private roomId: string;
    private roomData: RemoteRoomData | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private gameState: {
        width: number;
        height: number;
        paddles: { leftY: number; rightY: number };
        ball: { x: number; y: number };
        score: { left: number; right: number };
    } | null = null;
    private leftPlayerName: string = '';
    private rightPlayerName: string = '';
    private inputState = { up: false, down: false };
    private leftAlias: string = '';
    private rightAlias: string = '';

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
        this.roomId = pathParams.get('roomId') || '';
    }

    async getHtml(): Promise<string> {
        return `
            <main class="flex-1 min-h-0 flex flex-col bg-gray-800 p-4">
                <div class="flex justify-between items-center mb-4">
                    <h1 class="text-3xl font-bold text-white">Pong - Remote Game</h1>
                    <button id="leave-btn" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors">
                        Leave Game
                    </button>
                </div>

                <div class="flex-1 bg-gray-900 rounded-lg shadow-lg flex flex-col items-center justify-center relative p-4" id="game-container">
                    <div id="match-info" class="w-full text-center text-white mb-3 hidden">
                        <div class="bg-black bg-opacity-70 inline-block px-6 py-2 rounded-lg">
                            <span id="player1-name" class="font-bold text-blue-400 text-lg">Player 1</span>
                            <span class="text-gray-300 mx-2">vs</span>
                            <span id="player2-name" class="font-bold text-gray-100 text-lg">Player 2</span>
                        </div>
                    </div>
                    <div id="waiting-message" class="text-gray-500 text-xl text-center">
                        <p>Waiting for opponent to join...</p>
                    </div>
                    <div class="bg-[#0f1220] rounded-lg border-2 border-neutral-700 shadow-lg p-3 hidden" id="canvas-wrapper">
                        <canvas id="pong-canvas" width="640" height="360" class="rounded"></canvas>
                    </div>
                </div>
            </main>
        `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Remote Pong`;
    }

    async setup(): Promise<void> {
        if (!this.socket.connected) {
            this.showError('Not connected to server');
            setTimeout(() => this.router.navigate('/'), 2000);
            return;
        }

        this.canvas = document.getElementById('pong-canvas') as HTMLCanvasElement;
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }

        this.setupSocketListeners();

        const leaveBtn = document.getElementById('leave-btn');
        leaveBtn?.addEventListener('click', () => this.leaveRoom());

        this.setupKeyboardControls();

        // Join or create the remote game room
        this.socket.emit('remote_pong_join', { roomId: this.roomId });
    }

    private setupSocketListeners(): void {
        this.socket.on('remote_pong_room_state', (data: { room: RemoteRoomData }) => {
            this.updateRoomState(data.room);
        });

        this.socket.on('remote_pong_match_announced', (data: { player1: string; player2: string; countdown: number }) => {
            this.leftPlayerName = data.player1;
            this.rightPlayerName = data.player2;
            const matchInfo = document.getElementById('match-info');
            if (matchInfo) matchInfo.classList.add('hidden');
            const canvasWrapper = document.getElementById('canvas-wrapper');
            if (canvasWrapper) canvasWrapper.classList.add('hidden');
            const waitingMsg = document.getElementById('waiting-message');
            if (waitingMsg) waitingMsg.classList.add('hidden');
            this.showCountdownOverlay(`${data.player1} vs ${data.player2}`, data.countdown || 3);
        });

        this.socket.on('remote_pong_match_started', () => {
            this.removeOverlay();
            this.startGame();
        });

        this.socket.on('remote_pong_game_state', (snapshot: any) => {
            this.gameState = snapshot;
            this.renderGame();
        });

        this.socket.on('remote_pong_match_ended', (data: { winner: string }) => {
            this.showMatchResult(data.winner);
        });

        this.socket.on('remote_pong_error', (data: { message: string }) => {
            this.showError(data.message);
            setTimeout(() => this.router.navigate('/'), 3000);
        });
    }

    private updateRoomState(room: RemoteRoomData): void {
        this.roomData = room;

        if (room.player1 && room.player2 && room.status === 'waiting') {
            const waitingMsg = document.getElementById('waiting-message');
            if (waitingMsg) waitingMsg.classList.add('hidden');
        }
    }

    private startGame(): void {
        const matchInfo = document.getElementById('match-info');
        const p1Name = document.getElementById('player1-name');
        const p2Name = document.getElementById('player2-name');
        
        if (p1Name) p1Name.textContent = this.leftAlias;
        if (p2Name) p2Name.textContent = this.rightAlias;
        if (matchInfo) matchInfo.classList.remove('hidden');

        const canvasWrapper = document.getElementById('canvas-wrapper');
        if (canvasWrapper) canvasWrapper.classList.remove('hidden');

        const waitingMsg = document.getElementById('waiting-message');
        if (waitingMsg) waitingMsg.classList.add('hidden');

        this.removeOverlay();
    }

    private showCountdownOverlay(matchText: string, countdown: number): void {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        let overlay = document.getElementById('countdown-overlay') as HTMLDivElement;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'countdown-overlay';
            overlay.className = 'absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-10 rounded-lg';
            gameContainer.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="text-white text-center">
                <div class="text-3xl font-bold mb-4">${matchText}</div>
                <div class="text-7xl font-bold" id="countdown-number">${countdown}</div>
            </div>
        `;

        let currentCount = countdown;
        const countdownInterval = setInterval(() => {
            currentCount--;
            const countdownNumber = document.getElementById('countdown-number');
            if (countdownNumber) {
                if (currentCount > 0) {
                    countdownNumber.textContent = currentCount.toString();
                } else {
                    countdownNumber.textContent = 'GO!';
                    setTimeout(() => {
                        this.removeOverlay();
                        clearInterval(countdownInterval);
                    }, 500);
                }
            }
        }, 1000);
    }

    private removeOverlay(): void {
        const overlay = document.getElementById('countdown-overlay');
        if (overlay) overlay.remove();
    }

    private showMatchResult(winner: string): void {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-20 rounded-lg';
        overlay.innerHTML = `
            <div class="text-white text-center">
                <div class="text-6xl font-bold mb-4">🏆</div>
                <div class="text-3xl font-bold mb-2">${winner} Wins!</div>
                <div class="text-lg text-gray-300 mt-4">Returning to home in 5 seconds...</div>
            </div>
        `;
        gameContainer.appendChild(overlay);

        setTimeout(() => {
            this.router.navigate('/');
        }, 5000);
    }

    private setupKeyboardControls(): void {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        const key = e.key.toLowerCase();
        if (key === 'arrowup' || key === 'w') {
            this.inputState.up = true;
            this.sendInput();
            e.preventDefault();
        } else if (key === 'arrowdown' || key === 's') {
            this.inputState.down = true;
            this.sendInput();
            e.preventDefault();
        }
    };

    private handleKeyUp = (e: KeyboardEvent): void => {
        const key = e.key.toLowerCase();
        if (key === 'arrowup' || key === 'w') {
            this.inputState.up = false;
            this.sendInput();
            e.preventDefault();
        } else if (key === 'arrowdown' || key === 's') {
            this.inputState.down = false;
            this.sendInput();
            e.preventDefault();
        }
    };

    private sendInput(): void {
        if (!this.roomId) return;
        this.socket.emit('remote_pong_input', {
            roomId: this.roomId,
            input: this.inputState
        });
    }

    private renderGame(): void {
        if (!this.ctx || !this.canvas || !this.gameState) return;

        const { width, height, paddles, ball, score } = this.gameState;

        // Dark background matching tournament
        this.ctx.fillStyle = '#0f1220';
        this.ctx.fillRect(0, 0, width, height);
        
        // Border
        this.ctx.strokeStyle = '#1e293b';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, width, height);

        // Player names at top
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        if (this.leftPlayerName) this.ctx.fillText(this.leftPlayerName, 80, 25);
        if (this.rightPlayerName) this.ctx.fillText(this.rightPlayerName, width - 80, 25);

        // Center line and circle
        this.ctx.strokeStyle = '#334155';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([8, 8]);
        this.ctx.beginPath();
        this.ctx.moveTo(width / 2, 0);
        this.ctx.lineTo(width / 2, height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.arc(width / 2, height / 2, 35, 0, Math.PI * 2);
        this.ctx.stroke();

        // Paddles with glow
        const paddleWidth = 12;
        const paddleHeight = 80;
        
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.shadowColor = '#60a5fa';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(0, paddles.leftY, paddleWidth, paddleHeight);
        
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.shadowColor = '#94a3b8';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(width - paddleWidth, paddles.rightY, paddleWidth, paddleHeight);
        this.ctx.shadowBlur = 0;

        // Ball with glow
        const ballSize = 10;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = '#f8fafc';
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.ctx.arc(ball.x + ballSize / 2, ball.y + ballSize / 2, ballSize / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // Scores at top center
        this.ctx.font = 'bold 32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.fillText(score.left.toString(), width / 2 - 40, 40);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(':', width / 2, 40);
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillText(score.right.toString(), width / 2 + 40, 40);
    }

    private leaveRoom(): void {
        this.socket.emit('remote_pong_leave', { roomId: this.roomId });
        this.router.navigate('/');
    }

    private showError(message: string): void {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;

        const errorDiv = document.createElement('div');
        errorDiv.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-30';
        errorDiv.textContent = message;
        gameContainer.appendChild(errorDiv);

        setTimeout(() => errorDiv.remove(), 3000);
    }

    cleanup(): void {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

        this.socket.off('remote_pong_room_state');
        this.socket.off('remote_pong_match_announced');
        this.socket.off('remote_pong_match_started');
        this.socket.off('remote_pong_game_state');
        this.socket.off('remote_pong_match_ended');
        this.socket.off('remote_pong_error');

        if (this.roomId) {
            this.socket.emit('remote_pong_leave', { roomId: this.roomId });
        }
    }
}
