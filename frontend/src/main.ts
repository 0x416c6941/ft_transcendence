import { DIV_ID, PATHS_TO_ROUTE } from './app.config.js';
import Router from "./router.js";

let router: Router | null = null;
let io: any = null;

document.addEventListener("DOMContentLoaded", (e) => {
	// "/index.html" => "/".
	if (location.pathname === '/index.html') {
		history.replaceState(null, '', '/');
	}
	router = new Router(DIV_ID, PATHS_TO_ROUTE);
	io = (window as any).io(window.location.origin, {
		path: '/api/socket.io/'
	});
});
