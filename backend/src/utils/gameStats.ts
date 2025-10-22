// Game statistics tracking utilities
import { FastifyInstance } from 'fastify';

export interface GameRecord {
	game_name: string;
	started_at: string;
	finished_at?: string;
	player1_name: string;
	player1_is_user: boolean;
	player2_name: string;
	player2_is_user: boolean;
	winner?: string;
	data?: string;
}

/**
 * Save a game record to the database
 * Called internally by game servers
 */
export async function saveGameRecord(
	fastify: FastifyInstance,
	gameRecord: GameRecord
): Promise<void> {
	try {
		// Log the game record before saving
		fastify.log.info({ gameRecord }, 'Saving game record');

		await new Promise<void>((resolve, reject) => {
			fastify.sqlite.run(
				`INSERT INTO games (game_name, started_at, finished_at, player1_name, player1_is_user, player2_name, player2_is_user, winner, data)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					gameRecord.game_name,
					gameRecord.started_at,
					gameRecord.finished_at || null,
					gameRecord.player1_name,
					gameRecord.player1_is_user ? 1 : 0,
					gameRecord.player2_name,
					gameRecord.player2_is_user ? 1 : 0,
					gameRecord.winner || null,
					gameRecord.data || null
				],
				function (err: Error | null) {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				}
			);
		});

		fastify.log.info(`Game record saved: ${gameRecord.player1_name} vs ${gameRecord.player2_name}`);
	} catch (error) {
		fastify.log.error(`Failed to save game record: ${error}`);
		throw error;
	}
}

/**
 * Check if a socket belongs to a logged-in user
 * A logged-in user is considered a registered user
 */
export function isSocketAuthenticated(socket: any): boolean {
	// Check if the socket has user authentication data
	// The socket can have username in socket.data.username (main namespace)
	// or directly on socket.username (game namespaces)
	return !!(
		(socket.data && socket.data.username) ||
		socket.username ||
		socket.userId
	);
}
