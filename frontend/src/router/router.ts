/**
 * XXX: Thanks to @dcode-youtube for explaination
 * on how to implement a router for SPA w/o frameworks!
 */

interface Route {
	path: string;
	view: Function;
}

/**
 * @var {readonly string[]}
 * Array of paths we can route an SPA to.
 */
const ROUTES = [
	"/",
	"/about"
] as const;

export default async function router() {
	const potentialMatches = ROUTES.map(path => {
		return {
			route: path,
			isMatch: location.pathname === path,
		};
	});

	let match = potentialMatches.find(potentialMatch => potentialMatch.isMatch);

	if (match === undefined) {
		// Handle this.
	}
	console.log(potentialMatches);
};
