import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import OnlineUsers from '../components/OnlineUsers.js';
import { auth } from "../auth.js";
import { io } from '../socket.js';

export default class HomeView extends AbstractView {
  private isLoggedIn: boolean = false;
  private onlineUsersComponent: OnlineUsers | null = null;
  private unsubscribeAuth?: () => void;

  constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
    super(router, pathParams, queryParams);
    this.isLoggedIn = auth.isAuthed();
  }

async getHtml(): Promise<string> {
  const buttonClass = this.isLoggedIn
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-blue-600 hover:bg-blue-700';
  const buttonText = this.isLoggedIn ? 'Logout' : 'Login';
  const authControl = this.isLoggedIn
    ? `<button id="logout-btn" class="${buttonClass} text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">Logout</button>`
    : `<a href="/login" data-link class="${buttonClass} text-white px-6 py-3 rounded-lg shadow-lg text-center font-semibold transition-colors">Login</a>`;

  return `
    <main class="h-screen flex justify-center items-center flex-col bg-gray-800">
      <h1 class="text-5xl font-bold text-white mb-8 tracking-wide">Welcome to ${APP_NAME}</h1>
      <div class="flex flex-col gap-4 w-64">
        ${authControl}
        <a href="/rooms/new" data-link
           class="bg-green-600 text-white px-4 py-2 rounded shadow text-center">
          Create Room
        </a>
        <a href="/rooms/join" data-link
           class="bg-blue-600 text-white px-4 py-2 rounded shadow text-center">
          Join Room
        </a>
        <a href="/pong-local" data-link
           class="bg-indigo-600 text-white px-4 py-2 rounded shadow text-center">
          Play Pong (Local)
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

  async setup(): Promise<void> {
    // hydrate auth; initial state
    await auth.bootstrap();
    this.isLoggedIn = auth.isAuthed();

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await auth.signOut();
        window.location.reload();
      });
    }

    // Mount OnlineUsers component if user is logged in
    if (this.isLoggedIn && io.connected) {
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
    // Unmount OnlineUsers component
    if (this.onlineUsersComponent) {
      this.onlineUsersComponent.unmount();
      this.onlineUsersComponent = null;
    }
  }
}
