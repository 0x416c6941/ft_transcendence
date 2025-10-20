import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import { ApiError, getUserById, type UserById, logout as apiLogout, getCurrentUser } from "../api/users.js";

/**
 * ProfileView (cookie-based auth)
 * --------------------------------
 * - Uses cookies for auth (no Authorization header)
 * - Redirects to /login if no id or the session is invalid/expired
 */
export default class ProfileView extends AbstractView {
  constructor(
    router: Router,
    pathParams: Map<string, string>,
    queryParams: URLSearchParams
  ) {
    super(router, pathParams, queryParams);
  }

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Profile`;
  }

  async getHtml(): Promise<string> {
    return `
      <main class="min-h-screen flex items-center justify-center bg-neutral-100 dark:bg-neutral-900">
        <section class="w-full max-w-96 bg-white dark:bg-neutral-800 rounded shadow p-4">
          <h1 class="txt-light-dark-sans text-2xl mb-4">Your profile</h1>

          <div id="profile-content" class="space-y-2">
            <p class="text-neutral-500">Loading…</p>
          </div>

          <p id="profile-error" class="text-red-500 text-sm mt-3" role="alert" aria-live="polite"></p>

          <div class="mt-6 text-center">
            <button id="logout-btn" class="bg-red-500 text-white py-1 px-3 rounded">Logout</button>
          </div>
        </section>
      </main>
    `;
  }

  async setup(): Promise<void> {
    const container = document.getElementById("profile-content");
    const err = document.getElementById("profile-error");
    const logoutBtn = document.getElementById("logout-btn") as HTMLButtonElement | null;
    if (!container || !err || !logoutBtn) return;

    // --- Fetch current user (request() auto-tries /refresh on 401) ---
    try {
      const data: UserById = await getCurrentUser();
      const { username, email, display_name } = data.user;

      container.innerHTML = `
        <dl class="divide-y divide-neutral-200 dark:divide-neutral-700">
          <div class="py-2 grid grid-cols-3 gap-2">
            <dt class="text-neutral-500">Display name</dt>
            <dd class="col-span-2 txt-light-dark-sans">${escapeHtml(display_name ?? "")}</dd>
          </div>
          <div class="py-2 grid grid-cols-3 gap-2">
            <dt class="text-neutral-500">Username</dt>
            <dd class="col-span-2 txt-light-dark-sans">${escapeHtml(username)}</dd>
          </div>
          <div class="py-2 grid grid-cols-3 gap-2">
            <dt class="text-neutral-500">Email</dt>
            <dd class="col-span-2 txt-light-dark-sans">${escapeHtml(email)}</dd>
          </div>
        </dl>
      `;
      err.textContent = "";
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load profile.";
      err.textContent = msg;
      container.innerHTML = `<p class="text-neutral-500">Could not load your profile.</p>`;

      // If unauthenticated even after refresh → send to login
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setTimeout(() => this.router.navigate("/login"), 800);
      }
    }

    // --- Logout (server clears cookies; we clear local userId) ---
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      logoutBtn.textContent = "Logging out…";
      try {
        await apiLogout();
      } catch {
        // Even if the network fails, still clear local state
      } finally {
        this.router.navigate("/login");
      }
    });
  }
}

/** Tiny HTML escaper to avoid accidental injection when rendering text */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
