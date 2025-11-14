/**
 * ChatPanel Component
 * Displays global chat and direct messages in a toggleable sidebar
 */

import Router from '../router.js';
import { io } from '../socket.js';
import { getLeaderboard } from '../api/stats.js';

interface ChatMessage {
	id: number;
	senderId: number;
	senderUsername: string;
	senderDisplayName: string;
	message: string;
	timestamp: string;
	conversationId?: number;
	editedAt?: string;
}

interface Conversation {
	id: number | null;
	otherUserId: number;
	otherUserUsername?: string;
	otherUserDisplayName: string;
	lastMessage: string | null;
	unreadCount: number;
	isFriend: boolean;
	isNew?: boolean; // Flag for conversations that haven't started yet
}

interface Friend {
	id: number;
	username: string;
	display_name: string;
	is_online: boolean;
}

interface GameInvite {
	id: number;
	gameType: 'tetris' | 'pong';
	fromUserId: number;
	fromUsername: string;
	fromDisplayName: string;
	toUserId: number;
	toUsername: string;
	toDisplayName: string;
	status: 'pending' | 'accepted' | 'declined' | 'expired';
	createdAt: string;
}

export default class ChatPanel {
	private router: Router;
	private socket: any;
	private container: HTMLElement | null = null;
	private currentTab: 'global' | 'dm' | 'games' = 'global';
	private globalMessages: ChatMessage[] = [];
	private conversations: Conversation[] = [];
	private activeConversationId: number | null = null;
	private dmMessages: Map<number, ChatMessage[]> = new Map();
	private gameInvites: GameInvite[] = [];
	private isInGame: boolean = false;
	private isOpen: boolean = false;
	private friends: Friend[] = [];
	private onlineUsers: Array<{ userId: number; username: string; displayName: string }> = [];
	private isAdmin: boolean = false;
	private cachedOnlineUserIds: Set<number> = new Set(); // Cache online user IDs
	private dmUnreadCount: number = 0;
	private gameInviteCount: number = 0;
	private winRates: Map<string, number> = new Map(); // username -> win_rate

	constructor(router: Router) {
		this.router = router;
		this.socket = io;
		this.setupSocketListeners();
		this.checkGameStatus();
		this.socket.emit('chat:get_conversations');
	}

	private checkGameStatus(): void {
		const updateStatus = () => {
			const path = window.location.pathname;
			this.isInGame = /\/(pong|tetris)/.test(path) && 
			                 path !== '/pong-local' && 
			                 path !== '/tetris' && 
			                 path !== '/tetris-ai';
		};
		
		updateStatus();
		window.addEventListener('popstate', () => {
			updateStatus();
			if (this.container) this.render();
		});
	}

