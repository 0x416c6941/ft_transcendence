import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';
import { validateRoomField } from '../utils/validators.js';

export default class PongRoomsView extends AbstractView {
    private roomsList: Array<{ name: string; playerCount: number; maxPlayers: number; hasPassword: boolean; status: string }> = [];
    private socket = io;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
            <main class="flex-1 min-h-0 flex flex-col justify-center items-center bg-neutral-200 dark:bg-neutral-900 p-4">
                <h1 class="txt-light-dark-sans text-3xl mb-6">Tournament Room - ${APP_NAME}</h1>

                <div class="flex gap-6 w-full max-w-5xl">
                    <!-- Left side: Room form -->
                    <div class="bg-white dark:bg-neutral-800 p-8 rounded-lg shadow-lg w-full max-w-md">
                        <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Enter Room</h2>
                        <form id="room-form" class="space-y-6">
                            <div>
                                <label for="room-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Room Name
                                </label>
                                <input
                                    type="text"
                                    id="room-name"
                                    name="room-name"
                                    maxlength="15"
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter room name"
                                    required
                                />
                            </div>
                            <div>
                                <label for="room-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Password (optional)
                                </label>
                                <input
                                    type="password"
                                    id="room-password"
                                    name="room-password"
                                    maxlength="16"
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter password (if required)"
                                />
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Set password to create private room, or enter password to join protected room
                                </p>
                            </div>
                            <div id="error-message" class="text-red-600 text-sm hidden"></div>
                            <button
                                type="button"
                                id="enter-room-btn"
                                class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 opacity-50 cursor-not-allowed"
                                disabled
                            >
                                Enter Room
                            </button>
                        </form>
                        <div class="mt-6 text-center">
                            <button type="button" id="back-btn" class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors">
                                Back to Home
                            </button>
                        </div>
                    </div>

