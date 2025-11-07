import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../src/utils/jwt.js';
import { authenticateToken } from '../src/middleware/auth.js';
import {
	validateAndNormalizeRegistrationPayload,
	RegistrationValidationError
} from '../src/utils/registrationValidation.js';

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

interface RefreshTokenBody {
	refreshToken: string;
}

interface UserParams {
	id: string;
}

/**
 * User routes without Swagger schemas for testing purposes
 */
export default async function userRoutesNoSchema(fastify: FastifyInstance) {
	// Create a new user (Register)
	fastify.post<{ Body: CreateUserBody }>(
		'/users',
		async (request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) => {
			let normalizedPayload;
			try {
				normalizedPayload = validateAndNormalizeRegistrationPayload(request.body);
			} catch (err: unknown) {
				if (err instanceof RegistrationValidationError) {
					return reply.code(400).send({ error: 'Invalid registration data', details: err.messages });
				}
				throw err;
			}

			const { username, password, email, display_name, use_2fa } = normalizedPayload;

			try {
				// Hash the password
				const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

				// Insert user into database
				await new Promise<void>((resolve, reject) => {
					(fastify as any).sqlite.run(
						`INSERT INTO users (username, password, email, display_name, use_2fa) VALUES (?, ?, ?, ?, ?)`,
						[username, hashedPassword, email, display_name, use_2fa ? 1 : 0],
						function (this: any, err: Error | null) {
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
					username: username,
					requires2FA: use_2fa || false
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
					(fastify as any).sqlite.get(
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

				// Return user data with tokens (without password)
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
	fastify.post<{ Body: RefreshTokenBody }>(
		'/users/refresh',
		async (request: FastifyRequest<{ Body: RefreshTokenBody }>, reply: FastifyReply) => {
			const { refreshToken } = request.body;

			if (!refreshToken) {
				return reply.code(400).send({
					error: 'Refresh token is required'
				});
			}

			try {
				// Verify the refresh token
				const decoded = verifyToken(refreshToken);

				// Generate new tokens
				const newAccessToken = generateAccessToken(decoded.userId, decoded.username);
				const newRefreshToken = generateRefreshToken(decoded.userId, decoded.username);

				return reply.code(200).send({
					accessToken: newAccessToken,
					refreshToken: newRefreshToken
				});
			} catch (err: any) {
				return reply.code(401).send({
					error: 'Invalid or expired refresh token'
				});
			}
		}
	);

	// Get all users
	fastify.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
		try {
			const users = await new Promise<any[]>((resolve, reject) => {
				(fastify as any).sqlite.all(
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
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			try {
				const user = await new Promise<any>((resolve, reject) => {
					(fastify as any).sqlite.get(
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

	// Update a user by ID
	fastify.put<{ Params: UserParams; Body: UpdateUserBody }>(
		'/users/:id',
		{ preHandler: authenticateToken },
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
					(fastify as any).sqlite.run(
						`UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
						values,
						function (this: any, err: Error | null) {
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

				// Fetch the updated user data
				const updatedUser = await new Promise<any>((resolve, reject) => {
					(fastify as any).sqlite.get(
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

				return reply.code(200).send(updatedUser);
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
		{ preHandler: authenticateToken },
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			// Authorization check: users can only delete their own profile
			if (request.user?.userId !== parseInt(id)) {
				return reply.code(403).send({ error: 'Forbidden: You can only delete your own profile' });
			}

			try {
				const result = await new Promise<any>((resolve, reject) => {
					(fastify as any).sqlite.run(
						`DELETE FROM users WHERE id = ?`,
						[id],
						function (this: any, err: Error | null) {
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
