import Router from '../router.js';
import { io } from '../socket.js';

interface OnlineUser {
  userId: number;
  username: string;
  displayName: string;
}

interface GameInvite {
  fromUserId: number;
  fromUsername: string;
  fromDisplayName: string;
}

export default class OnlineUsers {
  private router: Router;
  private container: HTMLElement | null = null;
  private isVisible: boolean = false;
  private onlineUsers: OnlineUser[] = [];
  private pendingInvite: number | null = null; // User ID we sent an invite to
  private receivedInvite: GameInvite | null = null;
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

    this.socket.on('game:invite_received', (invite: GameInvite) => {
      this.receivedInvite = invite;
      this.showInviteModal();
    });

    this.socket.on('game:invite_accepted', (data: { byUsername: string }) => {
      this.pendingInvite = null;
      this.showNotification(`${data.byUsername} accepted your invite!`, 'success');
      setTimeout(() => this.router.navigate('/tetris-remote'), 1500);
    });

    this.socket.on('game:invite_declined', (data: { byDisplayName: string }) => {
      this.pendingInvite = null;
      this.showNotification(`${data.byDisplayName} declined your invite.`, 'error');
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
      ['user_info', 'online_users_updated', 'game:invite_received', 'game:invite_accepted', 'game:invite_declined']
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
              ` : this.pendingInvite === user.userId ? `
                <span class="text-yellow-400 text-sm">Pending...</span>
              ` : `
                <button 
                  class="invite-user-btn bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors"
                  data-user-id="${user.userId}"
                  data-username="${this.escapeHtml(user.username)}"
                >
                  Invite
                </button>
              `}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Attach event listeners
    this.container.querySelector('#close-panel')?.addEventListener('click', () => this.hide());

    this.container.querySelectorAll('.invite-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const userId = parseInt(target.getAttribute('data-user-id') || '0');
        const username = target.getAttribute('data-username') || '';
        this.sendInvite(userId, username);
      });
    });
  }

  private sendInvite(userId: number, username: string): void {
    this.pendingInvite = userId;
    this.socket?.emit('game:invite', { targetUserId: userId });
    this.showNotification(`Invite sent to ${username}`, 'info');
    this.render();
  }

  private showInviteModal(): void {
    if (!this.receivedInvite) return;

    const modal = document.createElement('div');
    modal.id = 'invite-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60]';
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-white text-xl font-semibold mb-4">Game Invite!</h3>
        <p class="text-gray-300 mb-6">
          <span class="font-semibold text-sky-400">${this.escapeHtml(this.receivedInvite.fromDisplayName)}</span> 
          wants to play Tetris with you.
        </p>
        <div class="flex gap-3">
          <button id="accept-invite" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition-colors">
            Accept
          </button>
          <button id="decline-invite" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition-colors">
            Decline
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#accept-invite')?.addEventListener('click', () => {
      this.acceptInvite();
      modal.remove();
    });

    modal.querySelector('#decline-invite')?.addEventListener('click', () => {
      this.declineInvite();
      modal.remove();
    });
  }

  private acceptInvite(): void {
    if (!this.receivedInvite) return;
    this.socket?.emit('game:accept', { fromUserId: this.receivedInvite.fromUserId });
    this.showNotification('Invite accepted! Starting game...', 'success');
    this.receivedInvite = null;
    setTimeout(() => this.router.navigate('/tetris-remote'), 1500);
  }

  private declineInvite(): void {
    if (!this.receivedInvite) return;
    this.socket?.emit('game:decline', { fromUserId: this.receivedInvite.fromUserId });
    this.showNotification('Invite declined', 'info');
    this.receivedInvite = null;
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
