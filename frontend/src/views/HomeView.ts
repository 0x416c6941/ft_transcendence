import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import { auth } from "../auth.js";

export default class HomeView extends AbstractView {
  private isLoggedIn: boolean = false;
  private unsubscribeAuth?: () => void;

  constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
    super(router, pathParams, queryParams);
    this.isLoggedIn = auth.isAuthed();
  }

async getHtml(): Promise<string> {
  return `
    <main class="flex-1 min-h-0 flex flex-col justify-center items-center bg-gray-800">
      <h1 class="text-5xl font-bold text-white mb-8 tracking-wide">Welcome to ${APP_NAME}</h1>
      <div class="flex flex-col gap-4 w-64">
        ${this.isLoggedIn ? `
        <a href="/tournament-room" data-link
           class="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Pong: Tournament
        </a>
        ` : ''}
        <a href="/pong-local" data-link
           class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Pong: Alias vs. Alias
        </a>
        <a href="/pong-ai" data-link
           class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Pong: ${this.isLoggedIn ? 'User' : 'Alias'} vs AI
        </a>
        <a href="/tetris" data-link
           class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Tetris: Alias vs Alias
        </a>
        <a href="/tetris-ai" data-link
           class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Tetris: ${this.isLoggedIn ? 'User' : 'Alias'} vs AI
        </a>
        ${this.isLoggedIn ? `
        <a href="/tetris-tournament-room" data-link
           class="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Tetris: Tournament
        </a>
        ` : ''}
      </div>
    </main>
    `;
  }

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Home`;
  }

  async setup(): Promise<void> {
    // hydrate auth; initial state
    await auth.bootstrap();
    this.isLoggedIn = auth.isAuthed();

    this.unsubscribeAuth = auth.subscribe((s) => {
      const next = s.status === "authenticated";
      if (next !== this.isLoggedIn) {
        this.isLoggedIn = next;
        window.location.reload();
      }
    });
  }

  cleanup(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = undefined;
    }
  }
}
