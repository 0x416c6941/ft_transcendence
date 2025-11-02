import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';

interface TournamentPlayer {
    socketId: string;
    userId: number;
    displayName: string;
    isReady: boolean;
    isEliminated: boolean;
}

interface TournamentRoomData {
    id: string;
    name: string;
    creator: string;
    players: TournamentPlayer[];
    status: string;
}

export default class PongTournamentView extends AbstractView {
    private socket = io;
    private roomId: string;
    private roomData: TournamentRoomData | null = null;
    private isCreator: boolean = false;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private gameState: any = null;
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
                    <h1 class="text-3xl font-bold text-white">Tournament: <span id="room-name">Loading...</span></h1>
                    <button id="leave-btn" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors">
                        Leave Room
                    </button>
                </div>

                <div class="flex-1 flex gap-4 min-h-0">
                    <div class="flex-1 bg-gray-900 rounded-lg shadow-lg flex flex-col items-center justify-center relative p-4" id="game-container">
                        <div id="match-info" class="w-full text-center text-white mb-3 hidden">
                            <div class="bg-black bg-opacity-70 inline-block px-6 py-2 rounded-lg">
                                <span id="player1-name" class="font-bold text-blue-400 text-lg">Player 1</span>
                                <span class="text-gray-300 mx-2">vs</span>
                                <span id="player2-name" class="font-bold text-gray-100 text-lg">Player 2</span>
                            </div>
                        </div>
                        <div id="waiting-message" class="text-gray-500 text-xl text-center">
                            <p>Tournament game will appear here</p>
                            <p class="text-sm mt-2">Waiting for tournament to start...</p>
                        </div>
                        <div class="bg-[#0f1220] rounded-lg border-2 border-neutral-700 shadow-lg p-3 hidden" id="canvas-wrapper">
                            <canvas id="pong-canvas" width="640" height="360" class="rounded"></canvas>
                        </div>
                    </div>
                    <div class="w-80 bg-gray-900 rounded-lg shadow-lg p-4 flex flex-col">
                        <h2 class="text-xl font-semibold text-white mb-4">Players (<span id="player-count">0</span>/10)</h2>
                        <div id="player-list" class="flex-1 overflow-y-auto space-y-2 mb-4">
                        </div>
                        <div class="space-y-2">
                            <button id="ready-btn" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">
                                Ready
                            </button>
                            <button id="start-btn" class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors hidden">
                                Start Tournament
                            </button>
                            <div id="error-message" class="text-red-400 text-sm text-center hidden"></div>
                        </div>
                    </div>
                </div>
            </main>
        `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Tournament Lobby`;
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
        const readyBtn = document.getElementById('ready-btn');
        const startBtn = document.getElementById('start-btn');

        leaveBtn?.addEventListener('click', () => this.leaveRoom());
        readyBtn?.addEventListener('click', () => this.toggleReady());
        startBtn?.addEventListener('click', () => this.startTournament());

