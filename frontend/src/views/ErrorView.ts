// ./views/ErrorView.ts
import Router from "../router.js";
import AbstractView from './AbstractView.js';
import { APP_NAME } from '../app.config.js';

export default class ErrorView extends AbstractView {
	private static readonly _REDIRECT_DELAY_MS = 2500;

	/**
	 * @property {static readonly string} _DIV_REDIRECT_HOME_ID
	 * @private
	 * ID of the "div" container that would serve as a button
	 * to redirect user to the home page (view).
	 */
	private static readonly _DIV_REDIRECT_HOME_ID: string = 'redirect-home';

	/** hold the auto-redirect timer for clear it in cleanup() */
	private _timer: number | null = null;

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

  	setDocumentTitle(): void {
    		const code = this.queryParams.get('error_code') || 'Error';
    		document.title = `${APP_NAME} - ${code}`;
  	}

  	async getHtml(): Promise<string> {
    		const code = this.queryParams.get('error_code') || 'UNKNOWN_ERROR';
    		const message = this.queryParams.get('error_message') || 'An error occurred.';

  		return `
  		  <main class="flex-1 min-h-0 flex flex-col justify-center items-center bg-neutral-200 dark:bg-neutral-900">
  		    <div class="flex flex-1 w-full justify-center items-center flex-col"></div>

  		    <h1 class="txt-light-dark-sans text-5xl font-bold mb-4 tracking-wide select-none">
  		      Error ${code} - ${message}
  		    </h1>
  		    <p class="txt-light-dark-sans text-base mb-4 opacity-80 select-none">
  		      You will be redirected to the Home page shortly…
  		    </p>

  		    <div class="flex flex-1 w-full justify-center items-center flex-col">
  		      <a id="${ErrorView._DIV_REDIRECT_HOME_ID}"
  		         href="/"
  		         data-link
  		         class="select-none flex h-1/5 w-1/5 min-w-[220px] justify-center items-center rounded-4xl bg-sky-500 shadow-xl shadow-neutral-500/50 hover:brightness-110 active:brightness-95 transition-colors">
  		        <span class="text-neutral-200 font-sans text-1xl">Go Home now</span>
  		      </a>
  		    </div>
  		  </main>
  		`;
	}


  	setup(): void {
  	  	// click handler (for users who don't want to wait)
  	  	document.getElementById(ErrorView._DIV_REDIRECT_HOME_ID)?.addEventListener('click', this._redirectHome);

  	  	// auto-redirect after delay
  	  	this._timer = window.setTimeout(this._redirectHome, ErrorView._REDIRECT_DELAY_MS);
  	}

  	cleanup(): void {
  	  	document.getElementById(ErrorView._DIV_REDIRECT_HOME_ID)?.removeEventListener('click', this._redirectHome);

  	  	if (this._timer !== null) {
  	    		clearTimeout(this._timer);
  	    		this._timer = null;
  	  	}
  	}
}
