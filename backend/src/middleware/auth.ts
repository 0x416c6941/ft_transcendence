import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { verifyToken, extractTokenFromHeader, JwtPayload } from '../utils/jwt.js';
import '@fastify/cookie';

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
		// Prefer JWT from HttpOnly cookie
		const cookieToken = request.cookies?.accessToken;
		// Fallback: Authorization: Bearer <token>
		const headerToken = extractTokenFromHeader(request.headers.authorization as string | undefined);
		const token = cookieToken ?? headerToken;
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

export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
	try {
    		const cookieToken = (request.cookies as Record<string, string> | undefined)?.accessToken;
    		const headerToken = extractTokenFromHeader(request.headers.authorization as string | undefined);
    		const token = cookieToken ?? headerToken;
    		if (token) request.user = verifyToken(token);
  	} catch {
    		// Token is invalid but we don't reject the request
 		// User info just won't be available
  	}
}


// /**
//  * Authentication middleware - verifies JWT token
//  * Adds user information to request object if token is valid
//  */
// export async function authenticateToken(
// 	request: FastifyRequest,
// 	reply: FastifyReply
// ): Promise<void> {
// 	try {
// 		const authHeader = request.headers.authorization;
// 		const token = extractTokenFromHeader(authHeader);

// 		if (!token) {
// 			return reply.code(401).send({
// 				error: 'Access token required'
// 			});
// 		}

// 		const decoded = verifyToken(token);
// 		request.user = decoded;
// 	} catch (error) {
// 		return reply.code(403).send({
// 			error: 'Invalid or expired token'
// 		});
// 	}
// }

// /**
//  * Optional authentication middleware - verifies token if present
//  * Does not reject requests without tokens
//  */
// export async function optionalAuth(
// 	request: FastifyRequest,
// 	reply: FastifyReply
// ): Promise<void> {
// 	try {
// 		const authHeader = request.headers.authorization;
// 		const token = extractTokenFromHeader(authHeader);

// 		if (token) {
// 			const decoded = verifyToken(token);
// 			request.user = decoded;
// 		}
// 	} catch (error) {
// 		// Token is invalid but we don't reject the request
// 		// User info just won't be available
// 	}
// }
