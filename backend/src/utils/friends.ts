import { FastifyInstance } from 'fastify';
import { ApiError } from './users.js';

export async function dbGetFriendsByAdderId(fastify: FastifyInstance,
		adderId: number) {
	try {
		const friends = await new Promise<any>((resolve, reject) => {
			fastify.sqlite.all(`
				SELECT f.* FROM friends f WHERE f.adder_id = ?`,
				[adderId],
				function (err: Error | any, rows: Array<FriendsDbRecord>) {
					if (err) {
						reject(err);
					}
					resolve(rows);
				}
			);
		});

		return friends;
	}
	catch (err: any) {
		throw new ApiError('SQLite request failed', 500, err);
	}
}
