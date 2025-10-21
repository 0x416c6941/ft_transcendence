import fs from 'node:fs';
import jwt from 'jsonwebtoken';

// JWT secret key - should be loaded from environment variable
const jwtSecretPath = process.env.BACKEND_JWT_KEY_PATH;
if (!jwtSecretPath) {
	throw new Error("process.env.BACKEND_JWT_KEY_PATH isn't a valid path to JWT Secret Key.");
}
const JWT_SECRET = fs.readFileSync(jwtSecretPath);
const JWT_EXPIRES_IN = '24h'; // Token expires in 24 hours
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // Refresh token expires in 7 days

export interface JwtPayload {
	userId: number;
	username: string;
}

/**
 * Generate an access token for a user
 */
export function generateAccessToken(userId: number, username: string): string {
	const payload: JwtPayload = { userId, username };
	return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Generate a refresh token for a user
 */
export function generateRefreshToken(userId: number, username: string): string {
	const payload: JwtPayload = { userId, username };
	return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 * @throws Error if token is invalid or expired
 */
export function verifyToken(token: string): JwtPayload {
	try {
		const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
		return decoded;
	} catch (error) {
		throw new Error('Invalid or expired token');
	}
}

/**
 * Extract token from Authorization header
 * Format: "Bearer <token>"
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}
	return authHeader.substring(7); // Remove "Bearer " prefix
}
