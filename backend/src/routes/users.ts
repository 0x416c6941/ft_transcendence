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
	deleteUserSchema,
	makeAdminSchema,
	unmakeAdminSchema,
	oauth42Schema,
	oauth42CallbackSchema,
	oauth42UnlinkSchema,
	getUserAvatarSchema,
	resetUserAvatarSchema
} from '../schemas/user.schemas.js';
import {
	ApiError,
	dbGetUserByUsername,
	dbGetUserById,
	dbGetUserByAccountId42,
	dbGetAdminByUserId,
	dbUpdateUserAccountId42,
	exchange42CodeFor42Token,
	get42PublicData
} from '../utils/users.js';
import { URLSearchParams } from 'url';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import mime from 'mime';

/* Higher number => more Bcrypt hashing rounds
   => more time is necessary and more difficult is brute-forcing. */
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
				const adminCheck = await dbGetAdminByUserId(fastify, request.user!.userId);

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
				const adminCheck = await dbGetAdminByUserId(fastify, request.user!.userId);

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

				// Removing custom user avatar, if exists.
				await fsPromises.rm(
					path.join(fastify.config.avatarsPath.avatarsPath, `${id}.webp`),
					{ force: true });

				return reply.code(200).send({ message: 'User deleted successfully' });
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to delete user' });
			}
		}
	);

	/* Grant admin privileges to user by username (must be provided in body).
	 * Protected - user trying to do must be authorized and must be an admin. */
	fastify.post<{ Body: MakeOrUnmakeAdminBody }>(
		'/users/admins',
		{
			preHandler: authenticateToken,
			schema: makeAdminSchema
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
				const ourUser = await dbGetAdminByUserId(fastify, ourUserId);
				if (!ourUser) {
					return reply.code(403).send({ error: "You're not an admin" });
				}

				// Making `username` an admin.
				const user = await dbGetUserByUsername(fastify, username);
				if (!user) {
					return reply.code(404).send({ error: "Provided username doesn't exist" });
				}
				const idToMakeAdmin = user.id;
				// Checking if `username` is admin already.
				const alreadyAdminCheck = await dbGetAdminByUserId(fastify, idToMakeAdmin);
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

	/* Revoke admin privileges of a user by username (must be provided in body).
	 * Protected - user trying to do must be authorized and must be an admin. */
	fastify.delete<{ Body: MakeOrUnmakeAdminBody }>(
		'/users/admins',
		{
			preHandler: authenticateToken,
			schema: unmakeAdminSchema
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
				const ourUser = await dbGetAdminByUserId(fastify, ourUserId);

				if (!ourUser) {
					return reply.code(403).send({ error: "You're not an admin" });
				}

				// Removing admin privileges of `username`.
				const user = await dbGetUserByUsername(fastify, username);
				if (!user) {
					return reply.code(404).send({ error: "Provided username doesn't exist" });
				}
				const idToUnmakeAdmin = user.id;
				// Checking if `username` is admin.
				const isAdminCheck = await dbGetAdminByUserId(fastify, idToUnmakeAdmin);
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
	 * or log in with 42 account linked to the user
	 * (in the latter case, JWT must be present in "Authorization: Bearer" header). */
	fastify.post('/users/oauth/42',
		{
			schema: oauth42Schema
		},
		async (request: FastifyRequest, reply: FastifyReply) => {
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
				const user = await dbGetUserById(fastify, request.user!.userId);

				if (!user) {
					return reply.code(403).send({ error: 'Unauthorized: User not found' });
				}
				else if (user.account_id_42) {
					return reply.code(409).send({ error: 'This user has already linked some 42 account' });
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

	// A continuation of "POST" route on "/users/oauth/42".
	fastify.get<{ Querystring: Oauth42CallbackQuerystring }>(
		'/users/oauth/42/callback',
		{
			schema: oauth42CallbackSchema
		},
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

					const user = await dbGetUserById(fastify, request.user!.userId);
					if (!user) {
						return reply.code(403).send({ error: 'Unauthorized: User not found' });
					}
					else if (user.account_id_42) {
						return reply.code(409).send({ error: 'This user is already linked to some 42 account' });
					}

					const account42Test = await dbGetUserByAccountId42(fastify, account42Data.id);
					if (account42Test) {
						fastify.log.info(JSON.stringify(account42Test));
						return reply.code(409).send({ error: 'This 42 account is already linked to someone else' });
					}

					await dbUpdateUserAccountId42(fastify, user.id, account42Data.id);

					return reply.code(200).send({ message: 'Successfully linked 42 account' });
				}
				// User wants to log in.
				else {
					const user = await dbGetUserByAccountId42(fastify, account42Data.id);
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
	 * Protected: users can only unlink 42 account from their own profile, or they must be an admin. */
	fastify.delete<{ Params: UserParams }>(
		'/users/oauth/42/:id',
		{
			preHandler: authenticateToken,
			schema: oauth42UnlinkSchema
		},
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			/* Authorization check:
			 * users can only unlink 42 account from their own profile,
			 * OR they must be an admin. */
			try {
				const adminCheck = await dbGetAdminByUserId(fastify, request.user!.userId);

				if (request.user!.userId !== parseInt(id) && !adminCheck) {
					return reply.code(403).send({ error: 'You can only unlink 42 account from your own profile' });
				}

				const existenceCheck = await dbGetUserById(fastify, parseInt(id));
				if (!existenceCheck) {
					return reply.code(409).send({ error: "That user doesn't exist anymore" });
				}
				else if (!existenceCheck.account_id_42) {
					return reply.code(404).send({ error: "That user doesn't have any linked 42 account" });
				}

				await dbUpdateUserAccountId42(fastify, request.user!.userId, null);

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

	fastify.get<{ Params: UserParams }>(
		'/users/:id/avatar',
		{
			schema: getUserAvatarSchema
		},
		async(request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			// Check if user-specific avatar exists.
			let avatarPath = path.join(fastify.config.avatarsPath.avatarsPath,
				`${id}.webp`);
			try {
				await fsPromises.access(avatarPath, fsPromises.constants.R_OK);
			}
			catch {
				avatarPath = fastify.config.avatarsPath.defaultAvatarPath;
			}

			try {
				if (path.extname(avatarPath) !== '.webp') {
					fastify.log.warn(`Avatar at: ${avatarPath} isn't "image/webp"`);
				}
				const avatar = await fsPromises.readFile(avatarPath);

				reply.header('Content-Type', mime.getType(avatarPath));
				return reply.code(200).send(avatar);
			}
			catch (err: any) {
				fastify.log.error(err, 'Error while sending an avatar');
				return reply.code(500).send({ error: "Couldn't read an avatar on server side" });
			}
		}
	);

	// TODO: update avatar route.

	fastify.post<{ Params: UserParams }>(
		'/users/:id/avatar/reset',
		{
			preHandler: authenticateToken,
			schema: resetUserAvatarSchema
		},
		async(request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			// Checking if user at all still exists.
			try {
				const user = await dbGetUserById(fastify, parseInt(id));

				if (!user) {
					return reply.code(404).send({ error: "Your JWT token is valid, yet user doesn't exist" });
				}
			}
			catch (error: unknown) {
				fastify.log.error(error);
				if (error instanceof ApiError) {
					return reply.code(error.replyHttpCode).send(error.message);
				}
				return reply.code(500).send({ error: 'An internal server error occurred' });
			}

			const avatarPathToRemove = path.join(fastify.config.avatarsPath.avatarsPath,
					`${id}.webp`);

			// Checking if custom avatar exists.
			try {
				await fsPromises.access(avatarPathToRemove);
			}
			catch {
				return reply.code(409).send({ error: "You don't have any custom avatar" });
			}

			// Removing the user's avatar.
			try {
				await fsPromises.rm(avatarPathToRemove);

				return reply.code(200).send({ message: 'Successfully reset avatar to a default one' });
			}
			catch (err: any) {
				fastify.log.error(err, "Couldn't remove avatar");
				return reply.code(500).send({ error: "Couldn't remove avatar" });
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
	fastify.put('/users/me', {
		preHandler: authenticateToken
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });

		const body = (request.body as UpdateUserBody) || {};
  		const username = typeof body.username === 'string' ? body.username.trim() : undefined;
  		const password = typeof body.password === 'string' ? body.password.trim() : undefined;
  		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
  		const display_name = typeof body.display_name === 'string' ? body.display_name.trim() : undefined;

		// Basic validations (extend as needed)
  		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    			return reply.code(400).send({ error: 'Invalid email format' });
  		}

		const updates: string[] = [];
		const values: any[] = [];

		if (username && username.length > 0) {
    			updates.push('username = ?');
    			values.push(username);
		}
		if (password && password.length > 0) {
		    	const hashed = await bcrypt.hash(password, SALT_ROUNDS);
		    	updates.push('password = ?');
		    	values.push(hashed);
		}
		if (email && email.length > 0) {
		    	updates.push('email = ?');
		    	values.push(email);
		}
		if (display_name && display_name.length > 0) {
		    	updates.push('display_name = ?');
		    	values.push(display_name);
		}
		if (updates.length === 0) {
			return reply.code(400).send({ error: 'No fields to update' });
		}

		values.push(request.user.userId);

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
			// If no rows changed, user may still exist (values identical). Check existence.
			if (result.changes === 0) {
				const existing = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(
						`SELECT id FROM users WHERE id = ?`,
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
				if (!existing) {
					return reply.code(404).send({ error: 'User not found' });
				}
			}

			const updated = await new Promise<any>((resolve, reject) => {
      				fastify.sqlite.get(
        				`SELECT id, username, email, display_name, created_at FROM users WHERE id = ?`,
        				[request.user!.userId],
        				(err: Error | null, row: any) => (err ? reject(err) : resolve(row))
      				);
    			});

// Optional: rotate tokens if username changed (uncomment if you want this behavior)
    // if (username && username !== request.user.username) {
    //   const newAccess = generateAccessToken(updated.id, updated.username);
    //   const newRefresh = generateRefreshToken(updated.id, updated.username);
    //   reply.setCookie('accessToken', newAccess, accessCookieOpts)
    //        .setCookie('refreshToken', newRefresh, refreshCookieOpts);
    // }
			return reply.code(200).send({
      				message: result.changes === 0 ? 'No changes' : 'Profile updated successfully',
      				user: updated
    			});
  		} catch (err: any) {
  			if (typeof err?.message === 'string' && err.message.includes('UNIQUE constraint failed')) {
  			  	return reply.code(409).send({ error: 'Username or email already exists' });
  			}
  			fastify.log.error(err);
  			return reply.code(500).send({ error: 'Failed to update profile' });
		}
	});

	fastify.delete('/users/me', {
		preHandler: authenticateToken
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });

		try {
			const result = await new Promise<any>((resolve, reject) => {
				fastify.sqlite.run(
					`DELETE FROM users WHERE id = ?`,
					[request.user!.userId],
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

			// Clear cookies on account deletion
			reply.clearCookie('accessToken', { path: accessCookieOpts.path })
				.clearCookie('refreshToken', { path: refreshCookieOpts.path })
				.code(200)
				.send({ message: 'User deleted successfully' });
		} catch (err: any) {
			fastify.log.error(err);
			return reply.code(500).send({ error: 'Failed to delete user' });
		}
	});
}
