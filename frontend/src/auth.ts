// src/state/auth.ts
import { getCurrentUser, login, logout, type UserById } from "./api/users.js";

type AuthStatus = "unknown" | "authenticated" | "unauthenticated";
type AuthState = { status: AuthStatus; user?: UserById["user"] };

const state: AuthState = { status: "unknown" };
const listeners = new Set<(s: AuthState) => void>();
const notify = () => listeners.forEach(fn => fn({ ...state }));

function setAuthenticated(user: UserById["user"]) {
  state.status = "authenticated";
  state.user = user;
  notify();
}
function setUnauthenticated() {
  state.status = "unauthenticated";
  state.user = undefined;
  notify();
}

export const auth = {
  subscribe(fn: (s: AuthState) => void) { listeners.add(fn); return () => listeners.delete(fn); },
  get(): AuthState { return { ...state }; },
  isAuthed(): boolean { return state.status === "authenticated"; },

  async bootstrap() {
    if (state.status !== "unknown") return; // run once
    try {
      const data = await getCurrentUser(); // GET /api/users/me (cookies sent)
      setAuthenticated(data.user);
    } catch {
      setUnauthenticated();
    }
  },

  async signIn(username: string, password: string) {
    await login({ username, password });
    await this.bootstrap();
  },

  async signOut() {
    try { await logout(); } finally { setUnauthenticated(); }
  },
};
