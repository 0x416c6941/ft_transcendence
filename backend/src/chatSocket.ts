/**
 * Chat Socket.IO handlers
 */

import { FastifyInstance } from 'fastify';
import { Server, Socket } from 'socket.io';
import {
	getOrCreateConversation,
	areFriends,
	saveChatMessage,
	getGlobalChatHistory,
	getConversationHistory,
	getUserConversations,
	deleteMessage,
	editMessage,
	deleteConversation,
	validateChatMessage
} from './utils/chat.js';
import { ChatHistoryRequest } from './types/chat.js';

// Rate limiting: track message counts per user
const messageRateLimits = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 10000; // 10 seconds
const RATE_LIMIT_MAX = 5; // 5 messages per window

function checkRateLimit(userId: number): boolean {
	const now = Date.now();
	const userLimit = messageRateLimits.get(userId);

	if (!userLimit || now > userLimit.resetAt) {
		messageRateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
		return true;
	}

	if (userLimit.count >= RATE_LIMIT_MAX) {
		return false;
	}

	userLimit.count++;
	return true;
}

/**
 * Setup chat socket handlers on existing Socket.IO instance
 */
export function setupChatSocket(fastify: FastifyInstance, io: Server): void {
	io.on('connection', (socket: Socket) => {
		const userId = (socket as any).userId;
		const username = (socket as any).username;

		if (!userId || !username) {
			// Not authenticated, ignore chat handlers
			return;
		}

		fastify.log.info(`Setting up chat handlers for user ${username} (${userId})`);

		// Auto-join global chat room
		socket.join('chat:global');

		// ========== GLOBAL CHAT ==========

		socket.on('chat:send_global', async (data: { message: string }) => {
			try {
				// Rate limiting
				if (!checkRateLimit(userId)) {
					socket.emit('chat:error', { code: 'RATE_LIMIT', message: 'Too many messages. Please slow down.' });
					return;
				}

				// Validate message
				const validation = validateChatMessage(data.message);
				if (!validation.valid) {
					socket.emit('chat:error', { code: 'INVALID_MESSAGE', message: validation.error });
					return;
				}

				// Save to database
				const messageId = await saveChatMessage(fastify, userId, 'global', validation.sanitized!);

				// Get sender's display name
				const user: any = await new Promise((resolve, reject) => {
					fastify.sqlite.get('SELECT display_name FROM users WHERE id = ?', [userId], (err: Error | null, row: any) => {
						if (err) return reject(err);
						resolve(row);
					});
				});

				// Broadcast to all users in global chat
				const messageData = {
					id: messageId,
					senderId: userId,
					senderUsername: username,
					senderDisplayName: user.display_name,
					message: validation.sanitized,
					timestamp: new Date().toISOString()
				};

				io.to('chat:global').emit('chat:message_global', messageData);
				fastify.log.info(`Global chat message from ${username}: ${validation.sanitized}`);
			} catch (error: any) {
				fastify.log.error(`Error sending global chat message: ${error.message}`);
				socket.emit('chat:error', { code: 'SERVER_ERROR', message: 'Failed to send message' });
			}
		});

		// ========== DIRECT MESSAGES ==========

		socket.on('chat:send_dm', async (data: { recipientId: number; message: string }) => {
			try {
				// Rate limiting
				if (!checkRateLimit(userId)) {
					socket.emit('chat:error', { code: 'RATE_LIMIT', message: 'Too many messages. Please slow down.' });
					return;
				}

				// Validate message
				const validation = validateChatMessage(data.message);
				if (!validation.valid) {
					socket.emit('chat:error', { code: 'INVALID_MESSAGE', message: validation.error });
					return;
				}

				// Check if users are friends
				const isFriend = await areFriends(fastify, userId, data.recipientId);
				if (!isFriend) {
					socket.emit('chat:error', { code: 'NOT_FRIENDS', message: 'You can only send DMs to friends' });
					return;
				}

				// Get or create conversation
				const conversationId = await getOrCreateConversation(fastify, userId, data.recipientId);

				// Save message
				const messageId = await saveChatMessage(fastify, userId, 'dm', validation.sanitized!, conversationId);

				// Get sender's display name
				const user: any = await new Promise((resolve, reject) => {
					fastify.sqlite.get('SELECT display_name FROM users WHERE id = ?', [userId], (err: Error | null, row: any) => {
						if (err) return reject(err);
						resolve(row);
					});
				});

				const messageData = {
					id: messageId,
					conversationId,
					senderId: userId,
					senderUsername: username,
					senderDisplayName: user.display_name,
					recipientId: data.recipientId,
					message: validation.sanitized,
					timestamp: new Date().toISOString()
				};

				// Send to recipient if online
				const onlineUsers = (fastify as any).onlineUsers || new Map();
				const recipient = onlineUsers.get(data.recipientId);
				if (recipient) {
					io.to(recipient.socketId).emit('chat:message_dm', messageData);
				}

				// Send confirmation to sender
				socket.emit('chat:message_dm', messageData);

				fastify.log.info(`DM from ${username} to user ${data.recipientId}: ${validation.sanitized}`);
			} catch (error: any) {
				fastify.log.error(`Error sending DM: ${error.message}`);
				socket.emit('chat:error', { code: 'SERVER_ERROR', message: 'Failed to send message' });
			}
		});

		// ========== CHAT HISTORY ==========

		socket.on('chat:get_history', async (data: ChatHistoryRequest) => {
			try {
				const limit = data.limit || 50;
				const offset = data.offset || 0;

				if (data.type === 'global') {
					const history = await getGlobalChatHistory(fastify, limit, offset);
					socket.emit('chat:history', history);
				} else if (data.type === 'dm' && data.conversationId) {
					// Verify user is part of this conversation
					const conversation: any = await new Promise((resolve, reject) => {
						fastify.sqlite.get(
							'SELECT * FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
							[data.conversationId, userId, userId],
							(err: Error | null, row: any) => {
								if (err) return reject(err);
								resolve(row);
							}
						);
					});

					if (!conversation) {
						socket.emit('chat:error', { code: 'UNAUTHORIZED', message: 'Not authorized for this conversation' });
						return;
					}

					const history = await getConversationHistory(fastify, data.conversationId, limit, offset);
					socket.emit('chat:history', history);
				}
			} catch (error: any) {
				fastify.log.error(`Error getting chat history: ${error.message}`);
				socket.emit('chat:error', { code: 'SERVER_ERROR', message: 'Failed to load history' });
			}
		});

		// ========== CONVERSATIONS LIST ==========

		socket.on('chat:get_conversations', async () => {
			try {
				const conversations = await getUserConversations(fastify, userId);
				// Always emit the conversations array, even if empty (that's normal!)
				socket.emit('chat:conversations', conversations);
			} catch (error: any) {
				// Log the error on the server for debugging
				fastify.log.error(`Error getting conversations for user ${userId}: ${error.message}`, error);
				// Send empty array instead of error - let the UI handle the empty state gracefully
				socket.emit('chat:conversations', []);
			}
		});

		// ========== MESSAGE ACTIONS ==========

		socket.on('chat:edit_message', async (data: { messageId: number; newMessage: string }) => {
			try {
				// Validate new message
				const validation = validateChatMessage(data.newMessage);
				if (!validation.valid) {
					socket.emit('chat:error', { code: 'INVALID_MESSAGE', message: validation.error });
					return;
				}

				// Verify user owns this message
				const message: any = await new Promise((resolve, reject) => {
					fastify.sqlite.get(
						'SELECT * FROM chat_messages WHERE id = ? AND sender_id = ? AND deleted_at IS NULL',
						[data.messageId, userId],
						(err: Error | null, row: any) => {
							if (err) return reject(err);
							resolve(row);
						}
					);
				});

				if (!message) {
					socket.emit('chat:error', { code: 'UNAUTHORIZED', message: 'Cannot edit this message' });
					return;
				}

				// Edit message
				await editMessage(fastify, data.messageId, validation.sanitized!);

				const editData = {
					messageId: data.messageId,
					newMessage: validation.sanitized,
					editedAt: new Date().toISOString()
				};

				// Broadcast edit based on message type
				if (message.room_type === 'global') {
					io.to('chat:global').emit('chat:message_edited', editData);
				} else if (message.conversation_id) {
					// Send to both users in conversation
					const conversation: any = await new Promise((resolve, reject) => {
						fastify.sqlite.get('SELECT * FROM conversations WHERE id = ?', [message.conversation_id],
							(err: Error | null, row: any) => {
								if (err) return reject(err);
								resolve(row);
							}
						);
					});

					if (conversation) {
						const onlineUsers = (fastify as any).onlineUsers || new Map();
						const user1 = onlineUsers.get(conversation.user1_id);
						const user2 = onlineUsers.get(conversation.user2_id);
						
						if (user1) io.to(user1.socketId).emit('chat:message_edited', editData);
						if (user2) io.to(user2.socketId).emit('chat:message_edited', editData);
					}
				}

				fastify.log.info(`Message ${data.messageId} edited by ${username}`);
			} catch (error: any) {
				fastify.log.error(`Error editing message: ${error.message}`);
				socket.emit('chat:error', { code: 'SERVER_ERROR', message: 'Failed to edit message' });
			}
		});

		socket.on('chat:delete_message', async (data: { messageId: number }) => {
			try {
				// Check if user is admin
				const isAdmin: boolean = await new Promise((resolve, reject) => {
					fastify.sqlite.get('SELECT 1 FROM admins WHERE user_id = ?', [userId],
						(err: Error | null, row: any) => {
							if (err) return reject(err);
							resolve(!!row);
						}
					);
				});

				// Verify user owns this message OR is admin
				const message: any = await new Promise((resolve, reject) => {
					fastify.sqlite.get(
						'SELECT * FROM chat_messages WHERE id = ? AND deleted_at IS NULL',
						[data.messageId],
						(err: Error | null, row: any) => {
							if (err) return reject(err);
							resolve(row);
						}
					);
				});

				if (!message) {
					socket.emit('chat:error', { code: 'NOT_FOUND', message: 'Message not found' });
					return;
				}

				if (message.sender_id !== userId && !isAdmin) {
					socket.emit('chat:error', { code: 'UNAUTHORIZED', message: 'Cannot delete this message' });
					return;
				}

				// Delete message
				await deleteMessage(fastify, data.messageId);

				const deleteData = { messageId: data.messageId };

				// Broadcast deletion
				if (message.room_type === 'global') {
					io.to('chat:global').emit('chat:message_deleted', deleteData);
				} else if (message.conversation_id) {
					const conversation: any = await new Promise((resolve, reject) => {
						fastify.sqlite.get('SELECT * FROM conversations WHERE id = ?', [message.conversation_id],
							(err: Error | null, row: any) => {
								if (err) return reject(err);
								resolve(row);
							}
						);
					});

					if (conversation) {
						const onlineUsers = (fastify as any).onlineUsers || new Map();
						const user1 = onlineUsers.get(conversation.user1_id);
						const user2 = onlineUsers.get(conversation.user2_id);
						
						if (user1) io.to(user1.socketId).emit('chat:message_deleted', deleteData);
						if (user2) io.to(user2.socketId).emit('chat:message_deleted', deleteData);
					}
				}

				fastify.log.info(`Message ${data.messageId} deleted by ${username}${isAdmin ? ' (admin)' : ''}`);
			} catch (error: any) {
				fastify.log.error(`Error deleting message: ${error.message}`);
				socket.emit('chat:error', { code: 'SERVER_ERROR', message: 'Failed to delete message' });
			}
		});

		// ========== ADMIN: DELETE CONVERSATION ==========

		socket.on('chat:delete_conversation', async (data: { conversationId: number }) => {
			try {
				// Check if user is admin
				const isAdmin: boolean = await new Promise((resolve, reject) => {
					fastify.sqlite.get('SELECT 1 FROM admins WHERE user_id = ?', [userId],
						(err: Error | null, row: any) => {
							if (err) return reject(err);
							resolve(!!row);
						}
					);
				});

				if (!isAdmin) {
					socket.emit('chat:error', { code: 'UNAUTHORIZED', message: 'Admin access required' });
					return;
				}

				// Delete conversation
				await deleteConversation(fastify, data.conversationId);

				// Notify both users
				const conversation: any = await new Promise((resolve, reject) => {
					fastify.sqlite.get('SELECT * FROM conversations WHERE id = ?', [data.conversationId],
						(err: Error | null, row: any) => {
							if (err) return reject(err);
							resolve(row);
						}
					);
				});

				if (conversation) {
					const onlineUsers = (fastify as any).onlineUsers || new Map();
					const user1 = onlineUsers.get(conversation.user1_id);
					const user2 = onlineUsers.get(conversation.user2_id);
					
					const deleteData = { conversationId: data.conversationId };
					if (user1) io.to(user1.socketId).emit('chat:conversation_deleted', deleteData);
					if (user2) io.to(user2.socketId).emit('chat:conversation_deleted', deleteData);
				}

				fastify.log.info(`Conversation ${data.conversationId} deleted by admin ${username}`);
			} catch (error: any) {
				fastify.log.error(`Error deleting conversation: ${error.message}`);
				socket.emit('chat:error', { code: 'SERVER_ERROR', message: 'Failed to delete conversation' });
			}
		});

		// ========== MARK MESSAGES AS READ ==========

		socket.on('chat:mark_read', async (data: { conversationId: number }) => {
			if (!userId) {
				socket.emit('chat:error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
				return;
			}

			try {
				const lastMessage: any = await new Promise((resolve, reject) => {
					fastify.sqlite.get(
						`SELECT id FROM chat_messages 
						 WHERE conversation_id = ? AND deleted_at IS NULL 
						 ORDER BY created_at DESC LIMIT 1`,
						[data.conversationId],
						(err: Error | null, row: any) => err ? reject(err) : resolve(row)
					);
				});

				if (lastMessage) {
					await new Promise<void>((resolve, reject) => {
						fastify.sqlite.run(
							`INSERT INTO message_reads (user_id, conversation_id, last_read_message_id, last_read_at)
							 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
							 ON CONFLICT(user_id, conversation_id) 
							 DO UPDATE SET last_read_message_id = ?, last_read_at = CURRENT_TIMESTAMP`,
							[userId, data.conversationId, lastMessage.id, lastMessage.id],
							(err: Error | null) => err ? reject(err) : resolve()
						);
					});
				}
				
				const conversations = await getUserConversations(fastify, userId);
				socket.emit('chat:conversations', conversations);
			} catch (error) {
				fastify.log.error({ err: error }, 'Error marking messages as read');
				socket.emit('chat:error', { code: 'SERVER_ERROR', message: 'Failed to mark messages as read' });
			}
		});

		// ========== TYPING INDICATORS (Optional) ==========

	});

	fastify.log.info('Chat socket handlers initialized');
}
