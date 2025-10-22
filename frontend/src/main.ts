import { DIV_ID, PATHS_TO_ROUTE } from './app.config.js';
import Router from "./router.js";
/* Execute all code in './socket.js'.
 * To use sockets in other files, use this:
 * "import { io } from './socket.js';" */
import './socket.js';
import { auth } from './auth.js';

let router: Router | null = null;

document.addEventListener("DOMContentLoaded", (e) => {
	if (location.pathname === '/index.html') {
		history.replaceState(null, '', '/');
	}
	router = new Router(DIV_ID, PATHS_TO_ROUTE);

	// ensure auth state is hydrated (cookies sent automatically)
	void auth.bootstrap();

	const connectIfNeeded = () => {
		if (!auth.isAuthed()) return;

		if((window as any).userSocket?.connected) return; // already connected

		const socket = (window as any).io(window.location.origin, {
			path: '/api/socket.io/',
			withCredentials: true, // send cookies
		});

		socket.on('connect', () => {
			console.log('Connected to Socket.IO as authenticated user');
		});

		socket.on('connect_error', (err: Error) => {
			console.error('Socket.IO connection error:', err.message);
		});

		(window as any).userSocket = socket;
	};

	const disconnectIfNeeded = () => {
		const socket = (window as any).userSocket;
		if (socket && socket.connected) {
			socket.disconnect();
			(window as any).userSocket = null;
			console.log('Disconnected from Socket.IO');
		}
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
