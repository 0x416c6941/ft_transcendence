import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import fastifySqlite, { FastifySqliteOptions } from './fastifySqlite.js';
import { Server } from "socket.io";
import userRoutes from './routes/users.js';

// Creating Fastify instance.
const sslKeyPath = process.env.BACKEND_FASTIFY_SSL_KEY_PATH;
if (!sslKeyPath) {
	throw new Error("process.env.BACKEND_FASTIFY_SSL_KEY_PATH isn't a valid SSL key.");
}
const sslCertPath = process.env.BACKEND_FASTIFY_SSL_CRT_PATH;
if (!sslCertPath) {
	throw new Error("process.env.BACKEND_FASTIFY_SSL_CRT_PATH isn't a valid SSL key.");
}
const fastify: FastifyInstance = Fastify({
	logger: true,
	https: {
		key: fs.readFileSync(sslKeyPath),
		cert: fs.readFileSync(sslCertPath)
	}
});

// Connecting to DB.
const dbVolPath = process.env.BACKEND_CONTAINER_DB_VOL_PATH;
if (!dbVolPath) {
	throw new Error("process.env.BACKEND_CONTAINER_DB_VOL_PATH isn't a valid path.");
}
const dbFile = process.env.BACKEND_SQLITE_DB_NAME;
if (!dbFile) {
	throw new Error("process.env.BACKEND_SQLITE_DB_NAME isn't a valid DB filename.");
}

// Registering SQLite Fastify plugin.
fastify.register(fastifySqlite, {
	dbFile: dbVolPath.concat('/').concat(dbFile)
});

// Register user routes
fastify.register(userRoutes, { prefix: '/api' });

fastify.get('/test', async (request: FastifyRequest, reply: FastifyReply) => {
	return { hello: 'world' };
});

const start = async () => {
	const port = Number(process.env.BACKEND_FASTIFY_PORT);

	if (Number.isNaN(port)) {
		throw new Error("process.env.BACKEND_FASTIFY_PORT isn't a number.");
	}
	try {
		// Socket.IO initialization.
		const io = new Server(fastify.server, {
			path: '/api/socket.io/'
		});

		fastify.decorate('io', io);
		io.on('connection', (socket) => {
			fastify.log.info(`New sock: ${socket.id}`);

			socket.on('disconnect', () => {
				fastify.log.info(`Sock disconnect: ${socket.id}`);
			})
		})
		/* IPv4 only here.
		 * We don't need to take care of IPv6, since we'll either way
		 * receive data from NGINX as a reverse proxy on IPv4. */
		await fastify.listen({ port: port, host: '0.0.0.0' });
	}
	catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
