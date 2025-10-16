import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import { authenticateToken, checkUserExistence, UserExistenceCheckStatus } from '../middleware/auth.js';
import {
	registerUserSchema,
	loginUserSchema,
	refreshTokenSchema,
	getAllUsersSchema,
	getUserByIdSchema,
	updateUserSchema,
	deleteUserSchema
} from '../schemas/user.schemas.js';
import {
	ApiError,
	getUserFromDbByUsername,
	getUserFromDbById,
	getUserFromDbByAccountId42,
	getUserFromAdminsTable,
	updateUserAccountId42InDb,
	exchange42CodeFor42Token,
	get42PublicData
} from '../utils/users.js';
import { URLSearchParams } from 'url';

/* Higher number => more Bcrypt hashing rounds
   => more time is necessary and more difficult is brute-forcing. */
const SALT_ROUNDS = 10;

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
					// Returning linked 42 account ID would be weird, hence not doing it.
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
						// Returning linked 42 account ID would be weird, hence not doing it.
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

			/* Authorization check: users can only update their own profile,
			 * OR they must be an admin. */
			try {
				const adminCheck = await getUserFromAdminsTable(fastify, request.user!.userId);

				if (request.user?.userId !== parseInt(id) && !adminCheck) {
					return reply.code(403).send({ error: 'Forbidden: You can only update your own profile' });
				}
			}
			catch (error: unknown) {
				fastify.log.error(error);
				if (error instanceof ApiError) {
					return reply.code(error.replyHttpCode).send(error.message);
				}
				return reply.code(500).send({ error: 'An internal server error occurred' });
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

	// Delete a user by ID (protected - must be the same user or admin)
	fastify.delete<{ Params: UserParams }>(
		'/users/:id',
		{
			preHandler: authenticateToken,
			schema: deleteUserSchema
		},
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			/* Authorization check: users can only update their own profile,
			 * OR they must be an admin. */
			try {
				const adminCheck = await getUserFromAdminsTable(fastify, request.user!.userId);

				if (request.user?.userId !== parseInt(id) && !adminCheck) {
					return reply.code(403).send({ error: 'Forbidden: You can only update your own profile' });
				}
			}
			catch (error: unknown) {
				fastify.log.error(error);
				if (error instanceof ApiError) {
					return reply.code(error.replyHttpCode).send(error.message);
				}
				return reply.code(500).send({ error: 'An internal server error occurred' });
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
	fastify.post<{ Body: MakeOrUnmakeAdminBody }>(
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
				const ourUser = await getUserFromAdminsTable(fastify, ourUserId);
				if (!ourUser) {
					return reply.code(403).send({ error: "You're not an admin" });
				}

				// Making `username` an admin.
				const user = await getUserFromDbByUsername(fastify, username);
				if (!user) {
					return reply.code(403).send({ error: "Provided username doesn't exist" });
				}
				const idToMakeAdmin = user.id;
				// Checking if `username` is admin already.
				const alreadyAdminCheck = await getUserFromAdminsTable(fastify, idToMakeAdmin);
				if (alreadyAdminCheck) {
					return reply.code(409).send({ error: "Provided username is already an admin" });
				}

				await new Promise<void>((resolve, reject) => {
					fastify.sqlite.run(`
							INSERT INTO admins (user_id) VALUES (?)
						`, [idToMakeAdmin],
						function (err: Error | null) {
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

	// TODO: makeOrUnmakeAdminSchema
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
				const ourUser = await getUserFromAdminsTable(fastify, ourUserId);

				if (!ourUser) {
					return reply.code(403).send({ error: "You're not an admin" });
				}

				// Removing admin privileges of `username`.
				const user = await getUserFromDbByUsername(fastify, username);
				if (!user) {
					return reply.code(403).send({ error: "Provided username doesn't exist" });
				}
				const idToUnmakeAdmin = user.id;
				// Checking if `username` is admin.
				const isAdminCheck = await getUserFromAdminsTable(fastify, idToUnmakeAdmin);
				if (!isAdminCheck) {
					return reply.code(409).send({ error: "Provided username isn't an admin" });
				}
				else if (isAdminCheck.user_id === ourUserId) {
					return reply.code(403).send({ error: "You can't remove admin privileges from yourself. Why would you?" });
				}

				await new Promise<void>((resolve, reject) => {
					fastify.sqlite.run(`
							DELETE FROM admins WHERE user_id = ?
						`, [idToUnmakeAdmin],
						function (err: Error | null) {
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

	/* Unified route to link 42 account to logged in user,
	 * or log in with 42 account linked to the user.
	 * TODO: oauth42schema */
	fastify.post('/users/oauth/42', async (request: FastifyRequest, reply: FastifyReply) => {
		const baseUrl = 'https://api.intra.42.fr/oauth/authorize';
		let params = new URLSearchParams({
			client_id: `${fastify.config.oauth42.uid}`,
			redirect_uri: 'https://localhost/api/users/oauth/42/callback',
			scope: 'public',
			response_type: 'code'
		});
		if (request.headers.authorization) {
			await authenticateToken(request, reply);
			// Authentication failed and `authenticateToken()` replied with 401.
			if (!request.user) {
				return;
			}

			try {
				const user = await getUserFromDbById(fastify, request.user!.userId);

				if (!user) {
					return reply.code(403).send({ error: 'Unauthorized: User not found' });
				}
				else if (user.account_id_42) {
					return reply.code(409).send({ error: 'This user is already linked to some 42 account' });
				}
			}
			catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'SQLite request failed' });
			}
			params.append('state', request.headers.authorization);
		}

		return reply.redirect(`${baseUrl}?${params.toString()}`);
	});

	/* A continuation of "POST" route on "/users/oauth/42".
	 * TODO: oauth42CallbackSchema */
	fastify.get<{ Querystring: Oauth42CallbackQuerystring }>(
		'/users/oauth/42/callback',
		async (request: FastifyRequest<{ Querystring: Oauth42CallbackQuerystring }>, reply: FastifyReply) => {
			try {
				const token = await exchange42CodeFor42Token(fastify, request);

				const account42Data = await get42PublicData(token);

				// Authorized user wants to link 42 account.
				if (request.query.state) {
					/* `authenticateToken()` awaits "Authorization: Bearer *TOKEN*"
					 * in `request.headers.authorization`. */
					request.headers.authorization = request.query.state;
					await authenticateToken(request, reply);
					// Authentication failed and `authenticateToken()` replied with 401.
					if (!request.user) {
						return;
					}

					const user = await getUserFromDbById(fastify, request.user!.userId);
					if (!user) {
						return reply.code(403).send({ error: 'Unauthorized: User not found' });
					}
					else if (user.account_id_42) {
						return reply.code(409).send({ error: 'This user is already linked to some 42 account' });
					}

					const account42Test = await getUserFromDbByAccountId42(fastify, account42Data.id);
					if (account42Test) {
						fastify.log.info(JSON.stringify(account42Test));
						return reply.code(409).send({ error: 'This 42 account is already linked to someone else' });
					}

					await updateUserAccountId42InDb(fastify, user.id, account42Data.id);

					return reply.code(200).send({ message: 'Successfully linked 42 account' });
				}
				// User wants to log in.
				else {
					const user = await getUserFromDbByAccountId42(fastify, account42Data.id);
					if (!user) {
						return reply.code(404).send({ error: "This 42 account isn't linked to any user" });
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
				}
			}
			catch (error: unknown) {
				fastify.log.error(error);
				if (error instanceof ApiError) {
					return reply.code(error.replyHttpCode).send(error.message);
				}
				return reply.code(500).send({ error: 'An internal server error occurred' });
			}
		}
	);

	/* A route to unlink 42 account.
	 * TODO: oauth42DeleteSchema */
	fastify.delete<{ Params: UserParams }>(
		'/users/oauth/42/:id',
		{
			preHandler: authenticateToken
		},
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			/* Authorization check:
			 * users can only unlink 42 account from their own profile,
			 * OR they must be an admin. */
			try {
				const adminCheck = await getUserFromAdminsTable(fastify, request.user!.userId);

				if (request.user!.userId !== parseInt(id) && !adminCheck) {
					return reply.code(403).send({ error: 'Forbidden: You can only unlink 42 account from your own profile' });
				}

				const existenceCheck = await getUserFromDbById(fastify, parseInt(id));
				if (!existenceCheck) {
					return reply.code(409).send({ error: "That user doesn't exist anymore" });
				}
				else if (!existenceCheck.account_id_42) {
					return reply.code(404).send({ error: "You don't have any linked 42 account" });
				}

				await updateUserAccountId42InDb(fastify, request.user!.userId, null);
				
				return reply.code(200).send({ message: 'Successfully unlinked 42 account' });
			}
			catch (error: unknown) {
				fastify.log.error(error);
				if (error instanceof ApiError) {
					return reply.code(error.replyHttpCode).send(error.message);
				}
				return reply.code(500).send({ error: 'An internal server error occurred' });
			}
		}
	);
}
