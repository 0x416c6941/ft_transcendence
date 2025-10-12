import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

export default class HomeView extends AbstractView {
  constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
    super(router, pathParams, queryParams);
  }

async getHtml(): Promise<string> {
  return `
    <main class="h-screen flex justify-center items-center flex-col bg-neutral-200 dark:bg-neutral-900">
      <h1 class="txt-light-dark-sans text-3xl mb-4">Welcome to ${APP_NAME}</h1>
      <a href="/game" data-link
         class="bg-sky-500 text-white px-4 py-2 rounded shadow">Play Game</a>
    </main>
  `;
}

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Home`;
  }

  setup(): void {}
  cleanup(): void {}
}
