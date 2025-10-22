import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { FastifyReply } from 'fastify';

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
	return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" });
}

/**
 * Generate a refresh token for a user
 */
export function generateRefreshToken(userId: number, username: string): string {
	const payload: JwtPayload = { userId, username };
	return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN, algorithm: "HS256" });
}

/**
 * Verify and decode a JWT token
 * @throws Error if token is invalid or expired
 */
export function verifyToken(token: string): JwtPayload {
	try {
		const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
		return decoded;
	} catch (error) {
		throw new Error('Invalid or expired token');
	}
}

// === cookie helpers ===
// Use Strict unless you intentionally need cross-site; set Secure in prod (https)
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

/**
 * Clear both cookies
 */
export function clearAuthCookies(reply: FastifyReply) {
  	return reply
    		.clearCookie("accessToken", { path: accessCookieOpts.path })
    		.clearCookie("refreshToken", { path: refreshCookieOpts.path });
}

/**
 * Set both cookies
 */
export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  return reply
    .setCookie("accessToken", accessToken, accessCookieOpts)
    .setCookie("refreshToken", refreshToken, refreshCookieOpts);
}
