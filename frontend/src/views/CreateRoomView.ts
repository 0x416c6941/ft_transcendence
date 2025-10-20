import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import { io } from '../socket.js';

export default class CreateRoomView extends AbstractView {
    private socket: any = null;

    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
            <main class="h-screen flex justify-center items-center flex-col bg-neutral-200 dark:bg-neutral-900">
                <h1 class="txt-light-dark-sans text-3xl mb-4">Create Room - ${APP_NAME}</h1>
                <div class="bg-white dark:bg-neutral-800 p-6 rounded shadow-lg w-full max-w-md">
                    <form id="create-room-form">
                        <div class="mb-4">
                            <label class="block text-sm font-medium">Room Name</label>
                            <input type="text" id="room-name" class="w-full p-2 border rounded" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium">Password</label>
                            <input type="password" id="room-password" class="w-full p-2 border rounded" required>
                        </div>
                        <div class="mb-4">
                            <label class="block text-sm font-medium">Max Players</label>
                            <input type="number" id="max-players" class="w-full p-2 border rounded" min="2" max="10" value="4" required>
                        </div>
                        <div class="flex justify-between">
                            <button type="button" id="back-btn" class="px-4 py-2 bg-gray-500 text-white rounded">Back</button>
                            <button type="submit" class="px-4 py-2 bg-green-500 text-white rounded">Create</button>
                        </div>
                    </form>
                </div>
            </main>
        `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Create Room`;
    }

    setup(): void {
        this.socket = io;

        document.getElementById('back-btn')?.addEventListener('click', () => {
            this.router.navigate('/');
        });

        document.getElementById('create-room-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = (document.getElementById('room-name') as HTMLInputElement).value;
            const password = (document.getElementById('room-password') as HTMLInputElement).value;
            const maxPlayers = parseInt((document.getElementById('max-players') as HTMLInputElement).value);
            this.socket.emit('create_room', { name, password, maxPlayers });
        });

        this.socket.on('room_created', (data: { roomId: string }) => {
            this.router.navigate(`/pong?roomId=${data.roomId}`);
        });
    }

    cleanup(): void {
        if (this.socket) {
            this.socket.off('room_created');
            this.socket = null;
        }
    }
}