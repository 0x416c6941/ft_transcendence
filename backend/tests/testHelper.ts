import Fastify, { FastifyInstance } from 'fastify';
import fastifySqlite from '../src/fastifySqlite.js';
import userRoutesNoSchema from './userRoutesNoSchema.js';

/**
 * Build a Fastify instance for testing
 * This creates an isolated instance without SSL requirements
 * Uses schema-less routes to avoid Swagger reference issues
 */
export async function buildTestApp(): Promise<FastifyInstance> {
	const app = Fastify({
		logger: false // Disable logging during tests
	});

	// Register SQLite with in-memory database
	await app.register(fastifySqlite, {
		dbFile: ':memory:' // Use in-memory database for tests
	});

	// Register user routes without schemas for testing
	await app.register(userRoutesNoSchema, { prefix: '/api' });

	await app.ready();

	return app;
}

/**
 * Close and clean up the test app
 */
export async function closeTestApp(app: FastifyInstance): Promise<void> {
	if (app) {
		await app.close();
	}
}
