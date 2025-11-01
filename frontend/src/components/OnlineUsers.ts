import Router from '../router.js';
import { io } from '../socket.js';

interface OnlineUser {
  userId: number;
  username: string;
  displayName: string;
}

export default class OnlineUsers {
  private router: Router;
  private container: HTMLElement | null = null;
  private isVisible: boolean = false;
  private onlineUsers: OnlineUser[] = [];
  private socket: any = null;
  private currentUserId: number | null = null;

  constructor(router: Router) {
    this.router = router;
    this.socket = io;
    
    // Check if userId is already available
    if (this.socket.userId) {
      this.currentUserId = this.socket.userId;
    }
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    this.socket.on('user_info', (data: { userId: number }) => {
      this.currentUserId = data.userId;
      this.render();
    });

    this.socket.on('online_users_updated', (users: OnlineUser[]) => {
      this.onlineUsers = users;
      this.render();
    });
  }

  public mount(parentElement: HTMLElement): void {
    // Create panel container (no toggle button)
    this.container = document.createElement('div');
    this.container.id = 'online-users-panel';
    this.container.className = 'fixed top-0 right-0 h-full w-80 bg-gray-800 shadow-2xl transform translate-x-full transition-transform duration-300 z-50';
    parentElement.appendChild(this.container);

    // Request current state from server
    if (this.socket) {
      this.socket.emit('request_online_users');
    }

    this.render();
  }

  public unmount(): void {
    this.container?.remove();
    this.container = null;

    if (this.socket) {
      ['user_info', 'online_users_updated']
        .forEach(event => this.socket.off(event));
    }
  }

  public show(): void {
    this.isVisible = true;
    this.container?.classList.remove('translate-x-full');
  }

  public hide(): void {
    this.isVisible = false;
    this.container?.classList.add('translate-x-full');
  }

  public toggle(): void {
    this.isVisible ? this.hide() : this.show();
  }

  private render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="bg-gray-900 p-4 flex justify-between items-center">
          <h2 class="text-white text-xl font-semibold">Online Users (${this.onlineUsers.length})</h2>
          <button id="close-panel" class="text-gray-400 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Users List -->
        <div class="flex-1 overflow-y-auto p-4">
          ${this.onlineUsers.length === 0 ? `
            <div class="text-gray-400 text-center mt-8">
              <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
              </svg>
              <p>No users online</p>
            </div>
          ` : this.onlineUsers.map(user => `
            <div class="bg-gray-700 rounded-lg p-3 mb-2 flex items-center justify-between hover:bg-gray-600 transition-colors">
              <div class="flex items-center">
                <div class="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center text-white font-semibold mr-3">
                  ${user.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p class="text-white font-medium">${this.escapeHtml(user.displayName)}</p>
                  <p class="text-gray-400 text-sm">@${this.escapeHtml(user.username)}</p>
                </div>
              </div>
              ${user.userId === this.currentUserId ? `
                <span class="text-gray-500 text-sm italic">You</span>
              ` : `
                <div class="w-3 h-3 bg-green-500 rounded-full"></div>
              `}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Attach event listeners
    this.container.querySelector('#close-panel')?.addEventListener('click', () => this.hide());
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info'): void {
    const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-sky-600' };
    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.cssText = 'opacity: 0; transition: opacity 0.3s';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
