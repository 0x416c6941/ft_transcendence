/**
 * Chat type definitions
 */

export interface ChatMessage {
	id: number;
	sender_id: number;
	conversation_id: number | null;
	room_type: 'global' | 'dm';
	message: string;
	created_at: string;
	edited_at: string | null;
	deleted_at: string | null;
}

export interface ChatMessageWithSender extends ChatMessage {
	sender_username: string;
	sender_display_name: string;
}

export interface Conversation {
	id: number;
	user1_id: number;
	user2_id: number;
	created_at: string;
	last_message_at: string | null;
}

export interface ConversationWithDetails extends Conversation {
	other_user_id: number;
	other_user_username: string;
	other_user_display_name: string;
	last_message: string | null;
	unread_count: number;
	is_friend: boolean;
}

export interface ChatHistoryRequest {
	type: 'global' | 'dm';
	conversationId?: number;
	limit?: number;
	offset?: number;
}

export interface ChatHistoryResponse {
	messages: ChatMessageWithSender[];
	hasMore: boolean;
	total: number;
}
