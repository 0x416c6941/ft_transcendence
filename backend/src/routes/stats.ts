import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function statsRoutes(fastify: FastifyInstance) {
	// Get overall statistics
	fastify.get('/stats/overview', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			// Total users
			const totalUsers = await new Promise<number>((resolve, reject) => {
				fastify.sqlite.get('SELECT COUNT(*) as count FROM users', (err: Error | null, row: any) => {
					if (err) reject(err);
					else resolve(row.count);
				});
			});

			// Total games played
			const totalGames = await new Promise<number>((resolve, reject) => {
				fastify.sqlite.get('SELECT COUNT(*) as count FROM games WHERE finished_at IS NOT NULL', (err: Error | null, row: any) => {
					if (err) reject(err);
					else resolve(row.count);
				});
			});

			// Games by type
			const gamesByType = await new Promise<any[]>((resolve, reject) => {
				fastify.sqlite.all(
					'SELECT game_name, COUNT(*) as count FROM games WHERE finished_at IS NOT NULL GROUP BY game_name',
					(err: Error | null, rows: any[]) => {
						if (err) reject(err);
						else resolve(rows);
					}
				);
			});

			// Games in last 24 hours
			const recentGames = await new Promise<number>((resolve, reject) => {
				fastify.sqlite.get(
					`SELECT COUNT(*) as count FROM games 
					WHERE finished_at IS NOT NULL 
					AND datetime(finished_at) >= datetime('now', '-1 day')`,
					(err: Error | null, row: any) => {
						if (err) reject(err);
						else resolve(row.count);
					}
				);
			});

			// Average game duration
			const avgDuration = await new Promise<number>((resolve, reject) => {
				fastify.sqlite.get(
					`SELECT AVG(
						(julianday(finished_at) - julianday(started_at)) * 24 * 60
					) as avg_minutes
					FROM games 
					WHERE finished_at IS NOT NULL`,
					(err: Error | null, row: any) => {
						if (err) reject(err);
						else resolve(row.avg_minutes ? Math.round(row.avg_minutes * 10) / 10 : 0);
					}
				);
			});

			return reply.send({
				totalUsers,
				totalGames,
				gamesByType,
				recentGames,
				avgDuration
			});
		} catch (err: any) {
			fastify.log.error(err);
			return reply.code(500).send({ error: 'Failed to fetch overview stats' });
		}
	});

	// Get leaderboard
	fastify.get('/stats/leaderboard', async (request: FastifyRequest<{
		Querystring: { game?: string; limit?: string }
	}>, reply: FastifyReply) => {
		try {
			const { game, limit = '50' } = request.query;
			const limitNum = Math.min(parseInt(limit) || 50, 100);

			// Build WHERE clause and params
			let gameFilter1 = '';
			let gameFilter2 = '';
			const params: any[] = [];

			if (game) {
				gameFilter1 = ' AND game_name = ?';
				gameFilter2 = ' AND game_name = ?';
				params.push(game, game); // Once for each UNION part
			}

			const query = `
				SELECT 
					player_name,
					COUNT(*) as total_games,
					SUM(CASE WHEN is_winner = 1 THEN 1 ELSE 0 END) as wins,
					SUM(CASE WHEN is_winner = 0 THEN 1 ELSE 0 END) as losses,
					ROUND(
						CAST(SUM(CASE WHEN is_winner = 1 THEN 1 ELSE 0 END) AS REAL) / 
						COUNT(*) * 100, 
						2
					) as win_rate
				FROM (
					SELECT player1_name as player_name, 
						CASE WHEN winner = player1_name THEN 1 ELSE 0 END as is_winner
					FROM games 
					WHERE finished_at IS NOT NULL${gameFilter1}
					UNION ALL
					SELECT player2_name as player_name,
						CASE WHEN winner = player2_name THEN 1 ELSE 0 END as is_winner
					FROM games 
					WHERE finished_at IS NOT NULL${gameFilter2}
				) AS player_stats
				GROUP BY player_name
				HAVING total_games > 0
				ORDER BY win_rate DESC, wins DESC
				LIMIT ?
			`;

			params.push(limitNum);

			const leaderboard = await new Promise<any[]>((resolve, reject) => {
				fastify.sqlite.all(query, params, (err: Error | null, rows: any[]) => {
					if (err) {
						fastify.log.error(err);
						reject(err);
					}
					else {
						resolve(rows || []);
					}
				});
			});

			return reply.send({ leaderboard });
		} catch (err: any) {
			fastify.log.error(err);
			return reply.code(500).send({ error: 'Failed to fetch leaderboard' });
		}
	});

	// Get recent games
	fastify.get('/stats/recent-games', async (request: FastifyRequest<{
		Querystring: { limit?: string; game?: string }
	}>, reply: FastifyReply) => {
		try {
			const { limit = '20', game } = request.query;
			const limitNum = Math.min(parseInt(limit) || 20, 100);

			let query = `
				SELECT 
					id,
					game_name,
					started_at,
					finished_at,
					player1_name,
					player1_is_user,
					player2_name,
					player2_is_user,
					winner,
					ROUND(
						(julianday(finished_at) - julianday(started_at)) * 24 * 60,
						1
					) as duration_minutes
				FROM games
				WHERE finished_at IS NOT NULL
			`;

			if (game) {
				query += ` AND game_name = ?`;
			}

			query += ` ORDER BY finished_at DESC LIMIT ?`;

			const games = await new Promise<any[]>((resolve, reject) => {
				const params = game ? [game, limitNum] : [limitNum];
				fastify.sqlite.all(query, params, (err: Error | null, rows: any[]) => {
					if (err) reject(err);
					else resolve(rows);
				});
			});

			return reply.send({ games });
		} catch (err: any) {
			fastify.log.error(err);
			return reply.code(500).send({ error: 'Failed to fetch recent games' });
		}
	});

	// Get player statistics
	fastify.get('/stats/player/:username', async (request: FastifyRequest<{
		Params: { username: string }
	}>, reply: FastifyReply) => {
		try {
			const { username } = request.params;

			// Check if user exists
			const userExists = await new Promise<boolean>((resolve, reject) => {
				fastify.sqlite.get('SELECT id FROM users WHERE username = ?', [username], (err: Error | null, row: any) => {
					if (err) reject(err);
					else resolve(!!row);
				});
			});

			if (!userExists) {
				return reply.code(404).send({ error: 'Player not found' });
			}

			// Get player stats
			const stats = await new Promise<any>((resolve, reject) => {
				fastify.sqlite.get(`
					SELECT 
						COUNT(*) as total_games,
						SUM(CASE WHEN is_winner = 1 THEN 1 ELSE 0 END) as wins,
						SUM(CASE WHEN is_winner = 0 THEN 1 ELSE 0 END) as losses,
						ROUND(
							CAST(SUM(CASE WHEN is_winner = 1 THEN 1 ELSE 0 END) AS REAL) / 
							NULLIF(COUNT(*), 0) * 100, 
							2
						) as win_rate
					FROM (
						SELECT CASE WHEN winner = ? THEN 1 ELSE 0 END as is_winner
						FROM games 
						WHERE finished_at IS NOT NULL 
						AND (
							(player1_name = ? AND player1_is_user = 1) OR 
							(player2_name = ? AND player2_is_user = 1)
						)
					)
				`, [username, username, username], (err: Error | null, row: any) => {
					if (err) reject(err);
					else resolve(row);
				});
			});

			// Get stats by game type
			const statsByGame = await new Promise<any[]>((resolve, reject) => {
				fastify.sqlite.all(`
					SELECT 
						game_name,
						COUNT(*) as games_played,
						SUM(CASE WHEN is_winner = 1 THEN 1 ELSE 0 END) as wins,
						ROUND(
							CAST(SUM(CASE WHEN is_winner = 1 THEN 1 ELSE 0 END) AS REAL) / 
							COUNT(*) * 100, 
							2
						) as win_rate
					FROM (
						SELECT 
							game_name,
							CASE WHEN winner = ? THEN 1 ELSE 0 END as is_winner
						FROM games 
						WHERE finished_at IS NOT NULL 
						AND (
							(player1_name = ? AND player1_is_user = 1) OR 
							(player2_name = ? AND player2_is_user = 1)
						)
					)
					GROUP BY game_name
					ORDER BY games_played DESC
				`, [username, username, username], (err: Error | null, rows: any[]) => {
					if (err) reject(err);
					else resolve(rows);
				});
			});

			return reply.send({
				username,
				...stats,
				statsByGame
			});
		} catch (err: any) {
			fastify.log.error(err);
			return reply.code(500).send({ error: 'Failed to fetch player stats' });
		}
	});

	// Get activity timeline (games over time)
	fastify.get('/stats/activity', async (request: FastifyRequest<{
		Querystring: { days?: string }
	}>, reply: FastifyReply) => {
		try {
			const { days = '7' } = request.query;
			const daysNum = Math.min(parseInt(days) || 7, 90);

			const activity = await new Promise<any[]>((resolve, reject) => {
				fastify.sqlite.all(`
					SELECT 
						DATE(finished_at) as date,
						COUNT(*) as games_played
					FROM games
					WHERE finished_at IS NOT NULL
					AND datetime(finished_at) >= datetime('now', '-${daysNum} days')
					GROUP BY DATE(finished_at)
					ORDER BY date ASC
				`, (err: Error | null, rows: any[]) => {
					if (err) reject(err);
					else resolve(rows);
				});
			});

			return reply.send({ activity, days: daysNum });
		} catch (err: any) {
			fastify.log.error(err);
			return reply.code(500).send({ error: 'Failed to fetch activity data' });
		}
	});
}
