/**
 * api/users.ts (cookie-based auth version)
 * ----------------------------------------
 * - Uses HttpOnly cookies set by the backend (no localStorage)
 * - Sends requests with credentials so cookies are included
 * - Exposes a tiny fetch wrapper that retries once on 401 via /api/users/refresh
 */


/**
 * Types
 */
export type User = {
  	id: 		number;
  	username: 	string;
  	email: 		string;
  	display_name: 	string;
  	created_at?: 	string;
};

export type CreateUserInput = Omit<User, "id" | "created_at"> & { password: string };
export type UpdateUserInput = Partial<CreateUserInput>;

/**
 * @class       ApiError
 * @brief       Error with HTTP status.
 * @property    status HTTP status code (0 for network errors)
 */
export class ApiError extends Error {
  	constructor(public message: string, public status: number) {
    		super(message);
  	}
}

/**
 * @brief       Extracts a safe error/message string from a Response.
 * @param res   Fetch response
 * @returns     Message if found, otherwise undefined
 */
async function safeMsg(res: Response): Promise<string | undefined> {
  	try {
    		const data = await res.clone().json();
    		return (data && (data.error || data.message)) as string | undefined;
  	} catch {}
  	try {
    		const txt = await res.clone().text();
    		return txt?.trim() || undefined;
  	} catch {}
  	return undefined;
}

/**
 * @brief       Throws ApiError built from a Response.
 * @param res   Fetch response
 * @throws      ApiError
 */
async function safeApiError(res: Response): Promise<never> {
  const msg = (await safeMsg(res)) || `HTTP ${res.status}`;
  throw new ApiError(msg, res.status);
}

/**
 * @brief       Parses JSON only when present.
 * @tparam      T Parsed JSON shape
 * @param res   Fetch response
 * @returns     Parsed JSON or undefined cast to T for empty bodies
 */
async function parseJsonIfAny<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  const empty =
    res.status === 204 ||
    res.headers.get("content-length") === "0" ||
    !ct.includes("application/json");
  if (empty) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

/**
 * @brief               Centralized fetch with cookies and single 401 refresh retry.
 * @tparam              T Expected response type
 * @param input         Request URL or Request
 * @param init          Request init; set retryOn401=false to disable auto-refresh
 * @returns             Parsed JSON (or undefined for empty)
 * @throws              ApiError on HTTP errors or network failures
 */
async function request<T>(
        input: RequestInfo | URL,
        init: RequestInit & { retryOn401?: boolean } = {}
): Promise<T> {
        const { retryOn401 = true, ...fetchInit } = init;

        let res: Response;
        try {
                res = await fetch(input, {
                ...fetchInit,
                headers: { Accept: "application/json", ...(fetchInit.headers || {}) },
                credentials: "include",
        });
        } catch {
                throw new ApiError("Network error", 0);
        }

        if (res.ok) return parseJsonIfAny<T>(res);

        if (res.status === 401 && retryOn401) {
                try {
                        const refreshed = await fetch("/api/users/refresh", {
                        method: "POST",
                        credentials: "include",
                        headers: { Accept: "application/json" },
                });

                if (refreshed.ok) {
                        const retryRes = await fetch(input, {
                        ...fetchInit,
                        headers: { Accept: "application/json", ...(fetchInit.headers || {}) },
                        credentials: "include",
                        });

                        if (retryRes.ok) return parseJsonIfAny<T>(retryRes);
                        await safeApiError(retryRes);
                }

                await safeApiError(refreshed);
                } catch {
                        throw new ApiError("Network error during refresh", 0);
                }
        }

        await safeApiError(res);
        throw new Error("Unreachable");
}


/**
 * @brief Registers a new user.
 * @route POST /api/users
 * @param payload New user data
 * @returns { message, username }
 */
export async function createUser(payload: CreateUserInput) {
        return request<{ message: string; username: string }>("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
        });
}

/**
 * @brief Logs in a user (server sets HttpOnly cookies).
 * @route POST /api/users/login
 * @param payload { username, password }
 * @returns void
 */
