import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';

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

				// Return user data (without password)
				return reply.code(200).send({
					message: 'Login successful',
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

	// Get all users
	fastify.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
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

	// Update a user by ID
	fastify.put<{ Params: UserParams; Body: UpdateUserBody }>(
		'/users/:id',
		async (
			request: FastifyRequest<{ Params: UserParams; Body: UpdateUserBody }>,
			reply: FastifyReply
		) => {
			const { id } = request.params;
			const { username, password, email, display_name } = request.body;

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
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

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
