import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import sqlite3 from 'sqlite3';
import fp from 'fastify-plugin';

/**
 * @interface FastifySqliteOptions
 * Options for `fastifySqlite()`.
 */
export interface FastifySqliteOptions {
	/**
	 * @property {string} dbFile
	 * Filename of the database to open or create (if doesn't exist yet).
	 */
	dbFile: string;
}

const fastifySqlite: FastifyPluginAsync<FastifySqliteOptions> = async (fastify: FastifyInstance, options: FastifySqliteOptions): Promise<void> => {
	const db = await new Promise<sqlite3.Database>((resolve, reject) => {
		const connection = new sqlite3.Database(options.dbFile, (err) => {
			if (err) {
				reject(err);
			}
			else {
				resolve(connection);
			}
		})
	});

	fastify.decorate('sqlite', db);
	fastify.addHook('onClose', (fastify: FastifyInstance, done) => db.close());
}

export default fp(fastifySqlite, { name: 'fastify-sqlite' });
