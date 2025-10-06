/**
 * @fileoverview Augment the `FastifyInstance` type with our custom decorators.
 */

import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';

declare module 'fastify' {
	export interface FastifyInstance {
		/**
		 * @property {Server} io
		 * Socket.IO instance.
		 */
		io: Server;

		/**
		 * @property {sqlite3.Database} db
		 * SQLite database to work with.
		 */
		db: sqlite3.Database;
	}
}
