import AbstractView from "./AbstractView.js";
import { CSS_HREFS } from "./css.config.js";

export default class Home extends AbstractView {
	constructor() {
		super();

		this.setTitle("ft_transcendence");
		const cssHref = CSS_HREFS.find(viewCssHref => viewCssHref.view === "Home");
		if (cssHref === undefined) {
			throw new Error("CSS href for \"Home\" view isn't found!");
		}
		this.loadCss(cssHref.href);
	}

	async getHtml(): Promise<string> {
		return `
			<h1>Welcome to ft_transcendence!</h1>
			<br>
			Try 404 SPA:
			<br>
			<a href="/notfound" data-link>404</a>
		`;
	}
}
