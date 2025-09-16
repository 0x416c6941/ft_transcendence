import AbstractView from "./AbstractView.js";
import { CSS_HREFS } from "./css.config.js";

export default class NotFound extends AbstractView {
	constructor() {
		super();

		this.setTitle("ft_transcendence - 404");
		const cssHref = CSS_HREFS.find(viewCssHref => viewCssHref.view === "Home");
		if (cssHref === undefined) {
			throw new Error("CSS href for \"Home\" view isn't found!");
		}
		this.loadCss(cssHref.href);
	}

	async getHtml(): Promise<string> {
		return "<h1>Not found!</h1>";
	}
}