	private setupSocketListeners(): void {
		this.socket.on('user_info', (data: { userId: number; username: string; isAdmin: boolean }) => {
			this.isAdmin = data.isAdmin;
		});

		this.socket.on('friends_updated', async () => {
			await this.fetchFriends();
			this.socket.emit('request_online_users');
			this.socket.emit('chat:get_conversations');
		});

		this.socket.on('online_users_updated', (users: Array<{ userId: number; username: string; displayName: string }>) => {
			const onlineUserIds = new Set(users.map(u => u.userId));
			
			// Store online users list
			this.onlineUsers = users;
			
			// If on games tab, fetch win rates and re-render
			if (this.currentTab === 'games') {
				this.fetchWinRates().then(() => {
					if (this.currentTab === 'games') {
						this.renderMessages();
					}
				});
			}
			
			// Cache the online user IDs for when friends are fetched
			this.cachedOnlineUserIds = onlineUserIds;
			
			// Update existing friends' online status
			this.friends = this.friends.map(friend => ({
				...friend,
				is_online: onlineUserIds.has(friend.id)
			}));
			
			// Also ensure all conversation participants exist in friends array with correct online status
			// This handles the case where a friend was offline when friends list was fetched
			this.conversations.forEach(conv => {
				if (!this.friends.find(f => f.id === conv.otherUserId)) {
					// Only add if we have all required data
					if (conv.otherUserUsername && conv.otherUserDisplayName) {
						this.friends.push({
							id: conv.otherUserId,
							username: conv.otherUserUsername,
							display_name: conv.otherUserDisplayName,
							is_online: onlineUserIds.has(conv.otherUserId)
						});
					}
				}
			});
			
			// Re-render if viewing DM or Games tab to show updated online status
			// This ensures online status updates are immediately visible in both tabs
			if (this.container && (this.currentTab === 'dm' || this.currentTab === 'games') && !this.activeConversationId) {
				this.renderMessages();
			}
		});

		this.socket.on('chat:message_global', (data: ChatMessage) => {
			this.globalMessages.push(data);
			if (this.currentTab === 'global' && this.container) {
				requestAnimationFrame(() => {
					this.renderMessages();
					this.scrollToBottom();
				});
			}
		});

		this.socket.on('chat:message_dm', (data: ChatMessage & { conversationId: number }) => {
			const messages = this.dmMessages.get(data.conversationId) || [];
			messages.push(data);
			this.dmMessages.set(data.conversationId, messages);

			// If this is our own message to a new conversation (no active conversation set),
			// automatically open it
			const isOwnMessage = data.senderId === (this.socket as any).userId;
			const wasNewConversation = !this.activeConversationId && this.currentTab === 'dm';
			
			if (isOwnMessage && wasNewConversation) {
				this.activeConversationId = data.conversationId;
				// Do full render to show conversation view with header and input
				if (this.container) {
					this.render();
					setTimeout(() => this.scrollToBottom(), 10);
				}
			} else if (this.currentTab === 'dm' && this.activeConversationId === data.conversationId && this.container) {
				// Just update messages for existing active conversation
				requestAnimationFrame(() => {
					this.renderMessages();
					this.scrollToBottom();
				});
			}
			
			this.socket.emit('chat:get_conversations');
		});

		this.socket.on('chat:history', (data: { messages: any[] }) => {
			const mappedMessages = data.messages.map((msg: any) => ({
				id: msg.id,
				senderId: msg.sender_id,
				senderUsername: msg.sender_username,
				senderDisplayName: msg.sender_display_name,
				message: msg.message,
				timestamp: msg.created_at,
				conversationId: msg.conversation_id,
				editedAt: msg.edited_at
			}));

			if (this.currentTab === 'global') {
				this.globalMessages = mappedMessages;
				if (this.container) {
					requestAnimationFrame(() => {
						this.renderMessages();
						setTimeout(() => this.scrollToBottom(), 10);
					});
				}
			} else if (this.activeConversationId) {
				// Store messages for this conversation
				this.dmMessages.set(this.activeConversationId, mappedMessages);
				// Always re-render messages when DM history arrives
				if (this.container && this.currentTab === 'dm') {
					requestAnimationFrame(() => {
						this.renderMessages();
						setTimeout(() => this.scrollToBottom(), 10);
					});
				}
			}
		});

		this.socket.on('chat:conversations', (data: any[]) => {
			this.conversations = data.map(conv => ({
				id: conv.id,
				otherUserId: conv.other_user_id,
				otherUserUsername: conv.other_user_username,
				otherUserDisplayName: conv.other_user_display_name,
				lastMessage: conv.last_message,
				unreadCount: conv.unread_count,
				isFriend: conv.is_friend
			}));
			
			requestAnimationFrame(() => this.updateUnreadBadge());
			
			// Don't render immediately - request fresh online status first
			// The online_users_updated handler will trigger the render
			if (this.container && this.currentTab === 'dm' && !this.activeConversationId) {
				this.socket.emit('request_online_users');
			}
		});

		this.socket.on('chat:message_edited', (data: { messageId: number; newMessage: string; editedAt: string }) => {
			const globalMsg = this.globalMessages.find(m => m.id === data.messageId);
			if (globalMsg) {
				globalMsg.message = data.newMessage;
				globalMsg.editedAt = data.editedAt;
			}

			this.dmMessages.forEach(messages => {
				const dmMsg = messages.find(m => m.id === data.messageId);
				if (dmMsg) {
					dmMsg.message = data.newMessage;
					dmMsg.editedAt = data.editedAt;
				}
			});

			if (this.container) this.renderMessages();
		});

		this.socket.on('chat:message_deleted', (data: { messageId: number }) => {
			this.globalMessages = this.globalMessages.filter(m => m.id !== data.messageId);
			this.dmMessages.forEach((messages, convId) => {
				this.dmMessages.set(convId, messages.filter(m => m.id !== data.messageId));
			});
			if (this.container) this.renderMessages();
		});

		this.socket.on('chat:conversation_deleted', (data: { conversationId: number }) => {
			this.conversations = this.conversations.filter(c => c.id !== data.conversationId);
			this.dmMessages.delete(data.conversationId);

			if (this.activeConversationId === data.conversationId) {
				this.activeConversationId = null;
				if (this.container && this.currentTab === 'dm') this.render();
			} else if (this.container && this.currentTab === 'dm') {
				this.renderMessages();
			}
		});

		this.socket.on('chat:error', (data: { code: string; message: string }) => {
			this.showNotification(data.message, 'error');
		});

		// Game invite listeners
		this.socket.on('game:invite_received', (data: GameInvite) => {
			this.gameInvites.unshift(data);
			this.gameInviteCount++;
			this.updateUnreadBadge();
			this.showNotification(`${data.fromDisplayName} invited you to play ${data.gameType}!`, 'info');
			if (this.container && this.currentTab === 'games') this.renderMessages();
		});

		this.socket.on('game:invite_sent', () => this.socket.emit('game:get_invites'));

		this.socket.on('game:invite_accepted', (data: { inviteId: number; byDisplayName: string; gameType: string; roomId?: string }) => {
			const invite = this.gameInvites.find(inv => inv.id === data.inviteId);
			if (invite) invite.status = 'accepted';
			
			this.updateBadgeAndRefresh();
			this.showNotification(`${data.byDisplayName} accepted your invite!`, 'success');
			
			if (this.isOpen) this.toggle(); // Close chat panel
			
			setTimeout(() => {
				if (data.roomId) {
					// Navigate to the specific room with roomId as query parameter
					if (data.gameType === 'tetris') {
						this.router.navigate(`/tetris-remote?roomId=${data.roomId}`);
					} else if (data.gameType === 'pong') {
						this.router.navigate(`/pong-remote/${data.roomId}`);
					}
				} else {
					// Fallback to old behavior
					this.router.navigate(data.gameType === 'tetris' ? '/tetris-remote' : '/pong');
				}
			}, 1000);
		});

		this.socket.on('game:invite_room_created', (data: { inviteId: number; gameType: string; roomId?: string }) => {
			// This event is received by the player who accepted the invite
			if (this.isOpen) this.toggle(); // Close chat panel
			
			if (data.roomId) {
				setTimeout(() => {
					if (data.gameType === 'pong') {
						this.router.navigate(`/pong-remote/${data.roomId}`);
					} else if (data.gameType === 'tetris') {
						this.router.navigate(`/tetris-remote?roomId=${data.roomId}`);
					}
				}, 1000);
			}
		});		this.socket.on('game:invite_declined', (data: { inviteId: number; byDisplayName: string }) => {
			const invite = this.gameInvites.find(inv => inv.id === data.inviteId);
			if (invite) invite.status = 'declined';
			
			this.updateBadgeAndRefresh();
			this.showNotification(`${data.byDisplayName} declined your invite`, 'info');
		});

		this.socket.on('game:invites_list', (data: GameInvite[]) => {
			this.gameInvites = data;
			this.gameInviteCount = data.filter(inv => inv.status === 'pending' && inv.toUserId === (this.socket as any).userId).length;
			this.updateUnreadBadge();
			
			if (this.container && this.currentTab === 'games') {
				this.renderMessages();
			}
		});
	}

