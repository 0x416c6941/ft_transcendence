import { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * @class ApiError
 * Custom class to better handle errors.
 */
export class ApiError extends Error {
	/** 
	 * @property {readonly number} replyHttpCode
	 * HTTP error code reply should use.
	 */
	public readonly replyHttpCode: number;

	/**
	 * @property {readonly any?} details
	 * Optional details.
	 * @remarks Not a message of the error, but only additional info.
	 */
	public readonly details?: any;

	constructor(message: string, code: number, details?: any) {
		super(message);
		this.name = 'ApiError';
		this.replyHttpCode = code;
		this.details = details;
	}
}

/**
 * Get user with `username` from `fastify.sqlite`.
 * @param {FastifyInstance}	fastify		Instance of a Fastify server.
 * @param {string}		username	ID of the user to get from `fastify.sqlite`.
 * @return Promise<object>	Object containing user with `username` from `fastify.sqlite`.
 * 				If object is undefined, then user with `username`
 * 				doesn't exist in `fastify.sqlite`.
 * @throws {ApiError}	Throws if request to `fastify.sqlite` failed.
 */
export async function dbGetUserByUsername(fastify: FastifyInstance, username: string) {
	try {
		const user = await new Promise<any>((resolve, reject) => {
			fastify.sqlite.get('SELECT * FROM users u WHERE u.username = ?',
				[username],
				function (err: Error | null, row: any) {
					if (err) {
						reject(err);
					}
					resolve(row);
				}
			);
		});

		return user;
	}
	catch (err: unknown) {
		throw new ApiError('SQLite request failed', 500, err);
	}
}

/**
 * Get user with `id` from `fastify.sqlite`.
 * @param {FastifyInstance}	fastify	Instance of a Fastify server.
 * @param {number}		id	ID of the user to get from `fastify.sqlite`.
 * @return Promise<object>	Object containing user with `id` from `fastify.sqlite`.
 * 				If object is undefined, then user with `id`
 * 				doesn't exist in `fastify.sqlite`.
 * @throws {ApiError}	Throws if request to `fastify.sqlite` failed.
 */
export async function dbGetUserById(fastify: FastifyInstance, id: number) {
	try {
		const user = await new Promise<any>((resolve, reject) => {
			fastify.sqlite.get('SELECT * FROM users u WHERE u.id = ?',
				[id],
				function (err: Error | null, row: any) {
					if (err) {
						reject(err);
					}
					resolve(row);
				}
			);
		});

		return user;
	}
	catch (err: unknown) {
		throw new ApiError('SQLite request failed', 500, err);
	}
}

/**
 * Get user with `accountId42` from `fastify.sqlite`.
 * @param {FastifyInstance}	fastify		Instance of a Fastify server.
 * @param {number}		accountId42	ID of the linked 42 account of a user
 * 						to get from `fastify.sqlite`.
 * @return Promise<object>	Object containing user with linked 42 account
 * 				`accountId42` from `fastify.sqlite`.
 * 				If object is undefined, then the provided
 * 				42 account ID isn't linked to any user in `fastify.sqlite`.
 * @throws {ApiError}	Throws if request to `fastify.sqlite` failed.
 */
export async function dbGetUserByAccountId42(fastify: FastifyInstance, accountId42: number) {
	try {
		const user = await new Promise<any>((resolve, reject) => {
			fastify.sqlite.get('SELECT * FROM users u WHERE u.account_id_42 = ?',
				[accountId42],
				function (err: Error | null, row: any) {
					if (err) {
						reject(err);
					}
					resolve(row);
				}
			);
		});

		return user;
	}
	catch (err: unknown) {
		throw new ApiError('SQLite request failed', 500, err);
	}
}

/**
 * Return record from "admins" table, where "user_id" is `userId`.
 * @param {FastifyInstance}	fastify	Instance of a Fastify server.
 * @param {number}		userId	ID of the user in "admins" table.
 * @return Promise<object>	Row from "admins" table, if `userId` is recorded.
 * 				Object will otherwise be undefined.
 * @throws {ApiError}	Throws if request to `fastify.sqlite` failed.
 */
export async function dbGetAdminByUserId(fastify: FastifyInstance, userId: number) {
	try {
		const check = await new Promise<any>((resolve, reject) => {
			fastify.sqlite.get('SELECT * FROM admins a where a.user_id = ?',
				[userId],
				function (err: Error | null, row: any) {
					if (err) {
						reject(err);
					}
					resolve(row);
				}
			)
		});

		return check;
	}
	catch (err: unknown) {
		throw new ApiError('SQLite request failed', 500, err);
	}
}

/**
 * Update "account_id_42" with `accountId42` of a user with `userId`.
 * @param {FastifyInstance}	fastify		Instance of a Fastify server.
 * @param {number}		userId		ID of a user to update 
 * @param {number | null}	accountId42	Either an ID of 42 account to link
 * 						or `null` to unlink 42 account.
 */
export async function dbUpdateUserAccountId42(fastify: FastifyInstance,
	userId: number, accountId42: number | null) {
	try {
		const result = await new Promise<SqliteRunResult>((resolve, reject) => {
			fastify.sqlite.run('UPDATE users SET account_id_42 = ? WHERE id = ?',
				[accountId42, userId],
				function (err: Error | null) {
					if (err) {
						reject(err);
					}
					resolve(this);
				}
			);
		});

		return result;
	}
	catch(err: unknown) {
		throw new ApiError('SQLite request failed', 500, err);
	}
}

/**
 * Exchange 42 OAuth code for 42 OAuth token.
 * @param {FastifyInstance} 	fastify	Instance of a Fastify server.
 * @param {FastifyRequest}	request	Request with the 42 OAuth code we've just received.
 * @return Promise<object>	Object containing response from 42 OAuth API
 * 				including the OAuth token.
 * @throws {ApiError}	Throws if the 42 API returns a non-successful HTTP status
 * 			or on a network failure.
 */
export async function exchange42CodeFor42Token(fastify: FastifyInstance,
	request: FastifyRequest<{ Querystring: Oauth42CallbackQuerystring }>) {
	const tokenUrl = 'https://api.intra.42.fr/oauth/token';
	let tokenRequestBody = {
		grant_type: 'authorization_code',
		client_id: `${fastify.config.oauth42.uid}`,
		client_secret: `${fastify.config.oauth42.secret}`,
		code: `${request.query.code}`,
		redirect_uri: 'https://localhost/api/users/oauth/42/callback'
	};
	if (request.query.state) {
		tokenRequestBody = Object.assign(tokenRequestBody, { state: `${request.query.state}` });
	}

	try {
		const tokenResponse = await fetch(tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(tokenRequestBody)
		});
		if (!tokenResponse.ok) {
			const errorData = await tokenResponse.json();
			throw new ApiError('Received an error from the 42 API', 502, errorData);
		}

		return tokenResponse.json();
	}
	catch (error) {
		if (error instanceof ApiError) {
			throw error;
		}
		throw new ApiError('Could not connect to the 42 API', 500, error);
	}
}

/**
 * Get data of 42 account by using `token`.
 * @param {{ access_token: string }}	token	Object containing the access token.
 * @return {Promise<object>}	Object containing the user's public profile data.
 * @throws {ApiError}	Throws if the 42 API returns a non-successful HTTP status
 * 			or on a network failure.
 */
export async function get42PublicData(token: { access_token: string }) {
	const dataUrl = 'https://api.intra.42.fr/v2/me';

	try {
		const dataResponse = await fetch(dataUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token.access_token}`
			}
		});
		if (!dataResponse.ok) {
			const errorData = await dataResponse.json();
			throw new ApiError('Received an error from the 42 API', 502, errorData);
		}

		return dataResponse.json();
	}
	catch (error) {
		if (error instanceof ApiError) {
			throw error;
		}
		throw new ApiError('Could not connect to the 42 API', 500, error);
	}
}
