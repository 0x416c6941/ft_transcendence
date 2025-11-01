/**
 * @fileoverview Fastify plugin with "/friends" routes.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateToken } from '../middleware/auth.js';
import {
	AddFriendSchema,
	GetFriendsSchema,
	RemoveFriendSchema
} from '../schemas/friends.schemas.js';
import {
	ApiError,
	dbGetUserById,
	dbGetUserByUsername
} from '../utils/users.js';
import {
	dbGetAllFriendsByAdderId,
	dbAddFriendsRecord,
	dbRemoveFriendsRecord
} from '../utils/friends.js';

export default async function friendsRoutes(fastify: FastifyInstance) {
	fastify.get(
		'/friends',
		{
			preHandler: authenticateToken,
			schema: GetFriendsSchema
		},
		async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				const user = await dbGetUserById(fastify, request.user!.userId);
				if (!user) {
					return reply
						.code(401)
						.send({ error: 'JWT is valid, yet your user was removed from the system' });
				}

				const friends = await dbGetAllFriendsByAdderId(fastify, request.user!.userId);
				const friendsIds = friends.map((friend: FriendsDbRecord) => friend.added_id);

				return reply
					.code(200)
					.send({ ids: friendsIds });
			}
			catch (err: any) {
				if (err instanceof ApiError) {
					request.log.error({ err: err.details }, err.message);
					return reply
						.code(err.replyHttpCode)
						.send({ error: err.message });
				}
				fastify.log.error(err);
				return reply
					.code(500)
					.send({ error: 'Internal server error' });
			}
		}
	);

	fastify.post<{ Params: UsernameParams }>(
		'/friends/:username',
		{
			preHandler: authenticateToken,
			schema: AddFriendSchema
		},
		async (request: FastifyRequest<{ Params: UsernameParams }>, reply: FastifyReply) => {
			const { username } = request.params;

			try {
				const user = await dbGetUserById(fastify, request.user!.userId);
				if (!user) {
					return reply
						.code(401)
						.send({ error: 'JWT is valid, yet your user was removed from the system' });
				}

				const toAdd = await dbGetUserByUsername(fastify, username);
				if (!toAdd) {
					return reply
						.code(404)
						.send({ error: "User with such username doesn't exist" });
				}
				else if (user.username === toAdd.username) {
					return reply
						.code(400)
						.send({ error: "You can't add yourself as a friend" });
				}

				await dbAddFriendsRecord(fastify, user.id, toAdd.id);

				// Notify both users about the friend update via socket
				const io = (fastify as any).io;
				const onlineUsers = (fastify as any).onlineUsers as Map<number, { socketId: string; username: string; displayName: string }>;
				
				// Notify the user who added the friend
				const userSocket = onlineUsers.get(user.id);
				if (userSocket) {
					io.to(userSocket.socketId).emit('friends_updated');
				}
				
				// Notify the user who was added
				const addedUserSocket = onlineUsers.get(toAdd.id);
				if (addedUserSocket) {
					io.to(addedUserSocket.socketId).emit('friends_updated');
				}

				return reply
					.code(200)
					.send({ message: 'Successfully added a user as friend' });
			}
			catch (err: any) {
				if (err instanceof ApiError) {
					fastify.log.error({ err }, err.message);
					return reply
						.code(err.replyHttpCode)
						.send({ error: err.message });
				}
				fastify.log.error(err);
				return reply
					.code(500)
					.send({ error: 'Internal server error' });
			}
		}
	);

	fastify.delete<{ Params: UsernameParams }>(
		'/friends/:username',
		{
			preHandler: authenticateToken,
			schema: RemoveFriendSchema
		},
		async (request: FastifyRequest<{ Params: UsernameParams }>, reply: FastifyReply) => {
			const { username } = request.params;

			try {
				const user = await dbGetUserById(fastify, request.user!.userId);
				if (!user) {
					return reply
						.code(401)
						.send({ error: 'JWT is valid, yet your user was removed from the system' });
				}

				const toRemove = await dbGetUserByUsername(fastify, username);
				if (!toRemove) {
					return reply
						.code(404)
						.send({ error: "User with such username doesn't exist" });
				}
				else if (user.username === toRemove.username) {
					return reply
						.code(400)
						.send({ error: "You can't remove yourself from your friend list" });
				}

				await dbRemoveFriendsRecord(fastify, user.id, toRemove.id);

				// Notify both users about the friend update via socket
				const io = (fastify as any).io;
				const onlineUsers = (fastify as any).onlineUsers as Map<number, { socketId: string; username: string; displayName: string }>;
				
				// Notify the user who removed the friend
				const userSocket = onlineUsers.get(user.id);
				if (userSocket) {
					io.to(userSocket.socketId).emit('friends_updated');
				}
				
				// Notify the user who was removed
				const removedUserSocket = onlineUsers.get(toRemove.id);
				if (removedUserSocket) {
					io.to(removedUserSocket.socketId).emit('friends_updated');
				}

				return reply
					.code(200)
					.send({ message: 'Successfully removed a user from friends list' });
			}
			catch (err: any) {
				if (err instanceof ApiError) {
					fastify.log.error({ err }, err.message);
					return reply
						.code(err.replyHttpCode)
						.send({ error: err.message });
				}
				fastify.log.error(err);
				return reply
					.code(500)
					.send({ error: 'Internal server error' });
			}
		}
	);
}