        this.setupKeyboardControls();
    }

    private setupSocketListeners(): void {
        this.socket.on('tournament_room_state', (data: { room: TournamentRoomData }) => {
            this.updateRoomState(data.room);
        });

        this.socket.on('tournament_started', (data: { room: any }) => {
            this.updateRoomState(data.room);
            this.startGame(data.room);
        });

        this.socket.on('match_started', (data: { room: any }) => {
            this.updateRoomState(data.room);
            this.removeOverlay();
            this.startGame(data.room);
        });

        this.socket.on('match_announced', (data: { room: any; player1: { socketId: string; displayName: string }; player2: { socketId: string; displayName: string }; countdown: number }) => {
            this.updateRoomState(data.room);
            this.leftAlias = data.player1.displayName;
            this.rightAlias = data.player2.displayName;
            const matchInfo = document.getElementById('match-info');
            if (matchInfo) matchInfo.classList.add('hidden');
            const canvasWrapper = document.getElementById('canvas-wrapper');
            if (canvasWrapper) canvasWrapper.classList.add('hidden');
            const waitingMsg = document.getElementById('waiting-message');
            if (waitingMsg) waitingMsg.classList.add('hidden');
            this.showCountdownOverlay(`${data.player1.displayName} vs ${data.player2.displayName}`, data.countdown || 3);
        });

        this.socket.on('game_state', (snapshot: any) => {
            this.gameState = snapshot;
            this.renderGame();
        });

        this.socket.on('match_ended', (data: { loser: string; room: any }) => {
            this.showMatchResult(data.loser, false);
            this.updateRoomState(data.room);
        });

        this.socket.on('tournament_finished', (data: { winner: string; room: any }) => {
            this.showMatchResult(data.winner, true);
            this.updateRoomState(data.room);
        });

        this.socket.on('tournament_room_destroyed', (data: { message: string }) => {
            const waitingMsg = document.getElementById('waiting-message');
            if (waitingMsg) {
                waitingMsg.classList.remove('hidden');
                waitingMsg.innerHTML = `
                    <p class="text-yellow-400 text-2xl">Tournament has ended</p>
                    <p class="text-lg mt-2 text-white">You can leave now</p>
                `;
            }
            const canvasWrapper = document.getElementById('canvas-wrapper');
            if (canvasWrapper) canvasWrapper.classList.add('hidden');
            const matchInfo = document.getElementById('match-info');
            if (matchInfo) matchInfo.classList.add('hidden');
        });

        this.socket.on('tournament_error', (data: { error: string }) => {
            this.showError(data.error);
        });
    }

    private updateRoomState(room: TournamentRoomData): void {
        this.roomData = room;
        this.isCreator = this.socket.id === room.creator;
        const roomNameEl = document.getElementById('room-name');
        if (roomNameEl) roomNameEl.textContent = room.name;
        const playerCountEl = document.getElementById('player-count');
        if (playerCountEl) playerCountEl.textContent = room.players.length.toString();
        this.updatePlayerList(room.players);
        const currentPlayer = room.players.find(p => p.socketId === this.socket.id);
        const readyBtn = document.getElementById('ready-btn');
        if (room.status !== 'waiting') {
            readyBtn?.classList.add('hidden');
        } else if (readyBtn && currentPlayer) {
            readyBtn.classList.remove('hidden');
            if (currentPlayer.isReady) {
                readyBtn.textContent = 'Not Ready';
                readyBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                readyBtn.classList.add('bg-gray-600', 'hover:bg-gray-700');
            } else {
                readyBtn.textContent = 'Ready';
                readyBtn.classList.remove('bg-gray-600', 'hover:bg-gray-700');
                readyBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
            }
        }
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            if (this.isCreator && room.status === 'waiting') {
                startBtn.classList.remove('hidden');
            } else {
                startBtn.classList.add('hidden');
            }
        }
    }

    private updatePlayerList(players: TournamentPlayer[]): void {
        const playerListEl = document.getElementById('player-list');
        if (!playerListEl) return;

        playerListEl.innerHTML = players.map((player, index) => {
            const isCreator = this.roomData && player.socketId === this.roomData.creator;
            const readyIcon = player.isReady ? '✓' : '○';
            const readyColor = player.isReady ? 'text-green-400' : 'text-gray-500';
            const eliminatedClass = player.isEliminated ? 'line-through text-red-400' : '';
            const creatorBadge = isCreator ? '<span class="text-xs bg-yellow-600 px-2 py-1 rounded ml-2">Creator</span>' : '';

            return `
                <div class="flex items-center justify-between p-2 bg-gray-800 rounded">
                    <div class="flex items-center gap-2">
                        <span class="${readyColor} font-bold">${readyIcon}</span>
                        <span class="text-white ${eliminatedClass}">${player.displayName}</span>
                        ${creatorBadge}
                    </div>
                    ${player.isEliminated ? '<span class="text-red-400 text-sm">✗</span>' : ''}
                </div>
            `;
        }).join('');
    }

    private toggleReady(): void {
        if (!this.roomData) return;

        const currentPlayer = this.roomData.players.find(p => p.socketId === this.socket.id);
        if (!currentPlayer) return;

        const newReadyState = !currentPlayer.isReady;

        this.socket.emit('tournament_set_ready', {
            roomId: this.roomId,
            ready: newReadyState
        });
    }

    private startTournament(): void {
        if (!this.isCreator) {
            this.showError('Only the creator can start the tournament');
            return;
        }

        this.socket.emit('tournament_start', {
            roomId: this.roomId
        });
    }

    private leaveRoom(): void {
        this.socket.emit('leave_tournament_room', {
            roomId: this.roomId
        });

        this.router.navigate('/');
    }

    private showError(message: string): void {
        const errorEl = document.getElementById('error-message');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
            setTimeout(() => {
                errorEl.classList.add('hidden');
            }, 5000);
        }
    }

    private setupKeyboardControls(): void {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                this.inputState.up = true;
                e.preventDefault();
            }
            if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                this.inputState.down = true;
                e.preventDefault();
            }
            if (this.roomId) {
                io.emit('tournament_player_input', {
                    roomId: this.roomId,
                    up: this.inputState.up,
                    down: this.inputState.down
                });
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                this.inputState.up = false;
            }
            if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                this.inputState.down = false;
            }
            if (this.roomId) {
                io.emit('tournament_player_input', {
                    roomId: this.roomId,
                    up: this.inputState.up,
                    down: this.inputState.down
                });
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
    }

    private startGame(room: any): void {
        const waitingMsg = document.getElementById('waiting-message');
        if (waitingMsg) waitingMsg.classList.add('hidden');
        const canvasWrapper = document.getElementById('canvas-wrapper');
        if (canvasWrapper) canvasWrapper.classList.remove('hidden');
    const matchInfo = document.getElementById('match-info');
    if (matchInfo) matchInfo.classList.add('hidden');
        if (room.currentMatch) {
            const player1 = room.players.find((p: any) => p.socketId === room.currentMatch.player1);
            const player2 = room.players.find((p: any) => p.socketId === room.currentMatch.player2);
            this.leftAlias = player1?.displayName || 'Player 1';
            this.rightAlias = player2?.displayName || 'Player 2';
        }
        this.renderLoop();
    }

    private renderLoop = (): void => {
        this.renderGame();
        requestAnimationFrame(this.renderLoop);
    };

    private renderGame(): void {
        if (!this.ctx || !this.canvas || !this.gameState) return;

        const WIDTH = 640;
        const HEIGHT = 360;
        const { paddles, ball, score } = this.gameState;

        this.ctx.fillStyle = '#0f1220';
        this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
        this.ctx.strokeStyle = '#1e293b';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, WIDTH, HEIGHT);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 18px Arial';
    this.ctx.textAlign = 'center';
    if (this.leftAlias) this.ctx.fillText(this.leftAlias, 80, 25);
    if (this.rightAlias) this.ctx.fillText(this.rightAlias, WIDTH - 80, 25);

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
        const paddleWidth = 12, paddleHeight = 80;
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.shadowColor = '#60a5fa';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(0, paddles.leftY, paddleWidth, paddleHeight);
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.shadowColor = '#94a3b8';
        this.ctx.shadowBlur = 10;
        this.ctx.fillRect(WIDTH - paddleWidth, paddles.rightY, paddleWidth, paddleHeight);
        this.ctx.shadowBlur = 0;
        const ballSize = 10;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = '#f8fafc';
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.ctx.arc(ball.x + ballSize / 2, ball.y + ballSize / 2, ballSize / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.font = 'bold 32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#3b82f6';
        this.ctx.fillText(score.left.toString(), WIDTH / 2 - 40, 40);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(':', WIDTH / 2, 40);
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillText(score.right.toString(), WIDTH / 2 + 40, 40);
    }

    private showMatchResult(playerName: string, isWinner: boolean): void {
        const message = isWinner
            ? `🏆 Tournament Winner: ${playerName}!`
            : `${playerName} has been eliminated`;

        const container = document.getElementById('game-container');
        if (!container) return;

        this.removeOverlay();
        const overlay = document.createElement('div');
        overlay.id = 'overlay';
        overlay.className = 'absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 z-10';
        overlay.innerHTML = `
            <div class="text-white text-2xl font-bold text-center p-8 bg-gray-800 rounded-lg border-2 border-neutral-700">
                <p>${message}</p>
            </div>
        `;
        container.appendChild(overlay);

        setTimeout(() => {
            overlay.remove();

            if (isWinner) {
                const canvasWrapper = document.getElementById('canvas-wrapper');
                if (canvasWrapper) canvasWrapper.classList.add('hidden');
                const matchInfo = document.getElementById('match-info');
                if (matchInfo) matchInfo.classList.add('hidden');
                const waitingMsg = document.getElementById('waiting-message');
                if (waitingMsg) {
                    waitingMsg.classList.remove('hidden');
                    waitingMsg.innerHTML = `
                        <p class="text-green-400 text-2xl">🏆 Tournament Complete! 🏆</p>
                        <p class="text-xl mt-2 text-white">Winner: ${playerName}</p>
                    `;
                }
            }
        }, isWinner ? 5000 : 3000);
    }

    private showCountdownOverlay(matchTitle: string, seconds: number = 3): void {
        const container = document.getElementById('game-container');
        if (!container) return;

        this.removeOverlay();
        const overlay = document.createElement('div');
        overlay.id = 'overlay';
        overlay.className = 'absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-75 z-10';
        overlay.innerHTML = `
            <div class="text-center p-6 bg-gray-800 rounded-lg border-2 border-neutral-700">
                <div class="text-white text-2xl font-bold mb-3">${matchTitle}</div>
                <div id="countdown-num" class="text-6xl font-extrabold text-blue-400">${seconds}</div>
            </div>
        `;
        container.appendChild(overlay);

        let remaining = seconds;
        const numEl = overlay.querySelector('#countdown-num') as HTMLElement | null;
        const timer = setInterval(() => {
            remaining -= 1;
            if (numEl) numEl.textContent = remaining.toString();
            if (remaining <= 0) {
                clearInterval(timer);
                this.removeOverlay();
            }
        }, 1000);
    }

    private removeOverlay(): void {
        const existing = document.getElementById('overlay');
        if (existing) existing.remove();
    }

    cleanup(): void {
        this.socket.off('tournament_room_state');
        this.socket.off('tournament_started');
        this.socket.off('tournament_error');
        this.socket.off('game_state');
        this.socket.off('match_ended');
        this.socket.off('tournament_finished');
        this.socket.off('tournament_room_destroyed');
        this.socket.off('match_announced');
        this.socket.off('match_started');
    }
}
