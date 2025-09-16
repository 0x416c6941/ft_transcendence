import AbstractView from "./AbstractView.js";
import { CSS_HREFS } from "./css.config.js";

/**
 * @class Home
 * @extends AbstractView
 * A temporary view to test Regex named parameters.
 * Send number as a URL parameter.
 */
export default class RegexTest extends AbstractView {
	constructor(params: Record<string, string>) {
		super(params);

		this.setTitle("ft_transcendence");
		const cssHref = CSS_HREFS.find(viewCssHref => viewCssHref.view === "Home");
		if (cssHref === undefined) {
			throw new Error("CSS href for \"Home\" view isn't found!");
		}
		this.loadCss(cssHref.href);
	}

	async getHtml(): Promise<string> {
		let content: string;

		if (this.params["number"].match(/^\d+$/) === null) {
			content = "Invalid number received!";
		}
		else {
			content = `Number received: ${this.params["number"]}`;
		}

		return `
			<h1>Regex Test</h1>
			<br>
			${content}
			<br>
			<a href="/" data-link>Back to main page</a>
		`;
	}
}
