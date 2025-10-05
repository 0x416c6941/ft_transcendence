import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

/**
 * @class NotFoundView
 * 404 "Not Found" view.
 */
export default class NotFoundView extends AbstractView {
	/**
	 * @property {static readonly string} _DIV_REDIRECT_HOME_ID
	 * @private
	 * ID of the "div" container that would serve as a button
	 * to redirect user to the home page (view).
	 */
	private static readonly _DIV_REDIRECT_HOME_ID: string = 'redirect-home';

	/**
	 * @method
	 * @private
	 * Redirect user to the home page (view).
	 * @remarks This method must be an arrow function, otherwise
	 * 		content of "this" will be lost
	 * 		upon calling the method from the event listener.
	 * 		This method could also be a function returning
	 * 		a closure with the link to "this" class preserved
	 * 		in a separate variable.
	 */
	private _redirectHome = (): void => {
		this.router.navigate('/');
	};

	constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
		super(router, pathParams, queryParams);
	}

	async getHtml(): Promise<string> {
		return `
			<main class="h-screen flex justify-center items-center flex-col bg-neutral-200 dark:bg-neutral-900">
				<div class="flex flex-1 w-full justify-center items-center flex-col"></div>
				<p class="txt-light-dark-sans text-4xl select-none">404 - Not Found</p>
				<div class="flex flex-1 w-full justify-center items-center flex-col">
					<div id="${NotFoundView._DIV_REDIRECT_HOME_ID}" class="select-none flex h-1/5 w-1/5 justify-center items-center rounded-4xl bg-sky-500 shadow-xl shadow-neutral-500/50">
						<p class="txt-light-dark-sans text-1xl">Return to Home Page</p>
					</div>
				</div>
			</main>
		`;
	}

	setDocumentTitle(): void {
		document.title = APP_NAME.concat(' - 404');
	}

	setup(): void {
		document.getElementById(NotFoundView._DIV_REDIRECT_HOME_ID)?.addEventListener("click", this._redirectHome);
	}

	cleanup(): void {
		document.getElementById(NotFoundView._DIV_REDIRECT_HOME_ID)?.removeEventListener("click", this._redirectHome);
	}
}
