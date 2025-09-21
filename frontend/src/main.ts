import { DIV_ID, PATHS_TO_ROUTE } from './app.config.js';
import Router from "./router.js";

let router: Router | null = null;

document.addEventListener("DOMContentLoaded", (e) => {
	// "/index.html" => "/".
	history.replaceState(null, '', '/');
	router = new Router(DIV_ID, PATHS_TO_ROUTE);
});
