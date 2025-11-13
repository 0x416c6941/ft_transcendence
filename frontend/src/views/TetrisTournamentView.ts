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

export default class TetrisTournamentView extends AbstractView {
    private socket = io;
    private roomId: string;
    private roomData: TournamentRoomData | null = null;
    private isCreator: boolean = false;
    private gameState: any = null;
    private keys = { left: false, right: false, down: false, rotate: false, drop: false };
    private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
    private handleKeyUp: ((e: KeyboardEvent) => void) | null = null;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
        this.roomId = pathParams.get('roomId') || '';
    }

    async getHtml(): Promise<string> {
        return `
            <main class="flex-1 min-h-0 flex flex-col bg-gray-800 p-4">
                <div class="flex justify-between items-center mb-4">
                    <h1 class="text-3xl font-bold text-white">Tetris Tournament: <span id="room-name">Loading...</span></h1>
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
                        <div class="hidden" id="canvas-wrapper">
                            <div class="flex gap-6 justify-center">
                                <div class="flex flex-col items-center">
                                    <div class="text-blue-400 font-bold text-lg mb-2" id="player1-label">Player 1</div>
                                    <div class="bg-gray-700 px-4 py-2 rounded-t-lg border-2 border-b-0 border-gray-600">
                                        <div class="text-gray-300 text-sm">
                                            <span class="font-semibold">Score:</span> <span id="player1-score" class="text-yellow-400 font-bold">0</span>
                                        </div>
                                        <div class="text-gray-300 text-sm">
                                            <span class="font-semibold">Lines:</span> <span id="player1-lines" class="text-green-400 font-bold">0</span>
                                        </div>
                                    </div>
                                    <canvas id="tetris-player1" width="300" height="600" 
                                            class="border-2 border-gray-600 bg-black shadow-lg rounded-b-lg"></canvas>
                                </div>
                                <div class="flex flex-col items-center">
                                    <div class="text-gray-100 font-bold text-lg mb-2" id="player2-label">Player 2</div>
                                    <div class="bg-gray-700 px-4 py-2 rounded-t-lg border-2 border-b-0 border-gray-600">
                                        <div class="text-gray-300 text-sm">
                                            <span class="font-semibold">Score:</span> <span id="player2-score" class="text-yellow-400 font-bold">0</span>
                                        </div>
                                        <div class="text-gray-300 text-sm">
                                            <span class="font-semibold">Lines:</span> <span id="player2-lines" class="text-green-400 font-bold">0</span>
                                        </div>
                                    </div>
                                    <canvas id="tetris-player2" width="300" height="600" 
                                            class="border-2 border-gray-600 bg-black shadow-lg rounded-b-lg"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="w-80 bg-gray-900 rounded-lg shadow-lg p-4 flex flex-col">
                        <h2 class="text-xl font-semibold text-white mb-4">Players (<span id="player-count">0</span>/10)</h2>
                        <div id="player-list" class="flex-1 overflow-y-auto space-y-2 mb-4"></div>
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
        document.title = `${APP_NAME} - Tetris Tournament`;
    }

    async setup(): Promise<void> {
        if (!this.socket.connected) {
            this.showError('Not connected to server');
            setTimeout(() => this.router.navigate('/'), 2000);
            return;
        }

        this.setupSocketListeners();

        document.getElementById('leave-btn')?.addEventListener('click', () => this.leaveRoom());
        document.getElementById('ready-btn')?.addEventListener('click', () => this.toggleReady());
        document.getElementById('start-btn')?.addEventListener('click', () => this.startTournament());

        this.setupKeyboardControls();
        this.renderLoop();
    }

    private setupSocketListeners(): void {
        this.socket.on('tetris_tournament_room_state', (data: { room: TournamentRoomData }) => {
            this.updateRoomState(data.room);
        });

        this.socket.on('tetris_tournament_started', (data: { room: any }) => {
            this.updateRoomState(data.room);
        });

        this.socket.on('tetris_match_announced', (data: { room: any; player1: { socketId: string; displayName: string }; player2: { socketId: string; displayName: string }; countdown: number }) => {
            this.updateRoomState(data.room);
            ['match-info', 'canvas-wrapper', 'waiting-message'].forEach(id => 
                document.getElementById(id)?.classList.add('hidden')
            );
            this.showCountdownOverlay(`${data.player1.displayName} vs ${data.player2.displayName}`, data.countdown || 3);
        });

        this.socket.on('tetris_match_started', (data: { room: any }) => {
            this.updateRoomState(data.room);
            this.removeOverlay();
            this.startGame(data.room);
        });

        this.socket.on('tetris_game_state', (snapshot: any) => {
            this.gameState = snapshot;
        });

        this.socket.on('tetris_match_ended', (data: { loser: string; room: any }) => {
            this.showMatchResult(data.loser, false);
            this.updateRoomState(data.room);
        });

        this.socket.on('tetris_tournament_finished', (data: { winner: string; room: any }) => {
            this.showMatchResult(data.winner, true);
            this.updateRoomState(data.room);
        });

        this.socket.on('tetris_tournament_room_destroyed', () => {
            const waitingMsg = document.getElementById('waiting-message');
            if (waitingMsg) {
                waitingMsg.classList.remove('hidden');
                waitingMsg.innerHTML = `
                    <p class="text-yellow-400 text-2xl">Tournament has ended</p>
                    <p class="text-lg mt-2 text-white">You can leave now</p>
                `;
            }
            ['canvas-wrapper', 'match-info'].forEach(id => 
                document.getElementById(id)?.classList.add('hidden')
            );
        });

        this.socket.on('tetris_tournament_error', (data: { error: string }) => {
            this.showError(data.error);
        });
    }

    private updateRoomState(room: TournamentRoomData): void {
        this.roomData = room;
        this.isCreator = this.socket.id === room.creator;
        
        document.getElementById('room-name')!.textContent = room.name;
        document.getElementById('player-count')!.textContent = room.players.length.toString();
        
        this.updatePlayerList(room.players);
        
        const currentPlayer = room.players.find(p => p.socketId === this.socket.id);
        const readyBtn = document.getElementById('ready-btn');
        
        if (room.status !== 'waiting') {
            readyBtn?.classList.add('hidden');
        } else if (readyBtn && currentPlayer) {
            readyBtn.classList.remove('hidden');
            if (currentPlayer.isReady) {
                readyBtn.textContent = 'Not Ready';
                readyBtn.className = 'w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium transition-colors';
            } else {
                readyBtn.textContent = 'Ready';
                readyBtn.className = 'w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors';
            }
        }
        
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.classList.toggle('hidden', !(this.isCreator && room.status === 'waiting'));
        }
    }

    private updatePlayerList(players: TournamentPlayer[]): void {
        const playerListEl = document.getElementById('player-list');
        if (!playerListEl) return;

        playerListEl.innerHTML = players.map(player => {
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
        const currentPlayer = this.roomData?.players.find(p => p.socketId === this.socket.id);
        if (!currentPlayer) return;

        this.socket.emit('tetris_tournament_set_ready', {
            roomId: this.roomId,
            ready: !currentPlayer.isReady
        });
    }

    private startTournament(): void {
        if (!this.isCreator) {
            this.showError('Only the creator can start the tournament');
            return;
        }

        this.socket.emit('tetris_tournament_start', { roomId: this.roomId });
    }

    private leaveRoom(): void {
        this.socket.emit('leave_tetris_tournament_room', { roomId: this.roomId });
        this.router.navigate('/');
    }

    private showError(message: string): void {
        const errorEl = document.getElementById('error-message');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
            setTimeout(() => errorEl.classList.add('hidden'), 5000);
        }
    }

    private setupKeyboardControls(): void {
        this.handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const keyMap: Record<string, keyof typeof this.keys> = {
                'arrowleft': 'left', 'a': 'left',
                'arrowright': 'right', 'd': 'right',
                'arrowdown': 'down', 's': 'down',
                'arrowup': 'rotate', 'w': 'rotate',
                ' ': 'drop'
            };

            const action = keyMap[key];
            if (action && !this.keys[action]) {
                this.keys[action] = true;
                this.sendInput();
                e.preventDefault();
            }
        };

        this.handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const keyMap: Record<string, keyof typeof this.keys> = {
                'arrowleft': 'left', 'a': 'left',
                'arrowright': 'right', 'd': 'right',
                'arrowdown': 'down', 's': 'down',
                'arrowup': 'rotate', 'w': 'rotate',
                ' ': 'drop'
            };

            const action = keyMap[key];
            if (action) {
                this.keys[action] = false;
                this.sendInput();
            }
        };

        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    private sendInput(): void {
        this.socket.emit('tetris_tournament_player_input', {
            roomId: this.roomId,
            ...this.keys
        });
    }

    private startGame(room: any): void {
        document.getElementById('waiting-message')?.classList.add('hidden');
        document.getElementById('canvas-wrapper')?.classList.remove('hidden');
        document.getElementById('match-info')?.classList.remove('hidden');

        if (room.currentMatch) {
            const player1 = room.players.find((p: any) => p.socketId === room.currentMatch.player1);
            const player2 = room.players.find((p: any) => p.socketId === room.currentMatch.player2);
            
            // Set names in match-info (centered above)
            document.getElementById('player1-name')!.textContent = player1?.displayName || 'Player 1';
            document.getElementById('player2-name')!.textContent = player2?.displayName || 'Player 2';
            
            // Set labels directly above each canvas for clarity
            document.getElementById('player1-label')!.textContent = player1?.displayName || 'Player 1';
            document.getElementById('player2-label')!.textContent = player2?.displayName || 'Player 2';
        }
    }

    private renderLoop = (): void => {
        this.renderGame();
        requestAnimationFrame(this.renderLoop);
    };

    private renderGame(): void {
        if (!this.gameState) return;

        ['player1', 'player2'].forEach((player, idx) => {
            const canvas = document.getElementById(`tetris-${player}`) as HTMLCanvasElement;
            const ctx = canvas?.getContext('2d');
            if (!ctx) return;

            const playerState = idx === 0 ? this.gameState.player1 : this.gameState.player2;
            const COLS = 10, ROWS = 20, BLOCK_SIZE = 30;

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw board
            playerState.board.forEach((row: number[], y: number) => {
                row.forEach((cell: number, x: number) => {
                    if (cell > 0) {
                        ctx.fillStyle = this.getColor(cell);
                        ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                        ctx.strokeStyle = '#000';
                        ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                    }
                });
            });

            // Draw current piece
            if (playerState.currentPiece) {
                const { shape, x, y, color } = playerState.currentPiece;
                ctx.fillStyle = this.getColor(color);
                shape.forEach((row: number[], dy: number) => {
                    row.forEach((cell: number, dx: number) => {
                        if (cell > 0) {
                            ctx.fillRect((x + dx) * BLOCK_SIZE, (y + dy) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                            ctx.strokeStyle = '#000';
                            ctx.strokeRect((x + dx) * BLOCK_SIZE, (y + dy) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                        }
                    });
                });
            }

            // Update score and lines
            document.getElementById(`${player}-score`)!.textContent = playerState.score.toString();
            document.getElementById(`${player}-lines`)!.textContent = playerState.linesCleared.toString();
        });
    }

    private getColor(num: number): string {
        const colors = ['#000', '#00f', '#0f0', '#f00', '#00ff', '#ff0', '#f0f', '#0ff', '#f80'];
        return colors[num] || '#fff';
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
        overlay.innerHTML = `<div class="text-white text-2xl font-bold text-center p-8 bg-gray-800 rounded-lg border-2 border-neutral-700">
            <p>${message}</p>
        </div>`;
        container.appendChild(overlay);

        setTimeout(() => {
            overlay.remove();
            if (isWinner) {
                ['canvas-wrapper', 'match-info'].forEach(id => 
                    document.getElementById(id)?.classList.add('hidden')
                );
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
        overlay.innerHTML = `<div class="text-center p-6 bg-gray-800 rounded-lg border-2 border-neutral-700">
            <div class="text-white text-2xl font-bold mb-3">${matchTitle}</div>
            <div id="countdown-num" class="text-6xl font-extrabold text-blue-400">${seconds}</div>
        </div>`;
        container.appendChild(overlay);

        let remaining = seconds;
        const countdownInterval = setInterval(() => {
            const numEl = document.getElementById('countdown-num');
            if (!numEl) return clearInterval(countdownInterval);
            
            if (--remaining > 0) {
                numEl.textContent = remaining.toString();
            } else {
                numEl.textContent = 'GO!';
                clearInterval(countdownInterval);
            }
        }, 1000);
    }

    private removeOverlay(): void {
        document.getElementById('overlay')?.remove();
    }

    cleanup(): void {
        // Remove keyboard event listeners
        if (this.handleKeyDown) {
            document.removeEventListener('keydown', this.handleKeyDown);
            this.handleKeyDown = null;
        }
        if (this.handleKeyUp) {
            document.removeEventListener('keyup', this.handleKeyUp);
            this.handleKeyUp = null;
        }

        // Remove socket listeners
        ['tetris_tournament_room_state', 'tetris_tournament_started', 'tetris_tournament_error',
         'tetris_game_state', 'tetris_match_ended', 'tetris_tournament_finished',
         'tetris_tournament_room_destroyed', 'tetris_match_announced', 'tetris_match_started'
        ].forEach(event => this.socket.off(event));
    }
}
