import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import { nkfc } from "../utils/sanitize.js";
import { login } from "../api/users.js";
import { auth } from "../auth.js";

export default class LoginView extends AbstractView {
  constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
    super(router, pathParams, queryParams);
  }

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Login`;
  }

  async getHtml(): Promise<string> {
    return `
      <main class="h-screen flex flex-col justify-center items-center bg-neutral-100 dark:bg-neutral-900">
        <h1 class="txt-light-dark-sans text-3xl mb-6">Login to ${APP_NAME}</h1>
        <form id="login-form" class="flex flex-col gap-4 w-64" novalidate>
          <input id="username" type="text" placeholder="Username" class="txt-light-dark-sans p-2 rounded border" />
          <input id="password" type="password" placeholder="Password" class="txt-light-dark-sans p-2 rounded border" />
          <button type="submit" id="auth-button"
            class="bg-sky-500 hover:bg-sky-600 text-white py-2 rounded shadow transition-colors">
            Login
          </button>
        </form>
        <p id="error-msg" role="alert" aria-live="polite" class="text-red-500 mt-2" hidden></p>
        <p id="success-msg" role="alert" aria-live="polite" class="text-green-500 mt-2" hidden></p>
        <div class="mt-6">
          <a href="/" data-link class="txt-light-dark-sans underline">Back to Home</a>
        </div>
      </main>
    `;
  }

  async setup(): Promise<void> {
    // hydrate auth; if already logged in navigate away
    await auth.bootstrap();
    if (auth.isAuthed()) {
      this.router.navigate("/");
      return;
    }

    const form = document.getElementById("login-form") as HTMLFormElement | null;
    const usernameInput = document.getElementById("username") as HTMLInputElement | null;
    const passwordInput = document.getElementById("password") as HTMLInputElement | null;
    const errorMsg = document.getElementById("error-msg") as HTMLElement | null;
    const successMsg = document.getElementById("success-msg") as HTMLElement | null;

    if (!form || !usernameInput || !passwordInput || !errorMsg || !successMsg) return;

    // Setup login form handler
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!username || !password) {
        this.showError("Please enter both username and password.", errorMsg, successMsg);
        return;
      }

      try {
        await auth.signIn(nkfc(username), password);
        this.showSuccess(`Welcome, ${nkfc(username)}!`, errorMsg, successMsg);
        setTimeout(() => this.router.navigate("/"), 500);
      } catch (err: any) {
        const msg = err?.message || "Login failed";
        this.showError(msg, errorMsg, successMsg);
      }
    });
  }

  private showError(message: string, errorMsg: HTMLElement, successMsg: HTMLElement): void {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
    successMsg.hidden = true;
  }

  private showSuccess(message: string, errorMsg: HTMLElement, successMsg: HTMLElement): void {
    successMsg.textContent = message;
    successMsg.hidden = false;
    errorMsg.hidden = true;
  }
}