	public mount(parentElement: HTMLElement): void {
		this.container = document.createElement('div');
		this.container.id = 'chat-panel';
		this.container.className = 'fixed top-0 right-0 h-full w-96 bg-gray-800 shadow-2xl z-50 flex flex-col';
		this.container.style.transform = 'translateX(100%)';
		this.container.style.transition = 'transform 300ms ease-in-out';
		parentElement.appendChild(this.container);

		const requestData = async () => {
			if (!this.socket.connected) return setTimeout(requestData, 100);
			this.socket.emit(this.currentTab === 'global' ? 'chat:get_history' : 'chat:get_conversations', 
				this.currentTab === 'global' ? { type: 'global', limit: 50 } : undefined);
			// Wait for friends to be fetched before requesting online status
			await this.fetchFriends();
			this.socket.emit('request_online_users');
			// Request game invites on mount to ensure badge count is accurate
			this.socket.emit('game:get_invites');
		};

		this.socket.connected ? setTimeout(requestData, 50) : this.socket.once('connect', () => setTimeout(requestData, 100));
		this.render();
	}

	private async fetchFriends(): Promise<void> {
		try {
			const response = await fetch('/api/friends', { credentials: 'include' });
			if (!response.ok) return;
			
			const data = await response.json();
			if (!data.ids?.length) {
				this.friends = [];
				return;
			}

			const friendPromises = data.ids.map(async (id: number) => {
				const res = await fetch(`/api/users/${id}`, { credentials: 'include' });
				return res.ok ? (await res.json()).user : null;
			});

			this.friends = (await Promise.all(friendPromises))
				.filter(Boolean)
				.map(user => ({
					id: user.id,
					username: user.username,
					display_name: user.display_name,
					// Use cached online status if available, otherwise default to false
					is_online: this.cachedOnlineUserIds.has(user.id)
				}));
		} catch (error) {
			console.error('Failed to fetch friends:', error);
			this.friends = [];
		}
	}

