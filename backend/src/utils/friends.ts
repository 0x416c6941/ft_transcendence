import { FastifyInstance } from 'fastify';
import { ApiError } from './users.js';

export async function dbGetAllFriendsByAdderId(fastify: FastifyInstance,
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

/**
 * Get record from "friends" table by it's full composite primary key.
 * @param {FastifyInstance}	fastify	Instance of a Fastify server.
 * @param {number}		adderId	ID of a user who added `addedId` as their friend.
 * @param {number}		addedId	ID of a user who was added by `adderId` as their friend.
 * @return {Promise<FriendsDbRecord | undefined>}	Promise that fulfills either
 * 							with record with (`adderId`, `addedId`) as it's primary key
 * 							or with `undefined` if there's no such record.
 */
export async function dbGetFriendsRecord(fastify: FastifyInstance,
		adderId: number, addedId: number): Promise<FriendsDbRecord | undefined> {
	try {
		const friendsRecord = await new Promise<any>((resolve, reject) => {
			fastify.sqlite.get(`
					SELECT f.* FROM friends f
					WHERE f.adder_id = ? AND f.added_id = ?
				`,
				[adderId, addedId],
				function (err: Error | any, row: FriendsDbRecord | undefined) {
					if (err) {
						reject(err);
					}
					resolve(row);
				}
			);
		});

		return friendsRecord;
	}
	catch (err: any) {
		throw new ApiError('SQLite request failed', 500, err);
	}
}

export async function dbAddFriendsRecord(fastify: FastifyInstance,
		adderId: number, addedId: number) {
	try {
		const friendsRecord = await dbGetFriendsRecord(fastify, adderId, addedId);
		if (friendsRecord) {
			throw new ApiError("You're already friends with this user", 409);
		}

		await new Promise<void>((resolve, reject) => {
			fastify.sqlite.run(`
					INSERT INTO friends (adder_id, added_id) VALUES (?, ?)
				`,
				[adderId, addedId],
				function (err: Error | any) {
					if (err) {
						reject(err);
					}
					resolve();
				}
			);
		});
	}
	catch (err: any) {
		if (err instanceof ApiError) {
			throw err;
		}
		throw new ApiError('SQLite request failed', 500, err);
	}
}
