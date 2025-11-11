import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { clearAuthCookies, generateAccessToken, generateRefreshToken, generateTemp2FAToken, setAuthCookies, verifyToken, verifyTemp2FAToken } from '../utils/jwt.js';
import { authenticateToken } from '../middleware/auth.js';
import {
	registerUserSchema,
	loginUserSchema,
	refreshTokenSchema,
	logoutSchema,
	getCurrentUserSchema,
	getUserByIdSchema,
	updateUserSchema,
	deleteUserSchema,
	makeAdminSchema,
	unmakeAdminSchema,
	oauth42Schema,
	oauth42CallbackSchema,
	oauth42UnlinkSchema,
	getUserAvatarSchema,
	updateUserAvatarSchema,
	resetUserAvatarSchema,
	getUserByUsernameSchema,
	twoFactorSetupSchema,
	twoFactorVerifySchema
} from '../schemas/user.schemas.js';
import {
	ApiError,
	dbGetUserByUsername,
	dbGetUserById,
	dbGetUserByAccountId42,
	dbGetAdminByUserId,
	exchange42CodeFor42Token,
	get42PublicData,
	dbRegisterUserWithAccount42
} from '../utils/users.js';
import {
	RESERVED_42_USERNAME_PREFIX,
	RESERVED_42_DISPLAY_NAME_PREFIX,
	AVATAR_IMAGE_SIZE_LIMIT
} from '../app.config.js'
import {
	validateAndNormalizeRegistrationPayload,
	RegistrationValidationError,
	NormalizedRegistrationPayload
} from '../utils/registrationValidation.js';
import { URLSearchParams } from 'url';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import mime from 'mime';
import fastifyMultipart from '@fastify/multipart';
import sharp from 'sharp';

/* Higher number => more Bcrypt hashing rounds
   => more time is necessary and more difficult is brute-forcing. */
const SALT_ROUNDS = 10;

type PublicUserInfo = {
	id: number;
	username: string;
	email: string;
	display_name: string;
	created_at: string;
	use_2fa: boolean;
};

interface CreateUserBody {
	username: string;
	password: string;
	email: string;
	display_name: string;
	use_2fa?: boolean;
}

interface UpdateUserBody {
	username?: string;
	password?: string;
	email?: string;
	display_name?: string;
	use_2fa?: boolean;
}

interface LoginBody {
	username: string;
	password: string;
}

