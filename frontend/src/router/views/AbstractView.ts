export default class AbstractView {
	constructor() {
	}

	protected setTitle(title: string): void {
		document.title = title;
	}

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

	async getHtml(): Promise<string> {
		return "";
	}
}