	private async fetchWinRates(): Promise<void> {
		try {
			const result = await getLeaderboard();
			this.winRates.clear();
			result.leaderboard.forEach(entry => {
				// Store with lowercase key for case-insensitive matching
				this.winRates.set(entry.player_name.toLowerCase(), entry.win_rate);
			});
		} catch (error) {
			console.error('Failed to fetch win rates:', error);
		}
	}

	public unmount(): void {
		this.container?.remove();
		this.container = null;
	}

	public toggle(): void {
		if (!this.container) return;

		if (this.isInGame) {
			this.showNotification('Chat is disabled during games', 'info');
			return;
		}

		this.isOpen = !this.isOpen;
		this.container.style.transform = this.isOpen ? 'translateX(0)' : 'translateX(100%)';
	}

	private render(): void {
		if (!this.container) return;

		this.container.innerHTML = `
			<!-- Header -->
			<div class="bg-gray-900 p-4 border-b border-gray-700 flex items-center justify-between">
				<h2 class="text-xl font-bold text-white">Chat</h2>
				<button id="chat-close" class="text-gray-400 hover:text-white transition-colors">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Tab Switcher -->
			<div class="flex bg-gray-900 border-b border-gray-700">
				<button id="tab-global" class="flex-1 py-3 text-sm font-semibold transition-colors ${
					this.currentTab === 'global' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'
				}">
					Global Chat
				</button>
				<button id="tab-dm" class="relative flex-1 py-3 text-sm font-semibold transition-colors ${
					this.currentTab === 'dm' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'
				}">
					Direct Messages
					<span id="tab-dm-badge" class="hidden absolute top-1 right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"></span>
				</button>
				<button id="tab-games" class="relative flex-1 py-3 text-sm font-semibold transition-colors ${
					this.currentTab === 'games' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'
				}">
					Games
					<span id="tab-games-badge" class="hidden absolute top-1 right-2 bg-green-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"></span>
				</button>
			</div>

			${this.isInGame ? `
				<div class="flex-1 flex items-center justify-center p-6">
					<div class="text-center text-gray-400">
						<svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
						</svg>
						<p class="text-lg font-semibold mb-2">Chat Disabled</p>
						<p class="text-sm">Chat is not available during games</p>
					</div>
				</div>
			` : `
				<!-- Messages Container -->
				<div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3">
					<!-- Messages will be rendered here by renderMessages() -->
				</div>

				<!-- Input Area -->
				${this.renderInputArea()}
			`}
		`;

		this.attachEventListeners();
		
		// Update badges after render to ensure they're visible with correct counts
		// Use setTimeout to ensure DOM elements are available
		setTimeout(() => this.updateUnreadBadge(), 0);
		
		// Render messages after DOM is ready if we have data
		if (!this.isInGame && this.currentTab === 'global' && this.globalMessages.length > 0) {
			setTimeout(() => {
				this.renderMessages();
				this.scrollToBottom();
			}, 0);
		} else if (!this.isInGame && this.currentTab === 'dm' && !this.activeConversationId) {
			// Show conversation list
			setTimeout(() => this.renderMessages(), 0);
		} else if (!this.isInGame && this.currentTab === 'dm' && this.activeConversationId) {
			// Show active DM conversation messages (if cached)
			const convId = this.activeConversationId;
			setTimeout(() => {
				this.renderMessages();
				if (this.dmMessages.has(convId)) {
					this.scrollToBottom();
				}
			}, 0);
		}
	}

	private renderMessagesHTML(): string {
		if (this.currentTab === 'global') {
			return this.globalMessages.map(msg => this.renderMessageHTML(msg)).join('');
		} else if (this.activeConversationId) {
			const messages = this.dmMessages.get(this.activeConversationId) || [];
			return messages.map(msg => this.renderMessageHTML(msg)).join('');
		} else if ((this as any).tempRecipientId) {
			// Show empty state for new conversation
			const friend = this.friends.find(f => f.id === (this as any).tempRecipientId);
			return `
				<div class="flex items-center justify-center h-full">
					<div class="text-center text-gray-400 p-4">
						<div class="text-6xl mb-4">💬</div>
						<p class="text-lg font-semibold text-white mb-2">${friend ? friend.display_name : 'Friend'}</p>
						<p class="text-sm">Start a conversation by sending a message below!</p>
					</div>
				</div>
			`;
		}
		return '';
	}

