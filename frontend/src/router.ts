/* Thanks to @dcode-youtube for explanation
 * on how to implement a router for SPA w/o frameworks! */

/**
 * @fileoverview Router for our SPA.
 */

import AbstractView from './views/AbstractView.js';
import NotFoundView from './views/NotFoundView.js';
import { auth } from './auth.js';
import { mountHeader } from './header.js';

// Alias to avoid redundant typing...
type AbstractViewConstructor = new (router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) => AbstractView;

/**
 * @interface PathToRegister
 * Interface to easily handle "path"/abstract view constructor pairs
 * (basically routes).
 */
export interface PathToRegister {
	/**
	 * @property {string} path
	 * Path to handle for our router.
	 */
	path: string;

	/**
	 * @property {AbstractViewConstructor} constructor
	 * Constructor for the view (page) on `path`.
	 */
	constructor: AbstractViewConstructor;
	guard?: 'auth' | 'guest';
}

/**
 * @class Router
 */
export default class Router {
	/**
	 * @property {HTMLElement} _root
	 * @private
	 * Reference to the HTML element in the document,
	 * where our application will be drawn.
	 */
	private _root: HTMLElement;

	/**
	 * @property {PathToRegister[]} _routes
	 * @private
	 * Array of routes to handle.
	 */
	private _routes: PathToRegister[];

	/**
	 * @property {AbstractView | null} _currentView
	 * @private
	 * Currently rendered view. `null` on instantiation.
	 */
	private _currentView: AbstractView | null;

	private _bootstrapped = false;

	private _navigationBlocked = false;

	/**
	 * @method
	 * @remarks Call the constructor only after the DOM has been loaded.
	 * @param {string} rootId		ID of the root HTML element
	 * 					for our SPA to be drawn on.
	 * @param {PathToRegister[]} routes	Array of routes
	 * 					and constructors of views
	 * 					for them.
	 */
	constructor(rootId: string, routes: PathToRegister[]) {
		// `this._root` can't be null.
		const root = document.getElementById(rootId);
		if (root === null) {
			throw new Error("Router's root element not found.");
		}
		this._root = root;

		this._routes = routes;

		this._currentView = null;

		// Clicks (potentially on hyperlinks).
		document.body.addEventListener('click', (e) => {
			/* We take it as granted that only hyperlinks
			* would contain a custom "data-link" attribute. */
			if (e.target instanceof HTMLElement &&
				e.target.matches('[data-link]')) {
					e.preventDefault();
					this.navigate((e.target as HTMLAnchorElement).href);
				}
			});
		// Window navigation arrows.
		window.addEventListener('popstate', () => this._render());

		this._render();
	}

	/**
	 * @method
	 * Open a view and add it to browser's history.
	 * @remarks `path` may contain URL parameters, such as ":id".
	 * @param {string} path	Path to a view.
	 */
	navigate(path: string): void {
		if (this._navigationBlocked) {
			return;
		}
		history.pushState({}, '', path);
		this._render();
	}

	/**
	 * @method
	 * Block/unblock navigation during critical moments (e.g., countdown)
	 * @param {boolean} blocked	Whether to block navigation
	 */
	setNavigationBlocked(blocked: boolean): void {
		this._navigationBlocked = blocked;
	}

	/**
	 * @method
	 * @private
	 * Render a view at the path currently stored in `location.pathname`.
	 * @return {Promise<void>}	Gets resolved as soon
	 * 				as SPA view is completely updated.
	 */
	private async _render(): Promise<void> {
		// Ensure auth state once (prevents header flicker & correct guards)
    		if (!this._bootstrapped) {
    		  	await auth.bootstrap();
    		  	this._bootstrapped = true;
    		  	// mount reactive header once DOM exists (index.html header already present)
    		  	mountHeader(this);
    		}
		/* An anonymous function to get a regex
		 * for a routing path to see
		 * if `location.pathname` matches it. */
		const pathToRegex = (path: string): RegExp => new RegExp('^' + path.replace(/\//g, '\\/').replace(/:\w+/g, '(.+)') + '$');
		// To map keys to their values.
		const mapPathParams = (keys: string[], values: string[]): Map<string, string> => {
			const map: Map<string, string> = new Map();

			if (keys.length != values.length) {
				throw new Error('keys.length != values.length');
			}
			for (let i = 0; i < keys.length; i++) {
				map.set(keys[i], values[i]);
			}
			return map;
		}

		let newView: AbstractView | null = null;
		const matches: PathToRegister[] = this._routes.filter((route) => {
			return location.pathname.match(pathToRegex(route.path)) !== null;
		});

		if (matches.length !== 0) {
			const route = matches[0];

			// Check guard
			if (route.guard === 'auth' && !auth.isAuthed()) {
				this.navigate('/login');
				return this._render();
			}

			if (route.guard === 'guest' && auth.isAuthed()) {
				history.replaceState({}, '', '/');
				return this._render();
			}

			/* Getting rid of the whole string
			 * and leaving only the capture group. */
			const keys = [...route.path.matchAll(/:(\w+)/g)].map((keys) => keys[1]);
			// The same story.
			const values = location.pathname.match(pathToRegex(route.path))!.slice(1);

			newView = new route.constructor(this,
					mapPathParams(keys, values), new URLSearchParams(window.location.search));
		}
		else {
			// 404 doesn't need any path or query parameters.
			newView = new NotFoundView(this, new Map(), new URLSearchParams());
		}
		if (matches.length > 1) {
			console.warn(`${location.pathname} meets more than one routing path.`);
		}
		this._root.innerHTML = await newView.getHtml();
		newView.setDocumentTitle();
		this._currentView?.cleanup();
		this._currentView = newView;
		this._currentView.setup();
	}
}
