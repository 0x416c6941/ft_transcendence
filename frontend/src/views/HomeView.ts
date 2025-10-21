import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';
import OnlineUsers from '../components/OnlineUsers.js';

export default class HomeView extends AbstractView {
  private isLoggedIn: boolean = false;
  private onlineUsersComponent: OnlineUsers | null = null;

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
        <a href="/pong" data-link
           class="bg-indigo-600 text-white px-4 py-2 rounded shadow text-center">
          Play Pong
        </a>
        <a href="/tetris" data-link
           class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Tetris: Alias vs Alias
        </a>
        <a href="/tetris-ai" data-link
           class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Tetris: Alias vs AI
        </a>
        ${this.isLoggedIn ? `
        <button id="remote-game-btn"
           class="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">
          Tetris: Remote Game
        </button>
        ` : ''}
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

  setup(): void {
    // Mount OnlineUsers component if user is logged in
    if (this.isLoggedIn && (window as any).userSocket) {
      this.onlineUsersComponent = new OnlineUsers(this.router);
      const mainElement = document.querySelector('main');
      if (mainElement) {
        this.onlineUsersComponent.mount(mainElement);
      }

      // Setup Remote Game button click handler
      const remoteGameBtn = document.getElementById('remote-game-btn');
      if (remoteGameBtn) {
        remoteGameBtn.addEventListener('click', () => {
          if (this.onlineUsersComponent) {
            this.onlineUsersComponent.show();
          }
        });
      }
    }
  }

  cleanup(): void {
    // Unmount OnlineUsers component
    if (this.onlineUsersComponent) {
      this.onlineUsersComponent.unmount();
      this.onlineUsersComponent = null;
    }
  }
}