	private renderMessageHTML(msg: ChatMessage): string {
		const isOwn = msg.senderId === (this.socket as any).userId;
		
		return `
			<div class="flex ${isOwn ? 'justify-end' : 'justify-start'} group" data-message-id="${msg.id}">
				<div class="max-w-[75%] ${isOwn ? 'bg-blue-600' : 'bg-gray-700'} rounded-lg p-3 relative">
					${!isOwn ? `<div class="text-xs font-semibold text-gray-300 mb-1">${this.escapeHtml(msg.senderDisplayName)}</div>` : ''}
					<div class="text-white break-words">${this.escapeHtml(msg.message)}</div>
					<div class="text-xs text-gray-300 mt-1 flex items-center gap-2">
						<span>${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
						${msg.editedAt ? '<span class="text-gray-400">(edited)</span>' : ''}
					</div>
					${this.isAdmin ? `
						<button 
							class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 hover:bg-red-700 text-white rounded p-1 text-xs"
							data-delete-message="${msg.id}"
							title="Delete message (Admin)">
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
						</button>
					` : ''}
				</div>
			</div>
		`;
	}

	private renderConversationListHTML(): string {
		// All conversations from backend are mutual friends
		const allItems = this.conversations.map(conv => {
			// Check online status from friends list, but don't filter out if not found
			// (user might be offline or friends list might not be fully loaded yet)
			const friend = this.friends.find(f => f.id === conv.otherUserId);
			return { 
				...conv, 
				isOnline: friend?.is_online || false,
				hasMessages: !!conv.lastMessage
			};
		});

		if (allItems.length === 0) {
			return `
				<div class="text-center text-gray-400 px-4 py-8">
					<svg class="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
					</svg>
					<p class="text-sm font-semibold mb-2">No mutual friends yet</p>
					<p class="text-xs text-gray-500 max-w-xs mx-auto">
						Direct messages are only available with mutual friends. 
						Add friends and have them add you back to start chatting!
					</p>
				</div>
			`;
		}

		return `
			<div class="px-4 py-4 space-y-2">
				${allItems.map(item => `
					<button 
						class="w-full p-4 ${!item.hasMessages ? 'bg-gray-750 border border-gray-600 border-dashed' : 'bg-gray-700'} hover:bg-gray-600 rounded-lg text-left transition-colors flex items-center gap-3"
						data-conversation-id="${item.id || ''}"
						data-other-user-id="${item.otherUserId}">
						<div class="flex-1">
							<div class="flex items-center gap-2">
								<span class="font-semibold text-white">${item.otherUserDisplayName}</span>
								<span class="text-xs ${item.isOnline ? 'text-green-400' : 'text-gray-500'}">
									${item.isOnline ? '● Online' : '○ Offline'}
								</span>
							</div>
							${item.hasMessages ? 
								`<p class="text-sm text-gray-400 truncate mt-1">${this.escapeHtml(item.lastMessage || '')}</p>` : 
								'<p class="text-sm text-blue-400 mt-1">New conversation</p>'
							}
						</div>
						${item.unreadCount > 0 ? 
							`<span class="bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">${item.unreadCount}</span>` : 
							''
						}
					</button>
				`).join('')}
			</div>
		`;
	}

