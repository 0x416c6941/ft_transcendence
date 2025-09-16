import router, { navigateTo } from "./router/router.js";

// First load.
document.addEventListener("DOMContentLoaded", () => {
	router();
	document.body.addEventListener("click", e => {
		if (e.target instanceof Element && e.target.matches("[data-link]")) {
			e.preventDefault();
			navigateTo((e.target as HTMLAnchorElement).href);
		}
	});
});
// Navigation arrows.
window.addEventListener("popstate", router);
