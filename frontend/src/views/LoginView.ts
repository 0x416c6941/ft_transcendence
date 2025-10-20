import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import { nkfc } from "../utils/sanitize.js";
import { login } from "../api/users.js";

export default class LoginView extends AbstractView {
  private formEl: HTMLFormElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private onSubmit?: (e: Event) => void;

  constructor(
    router: Router,
    pathParams: Map<string, string>,
    queryParams: URLSearchParams
  ) {
    super(router, pathParams, queryParams);
  }

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Login`;
  }

  async getHtml(): Promise<string> {
    return `
      <main class="h-screen flex flex-col justify-center items-center bg-neutral-100 dark:bg-neutral-900">
        <h1 class="txt-light-dark-sans text-3xl mb-6">Login to ${APP_NAME}</h1>

        <form id="login-form" class="flex flex-col gap-4 w-64">
          <div>
            <input
              id="username"
              name="username"
              type="text"
              placeholder="Username"
              autocomplete="username"
              spellcheck="false"
              autocapitalize="none"
              required
              class="txt-light-dark-sans w-full p-2 rounded border"
              aria-describedby="username-error"
            />
            <p id="username-error" class="text-red-500 text-sm mt-1" role="alert" aria-live="polite"></p>
          </div>

          <div>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Password"
              autocomplete="current-password"
              spellcheck="false"
              autocapitalize="none"
              required
              class="txt-light-dark-sans w-full p-2 rounded border"
              aria-describedby="password-error"
            />
            <p id="password-error" class="text-red-500 text-sm mt-1" role="alert" aria-live="polite"></p>
          </div>

          <button id="login-submit" type="submit" class="bg-sky-500 text-white py-2 rounded shadow">
            Login
          </button>

          <p id="form-error" class="text-red-500 text-sm mt-2" role="alert" aria-live="polite"></p>
          <p id="form-success" class="text-green-600 text-sm mt-2" role="status" aria-live="polite"></p>
        </form>

        <div class="mt-6">
          <a href="/" data-link class="txt-light-dark-sans underline">Back to Home</a>
        </div>
      </main>
    `;
  }

  setup(): void {
    this.formEl = document.getElementById("login-form") as HTMLFormElement | null;
    this.submitBtn = document.getElementById("login-submit") as HTMLButtonElement | null;
    if (!this.formEl || !this.submitBtn) return;

    this.onSubmit = async (e: Event) => {
      e.preventDefault();
      if (!this.formEl || !this.submitBtn) return;

      const username = nkfc(
        (this.formEl.elements.namedItem("username") as HTMLInputElement)?.value.trim() ?? ""
      );
      const password = nkfc(
        (this.formEl.elements.namedItem("password") as HTMLInputElement)?.value.trim() ?? ""
      );

      // clear messages
      this.setText("form-error", "");
      this.setText("form-success", "");
      this.setText("username-error", "");
      this.setText("password-error", "");
      document.getElementById("username")?.removeAttribute("aria-invalid");
      document.getElementById("password")?.removeAttribute("aria-invalid");

      // basic presence and length checks
      if (!username) {
        this.setFieldError("username", "Username is required.");
        return;
      }
      if (!password) {
        this.setFieldError("password", "Password is required.");
        return;
      }
      if (username.length > 128) {
        this.setFieldError("username", "Username too long.");
        return;
      }
      if (password.length > 1024) {
        this.setFieldError("password", "Password too long.");
        return;
      }

      this.setBusy(true);

      try {
        // Server will set HttpOnly cookies; response contains user info
        const data = await login({ username, password });

        this.setText("form-success", "Login successful! Redirecting…");
        setTimeout(() => this.router.navigate("/profile"), 800);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid username or password.";
        this.setText("form-error", msg);
      } finally {
        this.setBusy(false);
      }
    };

    this.formEl.addEventListener("submit", this.onSubmit);
  }

  cleanup(): void {
    if (this.formEl && this.onSubmit) {
      this.formEl.removeEventListener("submit", this.onSubmit);
    }
    this.formEl = null;
    this.submitBtn = null;
    this.onSubmit = undefined;
  }

  // ---------- helpers ----------
  private setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  private setFieldError(name: "username" | "password", message: string): void {
    const input = document.getElementById(name) as HTMLInputElement | null;
    const el = document.getElementById(`${name}-error`);
    if (input) input.setAttribute("aria-invalid", "true");
    if (el) el.textContent = message;
  }

  private setBusy(busy: boolean): void {
    if (!this.submitBtn) return;
    this.submitBtn.disabled = busy;
    this.submitBtn.textContent = busy ? "Logging in…" : "Login";
  }
}