	private renderGameInvitesHTML(): string {
		const userId = (this.socket as any).userId;
		// Filter out current user from online users list
		const availableUsers = this.onlineUsers.filter(u => u.userId !== userId);
		
		// Count completed invites (accepted/declined)
		const completedInvites = this.gameInvites.filter(inv => 
			inv.status === 'accepted' || inv.status === 'declined'
		);
		
		// Send Invite Section
		const sendInviteSection = `
			<div class="px-4 py-3 border-b border-gray-700">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-sm font-semibold text-gray-300 flex items-center gap-2">
						<span>📨</span> Send Game Invite
					</h3>
					${completedInvites.length > 0 ? `
						<button 
							id="cleanup-invites"
							class="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded transition-colors flex items-center gap-1"
							title="Remove accepted/declined invites">
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
							Clean Up (${completedInvites.length})
						</button>
					` : ''}
				</div>
				${availableUsers.length === 0 ? `
					<p class="text-xs text-gray-500">No other users online</p>
				` : `
					<div class="space-y-2">
						${availableUsers.map(user => {
							const winRate = this.winRates.get(user.username.toLowerCase());
							const winRateText = winRate !== undefined ? `${winRate.toFixed(1)}%` : '—';
							return `
							<div class="flex items-center justify-between bg-gray-700 rounded-lg p-3">
								<div class="flex items-center gap-3">
									<div class="w-2 h-2 bg-green-500 rounded-full"></div>
									<div class="flex flex-col">
										<span class="text-sm text-white">${this.escapeHtml(user.displayName)}</span>
										<span class="text-xs text-gray-400">${winRateText}</span>
									</div>
								</div>
								<div class="flex gap-2">
									<button 
										class="send-game-invite px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
										data-friend-id="${user.userId}"
										data-game-type="tetris"
										title="Invite to Tetris">
										🎮 Tetris
									</button>
									<button 
										class="send-game-invite px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
										data-friend-id="${user.userId}"
										data-game-type="pong"
										title="Invite to Pong">
										🏓 Pong
									</button>
								</div>
							</div>
						`;}).join('')}
					</div>
				`}
			</div>
		`;
		
		// Invites List Section
		const invitesSection = this.gameInvites.length === 0 ? `
			<div class="text-center text-gray-400 px-4 py-8">
				<svg class="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
				</svg>
				<p class="text-xs text-gray-500">No pending invites</p>
			</div>
		` : `
			<div class="px-4 py-4 space-y-3">
				${this.gameInvites.map(invite => {
					const isReceived = invite.toUserId === userId;
					const isPending = invite.status === 'pending';
					const gameIcon = invite.gameType === 'tetris' ? '🎮' : '🏓';
					
					let statusBadge = '';
					let actionButtons = '';
					
					if (invite.status === 'accepted') {
						statusBadge = '<span class="text-xs text-green-400">✓ Accepted</span>';
					} else if (invite.status === 'declined') {
						statusBadge = '<span class="text-xs text-red-400">✗ Declined</span>';
					} else if (invite.status === 'expired') {
						statusBadge = '<span class="text-xs text-gray-500">⌛ Expired</span>';
					} else if (isPending && isReceived) {
						actionButtons = `
							<div class="flex gap-2 mt-2">
								<button 
									class="accept-invite flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
									data-invite-id="${invite.id}"
									data-game-type="${invite.gameType}">
									Accept
								</button>
								<button 
									class="decline-invite flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
									data-invite-id="${invite.id}">
									Decline
								</button>
							</div>
						`;
					} else if (isPending && !isReceived) {
						statusBadge = '<span class="text-xs text-yellow-400">⏳ Waiting...</span>';
					}
					
					return `
						<div class="bg-gray-700 rounded-lg p-4">
							<div class="flex items-start gap-3">
								<div class="text-3xl">${gameIcon}</div>
								<div class="flex-1">
									<div class="flex items-center justify-between mb-1">
										<span class="font-semibold text-white capitalize">${invite.gameType}</span>
										${statusBadge}
									</div>
									<p class="text-sm text-gray-300">
										${isReceived 
											? `<span class="text-blue-400">${this.escapeHtml(invite.fromDisplayName)}</span> invited you to play` 
											: `You invited <span class="text-blue-400">${this.escapeHtml(invite.toDisplayName)}</span>`
										}
									</p>
									<p class="text-xs text-gray-500 mt-1">${this.formatTimestamp(invite.createdAt)}</p>
									${actionButtons}
								</div>
							</div>
						</div>
					`;
				}).join('')}</div>
		`;
		
		return sendInviteSection + invitesSection;
	}

	private renderInputArea(): string {
		if (this.currentTab === 'dm' && !this.activeConversationId && !(this as any).tempRecipientId) {
			return '';
		}
		
		// No input area for games tab
		if (this.currentTab === 'games') {
			return '';
		}

		let placeholder = 'Type a message...';
		if (this.currentTab === 'dm') {
			if ((this as any).tempRecipientId) {
				const friend = this.friends.find(f => f.id === (this as any).tempRecipientId);
				placeholder = friend ? `Message ${friend.display_name}...` : 'Type a message to your friend...';
			} else {
				placeholder = 'Type a message to your friend...';
			}
		}

		return `
			<div class="p-4 bg-gray-900 border-t border-gray-700">
				<div class="flex gap-2">
					<input 
						id="chat-input" 
						type="text" 
						placeholder="${placeholder}"
						maxlength="1000"
						class="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					<button id="chat-send" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors">
						Send
					</button>
				</div>
				${this.currentTab === 'dm' && (this.activeConversationId || (this as any).tempRecipientId) ? 
					'<button id="back-to-conversations" class="text-sm text-gray-400 hover:text-white mt-2 transition-colors">← Back to conversations</button>' : 
					''
				}
			</div>
		`;
	}

	private renderMessages(): void {
		const messagesContainer = document.getElementById('chat-messages');
		if (!messagesContainer) return;

		if (this.currentTab === 'dm' && !this.activeConversationId && !(this as any).tempRecipientId) {
			messagesContainer.innerHTML = this.renderConversationListHTML();
			this.attachConversationListeners();
		} else if (this.currentTab === 'games') {
			messagesContainer.innerHTML = this.renderGameInvitesHTML();
			this.attachGameInviteListeners();
		} else {
			messagesContainer.innerHTML = this.renderMessagesHTML();
			this.attachDeleteListeners();
		}
	}

