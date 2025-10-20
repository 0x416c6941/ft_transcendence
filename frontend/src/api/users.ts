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
  id: number;
  username: string;
  email: string;
  display_name: string;
  created_at: string;
};

export type LoginResponse = {
  message: string;
  user: Omit<User, 'created_at'> & { created_at?: string };
};



export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function safeApiError(res: Response): Promise<never> {
  try {
    const data = await res.json();
    const msg = (data && (data.error || data.message)) as string | undefined;
    throw new ApiError(msg || `HTTP ${res.status}`, res.status);
  } catch {
    throw new ApiError(`HTTP ${res.status}`, res.status);
  }
}

/**
 * Centralized fetch with:
 *  - credentials: 'include' (so cookies are sent)
 *  - one-shot 401 auto-refresh (POST /api/users/refresh), then retry
 */
async function request<T>(
  input: RequestInfo | URL,
  init: RequestInit & { retryOn401?: boolean } = {}
): Promise<T> {
  // ⬇️ pull out the custom flag so it doesn't get passed to fetch
  const { retryOn401 = true, ...fetchInit } = init;

  const res = await fetch(input, {
    ...fetchInit,
    credentials: "include", // IMPORTANT for cookie auth
  });

  if (res.ok) {
    // Some endpoints may return 204/empty; guard for that
    const isEmpty = res.status === 204 || (res.headers.get("content-length") === "0");
    const ct = res.headers.get("content-type") || "";
    if (!isEmpty && ct.includes("application/json")) {
      return res.json() as Promise<T>;
    }
    // If the caller expects JSON but server returns empty, we coerce to T.
    // You can change the function signature to Promise<T | undefined> instead.
    return undefined as unknown as T;
  }

  // Optional auto-refresh logic
  if (res.status === 401 && retryOn401) {
    const refreshed = await fetch("/api/users/refresh", {
      method: "POST",
      credentials: "include",
    });

    if (refreshed.ok) {
      // ⬇retry ONCE, without retryOn401 (already extracted above)
      const retryRes = await fetch(input, {
        ...fetchInit,
        credentials: "include",
      });

      if (retryRes.ok) {
        const isEmpty = retryRes.status === 204 || (retryRes.headers.get("content-length") === "0");
        const ct = retryRes.headers.get("content-type") || "";
        if (!isEmpty && ct.includes("application/json")) {
          return retryRes.json() as Promise<T>;
        }
        return undefined as unknown as T;
      }
      await safeApiError(retryRes);
    }

    await safeApiError(res); // refresh failed
  }

  await safeApiError(res);
  throw new Error("Unreachable: safeApiError should have thrown");
}


/**
 * Registers a new user
 * POST /api/users
 */
export async function createUser(payload: {
  username: string;
  password: string;
  email: string;
  display_name: string;
}) {
  return request<{ message: string; username: string }>("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Logs in a user
 * POST /api/users/login
 * Server sets HttpOnly cookies; we just read the user payload.
 */
export async function login(payload: {
  username: string;
  password: string;
}): Promise<LoginResponse> {
  return request<LoginResponse>("/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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

/**
 * Reads user by id
 * GET /api/users/:id
 * Cookies are sent automatically; no Authorization header needed.
 * Will auto-refresh once on 401, then retry.
 */
export async function getUserById(id: number): Promise<UserById> {
  return request<UserById>(`/api/users/${id}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

/**
 * Optional helpers
 */
export async function logout(): Promise<{ message: string }> {
  return request<{ message: string }>("/api/users/logout", {
    method: "POST",
  });
}

// If you want explicit manual refresh (usually not needed because request() handles it)
export async function refresh(): Promise<{ message: string }> {
  return request<{ message: string }>("/api/users/refresh", {
    method: "POST",
    // Do not retry refresh recursively
    retryOn401: false,
  });
}
