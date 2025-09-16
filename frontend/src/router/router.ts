/**
 * XXX: Thanks to @dcode-youtube for explaination
 * on how to implement a router for SPA w/o frameworks!
 */
/**
 * @fileoverview Router for our SPA.
 * 	TL;DR: When going to a new page through hyperlink,
 * 		use `navigateTo()` (wrapper to add a URL to history and call `router()`);
 * 		when scrolling through history e.g. with window navigation arrows,
 * 		use `router()`.
 */

import AbstractView from "./views/AbstractView.js";
import Home from "./views/Home.js";
import RegexTest from "./views/RegexTest.js";
import NotFound from "./views/NotFound.js";

/**
 * @interface Route
 * Definition of route for `router` to handle.
 */
interface Route {
	/**
	 * @property {string} path
	 * URL path to route. May include named parameters, such as `:id`.
	 */
	path: string;

	/**
	 * @property {new (params: Record<string, string>) => AbstractView}
	 * Constructor for an AbstractView, that would accept
	 * object with URL parameters and return a view's instance.
	 */
	viewBuilder: new (params: Record<string, string>) => AbstractView;
}

/**
 * @var {readonly Route[]}
 * Array of paths (locations) and view's constructor for them.
 */
const ROUTES: Route[] = [
	{ path: "/", viewBuilder: Home },
	{ path: "/index.html", viewBuilder: Home },
	{ path: "/regex_test/:number", viewBuilder: RegexTest }
] as const;

/**
 * @interface PotentialMatch
 * Definition of a result of a check if `route` matches the requested URL.
 */
interface PotentialMatch {
	/**
	 * @property {Route} route
	 * A route.
	 */
	route: Route;

	/**
	 * @property {RegExpMatchArray | null}
	 * @brief The result of the regex match.
	 * @details If the match is successful,
	 * 		the array's first element contains the full matched path,
	 * 		and subsequent elements contain the values of any captured parameters.
	 * 		This property is `null` if no match was found.
	 */
	result: RegExpMatchArray | null;
}

/**
 * @interface SuccessfulMatch
 * Successful route match with a guaranteed result.
 * Use it to guarantee that `result` is a non-null property.
 * @details This interface is a type-safe representation of a matched route.
 * 		Useful for `getParams()` function.
 */
interface SuccessfulMatch {
	/**
	 * @property {Route} route
	 * A route.
	 */
	route: Route;

	/**
	 * @property {RegExpMatchArray}
	 * The non-null result of the regex match.
	 */
	result: RegExpMatchArray;
}

/**
 * @function pathToRegex
 * @brief Converts a URL path string into a regular expression.
 * @details This function takes a URL path,
 * 		which may contain named parameters (e.g., `:id`),
 * 		and transforms it into a `RegExp` object.
 * @param {string} path	The URL path string to convert.
 * @return {RegExp} A regular expression for matching the path.
 */
const pathToRegex = (path: string) => new RegExp("^" + path.replace(/\//g, "\\/").replace(/:\w+/g, "(.+)") + "$");

/**
 * @function getParams
 * @brief Extracts and maps URL parameters from a matched route.
 * @details This function takes a successful `SuccessfulMatch` object
 * 		and parses the captured parameter values from the `result` array.
 * 		It maps these values to their corresponding named keys,
 * 		which are extracted from the route's path,
 * 		and returns a key-value object.
 * @param {SuccessfulMatch} match	A successful match object containing the route
 * 						and regex result.
 * @returns {Record<string, string>} An object where keys are parameter names
 * 					and values are the captured URL segments.
 */
const getParams = (match: SuccessfulMatch): Record<string, string> => {
	const values = match.result.slice(1);
	const keys = Array.from(match.route.path.matchAll(/:(\w+)/g)).map(result => result[1]);

	return Object.fromEntries(keys.map((key, i) => {
		return [key, values[i]];
	}));
}

/**
 * @function router
 * Route an SPA to a path (location) stored in `location.pathname`,
 * which gets updated whenever we click the hyperlink.
 * @return {Promise<void>} A promise that resolves when the view has been rendered.
 */
export default async function router() {
	const potentialMatches: PotentialMatch[] = ROUTES.map((route): PotentialMatch => {
		return {
			route: route,
			result: location.pathname.match(pathToRegex(route.path))
		};
	});

	const match: PotentialMatch | undefined = potentialMatches.find(potentialMatch => potentialMatch.result !== null);
	let view: AbstractView;

	if (match !== undefined) {
		view = new match.route.viewBuilder(getParams(match as SuccessfulMatch));
	}
	else {
		view = new NotFound({ });
	}
	document.querySelector("#app")!.innerHTML = await view.getHtml();
};


/**
 * @function navigateTo
 * A wrapper for `router()` and also to add a new path (location)
 * to history for the browser's window's navigation arrows to work.
 */
export function navigateTo(url: string): void {
	history.pushState(null, "", url);
	router();
}