	private attachEventListeners(): void {
		// Close button
		document.getElementById('chat-close')?.addEventListener('click', () => this.toggle());

		// Tab switcher
		document.getElementById('tab-global')?.addEventListener('click', () => this.switchTab('global'));
		document.getElementById('tab-dm')?.addEventListener('click', () => this.switchTab('dm'));
		document.getElementById('tab-games')?.addEventListener('click', () => this.switchTab('games'));

		if (!this.isInGame) {
			// Send button
			document.getElementById('chat-send')?.addEventListener('click', () => this.sendMessage());

			// Enter key to send
			const input = document.getElementById('chat-input') as HTMLInputElement;
			input?.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') this.sendMessage();
			});

			// Back button (DMs)
			document.getElementById('back-to-conversations')?.addEventListener('click', () => {
				this.activeConversationId = null;
				delete (this as any).tempRecipientId;
				this.render();
			});

			// Attach message-specific listeners
			this.attachDeleteListeners();
			this.attachConversationListeners();
		}
	}

	private attachDeleteListeners(): void {
		// Delete message buttons
		document.querySelectorAll('[data-delete-message]').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const messageId = parseInt(btn.getAttribute('data-delete-message')!);
				this.deleteMessage(messageId);
			});
		});
	}

	private attachConversationListeners(): void {
		// Conversation/Friend buttons
		document.querySelectorAll('[data-conversation-id]').forEach(btn => {
			btn.addEventListener('click', () => {
				const convIdStr = btn.getAttribute('data-conversation-id')!;
				const otherUserId = parseInt(btn.getAttribute('data-other-user-id')!);
				
				if (convIdStr && convIdStr !== '') {
					// Existing conversation - open it
					const convId = parseInt(convIdStr);
					this.openConversation(convId);
				} else {
					// New conversation - set up for first message
					const friend = this.friends.find(f => f.id === otherUserId);
					if (friend) {
						this.activeConversationId = null; // Will be created on first message
						(this as any).tempRecipientId = friend.id;
						this.render();
					}
				}
			});
		});
	}

	private attachGameInviteListeners(): void {
		document.querySelectorAll('.send-game-invite').forEach(btn => {
			btn.addEventListener('click', () => {
				const targetUserId = parseInt(btn.getAttribute('data-friend-id')!);
				const gameType = btn.getAttribute('data-game-type')! as 'tetris' | 'pong';
				const targetUser = this.onlineUsers.find(u => u.userId === targetUserId);
				
				if (targetUser) {
					this.socket.emit('game:send_invite', { toUserId: targetUserId, gameType });
					this.showNotification(`Game invite sent to ${targetUser.displayName}!`, 'success');
				}
			});
		});
		
		document.querySelectorAll('.accept-invite').forEach(btn => {
			btn.addEventListener('click', () => {
				const inviteId = parseInt(btn.getAttribute('data-invite-id')!);
				const gameType = btn.getAttribute('data-game-type')! as 'tetris' | 'pong';
				const invite = this.gameInvites.find(inv => inv.id === inviteId);
				
				if (invite) invite.status = 'accepted';
				this.socket.emit('game:accept_invite', { inviteId, gameType });
				this.showNotification('Invite accepted! Starting game...', 'success');
				
				// Update badge counter immediately
				this.updateBadgeAndRefresh();
				// Navigation will be handled by the socket event response
			});
		});

		document.querySelectorAll('.decline-invite').forEach(btn => {
			btn.addEventListener('click', () => {
				const inviteId = parseInt(btn.getAttribute('data-invite-id')!);
				const invite = this.gameInvites.find(inv => inv.id === inviteId);
				
				if (invite) invite.status = 'declined';
				this.socket.emit('game:decline_invite', { inviteId });
				this.showNotification('Invite declined', 'info');
				
				// Update badge counter immediately
				this.updateBadgeAndRefresh();
			});
		});

		const cleanupBtn = document.getElementById('cleanup-invites');
		if (cleanupBtn) {
			cleanupBtn.addEventListener('click', () => {
				const completedIds = this.gameInvites
					.filter(inv => inv.status === 'accepted' || inv.status === 'declined')
					.map(inv => inv.id);
				
				if (completedIds.length > 0) {
					this.gameInvites = this.gameInvites.filter(inv => 
						inv.status !== 'accepted' && inv.status !== 'declined'
					);
					this.socket.emit('game:cleanup_invites', { inviteIds: completedIds });
					this.showNotification(`Cleaned up ${completedIds.length} invite(s)`, 'success');
					if (this.currentTab === 'games') this.renderMessages();
				}
			});
		}
	}

	private switchTab(tab: 'global' | 'dm' | 'games'): void {
		this.currentTab = tab;
		this.activeConversationId = null;

		if (tab === 'global') {
			this.socket.emit('chat:get_history', { type: 'global', limit: 50 });
			// chat:history handler will render when data arrives (or immediately if cached)
		} else if (tab === 'dm') {
			// Switching to DM tab - request conversations and fresh online status
			this.socket.emit('chat:get_conversations');
			this.socket.emit('request_online_users');
			// chat:conversations handler will render when data arrives
		} else if (tab === 'games') {
			// Switching to Games tab - request game invites list and online users
			this.socket.emit('game:get_invites');
			this.socket.emit('request_online_users');
			// Fetch win rates in background and re-render when ready
			this.fetchWinRates().then(() => {
				if (this.currentTab === 'games') {
					this.renderMessages();
				}
			});
			// Clear game invite count when viewing
			this.gameInviteCount = 0;
			this.updateUnreadBadge();
		}
		
		// Always render to update tabs immediately - messages area will be updated by handlers
		this.render();
	}

	private openConversation(conversationId: number): void {
		this.activeConversationId = conversationId;
		this.socket.emit('chat:mark_read', { conversationId });

		if (!this.dmMessages.has(conversationId)) {
			// Request history - handler will re-render when data arrives
			this.socket.emit('chat:get_history', { type: 'dm', conversationId, limit: 50 });
		}
		
		// Always render immediately to show UI structure
		// If messages aren't loaded yet, they'll be updated by chat:history handler
		this.render();
	}

	private sendMessage(): void {
		const input = document.getElementById('chat-input') as HTMLInputElement;
		if (!input) return;

		const message = input.value.trim();
		if (!message) return;

		if (this.currentTab === 'global') {
			this.socket.emit('chat:send_global', { message });
		} else if (this.activeConversationId) {
			const conversation = this.conversations.find(c => c.id === this.activeConversationId);
			if (conversation) {
				this.socket.emit('chat:send_dm', { recipientId: conversation.otherUserId, message });
			}
		} else if ((this as any).tempRecipientId) {
			this.socket.emit('chat:send_dm', { recipientId: (this as any).tempRecipientId, message });
			delete (this as any).tempRecipientId;
			setTimeout(() => this.socket.emit('chat:get_conversations'), 500);
		}

		input.value = '';
	}

	private deleteMessage(messageId: number): void {
		if (confirm('Are you sure you want to delete this message?')) {
			this.socket.emit('chat:delete_message', { messageId });
		}
	}

	private scrollToBottom(): void {
		const messagesContainer = document.getElementById('chat-messages');
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	private updateUnreadBadge(): void {
		const badge = document.getElementById('chat-unread-badge');
		if (!badge) return;

		// Calculate total unread messages across all conversations
		this.dmUnreadCount = this.conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
		const totalUnread = this.dmUnreadCount + this.gameInviteCount;

		if (totalUnread > 0) {
			badge.textContent = totalUnread > 99 ? '99+' : totalUnread.toString();
			badge.classList.remove('hidden');
		} else {
			badge.classList.add('hidden');
		}
		
		// Update individual tab badges
		const dmBadge = document.getElementById('tab-dm-badge');
		const gamesBadge = document.getElementById('tab-games-badge');
		
		if (dmBadge) {
			if (this.dmUnreadCount > 0) {
				dmBadge.textContent = this.dmUnreadCount > 99 ? '99+' : this.dmUnreadCount.toString();
				dmBadge.classList.remove('hidden');
			} else {
				dmBadge.classList.add('hidden');
			}
		}
		
		if (gamesBadge) {
			if (this.gameInviteCount > 0) {
				gamesBadge.textContent = this.gameInviteCount > 99 ? '99+' : this.gameInviteCount.toString();
				gamesBadge.classList.remove('hidden');
			} else {
				gamesBadge.classList.add('hidden');
			}
		}
	}

	private updateBadgeAndRefresh(): void {
		this.gameInviteCount = this.gameInvites.filter(inv => 
			inv.status === 'pending' && inv.toUserId === (this.socket as any).userId
		).length;
		this.updateUnreadBadge();
		if (this.container && this.currentTab === 'games') {
			requestAnimationFrame(() => this.renderMessages());
		}
	}

	private showNotification(message: string, type: 'success' | 'error' | 'info'): void {
		const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };
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

	private formatTimestamp(timestamp: string): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) {
			return 'Just now';
		} else if (diffMins < 60) {
			return `${diffMins}m ago`;
		} else if (diffHours < 24) {
			return `${diffHours}h ago`;
		} else if (diffDays < 7) {
			return `${diffDays}d ago`;
		} else {
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		}
	}
}
