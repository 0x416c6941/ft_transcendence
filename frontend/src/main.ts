import { DIV_ID, PATHS_TO_ROUTE } from './app.config.js';
import Router from "./router.js";
/* Execute all code in './socket.js'.
 * To use sockets in other files, use this:
 * "import { io } from './socket.js';" */
import './socket.js';

let router: Router | null = null;

document.addEventListener("DOMContentLoaded", (e) => {
	if (location.pathname === '/index.html') {
		history.replaceState(null, '', '/');
	}
	router = new Router(DIV_ID, PATHS_TO_ROUTE);

	// Connect to Socket.IO if user is logged in
	const hasAccessToken = document.cookie.split(';').some(cookie => cookie.trim().startsWith('accessToken='));
	if (hasAccessToken) {
		const token = document.cookie.split(';')
			.find(c => c.trim().startsWith('accessToken='))
			?.split('=')[1];
		
		if (token) {
			const socket = (window as any).io(window.location.origin, {
				path: '/api/socket.io/',
				auth: {
					token: token
				}
			});

			socket.on('connect', () => {
				console.log('Connected to Socket.IO as authenticated user');
			});

			socket.on('connect_error', (err: Error) => {
				console.error('Socket.IO connection error:', err.message);
			});

			// Store user info when received
			socket.on('user_info', (data: { userId: number; username: string }) => {
				socket.userId = data.userId;
				socket.username = data.username;
			});

			// Store socket globally for access from components
			(window as any).userSocket = socket;
		}
	}
});
