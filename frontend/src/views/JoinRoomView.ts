import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';

export default class JoinRoomView extends AbstractView {
    private socket: any = null;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
            <main class="flex-1 min-h-0 flex flex-col justify-center items-center bg-neutral-200 dark:bg-neutral-900">
                <h1 class="txt-light-dark-sans text-3xl mb-4">Join Room - ${APP_NAME}</h1>
                <div class="bg-white dark:bg-neutral-800 p-6 rounded shadow-lg w-full max-w-md">
                    <div id="room-list" class="mb-4"></div>
                    <form id="join-room-form">
                        <div class="mb-4">
                            <label class="block text-sm font-medium">Room ID</label>
                            <input type="text" id="join-room-id" class="w-full p-2 border rounded" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium">Password</label>
                            <input type="password" id="join-room-password" class="w-full p-2 border rounded" required>
                        </div>
                        <div class="flex justify-between">
                            <button type="button" id="back-btn" class="px-4 py-2 bg-gray-500 text-white rounded">Back</button>
                            <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded">Join</button>
                        </div>
                    </form>
                </div>
            </main>
        `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Join Room`;
    }

    setup(): void {
        this.socket = io;

        this.socket.emit('list_rooms');

        document.getElementById('back-btn')?.addEventListener('click', () => {
            this.router.navigate('/');
        });

        document.getElementById('join-room-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const roomId = (document.getElementById('join-room-id') as HTMLInputElement).value;
            const password = (document.getElementById('join-room-password') as HTMLInputElement).value;
            this.socket.emit('join_room', { roomId, password });
        });

        this.socket.on('rooms_list', (rooms: any[]) => {
            const roomList = document.getElementById('room-list');
            if (roomList) {
                roomList.innerHTML = '<h3 class="text-lg mb-2">Available Rooms</h3>';
                rooms.forEach(room => {
                    const roomDiv = document.createElement('div');
                    roomDiv.className = 'p-2 border rounded mb-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700';
                    roomDiv.innerHTML = `
                        <p><strong>${room.name}</strong> - Status: ${room.status}</p>
                        <p>Players: ${room.players}, Spectators: ${room.spectators}</p>
                    `;
                    roomDiv.addEventListener('click', () => {
                        (document.getElementById('join-room-id') as HTMLInputElement).value = room.id;
                    });
                    roomList.appendChild(roomDiv);
                });
            }
        });

        this.socket.on('room_joined', (data: any) => {
            this.router.navigate(`/pong?roomId=${data.id}`);
        });

        this.socket.on('room_join_failed', (data: { reason: string }) => {
            alert(data.reason);
        });
    }

    cleanup(): void {
        if (this.socket) {
            this.socket.off('rooms_list');
            this.socket.off('room_joined');
            this.socket.off('room_join_failed');
            this.socket = null;
        }
    }
}