export async function login(payload: { username: string; password: string }): Promise<void> {
        return request<void>("/api/users/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
        });
}


/**
 * @brief Logs out current user.
 * @route POST /api/users/logout
 * @returns void
 */
export async function logout(): Promise<void> {
        return request<void>("/api/users/logout", { method: "POST" });
}

/**
 * @brief Manually refreshes session (normally auto via request()).
 * @route POST /api/users/refresh
 * @returns void
 */
export async function refresh(): Promise<void> {
        return request<void>("/api/users/refresh", { method: "POST", retryOn401: false });
}

/**
 * @brief Gets the currently authenticated user.
 * @route GET /api/users/me
 * @returns User object
 */
export async function getCurrentUser(): Promise<User> {
        const data = await request<{ user: User }>("/api/users/me", { method: "GET" });
        return data.user;
}

/**
 * @brief Updates current user.
 * @route PUT /api/users/me
 * @param payload Partial user fields to update
 * @returns { message }
 */
export async function updateUser(payload: UpdateUserInput): Promise<{ message: string }> {
        return request<{ message: string }>("/api/users/me", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
  });
}

/**
 * @brief Deletes current user account.
 * @route DELETE /api/users/me
 * @returns { message }
 */
export async function deleteUser(): Promise<{ message: string }> {
        return request<{ message: string }>("/api/users/me", { method: "DELETE" });
}

/**
 * @brief Fetches a user by ID.
 * @route GET /api/users/:id
 * @param id Numeric user ID
 * @returns User object
 */
export async function getUserById(id: number): Promise<User> {
        const data = await request<{ user: User }>(`/api/users/${id}`, { method: "GET" });
        return data.user;
}

/**
 * @brief               Centralized fetch for binary responses with cookies and single 401 refresh retry.
 * @param input         Request URL or Request
 * @param init          Request init; set retryOn401=false to disable auto-refresh
 * @returns             Blob
 * @throws              ApiError on HTTP errors or network failures
 */
async function requestBlob(
        input: RequestInfo | URL,
        init: RequestInit & { retryOn401?: boolean } = {}
): Promise<Blob> {
        const { retryOn401 = true, ...fetchInit } = init;

        let res: Response;
        try {
                res = await fetch(input, {
                ...fetchInit,
                headers: { Accept: "image/*", ...(fetchInit.headers || {}) },
                credentials: "include",
        });
        } catch {
                throw new ApiError("Network error", 0);
        }

        if (res.ok) return res.blob();

        if (res.status === 401 && retryOn401) {
                try {
                        const refreshed = await fetch("/api/users/refresh", {
                        method: "POST",
                        credentials: "include",
                        headers: { Accept: "application/json" },
                });

                if (refreshed.ok) {
                        const retryRes = await fetch(input, {
                        ...fetchInit,
                        headers: { Accept: "image/*", ...(fetchInit.headers || {}) },
                        credentials: "include",
                        });

                        if (retryRes.ok) return retryRes.blob();
                        await safeApiError(retryRes);
                }

                await safeApiError(refreshed);
                } catch {
                        throw new ApiError("Network error during refresh", 0);
                }
        }

        await safeApiError(res);
        throw new Error("Unreachable");
}


/**
 * @brief       Fetches a user's avatar (binary image).
 * @route       GET /api/users/:id/avatar
 * @param id    Numeric user ID
 * @returns     Blob (e.g., image/webp)
 */
export async function getUserAvatar(id: number): Promise<Blob> {
        return requestBlob(`/api/users/${id}/avatar`, { method: "GET" });
}

/**
 * @brief       Fetches a user's avatar and returns an object URL for <img src>.
 * @route       GET /api/users/:id/avatar
 * @param id    Numeric user ID
 * @returns     string object URL (remember to URL.revokeObjectURL when done)
 */
export async function getUserAvatarURL(id: number): Promise<string> {
        const blob = await getUserAvatar(id);
        return URL.createObjectURL(blob);
}
