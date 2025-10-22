// src/state/auth.ts
import { getCurrentUser, login, logout, type User } from "./api/users.js";

type AuthStatus = "unknown" | "authenticated" | "unauthenticated";
type AuthState = { status: AuthStatus; user?: User };

let state: AuthState = { status: "unknown" };
const listeners = new Set<(s: AuthState) => void>();
const notify = () => listeners.forEach(fn => fn({ ...state }));

// Serialize bootstraps so simultaneous callers share one network hit
let booting: Promise<void> | null = null;

// Cheap shallow equality check for user objects
function shallowEqualUser(a?: User, b?: User) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.username === b.username;
}

function setState(next: AuthState) {
  const changed = next.status !== state.status || !shallowEqualUser(next.user, state.user);
  if (!changed) return;
  state = next;
  notify();
}

function setAuthenticated(user: User) {
  setState({ status: "authenticated", user });
}

function setUnauthenticated() {
  setState({ status: "unauthenticated", user: undefined });
}

export const auth = {
  subscribe(fn: (s: AuthState) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  get(): AuthState {
    return { ...state };
  },

  isAuthed(): boolean {
    return state.status === "authenticated";
  },

  // By default runs once; pass force=true to refresh even after first run.
  async bootstrap(force = false) {
    if (!force && state.status !== "unknown") return;

    // Share a single in-flight bootstrap
    if (!booting) {
      booting = (async () => {
        try {
          const user = await getCurrentUser(); // GET /api/users/me (cookies sent)
          setAuthenticated(user);
        } catch {
          setUnauthenticated();
        } finally {
          booting = null;
        }
      })();
    }
    await booting;
  },

  async signIn(username: string, password: string) {
    await login({ username, password }); // throws on failure
    // Force refresh of user state even if bootstrap ran before
    await this.bootstrap(true);
  },

  async signOut() {
    try {
      await logout(); // POST /api/users/logout (server revokes session/refresh)
    } finally {
      setUnauthenticated();
    }
  },
};
