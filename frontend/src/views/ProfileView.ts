import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import {
  ApiError,
  getCurrentUser,
  logout as apiLogout,
  deleteUser as apiDeleteUser,
  updateUser,
} from "../api/users.js";
import { auth } from "../auth.js";

/**
 * ProfileView (cookie-based auth)
 * --------------------------------
 * - Uses HttpOnly cookies for session
 * - Fetches user data from /api/users/me
 * - Allows updating profile (display name, email, password)
 * - Allows logout and account deletion
 * - Redirects to /login if unauthenticated
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

          <form id="profile-form" class="space-y-4">
            <div>
              <label class="block text-sm text-neutral-500" for="display_name">Display name</label>
              <input id="display_name" name="display_name"
                class="w-full border rounded p-2 bg-neutral-50 dark:bg-neutral-700"
                type="text" minlength="1" maxlength="20" required />
            </div>

            <div>
              <label class="block text-sm text-neutral-500" for="email">Email</label>
              <input id="email" name="email"
                class="w-full border rounded p-2 bg-neutral-50 dark:bg-neutral-700"
                type="email" required />
            </div>

            <div>
              <label class="block text-sm text-neutral-500" for="password">New Password (optional)</label>
              <input id="password" name="password"
                class="w-full border rounded p-2 bg-neutral-50 dark:bg-neutral-700"
                type="password" minlength="8" placeholder="Leave blank to keep current" />
            </div>

            <button id="update-btn" type="submit"
              class="w-full bg-sky-500 text-white py-2 rounded shadow">Save changes</button>
          </form>

          <p id="profile-msg" class="text-sm mt-3 text-center"></p>

          <div class="mt-6 text-center space-x-4">
            <button id="logout-btn" class="bg-neutral-700 text-white py-1 px-3 rounded">Logout</button>
            <button id="delete-btn" class="bg-red-500 text-white py-1 px-3 rounded">Delete Account</button>
          </div>
        </section>
      </main>
    `;
  }

  async setup(): Promise<void> {
    await auth.bootstrap();
    if (!auth.isAuthed()) {
      this.router.navigate("/login");
      return;
    }

    const form = document.getElementById("profile-form") as HTMLFormElement | null;
    const msg = document.getElementById("profile-msg");
    const logoutBtn = document.getElementById("logout-btn") as HTMLButtonElement | null;
    const deleteBtn = document.getElementById("delete-btn") as HTMLButtonElement | null;
    const updateBtn = document.getElementById("update-btn") as HTMLButtonElement | null;
    if (!form || !msg || !logoutBtn || !deleteBtn || !updateBtn) return;

    // --- Load user data ---
    try {
      const user = await getCurrentUser();
      const { username, email, display_name } = user;
      (document.getElementById("display_name") as HTMLInputElement).value = display_name ?? "";
      (document.getElementById("email") as HTMLInputElement).value = email;
      msg.textContent = `Logged in as ${username}`;
      msg.className = "text-neutral-500 text-sm text-center mt-2";
    } catch (e) {
      const m = e instanceof Error ? e.message : "Failed to load profile.";
      msg.textContent = m;
      msg.className = "text-red-500 text-sm text-center mt-2";

      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        await auth.signOut();
        setTimeout(() => this.router.navigate("/login"), 800);
      }
      return;
    }

    // --- Update profile ---
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      msg.textContent = "";

      const display_name = (document.getElementById("display_name") as HTMLInputElement).value.trim();
      const email = (document.getElementById("email") as HTMLInputElement).value.trim();
      const password = (document.getElementById("password") as HTMLInputElement).value.trim();

      updateBtn.disabled = true;
      updateBtn.textContent = "Saving…";

      try {
        await updateUser({ display_name, email, ...(password ? { password } : {}) });
        msg.textContent = "Profile updated successfully!";
        msg.className = "text-green-600 text-sm text-center mt-2";
      } catch (err) {
        msg.textContent = err instanceof Error ? err.message : "Update failed.";
        msg.className = "text-red-500 text-sm text-center mt-2";
      } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = "Save changes";
      }
    });

    // --- Logout ---
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      const prev = logoutBtn.textContent;
      logoutBtn.textContent = "Logging out…";
      try {
        await auth.signOut(); // central: calls API and clears state
        this.router.navigate("/login");
      } finally {
        logoutBtn.disabled = false;
        logoutBtn.textContent = prev || "Logout";
      }
    });

    // --- Delete account ---
    deleteBtn.addEventListener("click", async () => {
      const confirmed = window.confirm("Delete your account permanently?");
      if (!confirmed) return;

      deleteBtn.disabled = true;
      const prev = deleteBtn.textContent;
      deleteBtn.textContent = "Deleting…";
      try {
        await apiDeleteUser();
        await auth.signOut();
        msg.textContent = "Account deleted.";
        msg.className = "text-green-600 text-sm text-center mt-2";
        setTimeout(() => this.router.navigate("/register"), 1000);
      } catch (err) {
        msg.textContent = err instanceof Error ? err.message : "Deletion failed.";
        msg.className = "text-red-500 text-sm text-center mt-2";
        deleteBtn.disabled = false;
        deleteBtn.textContent = prev || "Delete Account";
      }
    });
  }
}
