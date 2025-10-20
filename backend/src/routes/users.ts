import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '@fastify/cookie';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import { authenticateToken } from '../middleware/auth.js';
import {
	registerUserSchema,
	loginUserSchema,
	// refreshTokenSchema, // no longer needed; refresh uses cookie now
	getAllUsersSchema,
	getUserByIdSchema,
	updateUserSchema,
	deleteUserSchema
} from '../schemas/user.schemas.js';

const SALT_ROUNDS = 10;

// centralize cookie options (adjust for your deployment)
const ACCESS_MAX_AGE = 60 * 15;           // 15 minutes
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const sameSite: 'lax' | 'none' = 'lax';
const secure = true;                       // keep true in production (HTTPS)

const accessCookieOpts = {
  httpOnly: true as const,
  secure,
  sameSite,
  path: '/' as const,
  maxAge: ACCESS_MAX_AGE
};

const refreshCookieOpts = {
  httpOnly: true as const,
  secure,
  sameSite,
  path: '/api/users/refresh' as const,
  maxAge: REFRESH_MAX_AGE
};

interface CreateUserBody {
	username: string;
	password: string;
	email: string;
	display_name: string;
}

interface UpdateUserBody {
	username?: string;
	password?: string;
	email?: string;
	display_name?: string;
}

interface LoginBody {
	username: string;
	password: string;
}

interface UserParams {
	id: string;
}

