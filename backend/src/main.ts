import Fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import fs from "node:fs";
import fastifySqlite, { FastifySqliteOptions } from "./fastifySqlite.js";
import { Server } from "socket.io";
import userRoutes from "./routes/users.js";
import { allSchemas } from "./schemas/index.js";
import { registerSwagger } from "./swagger/config.js";
import { setupPongGame } from "./pongGame.js";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupTetrisGame } from './tetrisGame.js';
import { setupTetrisAI } from './tetrisAI.js';
import { setupTetrisRemote } from './tetrisRemote.js';
import { seedDatabase } from './seedDatabase.js';
import { verifyToken } from './utils/jwt.js';

// Creating Fastify instance.
const sslKeyPath = process.env.BACKEND_FASTIFY_SSL_KEY_PATH;
if (!sslKeyPath) {
	throw new Error("process.env.BACKEND_FASTIFY_SSL_KEY_PATH isn't a valid path to SSL key.");
}
const sslCertPath = process.env.BACKEND_FASTIFY_SSL_CRT_PATH;
if (!sslCertPath) {
	throw new Error("process.env.BACKEND_FASTIFY_SSL_CRT_PATH isn't a valid path to SSL key.");
}
const fastify: FastifyInstance = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath),
  },
});

// Connecting to DB.
const dbVolPath = process.env.BACKEND_CONTAINER_DB_VOL_PATH;
if (!dbVolPath || !path.isAbsolute(dbVolPath)) {
	throw new Error("process.env.BACKEND_CONTAINER_DB_VOL_PATH isn't a valid absolute path.");
}
const dbFile = process.env.BACKEND_SQLITE_DB_NAME;
if (!dbFile) {
  throw new Error(
    "process.env.BACKEND_SQLITE_DB_NAME isn't a valid DB filename."
  );
}

// Registering SQLite Fastify plugin.
fastify.register(fastifySqlite, {
	dbFile: path.join(dbVolPath, dbFile)
});

// Register all JSON schemas for validation (must be before routes)
for (const schema of allSchemas) {
  fastify.addSchema(schema);
}

// Register Swagger documentation
registerSwagger(fastify);

// Register user routes
fastify.register(userRoutes, { prefix: "/api" });

