/**
 * Chat utility functions for database operations
 */

import { FastifyInstance } from 'fastify';
import {
	ChatMessage,
	ChatMessageWithSender,
	Conversation,
	ConversationWithDetails,
	ChatHistoryResponse
} from '../types/chat.js';

/**
 * Get or create a conversation between two users
 */
export async function getOrCreateConversation(
	fastify: FastifyInstance,
	userId1: number,
	userId2: number
): Promise<number> {
	const [smallerId, largerId] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];

	return new Promise((resolve, reject) => {
		// First, try to find existing conversation
		fastify.sqlite.get(
			'SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?',
			[smallerId, largerId],
			(err: Error | null, row: any) => {
				if (err) return reject(err);
				
				if (row) {
					// Conversation exists
					resolve(row.id);
				} else {
					// Create new conversation
					fastify.sqlite.run(
						'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
						[smallerId, largerId],
						function (err: Error | null) {
							if (err) return reject(err);
							resolve(this.lastID);
						}
					);
				}
			}
		);
	});
}

/**
 * Check if two users are friends
 */
export async function areFriends(
	fastify: FastifyInstance,
	userId1: number,
	userId2: number
): Promise<boolean> {
	return new Promise((resolve, reject) => {
		fastify.sqlite.get(
			`SELECT 1 FROM friends 
			 WHERE (adder_id = ? AND added_id = ?) 
			    OR (adder_id = ? AND added_id = ?)`,
			[userId1, userId2, userId2, userId1],
			(err: Error | null, row: any) => {
				if (err) return reject(err);
				resolve(!!row);
			}
		);
	});
}

/**
 * Save a chat message to database
 */
export async function saveChatMessage(
	fastify: FastifyInstance,
	senderId: number,
	roomType: 'global' | 'dm',
	message: string,
	conversationId: number | null = null
): Promise<number> {
	return new Promise((resolve, reject) => {
		fastify.sqlite.run(
			`INSERT INTO chat_messages (sender_id, conversation_id, room_type, message) 
			 VALUES (?, ?, ?, ?)`,
			[senderId, conversationId, roomType, message],
			function (err: Error | null) {
				if (err) return reject(err);
				
				// Update conversation's last_message_at if it's a DM
				if (conversationId) {
					fastify.sqlite.run(
						'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
						[conversationId],
						() => {} // Ignore errors on this update
					);
				}
				
				resolve(this.lastID);
			}
		);
	});
}

/**
 * Get global chat history
 */
export async function getGlobalChatHistory(
	fastify: FastifyInstance,
	limit: number = 50,
	offset: number = 0
): Promise<ChatHistoryResponse> {
	return new Promise((resolve, reject) => {
		// Get messages with sender info
		fastify.sqlite.all(
			`SELECT 
				cm.id, cm.sender_id, cm.message, cm.created_at, cm.edited_at,
				u.username as sender_username,
				u.display_name as sender_display_name
			 FROM chat_messages cm
			 JOIN users u ON cm.sender_id = u.id
			 WHERE cm.room_type = 'global' AND cm.deleted_at IS NULL
			 ORDER BY cm.created_at DESC
			 LIMIT ? OFFSET ?`,
			[limit + 1, offset], // Get one extra to check if there are more
			(err: Error | null, rows: any[]) => {
				if (err) return reject(err);
				
				const hasMore = rows.length > limit;
				const messages = (hasMore ? rows.slice(0, limit) : rows)
					.reverse() // Oldest first for display
					.map(row => ({
						id: row.id,
						sender_id: row.sender_id,
						conversation_id: null,
						room_type: 'global' as const,
						message: row.message,
						created_at: row.created_at,
						edited_at: row.edited_at,
						deleted_at: null,
						sender_username: row.sender_username,
						sender_display_name: row.sender_display_name
					}));
				
				// Get total count
				fastify.sqlite.get(
					'SELECT COUNT(*) as count FROM chat_messages WHERE room_type = ? AND deleted_at IS NULL',
					['global'],
					(err: Error | null, countRow: any) => {
						if (err) return reject(err);
						resolve({
							messages,
							hasMore,
							total: countRow.count
						});
					}
				);
			}
		);
	});
}

/**
 * Get DM conversation history
 */
export async function getConversationHistory(
	fastify: FastifyInstance,
	conversationId: number,
	limit: number = 50,
	offset: number = 0
): Promise<ChatHistoryResponse> {
	return new Promise((resolve, reject) => {
		fastify.sqlite.all(
			`SELECT 
				cm.id, cm.sender_id, cm.conversation_id, cm.message, cm.created_at, cm.edited_at,
				u.username as sender_username,
				u.display_name as sender_display_name
			 FROM chat_messages cm
			 JOIN users u ON cm.sender_id = u.id
			 WHERE cm.conversation_id = ? AND cm.deleted_at IS NULL
			 ORDER BY cm.created_at DESC
			 LIMIT ? OFFSET ?`,
			[conversationId, limit + 1, offset],
			(err: Error | null, rows: any[]) => {
				if (err) return reject(err);
				
				const hasMore = rows.length > limit;
				const messages = (hasMore ? rows.slice(0, limit) : rows)
					.reverse()
					.map(row => ({
						id: row.id,
						sender_id: row.sender_id,
						conversation_id: row.conversation_id,
						room_type: 'dm' as const,
						message: row.message,
						created_at: row.created_at,
						edited_at: row.edited_at,
						deleted_at: null,
						sender_username: row.sender_username,
						sender_display_name: row.sender_display_name
					}));
				
				fastify.sqlite.get(
					'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = ? AND deleted_at IS NULL',
					[conversationId],
					(err: Error | null, countRow: any) => {
						if (err) return reject(err);
						resolve({
							messages,
							hasMore,
							total: countRow.count
						});
					}
				);
			}
		);
	});
}

