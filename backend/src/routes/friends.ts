/**
 * @fileoverview Fastify plugin with "/friends" routes.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateToken } from '../middleware/auth.js';
import {
	GetFriendsSchema
} from '../schemas/friends.schemas.js';
import {
	ApiError,
	dbGetUserById
} from '../utils/users.js';
import {
	dbGetFriendsByAdderId
} from '../utils/friends.js';

export default async function friendsRoutes(fastify: FastifyInstance) {
	fastify.get('/friends',
		{
			preHandler: authenticateToken,
			schema: GetFriendsSchema
		},
		async (request: FastifyRequest, reply: FastifyReply) => {
			const { userId } = request.user!;

			try {
				const user = await dbGetUserById(fastify, userId);

				if (!user) {
					return reply
						.code(401)
						.send({ error: 'JWT is valid, yet user was removed from the system' });
				}

				const friends = await dbGetFriendsByAdderId(fastify, user.adder_id);
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
}
