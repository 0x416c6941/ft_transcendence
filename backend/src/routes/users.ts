import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import { authenticateToken } from '../middleware/auth.js';
import {
	registerUserSchema,
	loginUserSchema,
	refreshTokenSchema,
	getAllUsersSchema,
	getUserByIdSchema,
	updateUserSchema,
	deleteUserSchema
} from '../schemas/user.schemas.js';

/* Higher number => more Bcrypt hashing rounds
   => more time is necessary and more difficult is brute-forcing. */
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

interface MakeOrUnmakeAdminBody {
	username: string;
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
		{ schema: refreshTokenSchema },
		async (request: FastifyRequest<{ Body: { refreshToken: string } }>, reply: FastifyReply) => {
			const { refreshToken } = request.body;

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
		{ schema: getUserByIdSchema },
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

				// May happen if user doesn't exist anymore.
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

	// TODO: makeOrUnmakeAdminSchema
	fastify.put<{ Body: MakeOrUnmakeAdminBody }>(
		'/users/admins',
		{
			preHandler: authenticateToken
		},
		async (request: FastifyRequest<{ Body: MakeOrUnmakeAdminBody }>, reply: FastifyReply) => {
			const { username } = request.body;

			// This should NEVER happen.
			if (request.user === undefined) {
				fastify.log.error('"request.user" is undefined');
				return reply.code(500).send({ error: `"request.user" is undefined` });
			}
			const ourUserId = request.user.userId;
			try {
				// Checking if our user has admin privileges.
				const ourUser = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(`
							SELECT 1337 FROM admins WHERE user_id = ?
						`, [ourUserId], (err: Error | null, row: any) => {
							if (err) {
								reject(err);
							}
							else {
								resolve(row);
							}
						}
					);
				});

				if (!ourUser) {
					return reply.code(403).send({ error: "You're not an admin" });
				}

				// Making `username` an admin.
				let idToMakeAdmin: number | null;

				const user = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(`
							SELECT id FROM users WHERE username = ?
						`, [username], (err: Error | null, row: any) => {
							if (err) {
								reject(err);
							}
							else {
								resolve(row);
							}
						}
					);
				});
				if (!user) {
					return reply.code(403).send({ error: "Provided username doesn't exist" });
				}
				idToMakeAdmin = user.id;
				// Checking if `username` is admin already.
				const alreadyAdminCheck = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(`
							SELECT 1337 FROM admins WHERE user_id = ?
						`, [idToMakeAdmin], (err: Error | null, row: any) => {
							if (err) {
								reject(err);
							}
							else {
								resolve(row);
							}
						}
					);
				});
				if (alreadyAdminCheck) {
					return reply.code(409).send({ error: "Provided username is already an admin" });
				}
				await new Promise<void>((resolve, reject) => {
					fastify.sqlite.run(`
							INSERT INTO admins (user_id) VALUES (?)
						`, [idToMakeAdmin], (err: Error | null) => {
							if (err) {
								reject(err);
							}
							else {
								resolve();
							}
						}
					);
				});

				return reply.code(200).send({ message: 'Successfully made user an admin' });
			}
			catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'SQLite request failed' });
			}
		}
	);

	fastify.delete<{ Body: MakeOrUnmakeAdminBody }>(
		'/users/admins',
		{
			preHandler: authenticateToken
		},
		async (request: FastifyRequest<{ Body: MakeOrUnmakeAdminBody }>, reply: FastifyReply) => {
			const { username } = request.body;

			// This should NEVER happen.
			if (request.user === undefined) {
				fastify.log.error('"request.user" is undefined');
				return reply.code(500).send({ error: `"request.user" is undefined` });
			}
			const ourUserId = request.user.userId;
			try {
				// Checking if our user has admin privileges.
				const ourUser = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(`
							SELECT 1337 FROM admins WHERE user_id = ?
						`, [ourUserId], (err: Error | null, row: any) => {
							if (err) {
								reject(err);
							}
							else {
								resolve(row);
							}
						}
					);
				});

				if (!ourUser) {
					return reply.code(403).send({ error: "You're not an admin" });
				}

				// Removing admin privileges of `username`.
				let idToUnmakeAdmin: number | null;

				const user = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(`
							SELECT id FROM users WHERE username = ?
						`, [username], (err: Error | null, row: any) => {
							if (err) {
								reject(err);
							}
							else {
								resolve(row);
							}
						}
					);
				});
				if (!user) {
					return reply.code(403).send({ error: "Provided username doesn't exist" });
				}
				idToUnmakeAdmin = user.id;
				// Checking if `username` is admin.
				const isAdminCheck = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(`
							SELECT user_id FROM admins WHERE user_id = ?
						`, [idToUnmakeAdmin], (err: Error | null, row: any) => {
							if (err) {
								reject(err);
							}
							else {
								resolve(row);
							}
						}
					);
				});
				if (!isAdminCheck) {
					return reply.code(409).send({ error: "Provided username isn't an admin" });
				}
				else if (isAdminCheck.user_id === ourUserId) {
					return reply.code(403).send({ error: "You can't remove admin privileges from yourself. Why would you?" });
				}
				await new Promise<void>((resolve, reject) => {
					fastify.sqlite.run(`
							DELETE FROM admins WHERE user_id = ?
						`, [idToUnmakeAdmin], (err: Error | null) => {
							if (err) {
								reject(err);
							}
							else {
								resolve();
							}
						}
					);
				});

				return reply.code(200).send({ message: 'Successfully unmade user an admin' });
			}
			catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'SQLite request failed' });
			}
		}
	);
}