/**
 * Get all mutual friends as potential conversations
 * Returns both existing conversations and mutual friends without conversations
 */
export async function getUserConversations(
	fastify: FastifyInstance,
	userId: number
): Promise<ConversationWithDetails[]> {
	return new Promise((resolve, reject) => {
		// Get ALL mutual friends with optional conversation data
		fastify.sqlite.all(
			`SELECT 
				f1.added_id as other_user_id,
				u.username as other_user_username,
				u.display_name as other_user_display_name,
				c.id as conversation_id,
				c.user1_id,
				c.user2_id,
				c.created_at,
				c.last_message_at,
				(SELECT message FROM chat_messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) as last_message,
				COALESCE((
					SELECT COUNT(*) 
					FROM chat_messages cm
					LEFT JOIN message_reads mr ON mr.conversation_id = cm.conversation_id AND mr.user_id = ?
					WHERE cm.conversation_id = c.id 
					AND cm.deleted_at IS NULL
					AND cm.sender_id != ?
					AND (mr.last_read_message_id IS NULL OR cm.id > mr.last_read_message_id)
				), 0) as unread_count
			FROM friends f1
			INNER JOIN friends f2 
				ON f1.adder_id = f2.added_id 
				AND f1.added_id = f2.adder_id
			INNER JOIN users u ON u.id = f1.added_id
			LEFT JOIN conversations c 
				ON (c.user1_id = ? AND c.user2_id = f1.added_id)
				OR (c.user2_id = ? AND c.user1_id = f1.added_id)
			WHERE f1.adder_id = ?
			ORDER BY c.last_message_at DESC NULLS LAST`,
			[userId, userId, userId, userId, userId],
			(err: Error | null, rows: any[]) => {
				if (err) return reject(err);
				
				const conversations: ConversationWithDetails[] = rows.map(row => ({
					id: row.conversation_id, // null if no conversation exists yet
					user1_id: row.user1_id || userId,
					user2_id: row.user2_id || row.other_user_id,
					created_at: row.created_at,
					last_message_at: row.last_message_at,
					other_user_id: row.other_user_id,
					other_user_username: row.other_user_username,
					other_user_display_name: row.other_user_display_name,
					last_message: row.last_message,
					unread_count: row.unread_count || 0,
					is_friend: true // All results are mutual friends
				}));
				
				resolve(conversations);
			}
		);
	});
}

/**
 * Delete a message (soft delete)
 */
export async function deleteMessage(
	fastify: FastifyInstance,
	messageId: number
): Promise<void> {
	return new Promise((resolve, reject) => {
		fastify.sqlite.run(
			'UPDATE chat_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
			[messageId],
			(err: Error | null) => {
				if (err) return reject(err);
				resolve();
			}
		);
	});
}

/**
 * Edit a message
 */
export async function editMessage(
	fastify: FastifyInstance,
	messageId: number,
	newMessage: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		fastify.sqlite.run(
			'UPDATE chat_messages SET message = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
			[newMessage, messageId],
			(err: Error | null) => {
				if (err) return reject(err);
				resolve();
			}
		);
	});
}

/**
 * Delete entire conversation (admin only)
 */
export async function deleteConversation(
	fastify: FastifyInstance,
	conversationId: number
): Promise<void> {
	return new Promise((resolve, reject) => {
		// Soft delete all messages in conversation
		fastify.sqlite.run(
			'UPDATE chat_messages SET deleted_at = CURRENT_TIMESTAMP WHERE conversation_id = ?',
			[conversationId],
			(err: Error | null) => {
				if (err) return reject(err);
				
				// Delete the conversation itself
				fastify.sqlite.run(
					'DELETE FROM conversations WHERE id = ?',
					[conversationId],
					(err: Error | null) => {
						if (err) return reject(err);
						resolve();
					}
				);
			}
		);
	});
}

/**
 * Validate and sanitize chat message
 */
export function validateChatMessage(message: string): { valid: boolean; error?: string; sanitized?: string } {
	if (!message || typeof message !== 'string') {
		return { valid: false, error: 'Message is required' };
	}
	
	const trimmed = message.trim();
	
	if (trimmed.length === 0) {
		return { valid: false, error: 'Message cannot be empty' };
	}
	
	if (trimmed.length > 1000) {
		return { valid: false, error: 'Message too long (max 1000 characters)' };
	}
	
	// Basic XSS prevention - strip HTML tags
	const sanitized = trimmed
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	
	return { valid: true, sanitized };
}