                    <!-- Right side: Available rooms list -->
                    <div class="bg-white dark:bg-neutral-800 p-8 rounded-lg shadow-lg flex-1">
                        <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Available Rooms</h2>
                        <div id="rooms-list" class="space-y-2 max-h-96 overflow-y-auto">
                            <p class="text-gray-500 dark:text-gray-400 text-center py-8">Loading rooms...</p>
                        </div>
                    </div>
                </div>
            </main>
        `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Tournament Room`;
    }

    setup(): void {
        const enterRoomBtn = document.getElementById('enter-room-btn') as HTMLButtonElement;
        const backBtn = document.getElementById('back-btn');
        const errorMessage = document.getElementById('error-message');
        const roomNameInput = document.getElementById('room-name') as HTMLInputElement;
        const passwordInput = document.getElementById('room-password') as HTMLInputElement;

        this.loadRoomsList();

        const refreshInterval = setInterval(() => {
            this.loadRoomsList();
        }, 3000);

        (this as any).refreshInterval = refreshInterval;

        const handleValidation = () => {
            const roomNameResult = validateRoomField(roomNameInput.value, 'Room name');
            const passwordResult = validateRoomField(passwordInput.value, 'Password');

            let finalError: string | null = null;
            if (!roomNameResult.status) {
                finalError = roomNameResult.err_msg;
            } else if (!passwordResult.status) {
                finalError = passwordResult.err_msg;
            }

            if (finalError) {
                this.showError(finalError);
                enterRoomBtn.disabled = true;
                enterRoomBtn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                errorMessage?.classList.add('hidden');
                enterRoomBtn.disabled = false;
                enterRoomBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        };

        roomNameInput.addEventListener('input', handleValidation);
        passwordInput.addEventListener('input', handleValidation);

        enterRoomBtn?.addEventListener('click', () => {
            handleValidation();
            if (enterRoomBtn.disabled) return;
            
            this.enterRoom(roomNameInput.value.trim(), passwordInput.value.trim());
        });

        // Back button handler
        backBtn?.addEventListener('click', () => {
            this.router.navigate('/');
        });

        // Initial validation
        handleValidation();
    }

    private showError(message: string): void {
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.remove('hidden');
        }
    }

    private loadRoomsList(): void {
        if (!this.socket.connected) {
            setTimeout(() => {
                if (!this.socket.connected) {
                    this.showRoomsError('Not connected to server');
                }
            }, 1000);
            return;
        }

        this.socket.emit('get_tournament_rooms', (rooms: Array<{ name: string; playerCount: number; maxPlayers: number; hasPassword: boolean; status: string }>) => {
            this.roomsList = rooms;
            this.renderRoomsList();
        });
    }

    private renderRoomsList(): void {
        const roomsListEl = document.getElementById('rooms-list');
        if (!roomsListEl) return;

        if (this.roomsList.length === 0) {
            roomsListEl.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-8">No rooms available. Create one!</p>';
            return;
        }

        roomsListEl.innerHTML = this.roomsList.map(room => {
            const statusColor = room.status === 'waiting' ? 'text-green-400' : room.status === 'in_progress' ? 'text-yellow-400' : 'text-gray-400';
            const statusText = room.status === 'waiting' ? 'Waiting' : room.status === 'in_progress' ? 'In Progress' : 'Finished';
            const isFull = room.playerCount >= room.maxPlayers;
            const lockText = room.hasPassword ? 'Locked' : 'Not Locked';
            const lockColor = room.hasPassword ? 'text-yellow-600 dark:text-yellow-500' : 'text-green-600 dark:text-green-500';

            return `
                <button class="w-full p-4 bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-left ${isFull ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
                        data-room-name="${room.name}"
                        ${isFull ? 'disabled' : ''}>
                    <div class="flex justify-between items-center">
                        <div class="flex-1">
                            <div class="flex items-center gap-3">
                                <span class="font-semibold text-lg text-gray-800 dark:text-white">${room.name}</span>
                                <span class="${lockColor} text-sm font-medium">${lockText}</span>
                            </div>
                            <div class="flex gap-6 mt-2 text-sm">
                                <span class="text-gray-600 dark:text-gray-300">
                                    Players: ${room.playerCount}/${room.maxPlayers}
                                    ${isFull ? '<span class="text-red-500 ml-1 font-semibold">(Full)</span>' : ''}
                                </span>
                                <span class="${statusColor} font-medium">${statusText}</span>
                            </div>
                        </div>
                    </div>
                </button>
            `;
        }).join('');

        document.querySelectorAll('[data-room-name]').forEach(button => {
            button.addEventListener('click', (e) => {
                const roomName = (button as HTMLElement).dataset.roomName;
                if (roomName && !(button as HTMLButtonElement).disabled) {
                    const room = this.roomsList.find(r => r.name === roomName);

                    if (room?.hasPassword) {
                        this.fillRoomName(roomName);
                        const passwordInput = document.getElementById('room-password') as HTMLInputElement;
                        if (passwordInput) {
                            passwordInput.focus();
                        }
                    } else {
                        this.enterRoom(roomName, '');
                    }
                }
            });
        });
    }

    private fillRoomName(roomName: string): void {
        const roomNameInput = document.getElementById('room-name') as HTMLInputElement;
        if (roomNameInput) {
            roomNameInput.value = roomName;
            roomNameInput.focus();
        }
    }

    private showRoomsError(message: string): void {
        const roomsListEl = document.getElementById('rooms-list');
        if (roomsListEl) {
            roomsListEl.innerHTML = `<p class="text-red-500 text-center py-8">${message}</p>`;
        }
    }

    private enterRoom(name: string, password: string): void {
        if (!this.socket.connected) {
            this.showError('Not connected to server. Please try again.');
            return;
        }

        this.setButtonEnabled(false);

        this.socket.emit('enter_tournament_room', { name, password }, (response: { success: boolean; roomId?: string; error?: string }) => {
            this.setButtonEnabled(true);

            if (response.success && response.roomId) {
                this.router.navigate(`/tournament-lobby/${response.roomId}`);
            } else {
                this.showError(response.error || 'Failed to enter room');
            }
        });
    }

    private setButtonEnabled(enabled: boolean): void {
        const enterBtn = document.getElementById('enter-room-btn') as HTMLButtonElement;

        if (enterBtn) enterBtn.disabled = !enabled;

        if (!enabled) {
            enterBtn?.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            enterBtn?.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    cleanup(): void {
        // Clear auto-refresh interval
        if ((this as any).refreshInterval) {
            clearInterval((this as any).refreshInterval);
        }
    }
}
