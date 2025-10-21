import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

export default class HomeView extends AbstractView {
  private isLoggedIn: boolean = false;

  constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
    super(router, pathParams, queryParams);
    this.isLoggedIn = this.checkIfLoggedIn();
  }

async getHtml(): Promise<string> {
  const buttonClass = this.isLoggedIn 
    ? 'bg-red-600 hover:bg-red-700' 
    : 'bg-blue-600 hover:bg-blue-700';
  const buttonText = this.isLoggedIn ? 'Logout' : 'Login';

  return `
    <main class="h-screen flex justify-center items-center flex-col bg-gray-800">
      <h1 class="text-5xl font-bold text-white mb-8 tracking-wide">Welcome to ${APP_NAME}</h1>
      <div class="flex flex-col gap-4 w-64">
        <a href="/login" data-link
           class="${buttonClass} text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          ${buttonText}
        </a>
        <a href="/tetris" data-link
           class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Tetris (2 Players)
        </a>
        <a href="/tetris-ai" data-link
           class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Tetris vs AI
        </a>
      </div>
    </main>
  `;
}

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Home`;
  }

  private checkIfLoggedIn(): boolean {
    // Check if access token cookie exists
    return document.cookie.split(';').some(cookie => cookie.trim().startsWith('accessToken='));
  }

  setup(): void {}
  cleanup(): void {}
}
