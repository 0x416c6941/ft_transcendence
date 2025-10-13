/**
 * api/users.ts
 * -------------
 * Handles user-related API operations for the frontend.
 *
 * Responsibilities:
 * - Defines lightweight API helpers for registration and login
 * - Converts non-OK HTTP responses into structured `ApiError`s
 * - Centralizes `fetch` logic (headers, credentials, error parsing)
 *
 * Security:
 * - All requests use `credentials: "same-origin"` to include cookies if needed
 * - Passwords are sent over HTTPS (never hashed client-side)
 *
 * Usage:
 *   import { createUser, login } from "../api/users.js";
 *
 *   // Register
 *   await createUser({ username, password, email, display_name });
 *
 *   // Login
 *   const data = await login({ username, password });
 *   console.log(data.accessToken, data.user);
 */

/**
 * Custom error type for API responses.
 * Includes both message and HTTP status for consistent error handling.
 */
export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

/**
 * Attempts to extract and throw a safe, descriptive error
 * from a failed `fetch` response. Falls back to generic status text.
 */
async function safeApiError(res: Response): Promise<never> {
	try {
		const data = await res.json();
		const msg = (data && (data.error || data.message)) as
			| string
			| undefined;
		throw new ApiError(msg || `HTTP ${res.status}`, res.status);
	} catch {
		throw new ApiError(`HTTP ${res.status}`, res.status);
	}
}

/**
 * Registers a new user account.
 * Sends POST /api/users with username, password, email, and display_name.
 * Throws `ApiError` if the request fails.
 */
export async function createUser(payload: {
	username: string;
	password: string;
	email: string;
	display_name: string;
}) {
	const res = await fetch("/api/users", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify(payload),
	});
	if (!res.ok) await safeApiError(res);
	return res.json();
}

/**
 * Expected structure of a successful login response.
 */
export type LoginResponse = {
	message: string;
	accessToken: string;
	refreshToken: string;
	user: {
		id: number;
		username: string;
		email: string;
		display_name: string;
		created_at: string;
	};
};

/**
 * Authenticates a user.
 * Sends POST /api/users/login with username + password.
 * Returns the parsed response (tokens and user info) or throws an Error on failure.
 */
export async function login(payload: {
	username: string;
	password: string;
}): Promise<LoginResponse> {
	const res = await fetch("/api/users/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		// surface server error message if present
		try {
			const data = await res.json();
			const msg = (data && (data.error || data.message)) as
				| string
				| undefined;
			throw new Error(msg || `HTTP ${res.status}`);
		} catch {
			throw new Error(`HTTP ${res.status}`);
		}
	}
	return res.json();
}

export type UserById = {
	user: {
		id: number;
		username: string;
		email: string;
		display_name: string;
		created_at: string;
	};
};

export async function getUserById(id: number): Promise<UserById> {
	const headers: HeadersInit = { Accept: "application/json" };

	// include auth if you’re using JWT in the Authorization header
	try {
		const token = localStorage.getItem("accessToken");
		if (token) (headers as any).Authorization = `Bearer ${token}`;
	} catch {
		/* ignore storage errors */
	}

	const res = await fetch(`/api/users/${id}`, {
		method: "GET",
		headers,
		credentials: "same-origin",
	});

	if (!res.ok) {
		// surface server error if present
		try {
			const data = await res.json();
			throw new Error(
				(data && (data.error || data.message)) ||
					`HTTP ${res.status}`
			);
		} catch {
			throw new Error(`HTTP ${res.status}`);
		}
	}
	return res.json();
}
