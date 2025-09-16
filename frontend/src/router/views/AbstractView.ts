/**
 * @class AbstractView
 * Serves as a base class for all views ("pages") in the application.
 */
export default class AbstractView {
	/**
	 * @property {Record<string, string>} params
	 * @protected
	 * @brief An object containing URL parameters.
	 * @details This property stores the named parameters captured from the URL path.
	 * 	It will be empty if there are no named parameters for the view.
	 */
	protected params: Record<string, string>;

	constructor(params: Record<string, string>) {
		this.params = params;

		console.log(params);
	}

	/**
	 * @method
	 * @protected
	 * Sets the title of the document (basically the page in a browser).
	 * @param {string} title	The title to be set.
	 */
	protected setTitle(title: string): void {
		document.title = title;
	}

	/**
	 * @method
	 * @protected
	 * Asynchronously loads a stylesheet if it is not already present.
	 * @param {string} href	The URL of the CSS file to load.
	 * @return {Promise<void>} A promise that resolves
	 * 	when the stylesheet has been successfully loaded.
	 * 	Resolves immediately if the stylesheet is already in the document.
	 */
	protected loadCss(href: string): Promise<void> {
		// Checking if CSS was already loaded before.
		if (document.querySelector(`link[href="${href}"]`)) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve, reject) => {
			const link = document.createElement("link");

			link.rel = "stylesheet";
			link.href = href;
			link.onload = () => resolve();
			link.onerror = () => reject();
			document.head.appendChild(link);
		});
	}

	/**
	 * @method
	 * A pure virtual method for generating the HTML content of the view.
	 * @details This method is asynchronous to support fetching content
	 * 	(e.g., via `fetch`) before rendering.
	 * @returns {Promise<string>} A promise that resolves
	 * 	with the HTML content string for the view.
	 */
	async getHtml(): Promise<string> {
		return "";
	}
}
