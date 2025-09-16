/**
 * XXX: Thanks to @dcode-youtube for explaination
 * on how to implement a router for SPA w/o frameworks!
 */

import AbstractView from "./views/AbstractView.js";
import Home from "./views/Home.js";
import NotFound from "./views/NotFound.js";

interface Route {
	path: string;
	viewBuilder: new () => AbstractView;
}

/**
 * @var {readonly string[]}
 * Array of paths we can route an SPA to.
 */
const ROUTES: Route[] = [
	{ path: "/", viewBuilder: Home },
	{ path: "/index.html", viewBuilder: Home }
] as const;

export default async function router() {
	const potentialMatches = ROUTES.map(route => {
		return {
			route: route,
			// TODO: Handle with regex arguments for a path.
			isMatch: location.pathname === route.path,
		};
	});

	let match = potentialMatches.find(potentialMatch => potentialMatch.isMatch);
	let view: AbstractView;

	if (match === undefined) {
		view = new NotFound();
		// Handle this.
	}
	else {
		view = new match.route.viewBuilder();
	}
	document.querySelector("#app")!.innerHTML = await view.getHtml();
};

export function navigateTo(url: string) {
	history.pushState(null, "", url);
	router();
}