export default async function userRoutes(fastify: FastifyInstance) {
	// We need to be able to receive at least avatars, potentially other files as well.
	fastify.register(fastifyMultipart);

	// Create a new user (Register)
	fastify.post<{ Body: CreateUserBody }>(
		'/users',
		{ schema: registerUserSchema },
		async (request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) => {
			let normalizedPayload: NormalizedRegistrationPayload;
			try {
				normalizedPayload = validateAndNormalizeRegistrationPayload(request.body);
			} catch (err: unknown) {
				if (err instanceof RegistrationValidationError) {
					return reply.code(400).send({ error: 'Invalid registration data', details: err.messages });
				}
				throw err;
			}

			const { username, password, email, display_name, use_2fa } = normalizedPayload;

			/* Reserve some prefix for username and display name
			 * for 42 accounts in order to prevent possible collisions with normal accounts
			 * and try to ensure successful registration. */
			if (username.startsWith(RESERVED_42_USERNAME_PREFIX) ||
				display_name.startsWith(RESERVED_42_DISPLAY_NAME_PREFIX)) {
				return reply
					.code(403)
					.send({ error: 'Username and display prefix "42_" is reserved for 42 OAuth accounts.' })
			}
			try {
				// Hash the password
				const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

				// Generate TOTP secret if 2FA is enabled
				let totpSecret: string | null = null;
				if (use_2fa) {
					const secret = speakeasy.generateSecret({
						name: `ft_transcendence (${username})`,
						length: 32
					});
					totpSecret = secret.base32;
				}

				// Insert user into database
				await new Promise<void>((resolve, reject) => {
					fastify.sqlite.run(
						`INSERT INTO users (username, password, email, display_name, use_2fa, totp_secret) VALUES (?, ?, ?, ?, ?, ?)`,
						[username, hashedPassword, email, display_name, use_2fa ? 1 : 0, totpSecret],
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
					username: username,
					requires2FA: use_2fa || false
				});
			} catch (err: any) {
				if (typeof err.message === 'string' && err.message.includes('UNIQUE constraint failed')) {
					return reply.code(409).send({
						error: 'Username, display name or email already exists'
					});
				}
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to create user' });
			}
		}
	);

	// Get 2FA setup QR code
	fastify.get(
		'/users/2fa/setup',
		{ schema: twoFactorSetupSchema },
		async (request: FastifyRequest<{ Querystring: { username: string } }>, reply: FastifyReply) => {
			const { username } = request.query;

			try {
				const user = await dbGetUserByUsername(fastify, username);

				if (!user) {
					return reply.code(404).send({ error: 'User not found' });
				}

				if (!user.use_2fa || !user.totp_secret) {
					return reply.code(400).send({ error: '2FA is not enabled for this user' });
				}

				// Generate QR code
				const otpauthUrl = speakeasy.otpauthURL({
					secret: user.totp_secret,
					label: username,
					issuer: 'ft_transcendence',
					encoding: 'base32'
				});

				const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);

				return reply.code(200).send({
					qrCode: qrCodeDataURL,
					secret: user.totp_secret
				});
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to generate QR code' });
			}
		}
	);

	// Get current user's 2FA QR code (authenticated)
	fastify.get(
		'/users/me/2fa/qrcode',
		{ preHandler: authenticateToken },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const userId = request.user!.userId;

			try {
				const user = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(
						'SELECT username, use_2fa, totp_secret FROM users WHERE id = ?',
						[userId],
						(err: Error | null, row: any) => {
							if (err) reject(err);
							else resolve(row);
						}
					);
				});

				if (!user) {
					return reply.code(404).send({ error: 'User not found' });
				}

				if (!user.use_2fa || !user.totp_secret) {
					return reply.code(400).send({ error: '2FA is not enabled or not set up' });
				}

				// Generate QR code
				const otpauthUrl = speakeasy.otpauthURL({
					secret: user.totp_secret,
					label: user.username,
					issuer: 'ft_transcendence',
					encoding: 'base32'
				});

				const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);

				return reply.code(200).send({
					qrCode: qrCodeDataURL,
					secret: user.totp_secret
				});
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to generate QR code' });
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
				const user = await dbGetUserByUsername(fastify, username);

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

				// Check if 2FA is enabled
				if (user.use_2fa) {
					// Generate a temporary token for 2FA verification
					const tempToken = generateTemp2FAToken(user.id, user.username);
					
					return reply.code(200).send({
						requires2FA: true,
						tempToken: tempToken,
						message: 'Please provide your 2FA token'
					});
				}

				// Generate JWT tokens
				const accessToken = generateAccessToken(user.id, user.username);
				const refreshToken = generateRefreshToken(user.id, user.username);

				// Set HttpOnly cookies
       				setAuthCookies(reply, accessToken, refreshToken);

				return reply
					.code(200)
					.send({
						message: 'Login successful',
					});
			} catch (err: any) {
				if (err instanceof ApiError) {
					fastify.log.error({ err: err.details }, err.message);
					return reply.code(err.replyHttpCode).send({ error: err.message });
				}

				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to login' });
			}
		}
	);

	// Verify 2FA token
	fastify.post<{ Body: { token: string; tempToken: string } }>(
		'/users/2fa/verify',
		{ schema: twoFactorVerifySchema },
		async (request: FastifyRequest<{ Body: { token: string; tempToken: string } }>, reply: FastifyReply) => {
			const { token, tempToken } = request.body;

			try {
				// Verify the temporary token
				const decoded = verifyTemp2FAToken(tempToken);

				// Get user from database
				const user = await dbGetUserById(fastify, decoded.userId);

				if (!user) {
					return reply.code(401).send({ error: 'User not found' });
				}

				if (!user.use_2fa || !user.totp_secret) {
					return reply.code(400).send({ error: '2FA is not enabled for this user' });
				}

				// Verify the TOTP token
				const isValid = speakeasy.totp.verify({
					secret: user.totp_secret,
					encoding: 'base32',
					token: token,
					window: 2 // Allow 2 time steps (60 seconds) of clock drift
				});

				if (!isValid) {
					return reply.code(401).send({ error: 'Invalid 2FA token' });
				}

				// Generate full JWT tokens
				const accessToken = generateAccessToken(user.id, user.username);
				const refreshToken = generateRefreshToken(user.id, user.username);

				// Set HttpOnly cookies
				setAuthCookies(reply, accessToken, refreshToken);

				return reply.code(200).send({
					message: 'Login successful'
				});
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(401).send({ error: 'Invalid or expired 2FA token' });
			}
		}
	);

	// Refresh token endpoint
	fastify.post(
		'/users/refresh',
		{ schema: refreshTokenSchema },
		async (request: FastifyRequest, reply: FastifyReply) => {
			reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
    			const refreshToken = request.cookies?.refreshToken;

			// Validate the refresh token
			if (!refreshToken) {
        			return reply.code(401).send({ error: 'Missing refresh token' });
      			}

			try {
				// Verify the refresh token
				const decoded = verifyToken(refreshToken);

				// Generate new tokens
				const newAccessToken = generateAccessToken(decoded.userId, decoded.username);
				const newRefreshToken = generateRefreshToken(decoded.userId, decoded.username);

				setAuthCookies(reply, newAccessToken, newRefreshToken);
				// Set new tokens in HttpOnly cookies
				return reply
					.code(200)
					.send({	message: 'Tokens refreshed successfully'});
			} catch (error) {
				return reply.code(401).send({
					error: 'Invalid or expired refresh token'
				});
			}
		}
	);

	// Logout: clear cookies
  	fastify.post('/users/logout',
		{ schema: logoutSchema },
		async (request: FastifyRequest, reply: FastifyReply) => {
			// prevent caching of auth state
      			reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
      			// clear both cookies via helper
      			clearAuthCookies(reply);
			return reply.code(200).send({ message: "Logged out" });
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

	// Get a specific user by Username
	fastify.get<{ Params: UsernameParams }>(
		'/users/by-username/:username',
		{
			preHandler: authenticateToken,
			schema: getUserByUsernameSchema
		},
		async (request: FastifyRequest<{ Params: UsernameParams }>, reply: FastifyReply) => {
			const { username } = request.params;

			try {
				const requesterUser = await dbGetUserById(fastify, request.user!.userId);
				if (!requesterUser) {
					return reply
						.code(401)
						.send({ error: "Your JWT token is valid, yet your user doesn't exist" });
				}

				const dbUser = await dbGetUserByUsername(fastify, username);
				if (!dbUser) {
					return reply.code(404).send({ error: 'User not found' });
				}

				return reply
					.code(200)
					.send({
						user: {
							id: dbUser.id,
							username: dbUser.username,
							email: dbUser.email,
							display_name: dbUser.display_name,
							created_at: dbUser.created_at
						}
					});
			} catch (err: any) {
				fastify.log.error(err);
				return reply
					.code(500)
					.send({ error: 'Failed to retrieve user' });
			}
		}
	);

	// Get own user info
	fastify.get(
		'/users/me',
		{
			preHandler: authenticateToken,
			schema: getCurrentUserSchema
		},
		async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				const userData = await dbGetUserById(fastify, request.user!.userId);

				if (!userData) {
					return reply
						.code(401)
						.send({ error: "JWT token is valid, yet your user doesn't exist" });
				}

				const user: PublicUserInfo = {
					id: userData.id,
					username: userData.username,
					email: userData.email,
					display_name: userData.display_name,
					created_at: userData.created_at,
					use_2fa: userData.use_2fa ? true : false
				};

				return reply.code(200).send({ user });
			} catch (err: any) {
				if (err instanceof ApiError) {
					fastify.log.error({ err: err.details }, err.message);
					return reply.code(err.replyHttpCode).send({ error: err.message });
				}
				fastify.log.error({ err }, "Failed to retrieve user");
				return reply.code(500).send({ error: 'Failed to retrieve user' });
			}
		}
	);

	// Update a user
	fastify.put<{ Body: UpdateUserBody }>(
		'/users/me',
		{
			preHandler: authenticateToken,
			schema: updateUserSchema
		}, async (
			request: FastifyRequest<{ Body: UpdateUserBody }>,
			reply: FastifyReply
		) => {
			const userId = request.user!.userId;
			const { username, password, email, display_name, use_2fa } = request.body;

			/* Reserve some prefix for username and display name
			 * for 42 accounts in order to prevent possible collisions with normal accounts
			 * and try to ensure successful registration. */
			if (username?.startsWith(RESERVED_42_USERNAME_PREFIX) ||
				display_name?.startsWith(RESERVED_42_DISPLAY_NAME_PREFIX)) {
				return reply
					.code(403)
					.send({ error: 'Username and display prefix "42_" is reserved for 42 OAuth accounts.' })
			}

			// Get current user to check totp_secret
			let currentUser: any;
			try {
				currentUser = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.get(
						'SELECT id, username, totp_secret, use_2fa FROM users WHERE id = ?',
						[userId],
						(err: Error | null, row: any) => {
							if (err) reject(err);
							else resolve(row);
						}
					);
				});

				if (!currentUser) {
					return reply.code(404).send({ error: 'User not found' });
				}
			} catch (err: any) {
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to retrieve user' });
			}

			// Build dynamic update query
			const updates: string[] = [];
			const values: any[] = [];

			if (username) {
				updates.push('username = ?');
				values.push(username);
			}
			if (typeof password === "string" && password.length > 0) {
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

			// Handle 2FA changes
			let newTotpSecret: string | null = null;
			let shouldGenerateQR = false;

			if (typeof use_2fa === 'boolean') {
				updates.push('use_2fa = ?');
				values.push(use_2fa ? 1 : 0);

				// If enabling 2FA and totp_secret is empty, generate new secret
				if (use_2fa && !currentUser.totp_secret) {
					const secret = speakeasy.generateSecret({
						name: `ft_transcendence (${currentUser.username})`,
						length: 32
					});
					newTotpSecret = secret.base32;
					updates.push('totp_secret = ?');
					values.push(newTotpSecret);
					shouldGenerateQR = true;
				}
			}

			if (updates.length === 0) {
				return reply.code(400).send({ error: 'No fields to update' });
			}

			values.push(userId);

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

				// If we generated a new TOTP secret, return QR code
				if (shouldGenerateQR && newTotpSecret) {
					const otpauthUrl = speakeasy.otpauthURL({
						secret: newTotpSecret,
						label: currentUser.username,
						issuer: 'ft_transcendence',
						encoding: 'base32'
					});

					const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);

					return reply.code(200).send({
						message: 'User updated successfully',
						qrCode: qrCodeDataURL,
						secret: newTotpSecret
					});
				}

				return reply.code(200).send({ message: 'User updated successfully' });
			} catch (err: any) {
				if (err.message.includes('UNIQUE constraint failed')) {
					return reply.code(409).send({
						error: 'Username, display name or email already exists'
					});
				}
				fastify.log.error(err);
				return reply.code(500).send({ error: 'Failed to update user' });
			}
		}
	);

	// Delete a user by ID
	fastify.delete<{ Params: UserParams }>(
		'/users/me',
		{
			preHandler: authenticateToken,
			schema: deleteUserSchema
		},
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const userId = request.user!.userId;

			try {
				const result = await new Promise<any>((resolve, reject) => {
					fastify.sqlite.run(
						`DELETE FROM users WHERE id = ?`,
						[userId],
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
				try {
					await fsPromises.rm(
						path.join(fastify.config.avatarsPath.avatarsPath, `${userId}.webp`),
						{ force: true }
					);
				} catch (err) {
					fastify.log.error({ err }, "Failed to remove avatar on delete");
				}
				// Clear cookies on account deletion
				clearAuthCookies(reply);

				return reply
					.code(200)
					.send({ message: 'User deleted successfully' });
			} catch (err: any) {
				if (err instanceof ApiError) {
					fastify.log.error({ err: err.details }, err.message);
					return reply.code(err.replyHttpCode).send({ error: err.message });
				}
				fastify.log.error({ err }, "Failed to delete user");
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

	// Log in with 42 OAuth
	// (tries to create an account for a user if it doesn't exist yet).
	fastify.get('/users/oauth/42',
		{
			schema: oauth42Schema
		},
		async (request: FastifyRequest, reply: FastifyReply) => {
			const requestBaseUrl = 'https://api.intra.42.fr/oauth/authorize';
			let requestParams = new URLSearchParams({
				client_id: `${fastify.config.oauth42.uid}`,
				redirect_uri: 'https://localhost/api/users/oauth/42/callback',
				scope: 'public',
				response_type: 'code'
			});

			// In case we catch any error, we need to redirect user back.
			const errorBaseUrl = 'https://localhost/error/';
			let errorParams: URLSearchParams | null = null;

			if (request.cookies?.accessToken) {
				let hasResetCookie = false;

				// Prevent caches from storing personalized responses.
				reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
				try {
					request.user = verifyToken(request.cookies.accessToken);
				}
				catch (err: any) {
					// User stores invalid cookie and tries to log in with 42 OAuth.
					// Makes sense to clear it for them in this case, however log this situation.
					clearAuthCookies(reply);
					fastify.log.info(`Clearing cookie with invalid JWT during 42 OAuth: ${request.cookies.accessToken}`);
					hasResetCookie = true;
				}
				if (!hasResetCookie) {
					try {
						const user = await dbGetUserById(fastify, request.user!.userId);

						if (user) {
							errorParams = new URLSearchParams({
								error_code: '403',
								error_message: 'You are already logged in'
							});
							return reply.redirect(`${errorBaseUrl}?${errorParams.toString()}`);
						}
					}
					catch (err: any) {
						fastify.log.error(err);
						errorParams = new URLSearchParams({
							error_code: '500',
							error_message: 'SQLite request failed'
						});
						return reply.redirect(`${errorBaseUrl}?${errorParams.toString()}`);
					}
				}
			}

			return reply.redirect(`${requestBaseUrl}?${requestParams.toString()}`);
		}
	);

	/* A continuation of "GET" route on "/users/oauth/42".
	 *
	 * XXX for evaluator: we could've also implemented linking and unlinking of 42 OAuth for existing accounts.
	 * The reason we don't handle these is because this would require
	 * adding additional logic and also more work on the frontend side.
	 * Subject states:
	 * "In this major module, the goal is to implement a secure external authentication system using OAuth 2.0."
	 * We believe our PoC is sufficient to demostrate, that we can use RFC 6749 to achieve certain goals.
	 */
	fastify.get<{ Querystring: Oauth42CallbackQuerystring }>(
		'/users/oauth/42/callback',
		{
			schema: oauth42CallbackSchema
		},
		async (request: FastifyRequest<{ Querystring: Oauth42CallbackQuerystring }>, reply: FastifyReply) => {
			const redirectBaseUrl = 'https://localhost';

			// In case we catch any error, we need to redirect user back.
			const errorBaseUrl = 'https://localhost/error/';
			let errorParams: URLSearchParams | null = null;

			try {
				// Prevent caches from storing personalized responses.
				reply.header("Cache-Control", "no-store").header("Vary", "Cookie");

				const token = await exchange42CodeFor42Token(fastify, request);

				const account42Data = await get42PublicData(token);

				let user = await dbGetUserByAccountId42(fastify, account42Data.id);
				if (!user) {
					// Creating new user based on 42 account.
					await dbRegisterUserWithAccount42(fastify, account42Data);

					user = await dbGetUserByAccountId42(fastify, account42Data.id);
				}

				const accessToken = generateAccessToken(user.id, user.username);
				const refreshToken = generateRefreshToken(user.id, user.username);
				setAuthCookies(reply, accessToken, refreshToken);

				return reply.redirect(redirectBaseUrl);
			}
			catch (error: unknown) {
				fastify.log.error(error);
				if (error instanceof ApiError) {
					errorParams = new URLSearchParams({
						error_code: `${error.replyHttpCode}`,
						error_message: `${error.message}`
					});
				}
				else {
					errorParams = new URLSearchParams({
						error_code: '500',
						error_message: 'An internal server error occurred during 42 OAuth process'
					});
				}
				return reply.redirect(`${errorBaseUrl}?${errorParams.toString()}`);
			}
		}
	);

	/* A route to unlink 42 account.
	 * Protected: users can only unlink 42 account from their own profile, or they must be an admin. */
	/*
	fastify.delete<{ Params: UserParams }>(
		'/users/oauth/42/:id',
		{
			preHandler: authenticateToken,
			schema: oauth42UnlinkSchema
		},
		async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			// Authorization check:
			// users can only unlink 42 account from their own profile,
			// OR they must be an admin.
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
					return reply.code(422).send({ error: "That user doesn't have any linked 42 account" });
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
	 */

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

	fastify.put<{ Params: UserParams }>(
		'/users/:id/avatar', {
		bodyLimit: AVATAR_IMAGE_SIZE_LIMIT,
		preHandler: authenticateToken,
		schema: updateUserAvatarSchema
	}, async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
		const { id } = request.params;

		/* Checking if user still exists
		 * and if they have sufficient privileges to update avatar
		 * of a requested user. */
		try {
			const user = await dbGetUserById(fastify, request.user!.userId);

			if (!user) {
				return reply.code(401).send({ error: "Your JWT token is valid, yet user doesn't exist" });
			}

			const adminCheck = await dbGetAdminByUserId(fastify, request.user!.userId);

			if (request.user!.userId !== parseInt(id) &&
				!adminCheck) {
				return reply.code(403).send({ error: "Insufficient privileges." });
			}
		}
		catch (error: unknown) {
			fastify.log.error(error);
			if (error instanceof ApiError) {
				return reply.code(error.replyHttpCode).send(error.message);
			}
			return reply.code(500).send({ error: 'An internal server error occurred' });
		}

		const data = await request.file();
		if (!data) {
			return reply.code(400).send({ error: 'No file' });
		}
		else if (!data.mimetype.startsWith('image/')) {
			return reply.code(400).send({ error: 'Uploaded file must be an image' });
		}
		const chunks: Buffer[] = [];
		for await (const chunk of data.file) {
			chunks.push(chunk);
		}
		const buffer = Buffer.concat(chunks);

		const outputPath = path.join(fastify.config.avatarsPath.avatarsPath, `${id}.webp`);
		try {
			await sharp(buffer)
				.resize(256, 256)
				.webp()
				.toFile(outputPath);

			return reply.code(200).send({ message: 'Successfully updated an avatar' });
		}
		catch (err: unknown) {
			return reply.code(400).send({ error: 'Received borked image' });
		}
	});

	fastify.post<{ Params: UserParams }>(
		'/users/:id/avatar/reset',
		{
			preHandler: authenticateToken,
			schema: resetUserAvatarSchema
		},
		async(request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
			const { id } = request.params;

			/* Checking if user still exists
			 * and if they have sufficient privileges to reset avatar
			 * of a requested user. */
			// Checking if user still exists at all.
			try {
				const user = await dbGetUserById(fastify, parseInt(id));

				if (!user) {
					return reply.code(401).send({ error: "Your JWT token is valid, yet user doesn't exist" });
				}

				const adminCheck = await dbGetAdminByUserId(fastify, request.user!.userId);

				if (request.user!.userId !== parseInt(id) &&
					!adminCheck) {
					return reply.code(403).send({ error: "Insufficient privileges." });
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

}
