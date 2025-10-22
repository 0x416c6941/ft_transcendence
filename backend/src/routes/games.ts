import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateToken } from '../middleware/auth.js';
import { dbGetAdminByUserId } from '../utils/users.js';
import {
	createGameSchema,
	getAllGamesSchema,
	getGameByIdSchema,
	updateGameSchema,
	deleteGameSchema
} from '../schemas/game.schemas.js';

interface CreateGameBody {
	started_at?: string;
	finished_at?: string;
	player1_name: string;
	player1_is_user: boolean;
	player2_name: string;
	player2_is_user: boolean;
	winner?: string;
	data?: string;
}

interface UpdateGameBody {
	finished_at?: string;
	player1_name?: string;
	player1_is_user?: boolean;
	player2_name?: string;
	player2_is_user?: boolean;
	winner?: string;
	data?: string;
}

interface GameParams {
	id: string;
}

export default async function gameRoutes(fastify: FastifyInstance) {
	// Create a new game record (only gamemaster with id 1 can create)
	fastify.post<{ Body: CreateGameBody }>(
		'/games',
		{
			preHandler: authenticateToken,
			schema: createGameSchema
		},
		async (request: FastifyRequest<{ Body: CreateGameBody }>, reply: FastifyReply) => {
			// Only gamemaster (user id 1) can create game records
			if (request.user?.userId !== 1) {
				return reply.code(403).send({
					error: 'Forbidden: Only gamemaster can create game records'
				});
			}

			const {
				started_at,
				finished_at,
				player1_name,
				player1_is_user,
				player2_name,
				player2_is_user,
				winner,
				data
			} = request.body;

			try {
				const gameId = await new Promise<number>((resolve, reject) => {
					const query = started_at
						? 'INSERT INTO games (started_at, finished_at, player1_name, player1_is_user, player2_name, player2_is_user, winner, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
						: 'INSERT INTO games (finished_at, player1_name, player1_is_user, player2_name, player2_is_user, winner, data) VALUES (?, ?, ?, ?, ?, ?, ?)';
					
					const params = started_at
						? [started_at, finished_at || null, player1_name, player1_is_user ? 1 : 0, player2_name, player2_is_user ? 1 : 0, winner || null, data || null]
						: [finished_at || null, player1_name, player1_is_user ? 1 : 0, player2_name, player2_is_user ? 1 : 0, winner || null, data || null];

					fastify.sqlite.run(
						query,
						params,
						function (err: Error | null) {
							if (err) {
								reject(err);
							} else {
								resolve(this.lastID);
							}
						}
					);
				});

				return reply.code(201).send({
					message: 'Game record created successfully',
					gameId
				});
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to create game record' });
			}
		}
	);

	// Get all games (only authenticated users can view)
	fastify.get(
		'/games',
		{
			preHandler: authenticateToken,
			schema: getAllGamesSchema
		},
		async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				const games = await new Promise<any[]>((resolve, reject) => {
					fastify.sqlite.all(
						'SELECT * FROM games ORDER BY started_at DESC',
						(err: Error | null, rows: any[]) => {
							if (err) {
								reject(err);
							} else {
								resolve(rows);
							}
						}
					);
				});

				return reply.code(200).send(games);
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to fetch games' });
			}
		}
	);

	// Get a single game by ID (only authenticated users can view)
	fastify.get<{ Params: GameParams }>(
		'/games/:id',
		{
			preHandler: authenticateToken,
			schema: getGameByIdSchema
		},
		async (request: FastifyRequest<{ Params: GameParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			try {
				const game = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(
						'SELECT * FROM games WHERE id = ?',
						[id],
						(err: Error | null, row: any) => {
							if (err) {
								reject(err);
							} else {
								resolve(row);
							}
						}
					);
				});

				if (!game) {
					return reply.code(404).send({ error: 'Game not found' });
				}

				return reply.code(200).send(game);
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to fetch game' });
			}
		}
	);

	// Update a game by ID (only admins can update)
	fastify.put<{ Params: GameParams; Body: UpdateGameBody }>(
		'/games/:id',
		{
			preHandler: authenticateToken,
			schema: updateGameSchema
		},
		async (
			request: FastifyRequest<{ Params: GameParams; Body: UpdateGameBody }>,
			reply: FastifyReply
		) => {
			const { id } = request.params;

			// Check if user is admin
			try {
				const isAdmin = await dbGetAdminByUserId(fastify, request.user!.userId);
				if (!isAdmin) {
					return reply.code(403).send({
						error: 'Forbidden: Only admins can update game records'
					});
				}
			} catch (error: any) {
				fastify.log.error(error);
				return reply.code(500).send({ error: 'Failed to verify admin status' });
			}

			const {
				finished_at,
				player1_name,
				player1_is_user,
				player2_name,
				player2_is_user,
				winner,
				data
			} = request.body;

			// Build dynamic update query
			const updates: string[] = [];
			const values: any[] = [];

			if (finished_at !== undefined) {
				updates.push('finished_at = ?');
				values.push(finished_at);
			}
			if (player1_name !== undefined) {
				updates.push('player1_name = ?');
				values.push(player1_name);
			}
			if (player1_is_user !== undefined) {
				updates.push('player1_is_user = ?');
				values.push(player1_is_user ? 1 : 0);
			}
			if (player2_name !== undefined) {
				updates.push('player2_name = ?');
				values.push(player2_name);
			}
			if (player2_is_user !== undefined) {
				updates.push('player2_is_user = ?');
				values.push(player2_is_user ? 1 : 0);
			}
			if (winner !== undefined) {
				updates.push('winner = ?');
				values.push(winner);
			}
			if (data !== undefined) {
				updates.push('data = ?');
				values.push(data);
			}

			if (updates.length === 0) {
				return reply.code(400).send({ error: 'No fields to update' });
			}

			values.push(id);

			try {
				const result = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.run(
						`UPDATE games SET ${updates.join(', ')} WHERE id = ?`,
						values,
						function (err: Error | null) {
							if (err) {
								reject(err);
							} else {
								resolve(this);
							}
						}
					);
				});

				if (result.changes === 0) {
					return reply.code(404).send({ error: 'Game not found' });
				}

				return reply.code(200).send({ message: 'Game updated successfully' });
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to update game' });
			}
		}
	);

	// Delete a game by ID (only admins can delete)
	fastify.delete<{ Params: GameParams }>(
		'/games/:id',
		{
			preHandler: authenticateToken,
			schema: deleteGameSchema
		},
		async (request: FastifyRequest<{ Params: GameParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			// Check if user is admin
			try {
				const isAdmin = await dbGetAdminByUserId(fastify, request.user!.userId);
				if (!isAdmin) {
					return reply.code(403).send({
						error: 'Forbidden: Only admins can delete game records'
					});
				}
			} catch (error: any) {
				fastify.log.error(error);
				return reply.code(500).send({ error: 'Failed to verify admin status' });
			}

			try {
				const result = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.run(
						'DELETE FROM games WHERE id = ?',
						[id],
						function (err: Error | null) {
							if (err) {
								reject(err);
							} else {
								resolve(this);
							}
						}
					);
				});

				if (result.changes === 0) {
					return reply.code(404).send({ error: 'Game not found' });
				}

				return reply.code(200).send({ message: 'Game deleted successfully' });
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to delete game' });
			}
		}
	);
}
