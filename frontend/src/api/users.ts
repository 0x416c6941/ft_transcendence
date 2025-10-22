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
  created_at?: string;
};

export type CreateUserInput = Omit<User, "id" | "created_at"> & { password: string };
export type UpdateUserInput = Partial<CreateUserInput>;

export class ApiError extends Error {
  constructor(public message: string, public status: number) {
    super(message);
  }
}

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

async function safeApiError(res: Response): Promise<never> {
  const msg = (await safeMsg(res)) || `HTTP ${res.status}`;
  throw new ApiError(msg, res.status);
}

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
 * Centralized fetch:
 *  - sends cookies
 *  - retries once on 401 via /api/users/refresh
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
 * Registers a new user
 * POST /api/users
 */
export async function createUser(payload: CreateUserInput) {
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
export async function login(payload: { username: string; password: string }): Promise<void> {
  return request<void>("/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// export type UserById = {
//   user: {
//     id: number;
//     username: string;
//     email: string;
//     display_name: string;
//     created_at: string;
//   };
// };

/**
 * Optional helpers
 */
export async function logout(): Promise<void> {
  return request<void>("/api/users/logout", { method: "POST" });
}

// For manual refresh (usually not needed because request() handles it)
export async function refresh(): Promise<void> {
  return request<void>("/api/users/refresh", { method: "POST", retryOn401: false });
}

export async function getCurrentUser(): Promise<User> {
  const data = await request<{ user: User }>("/api/users/me", { method: "GET" });
  return data.user;
}

export async function updateUser(payload: UpdateUserInput): Promise<{ message: string }> {
  return request<{ message: string }>("/api/users/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(): Promise<{ message: string }> {
  return request<{ message: string }>("/api/users/me", { method: "DELETE" });
}
