export default class AbstractView {
	constructor() {
	}

	setTitle(title: string): void {
		document.title = title;
	}

	async getHTML(): string {
	}
}
