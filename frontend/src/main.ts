import { DIV_ID, PATHS_TO_ROUTE } from './app.config.js';
import Router from "./router.js";
import { auth } from './auth.js';
import { io } from './socket.js';

let router: Router | null = null;

document.addEventListener("DOMContentLoaded", (e) => {
	if (location.pathname === '/index.html') {
		history.replaceState(null, '', '/');
	}
	router = new Router(DIV_ID, PATHS_TO_ROUTE);

	let handlersAttached = false;

	const attachHandlers = () => {
		if (handlersAttached) return;
		handlersAttached = true;

		io.on('connect', () => {
			console.log('Connected to Socket.IO as authenticated user');
		});

		io.on('connect_error', (err: Error) => {
			console.error('Socket.IO connection error:', err.message);
		});

		// Store user info when received
		io.on('user_info', (data: { userId: number; username: string }) => {
			io.userId = data.userId;
			io.username = data.username;
		});
	};


	const connectIfNeeded = () => {
		if (!auth.isAuthed()) return;
		if (io.connected) return;

		attachHandlers();
		io.connect(); 	// cookies are sent via withCredentials
		(window as any).userSocket = io;
	}

	const disconnectIfNeeded = () => {
		if (io.connected) {
			io.disconnect();
			console.log('Disconnected from Socket.IO');
		}
			(window as any).userSocket = null;
	};

	// React to auth state changes
	auth.subscribe((state) => {
		if (state.status === 'authenticated') {
			connectIfNeeded();
		} else {
			disconnectIfNeeded();
		}
	});

	// Initial connection if already authenticated
	if (auth.isAuthed()) {
		connectIfNeeded();
	} else {
		disconnectIfNeeded();
	}
});
