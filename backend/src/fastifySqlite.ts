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
				display_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
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
	// Create `friends` table if it doesn't exist yet.
	await new Promise<void>((resolve, reject) => {
		// If attribute is a part of the primary key,
		// "NOT NULL" is implied automatically (according to SQL standards).
		// Still, let's also write it explicitly, because, well, why not?
		db.run(`
			CREATE TABLE IF NOT EXISTS friends (
				adder_id INTEGER NOT NULL,
				added_id INTEGER NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

				-- It wouldn't make sense for a user to be friends with themselves, right?
				CHECK (adder_id != added_id),

				PRIMARY KEY (adder_id, added_id),

				FOREIGN KEY (added_id) REFERENCES users(id) ON DELETE CASCADE,
				FOREIGN KEY (adder_id) REFERENCES users(id) ON DELETE CASCADE
			)
		`,
		function (err: Error | null) {
			if (err) {
				reject(err);
			}
			resolve();
		});
	});

	// Create games table
	await new Promise<void>((resolve, reject) => {
		db.run(`
			CREATE TABLE IF NOT EXISTS games (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				game_name TEXT NOT NULL,
				started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
				fastify.log.error(`Failed to create games table: ${err.message}`);
				reject(err);
			} else {
				fastify.log.info('Games table ready');
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
