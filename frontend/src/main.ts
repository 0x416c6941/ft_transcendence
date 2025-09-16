import router, { navigateTo } from "./router/router.js";

// Event happens only on the first load of SPA.
document.addEventListener("DOMContentLoaded", () => {
	// Initial view.
	router();
	// Clicks on DOM elements with "data-link" attribute.
	document.body.addEventListener("click", e => {
		if (e.target instanceof Element && e.target.matches("[data-link]")) {
			e.preventDefault();
			navigateTo((e.target as HTMLAnchorElement).href);
		}
	});
});
// Navigation arrows.
window.addEventListener("popstate", router);
