import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";
import { nkfc } from "../utils/sanitize.js";
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
      <main class="flex-1 min-h-0 flex flex-col justify-center items-center bg-neutral-100 dark:bg-neutral-900">
        <h1 class="txt-light-dark-sans text-3xl mb-6">Login to ${APP_NAME}</h1>
        
        <!-- Normal Login Form -->
        <form id="login-form" class="flex flex-col gap-4 w-64" novalidate>
          <input id="username" type="text" placeholder="Username" class="txt-light-dark-sans p-2 rounded border" />
          <input id="password" type="password" placeholder="Password" class="txt-light-dark-sans p-2 rounded border" />
          <button type="submit" id="auth-button"
            class="bg-sky-500 hover:bg-sky-600 text-white py-2 rounded shadow transition-colors">
            Login
          </button>
        </form>

        <!-- 2FA Form (hidden by default) -->
        <form id="2fa-form" class="hidden flex-col gap-4 w-64" novalidate>
          <p class="txt-light-dark-sans text-center">Enter your 6-digit code from Google Authenticator:</p>
          <input id="2fa-token" type="text" placeholder="000000" maxlength="6" pattern="[0-9]{6}"
            class="txt-light-dark-sans p-2 rounded border text-center text-2xl tracking-widest" />
          <button type="submit" id="2fa-verify-button"
            class="bg-sky-500 hover:bg-sky-600 text-white py-2 rounded shadow transition-colors">
            Verify
          </button>
          <button type="button" id="2fa-cancel-button"
            class="bg-neutral-500 hover:bg-neutral-600 text-white py-2 rounded shadow transition-colors">
            Cancel
          </button>
        </form>

        <p id="error-msg" role="alert" aria-live="polite" class="text-red-500 mt-2" hidden></p>
        <p id="success-msg" role="alert" aria-live="polite" class="text-green-500 mt-2" hidden></p>

        <div class="flex items-center gap-3 w-64 my-4">
          <div class="h-px bg-neutral-300 dark:bg-neutral-700 flex-1"></div>
          <span class="txt-light-dark-sans text-sm">or</span>
          <div class="h-px bg-neutral-300 dark:bg-neutral-700 flex-1"></div>
        </div>

        <a id="oauth-42-btn" href="/api/users/oauth/42"
          class="w-64 text-center bg-black/90 hover:bg-black text-white py-2 rounded shadow transition-colors"
          rel="nofollow"
        >
          Sign in with 42
        </a>

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
    const twoFAForm = document.getElementById("2fa-form") as HTMLFormElement | null;
    const twoFATokenInput = document.getElementById("2fa-token") as HTMLInputElement | null;
    const twoFACancelButton = document.getElementById("2fa-cancel-button") as HTMLButtonElement | null;
    const errorMsg = document.getElementById("error-msg") as HTMLElement | null;
    const successMsg = document.getElementById("success-msg") as HTMLElement | null;

    if (!form || !usernameInput || !passwordInput || !errorMsg || !successMsg) return;
    if (!twoFAForm || !twoFATokenInput || !twoFACancelButton) return;

    let tempToken: string | null = null;

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
        const response = await auth.signIn(nkfc(username), password);
        
        // Check if 2FA is required
        if (response?.requires2FA && response.tempToken) {
          tempToken = response.tempToken;
          // Show 2FA form
          form.classList.add("hidden");
          twoFAForm.classList.remove("hidden");
          twoFAForm.classList.add("flex");
          twoFATokenInput.focus();
          this.showSuccess("Please enter your 2FA code", errorMsg, successMsg);
        } else {
          // Regular login successful
          this.showSuccess(`Welcome, ${nkfc(username)}!`, errorMsg, successMsg);
          setTimeout(() => this.router.navigate("/"), 500);
        }
      } catch (err: any) {
        const msg = err?.message || "Login failed";
        this.showError(msg, errorMsg, successMsg);
      }
    });

    // Setup 2FA form handler
    twoFAForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const token = twoFATokenInput.value.trim();

      if (!token || token.length !== 6) {
        this.showError("Please enter a valid 6-digit code.", errorMsg, successMsg);
        return;
      }

      if (!tempToken) {
        this.showError("Session expired. Please login again.", errorMsg, successMsg);
        twoFAForm.classList.add("hidden");
        form.classList.remove("hidden");
        return;
      }

      try {
        await auth.verify2FA(token, tempToken);
        this.showSuccess("Login successful!", errorMsg, successMsg);
        setTimeout(() => this.router.navigate("/"), 500);
      } catch (err: any) {
        const msg = err?.message || "Verification failed";
        this.showError(msg, errorMsg, successMsg);
      }
    });

    // Setup cancel button
    twoFACancelButton.addEventListener("click", () => {
      tempToken = null;
      twoFATokenInput.value = "";
      twoFAForm.classList.add("hidden");
      twoFAForm.classList.remove("flex");
      form.classList.remove("hidden");
      errorMsg.hidden = true;
      successMsg.hidden = true;
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
