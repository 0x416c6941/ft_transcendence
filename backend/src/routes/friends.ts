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

				const friends = await dbGetAllFriendsByAdderId(fastify, user.adder_id);
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

				await dbAddFriendsRecord(fastify, user.id, toAdd.id);

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

				await dbRemoveFriendsRecord(fastify, user.id, toRemove.id);

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
