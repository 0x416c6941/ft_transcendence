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
		const connection = new sqlite3.Database(options.dbFile, (err: Error | null) => {
			if (err) {
				reject(err);
			}
			else {
				resolve(connection);
			}
		})
	});

	// Create `users` table if it doesn't exist yet
	await new Promise<void>((resolve, reject) => {
		db.run(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT NOT NULL UNIQUE COLLATE NOCASE,
				password TEXT NOT NULL,
				email TEXT NOT NULL UNIQUE COLLATE NOCASE,
				display_name TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				account_id_42 INTEGER
			)
		`, (err: Error | null) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
	// Create `admins` table if it doesn't exist yet
	await new Promise<void>((resolve, reject) => {
		db.run(`
			CREATE TABLE IF NOT EXISTS admins (
				user_id INTEGER PRIMARY KEY,
				FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
			)
		`, (err: Error | null) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});

	// Create `games` table if it doesn't exist yet
	await new Promise<void>((resolve, reject) => {
		db.run(`
			CREATE TABLE IF NOT EXISTS games (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				started_at DATETIME,
				finished_at DATETIME,
				player1_name TEXT NOT NULL,
				player1_is_user BOOLEAN NOT NULL DEFAULT 0,
				player2_name TEXT NOT NULL,
				player2_is_user BOOLEAN NOT NULL DEFAULT 0,
				winner TEXT,
				data TEXT
			)
		`, (err: Error | null) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});

	fastify.decorate('sqlite', db);
	fastify.addHook('onClose', (fastify: FastifyInstance, done) => {
		db.close((err: Error | null) => {
			if (err) {
				fastify.log.error('Caught error on SQLite closing: ${err}');
			}
		});
		done();
	});
}

export default fp(fastifySqlite, { name: 'fastify-sqlite' });
