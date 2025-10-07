import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import { authenticateToken } from '../middleware/auth.js';

const SALT_ROUNDS = 10;

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
		{
			schema: {
				description: 'Register a new user account',
				tags: ['users', 'auth'],
				body: {
					$ref: 'CreateUserRequest#'
				},
				response: {
					201: {
						description: 'User created successfully',
						type: 'object',
						properties: {
							message: { type: 'string' },
							username: { type: 'string' }
						}
					},
					400: {
						description: 'Bad request - missing required fields',
						$ref: 'Error#'
					},
					409: {
						description: 'Conflict - username or email already exists',
						$ref: 'Error#'
					},
					500: {
						description: 'Internal server error',
						$ref: 'Error#'
					}
				}
			}
		},
		async (request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) => {
			const { username, password, email, display_name } = request.body;

			// Validate required fields
			if (!username || !password || !email || !display_name) {
				return reply.code(400).send({
					error: 'Missing required fields: username, password, email, display_name'
				});
			}

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
		{
			schema: {
				description: 'Authenticate user with username and password',
				tags: ['auth'],
				body: {
					$ref: 'LoginRequest#'
				},
				response: {
					200: {
						description: 'Login successful',
						$ref: 'LoginResponse#'
					},
					400: {
						description: 'Bad request - missing required fields',
						$ref: 'Error#'
					},
					401: {
						description: 'Unauthorized - invalid credentials',
						$ref: 'Error#'
					},
					500: {
						description: 'Internal server error',
						$ref: 'Error#'
					}
				}
			}
		},
		async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
			const { username, password } = request.body;

			if (!username || !password) {
				return reply.code(400).send({
					error: 'Missing required fields: username, password'
				});
			}

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

				// Return tokens and user data (without password)
				return reply.code(200).send({
					message: 'Login successful',
					accessToken,
					refreshToken,
					user: {
						id: user.id,
						username: user.username,
						email: user.email,
						display_name: user.display_name
					}
				});
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to login' });
			}
		}
	);

	// Refresh token endpoint
	fastify.post<{ Body: { refreshToken: string } }>(
		'/users/refresh',
		{
			schema: {
				description: 'Refresh access token using refresh token',
				tags: ['auth'],
				body: {
					$ref: 'RefreshTokenRequest#'
				},
				response: {
					200: {
						description: 'New access token generated',
						$ref: 'RefreshTokenResponse#'
					},
					400: {
						description: 'Missing refresh token',
						$ref: 'Error#'
					},
					401: {
						description: 'Invalid or expired refresh token',
						$ref: 'Error#'
					}
				}
			}
		},
		async (request: FastifyRequest<{ Body: { refreshToken: string } }>, reply: FastifyReply) => {
			const { refreshToken } = request.body;

			if (!refreshToken) {
				return reply.code(401).send({
					error: 'Refresh token required'
				});
			}

			try {
				// Verify the refresh token
				const { verifyToken } = await import('../utils/jwt.js');
				const decoded = verifyToken(refreshToken);

				// Generate new tokens
				const newAccessToken = generateAccessToken(decoded.userId, decoded.username);
				const newRefreshToken = generateRefreshToken(decoded.userId, decoded.username);

				return reply.code(200).send({
					accessToken: newAccessToken,
					refreshToken: newRefreshToken
				});
			} catch (error) {
				return reply.code(403).send({
					error: 'Invalid or expired refresh token'
				});
			}
		}
	);

	// Get all users
	fastify.get('/users', {
		schema: {
			description: 'Retrieve all users (passwords excluded)',
			tags: ['users'],
			response: {
				200: {
					description: 'List of users',
					type: 'object',
					properties: {
						users: {
							type: 'array',
							items: { $ref: 'User#' }
						}
					}
				},
				500: {
					description: 'Internal server error',
					$ref: 'Error#'
				}
			}
		}
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
		{
			schema: {
				description: 'Retrieve a specific user by ID (password excluded)',
				tags: ['users'],
				params: {
					type: 'object',
					properties: {
						id: { type: 'integer', description: 'User ID' }
					},
					required: ['id']
				},
				response: {
					200: {
						description: 'User details',
						type: 'object',
						properties: {
							user: { $ref: 'User#' }
						}
					},
					404: {
						description: 'User not found',
						$ref: 'Error#'
					},
					500: {
						description: 'Internal server error',
						$ref: 'Error#'
					}
				}
			}
		},
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

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
			schema: {
				description: 'Update user information (authentication required, can only update own profile)',
				tags: ['users'],
				security: [{ bearerAuth: [] }],
				params: {
					type: 'object',
					properties: {
						id: { type: 'integer', description: 'User ID' }
					},
					required: ['id']
				},
				body: {
					$ref: 'UpdateUserRequest#'
				},
				response: {
					200: {
						description: 'User updated successfully',
						type: 'object',
						properties: {
							message: { type: 'string' }
						}
					},
					400: {
						description: 'Bad request - no fields to update',
						$ref: 'Error#'
					},
					401: {
						description: 'Unauthorized',
						$ref: 'Error#'
					},
					403: {
						description: 'Forbidden - can only update own profile',
						$ref: 'Error#'
					},
					404: {
						description: 'User not found',
						$ref: 'Error#'
					},
					409: {
						description: 'Conflict - username or email already exists',
						$ref: 'Error#'
					},
					500: {
						description: 'Internal server error',
						$ref: 'Error#'
					}
				}
			}
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
			schema: {
				description: 'Delete a user by ID',
				tags: ['users'],
				security: [{ bearerAuth: [] }],
				params: {
					type: 'object',
					properties: {
						id: { type: 'integer', description: 'User ID' }
					},
					required: ['id']
				},
				response: {
					200: {
						description: 'User deleted successfully',
						type: 'object',
						properties: {
							message: { type: 'string' }
						}
					},
					401: {
						description: 'Unauthorized - missing or invalid token',
						$ref: 'Error#'
					},
					403: {
						description: 'Forbidden - cannot delete other users',
						$ref: 'Error#'
					},
					404: {
						description: 'User not found',
						$ref: 'Error#'
					},
					500: {
						description: 'Internal server error',
						$ref: 'Error#'
					}
				}
			}
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
}
