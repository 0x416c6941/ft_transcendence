import AbstractView from './AbstractView.js';
import { APP_NAME } from '../app.config.js';

/**
 * @class NotFound
 * 404 "Not Found" view.
 */
export default class NotFound extends AbstractView {
	constructor(pathParams: Map<string, string>, queryParams: URLSearchParams) {
		super(pathParams, queryParams);
	}

	async GetHtml(): Promise<string> {
		return '';
	}

	setDocumentTitle(): void {
		document.title = APP_NAME.concat(' - 404');
	}
}
