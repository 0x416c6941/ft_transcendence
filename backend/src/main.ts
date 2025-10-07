import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import fastifySqlite, { FastifySqliteOptions } from './fastifySqlite.js';
import { Server } from "socket.io";
import userRoutes from './routes/users.js';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

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

// Add shared schemas for validation (must be before routes)
fastify.addSchema({
	$id: 'User',
	type: 'object',
	properties: {
		id: { type: 'integer', description: 'User ID' },
		username: { type: 'string', description: 'Unique username' },
		email: { type: 'string', format: 'email', description: 'User email address' },
		display_name: { type: 'string', description: 'Display name' },
		created_at: { type: 'string', format: 'date-time', description: 'Account creation timestamp' }
	}
});

fastify.addSchema({
	$id: 'CreateUserRequest',
	type: 'object',
	required: ['username', 'password', 'email', 'display_name'],
	properties: {
		username: { type: 'string', description: 'Unique username' },
		password: { type: 'string', format: 'password', description: 'User password (will be hashed)' },
		email: { type: 'string', format: 'email', description: 'User email address' },
		display_name: { type: 'string', description: 'Display name' }
	}
});

fastify.addSchema({
	$id: 'UpdateUserRequest',
	type: 'object',
	properties: {
		username: { type: 'string', description: 'Unique username' },
		password: { type: 'string', format: 'password', description: 'User password (will be hashed)' },
		email: { type: 'string', format: 'email', description: 'User email address' },
		display_name: { type: 'string', description: 'Display name' }
	}
});

fastify.addSchema({
	$id: 'LoginRequest',
	type: 'object',
	required: ['username', 'password'],
	properties: {
		username: { type: 'string', description: 'Username' },
		password: { type: 'string', format: 'password', description: 'User password' }
	}
});

fastify.addSchema({
	$id: 'LoginResponse',
	type: 'object',
	properties: {
		message: { type: 'string', description: 'Success message' },
		accessToken: { type: 'string', description: 'JWT access token (expires in 24 hours)' },
		refreshToken: { type: 'string', description: 'JWT refresh token (expires in 7 days)' },
		user: { $ref: 'User#' }
	}
});

fastify.addSchema({
	$id: 'RefreshTokenRequest',
	type: 'object',
	required: ['refreshToken'],
	properties: {
		refreshToken: { type: 'string', description: 'Refresh token to exchange for new tokens' }
	}
});

fastify.addSchema({
	$id: 'RefreshTokenResponse',
	type: 'object',
	properties: {
		accessToken: { type: 'string', description: 'New JWT access token' },
		refreshToken: { type: 'string', description: 'New JWT refresh token' }
	}
});

fastify.addSchema({
	$id: 'Error',
	type: 'object',
	properties: {
		error: { type: 'string', description: 'Error message' }
	}
});

// Register Swagger
fastify.register(swagger, {
	openapi: {
		openapi: '3.0.0',
		info: {
			title: 'ft_transcendence User API',
			description: 'API documentation for user management with secure authentication',
			version: '0.0.1'
		},
		servers: [
			{
				url: 'https://localhost',
				description: 'Development server (via nginx)'
			}
		],
		tags: [
			{ name: 'users', description: 'User management endpoints' },
			{ name: 'auth', description: 'Authentication endpoints' }
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT',
					description: 'Enter your JWT token in the format: Bearer <token>'
				}
			}
		}
	}
});

fastify.register(swaggerUI, {
	routePrefix: '/api/documentation',
	uiConfig: {
		docExpansion: 'list',
		deepLinking: false
	},
	staticCSP: true,
	transformStaticCSP: (header) => header
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
