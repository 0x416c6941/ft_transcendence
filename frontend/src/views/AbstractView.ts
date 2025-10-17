import Router from "../router.js";

/**
 * @class AbstractView
 * @brief An abstract view class.
 * @details "View" is basically a page in our SPA.
 */
export default class AbstractView {
	/**
	 * @property {Router} router
	 * @protected
	 * @brief A link to router to be able to redirect one view to another view.
	 * @details If you want to redirect a user to another view,
	 * 		do so at the very end of `setup()` method by calling
	 * 		`this.router.navigate(${VIEW_PATH_HERE})`.
	 */
	protected router: Router;

	/**
	 * @property {Record<string, string>} params
	 * @protected
	 * Object containing URL parameters.
	 */
	protected pathParams: Map<string, string>;

	/**
	 * @property {URLSearchParams} queryParams
	 * @protected
	 * Object containing query parameters.
	 */
	protected queryParams: URLSearchParams;

	constructor(
		router: Router,
		pathParams: Map<string, string>,
		queryParams: URLSearchParams
	) {
		// Shallow copy of all objects.
		this.router = router;
		this.pathParams = pathParams;
		this.queryParams = queryParams;
	}

	/**
	 * @method
	 * Get HTML page of the view.
	 * @return {Promise<string>} HTML content for our SPA's root container.
	 */
	async getHtml(): Promise<string> {
		return "";
	}

	/**
	 * @method
	 * Set the document's (tab's) title to `title`.
	 * @param {string} title	Document's title to set.
	 */
	setDocumentTitle(): void {}

	/**
	 * @method
	 * @brief Call this method after view is rendered.
	 * @details Sets up event listeners, creats Socket.IO sockets, etc.
	 */
	setup(): void {}

	/**
	 * @method
	 * @brief Always call this method right before closing a view.
	 * @details Deregisters events, closes Socket.IO sockets, etc.
	 */
	cleanup(): void {}
}