const start = async () => {
  const port = Number(process.env.BACKEND_FASTIFY_PORT);

	if (Number.isNaN(port)) {
		throw new Error("process.env.BACKEND_FASTIFY_PORT isn't a number.");
	}
	try {
		await fastify.register(cookie, {
			parseOptions: {
				sameSite: 'lax',
			}
		})
		await fastify.register(cors, {
			origin: ["https://localhost/"], // the frontend origin allowed
			credentials: true, // allow sending cookies or Authorization headers
  		});
		// Loading 42's OAuth credentials.
		if (!process.env.BACKEND_OAUTH_42_UID_PATH || !process.env.BACKEND_OAUTH_42_SECRET_PATH) {
			fastify.log.error(`process.env.BACKEND_OAUTH_42_UID_PATH
				or process.env.BACKEND_OAUTH_42_SECRET_PATH are undefined`);
			process.exit(1);
		}
		const oauth42Uid: string = await new Promise<string>((resolve, reject) => {
			fs.readFile(process.env.BACKEND_OAUTH_42_UID_PATH!, (err: Error | null, data: any) => {
				if (err) {
					reject(err);
				}
				resolve(data);
			});
		});
		const oauth42Secret: string = await new Promise<string>((resolve, reject) => {
			fs.readFile(process.env.BACKEND_OAUTH_42_SECRET_PATH!, (err: Error | null, data: any) => {
				if (err) {
					reject(err);
				}
				resolve(data);
			});
		});

		/* Taking care of creating directory with avatars in Docker Volume
		 * and the default user avatar. */
		if (!process.env.BACKEND_AVATAR_PATH_IN_DB_VOL) {
			fastify.log.error('process.env.BACKEND_AVATAR_PATH_IN_DB_VOL is undefined');
			process.exit(1);
		}
		const avatarsPath = path.join(dbVolPath, process.env.BACKEND_AVATAR_PATH_IN_DB_VOL);
		// Creating directory with avatars in Docker Volume, if it doesn't exist yet.
		if (!fs.existsSync(avatarsPath)) {
			await fs.mkdir(avatarsPath,
				{ recursive: true, mode: 0o755 },
				(err: any) => {
					if (err) {
						fastify.log.error(`Couldn't create directory for avatar storage: ${err}`);
						process.exit(1);
					}
				}
			);
		}
		const defaultAvatarPath = path.join(avatarsPath, 'default.webp');
		/* Copying default avatar to directory with avatars in Docker Volume,
		 * if it doesn't exist yet. */
		if (!fs.existsSync(defaultAvatarPath)) {
			fs.copyFile(path.join('blobs', 'default_avatar.webp'),
				defaultAvatarPath,
				(err: any) => {
					if (err) {
						fastify.log.error(`Couldn't copy default avatar: ${err}`);
						process.exit(1);
					}
				}
			);
		}

		// Appending `config` to Fastify instance.
		fastify.decorate('config', {
			oauth42: {
				uid: String(oauth42Uid).trim(),
				secret: String(oauth42Secret).trim()
			},
			avatarsPath: {
				avatarsPath, defaultAvatarPath
			}
		});

		// Socket.IO initialization.
		const io = new Server(fastify.server, {
			path: '/api/socket.io/'
		});

		// Online users tracking
		const onlineUsers = new Map<number, { socketId: string; username: string; displayName: string }>();

		// Socket.IO authentication middleware
		io.use(async (socket, next) => {
			try {
				const token = socket.handshake.auth.token ||
					socket.handshake.headers.cookie?.split(';')
						.find(c => c.trim().startsWith('accessToken='))?.split('=')[1];

				if (!token) return next(new Error('Authentication required'));

				const decoded = verifyToken(token);
				(socket as any).userId = decoded.userId;
				(socket as any).username = decoded.username;
				next();
			} catch (error) {
				next(new Error('Invalid token'));
			}
		});

		fastify.decorate('io', io);
		io.on('connection', (socket) => {
			const userId = (socket as any).userId;
			const username = (socket as any).username;

			fastify.log.info(`User ${username} (${userId}) connected: ${socket.id}`);
			socket.emit('user_info', { userId, username });

			// Get user's display name and add to online users
			fastify.sqlite.get('SELECT display_name FROM users WHERE id = ?', [userId], (err: Error | null, row: any) => {
				if (err || !row) return fastify.log.error(`Failed to get display name for user ${userId}`);

				onlineUsers.set(userId, { socketId: socket.id, username, displayName: row.display_name });

				// Broadcast updated online users list
				const usersList = Array.from(onlineUsers.entries()).map(([id, data]) => ({
					userId: id, username: data.username, displayName: data.displayName
				}));
				io.emit('online_users_updated', usersList);
				fastify.log.info(`Online users: ${usersList.map(u => u.username).join(', ')}`);
			});

			// Handle request for current online users list
			socket.on('request_online_users', () => {
				const usersList = Array.from(onlineUsers.entries()).map(([id, data]) => ({
					userId: id, username: data.username, displayName: data.displayName
				}));
				socket.emit('online_users_updated', usersList);
			});

			// Handle game invites
			socket.on('game:invite', (data: { targetUserId: number }) => {
				const targetUser = onlineUsers.get(data.targetUserId);
				if (!targetUser) return;

				io.to(targetUser.socketId).emit('game:invite_received', {
					fromUserId: userId, fromUsername: username, fromDisplayName: onlineUsers.get(userId)?.displayName
				});
				fastify.log.info(`Game invite from ${username} to ${targetUser.username}`);
			});

			// Handle game invite acceptance
			socket.on('game:accept', (data: { fromUserId: number }) => {
				const inviterUser = onlineUsers.get(data.fromUserId);
				if (!inviterUser) return;

				io.to(inviterUser.socketId).emit('game:invite_accepted', { byUserId: userId, byUsername: username });
				fastify.log.info(`${username} accepted game invite from ${inviterUser.username}`);
			});

			// Handle game invite decline
			socket.on('game:decline', (data: { fromUserId: number }) => {
				const inviterUser = onlineUsers.get(data.fromUserId);
				if (!inviterUser) return;

				io.to(inviterUser.socketId).emit('game:invite_declined', {
					byUserId: userId, byUsername: username, byDisplayName: onlineUsers.get(userId)?.displayName
				});
				fastify.log.info(`${username} declined game invite from ${inviterUser.username}`);
			});

			socket.on('disconnect', () => {
				fastify.log.info(`User ${username} (${userId}) disconnected: ${socket.id}`);
				onlineUsers.delete(userId);

				// Broadcast updated online users list
				const usersList = Array.from(onlineUsers.entries()).map(([id, data]) => ({
					userId: id, username: data.username, displayName: data.displayName
				}));
				io.emit('online_users_updated', usersList);
				fastify.log.info(`Online users: ${usersList.map(u => u.username).join(', ')}`);
			});
		});

		// Seed database with default users (if empty)
		await seedDatabase(fastify);

		// Set up Tetris game servers
		setupTetrisGame(fastify, io);
		setupTetrisAI(fastify, io);
		setupTetrisRemote(fastify, io);

		// Set up Pong game server
		setupPongGame(fastify, io);

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
