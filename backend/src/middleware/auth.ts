import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { verifyToken, extractTokenFromHeader, JwtPayload } from '../utils/jwt.js';

/**
 * Extend FastifyRequest to include user information
 */
declare module 'fastify' {
	interface FastifyRequest {
		user?: JwtPayload;
	}
}

/**
 * @enum UserExistenceCheckStatus
 * Return value of checkUserExistence().
 */
export enum UserExistenceCheckStatus {
	DoesntExist,
	Exists,
	DbFailure	///< The database query failed to execute.
}

/**
 * Authentication middleware - verifies JWT token
 * Adds user information to request object if token is valid
 */
export async function authenticateToken(
	request: FastifyRequest,
	reply: FastifyReply
): Promise<void> {
	try {
		const authHeader = request.headers.authorization;
		const token = extractTokenFromHeader(authHeader);

		if (!token) {
			return reply.code(401).send({
				error: 'Access token required'
			});
		}

		const decoded = verifyToken(token);
		request.user = decoded;
	} catch (error) {
		return reply.code(403).send({
			error: 'Invalid or expired token'
		});
	}
}

/**
 * Optional authentication middleware - verifies token if present
 * Does not reject requests without tokens
 */
export async function optionalAuth(
	request: FastifyRequest,
	reply: FastifyReply
): Promise<void> {
	try {
		const authHeader = request.headers.authorization;
		const token = extractTokenFromHeader(authHeader);

		if (token) {
			const decoded = verifyToken(token);
			request.user = decoded;
		}
	} catch (error) {
		// Token is invalid but we don't reject the request
		// User info just won't be available
	}
}

export async function checkUserExistence(fastify: FastifyInstance,
	request: FastifyRequest,
	reply: FastifyReply
): Promise<UserExistenceCheckStatus> {
	try {
		const dbExistenceCheck = await new Promise<any>((resolve, reject) => {
			fastify.sqlite.get(`SELECT 1337 FROM users u WHERE u.id = ?`, [request.user?.userId],
				(err: Error | null, row: any) => {
					if (err) {
						reject(err);
					}
					else {
						resolve(row);
					}
				}
			);
		});

		if (!dbExistenceCheck) {
			reply.code(401).send({ error: "Your account doesn't exist anymore" });
			return UserExistenceCheckStatus.DoesntExist;
		}
		return UserExistenceCheckStatus.Exists;
	}
	catch (err: any) {
		fastify.log.error(err);
		reply.code(500).send({ error: 'SQLite request failed' });
		return UserExistenceCheckStatus.DbFailure;
	}
}
