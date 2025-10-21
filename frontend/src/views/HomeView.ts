import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

export default class HomeView extends AbstractView {
  constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
    super(router, pathParams, queryParams);
  }

async getHtml(): Promise<string> {
  return `
    <main class="h-screen flex justify-center items-center flex-col bg-gray-800">
      <h1 class="text-5xl font-bold text-white mb-8 tracking-wide">Welcome to ${APP_NAME}</h1>
      <div class="flex flex-col gap-4 w-64">
        <a href="/login" data-link
           class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Login
        </a>
        <a href="/tetris" data-link
           class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Play Tetris
        </a>
      </div>
    </main>
  `;
}

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Home`;
  }

  setup(): void {}
  cleanup(): void {}
}