export default async function userRoutes(fastify: FastifyInstance) {
	// Create a new user (Register)
	fastify.post<{ Body: CreateUserBody }>(
		'/users',
		{ schema: registerUserSchema },
		async (request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) => {
			const { username, password, email, display_name } = request.body;

			try {
				// Hash the password
				const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

				// Insert user into database
				await new Promise<void>((resolve, reject) => {
					fastify.sqlite.run(
						`INSERT INTO users (username, password, email, display_name) VALUES (?, ?, ?, ?)`,
						[username, hashedPassword, email, display_name],
						function (err: Error | null) {
							if (err) {
								reject(err);
							} else {
								resolve();
							}
						}
					);
				});

				return reply.code(201).send({
					message: 'User created successfully',
					username: username
				});
			} catch (err: any) {
				if (err.message.includes('UNIQUE constraint failed')) {
					return reply.code(409).send({
						error: 'Username or email already exists'
					});
				}
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to create user' });
			}
		}
	);

	// Login endpoint
	fastify.post<{ Body: LoginBody }>(
		'/users/login',
		{ schema: loginUserSchema },
		async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
			const { username, password } = request.body;

			try {
				// Get user from database
				const user = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(
						`SELECT id, username, password, email, display_name FROM users WHERE username = ?`,
						[username],
						(err: Error | null, row: any) => {
							if (err) {
								reject(err);
							} else {
								resolve(row);
							}
						}
					);
				});

				if (!user) {
					return reply.code(401).send({
						error: 'Invalid username or password'
					});
				}

				// Verify password
				const isPasswordValid = await bcrypt.compare(password, user.password);

				if (!isPasswordValid) {
					return reply.code(401).send({
						error: 'Invalid username or password'
					});
				}

				// Generate JWT tokens
				const accessToken = generateAccessToken(user.id, user.username);
				const refreshToken = generateRefreshToken(user.id, user.username);

				// Set tokens in HttpOnly cookies
				reply.setCookie('accessToken', accessToken, accessCookieOpts)
					.setCookie('refreshToken', refreshToken, refreshCookieOpts)
					.code(200)
					.send({
						message: 'Login successful',
						user: {
							id: user.id,
							username: user.username,
							email: user.email,
							display_name: user.display_name
						}
					});
				// return reply.code(200).send({
				// 	message: 'Login successful',
				// 	accessToken,
				// 	refreshToken,
				// 	user: {
				// 		id: user.id,
				// 		username: user.username,
				// 		email: user.email,
				// 		display_name: user.display_name
				// 	}
				// });
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to login' });
			}
		}
	);

	// Refresh token endpoint
	fastify.post<{ Body: { refreshToken: string } }>(
		'/users/refresh',
		// { schema: refreshTokenSchema },  // remove schema because body is not used
		async (request: FastifyRequest, reply: FastifyReply) => {
    			const refreshToken = request.cookies?.refreshToken;

			// Validate the refresh token
			if (!refreshToken) {
        			return reply.code(401).send({ error: 'Missing refresh token' });
      			}

			try {
				// Verify the refresh token
				const { verifyToken } = await import('../utils/jwt.js');
				const decoded = verifyToken(refreshToken);

				// Generate new tokens
				const newAccessToken = generateAccessToken(decoded.userId, decoded.username);
				const newRefreshToken = generateRefreshToken(decoded.userId, decoded.username);

				// Set new tokens in HttpOnly cookies
				reply.setCookie('accessToken', newAccessToken, accessCookieOpts)
					.setCookie('refreshToken', newRefreshToken, refreshCookieOpts)
					.code(200)
					.send({	message: 'Tokens refreshed successfully'});
				// return reply.code(200).send({
				// 	accessToken: newAccessToken,
				// 	refreshToken: newRefreshToken
				// });
			} catch (error) {
				return reply.code(403).send({
					error: 'Invalid or expired refresh token'
				});
			}
		}
	);

	// Logout: clear cookies
  	fastify.post('/users/logout', async (_req: FastifyRequest, reply: FastifyReply) => {
    		reply.clearCookie('accessToken', { path: accessCookieOpts.path })
      		.clearCookie('refreshToken', { path: refreshCookieOpts.path })
      		.send({ message: 'Logged out' });
  	});

	// Get all users
	fastify.get('/users', {
		schema: getAllUsersSchema
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const users = await new Promise<any[]>((resolve, reject) => {
				fastify.sqlite.all(
					`SELECT id, username, email, display_name, created_at FROM users`,
					[],
					(err: Error | null, rows: any[]) => {
						if (err) {
							reject(err);
						} else {
							resolve(rows);
						}
					}
				);
			});

			return reply.code(200).send({ users });
		} catch (err: any) {
			fastify.log.error(err);
			return reply.code(500).send({ error: 'Failed to retrieve users' });
		}
	});

	// Get a specific user by ID
	fastify.get<{ Params: UserParams }>(
		'/users/:id',
		{ preHandler: authenticateToken, schema: getUserByIdSchema },
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			// Only allow the owner to read their own profile
			if (request.user?.userId !== parseInt(id)) {
				return reply.code(403).send({ error: 'Forbidden: You can only access your own profile' });
			}

			try {
				const user = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(
						`SELECT id, username, email, display_name, created_at FROM users WHERE id = ?`,
						[id],
						(err: Error | null, row: any) => {
							if (err) {
								reject(err);
							} else {
								resolve(row);
							}
						}
					);
				});

				if (!user) {
					return reply.code(404).send({ error: 'User not found' });
				}

				return reply.code(200).send({ user });
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to retrieve user' });
			}
		}
	);

	// Update a user by ID (protected - must be the same user or admin)
	fastify.put<{ Params: UserParams; Body: UpdateUserBody }>(
		'/users/:id',
		{
			preHandler: authenticateToken,
			schema: updateUserSchema
		},
		async (
			request: FastifyRequest<{ Params: UserParams; Body: UpdateUserBody }>,
			reply: FastifyReply
		) => {
			const { id } = request.params;
			const { username, password, email, display_name } = request.body;

			// Authorization check: users can only update their own profile
			if (request.user?.userId !== parseInt(id)) {
				return reply.code(403).send({ error: 'Forbidden: You can only update your own profile' });
			}

			// Build dynamic update query
			const updates: string[] = [];
			const values: any[] = [];

			if (username) {
				updates.push('username = ?');
				values.push(username);
			}
			if (password) {
				const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
				updates.push('password = ?');
				values.push(hashedPassword);
			}
			if (email) {
				updates.push('email = ?');
				values.push(email);
			}
			if (display_name) {
				updates.push('display_name = ?');
				values.push(display_name);
			}

			if (updates.length === 0) {
				return reply.code(400).send({ error: 'No fields to update' });
			}

			values.push(id);

			try {
				const result = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.run(
						`UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
						values,
						function (err: Error | null) {
							if (err) {
								reject(err);
							} else {
								resolve(this);
							}
						}
					);
				});

				if (result.changes === 0) {
					return reply.code(404).send({ error: 'User not found' });
				}

				return reply.code(200).send({ message: 'User updated successfully' });
			} catch (err: any) {
				if (err.message.includes('UNIQUE constraint failed')) {
					return reply.code(409).send({
						error: 'Username or email already exists'
					});
				}
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to update user' });
			}
		}
	);

	// Delete a user by ID
	fastify.delete<{ Params: UserParams }>(
		'/users/:id',
		{
			preHandler: authenticateToken,
			schema: deleteUserSchema
		},
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			// Authorization check: users can only delete their own profile
			if (request.user?.userId !== parseInt(id)) {
				return reply.code(403).send({ error: 'Forbidden: You can only delete your own profile' });
			}

			try {
				const result = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.run(
						`DELETE FROM users WHERE id = ?`,
						[id],
						function (err: Error | null) {
							if (err) {
								reject(err);
							} else {
								resolve(this);
							}
						}
					);
				});

				if (result.changes === 0) {
					return reply.code(404).send({ error: 'User not found' });
				}

				return reply.code(200).send({ message: 'User deleted successfully' });
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to delete user' });
			}
		}
	);
	// Current user (from cookie/header JWT)
	fastify.get(
		'/users/me',
		{preHandler: authenticateToken},
		async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				if (!request.user) {
					return reply.code(401).send({ error: 'Unauthorized' });
				}

				const user = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(
						`SELECT id, username, email, display_name, created_at FROM users WHERE id = ?`,
						[request.user!.userId],
						(err: Error | null, row: any) => {
							if (err) {
								reject(err);
							} else {
								resolve(row);
							}
						}
					);
				});

				if (!user) {
					return reply.code(404).send({ error: 'User not found' });
				}

				return reply.code(200).send({ user });
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to retrieve user' });
			}
		}
	);
}
