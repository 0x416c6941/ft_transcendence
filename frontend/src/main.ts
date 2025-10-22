import { DIV_ID, PATHS_TO_ROUTE } from './app.config.js';
import Router from "./router.js";
import { io } from './socket.js';

let router: Router | null = null;

document.addEventListener("DOMContentLoaded", (e) => {
	// "/index.html" => "/".
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
			io.auth = { token };
			io.connect();

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
		}
	}
});
