import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";

import {
  validateNickname,
  validateUsername,
  validateEmail,
  validatePassword,
  type FieldResult,
} from "../utils/validators.js";
import { nkfc, emailSan } from "../utils/sanitize.js";
import { createUser } from "../api/users.js";
import { auth } from "../auth.js";

type SubmitHandler = (e: Event) => void;
type InputHandler = (e: Event) => void;
type FieldName = "nickname" | "username" | "email" | "password";

const VALIDATORS: Record<FieldName, (v: string) => FieldResult> = {
  nickname: validateNickname,
  username: validateUsername,
  email: validateEmail,
  password: validatePassword,
};

export default class RegisterView extends AbstractView {
  private formEl: HTMLFormElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private onSubmit?: SubmitHandler;
  private onInput?: InputHandler;

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Register`;
  }

  async getHtml(): Promise<string> {
    return `
      <main
        class="flex-1 min-h-0 flex flex-col justify-center items-center bg-neutral-200 dark:bg-neutral-900"
      >
        <section
          class="w-full max-w-96 bg-neutral-100 dark:bg-neutral-800 rounded shadow p-2"
        >
          <h1 class="header1 w-full mb-4 text-center">Create your account</h1>

          <form id="register-form" novalidate>
            <!-- Display name -->
            <div class="mb-4">
              <label class="txt-light-dark-sans" for="nickname"
                >Display name</label
              >
              <input
                class="w-full border rounded p-2"
                type="text"
                id="nickname"
                name="nickname"
                inputmode="text"
                autocomplete="nickname"
                minlength="1"
                maxlength="20"
                pattern="^[a-zA-Z0-9_]{1,20}$"
                required
                aria-describedby="nickname-help nickname-error"
              />
              <p id="nickname-help" class="text-neutral-500 text-sm mt-2">
                1–20 chars, letters, numbers, underscores only.
              </p>
              <p
                id="nickname-error"
                class="text-red-500 text-sm mt-2"
                role="alert"
                aria-live="polite"
              ></p>
            </div>

            <!-- Username -->
            <div class="mb-4">
              <label class="txt-light-dark-sans" for="username">Username</label>
              <input
                class="w-full border rounded p-2"
                type="text"
                id="username"
                name="username"
                inputmode="text"
                autocomplete="username"
                minlength="3"
                maxlength="20"
                pattern="^[a-zA-Z0-9_]{3,20}$"
                required
                aria-describedby="username-help username-error"
              />
              <p id="username-help" class="text-neutral-500 text-sm mt-2">
                3–20 chars, letters, numbers, underscores only.
              </p>
              <p
                id="username-error"
                class="text-red-500 text-sm mt-2"
                role="alert"
                aria-live="polite"
              ></p>
            </div>

            <!-- Email -->
            <div class="mb-4">
              <label class="txt-light-dark-sans" for="email">Email</label>
              <input
                class="w-full border rounded p-2"
                type="email"
                id="email"
                name="email"
                inputmode="email"
                autocomplete="email"
                required
                aria-describedby="email-error"
              />
              <p
                id="email-error"
                class="text-red-500 text-sm mt-2"
                role="alert"
                aria-live="polite"
              ></p>
            </div>

            <!-- Password -->
            <div class="mb-4">
              <label class="txt-light-dark-sans" for="password">Password</label>
              <input
                class="w-full border rounded p-2"
                type="password"
                id="password"
                name="password"
                autocomplete="new-password"
                minlength="8"
                required
                aria-describedby="password-help password-error"
              />
              <p id="password-help" class="text-neutral-500 text-sm mt-2">
                At least 8 characters, incl. upper, lower, and a number.
              </p>
              <p
                id="password-error"
                class="text-red-500 text-sm mt-2"
                role="alert"
                aria-live="polite"
              ></p>
            </div>

            <!-- 2FA Checkbox -->
            <div class="mb-4">
              <label class="flex items-center txt-light-dark-sans">
                <input
                  type="checkbox"
                  id="use-2fa"
                  name="use_2fa"
                  class="mr-2"
                />
                Enable Two-Factor Authentication (2FA)
              </label>
              <p class="text-neutral-500 text-sm mt-2">
                Requires Google Authenticator app for login
              </p>
            </div>

            <button
              id="register-submit"
              type="submit"
              class="w-full button button-login py-2 px-4 rounded shadow"
            >
              Create account
            </button>

            <p
              id="form-error"
              class="text-red-500 text-sm mt-2"
              role="alert"
              aria-live="polite"
            ></p>
            <p
              id="form-success"
              class="text-green-600 text-sm mt-2"
              role="status"
              aria-live="polite"
            ></p>
          </form>
        </section>

        <!-- 2FA Setup Modal -->
        <div id="twofa-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 class="text-2xl font-bold mb-4 txt-light-dark-sans">Set Up Two-Factor Authentication</h2>
            <p class="mb-4 txt-light-dark-sans">Scan this QR code with Google Authenticator:</p>
            <div class="flex justify-center mb-4">
              <img id="qr-code-image" src="" alt="QR Code" class="max-w-full" />
            </div>
            <p class="mb-2 txt-light-dark-sans text-sm">Or enter this secret manually:</p>
            <div class="bg-neutral-100 dark:bg-neutral-700 p-2 rounded mb-4">
              <code id="secret-text" class="txt-light-dark-sans text-sm break-all"></code>
            </div>
            <button id="2fa-continue-btn" class="w-full button button-login py-2 px-4 rounded shadow">
              Continue to Login
            </button>
          </div>
        </div>
      </main>
    `;
  }

  async setup(): Promise<void> {
    await auth.bootstrap();
    if (auth.isAuthed()){
      this.router.navigate("/");
      return;
    }
    this.formEl = document.getElementById("register-form") as HTMLFormElement | null;
    this.submitBtn = document.getElementById("register-submit") as HTMLButtonElement | null;
    if (!this.formEl) return;

    // live validation
    this.onInput = (e: Event) => {
      const target = e.target as HTMLInputElement | null;
      if (!target || !target.name) return;
      // Only validate fields that have validators (skip use_2fa checkbox)
      if (target.name in VALIDATORS) {
        this.validateField(target.name as FieldName);
      }
    };
    this.formEl.addEventListener("input", this.onInput);
    this.formEl.addEventListener("blur", this.onInput, true);

    // submit
    this.onSubmit = async (e: Event) => {
      e.preventDefault();
      if (!this.formEl || !this.submitBtn) return;

      const nickname = this.getValue("nickname");
      const username = this.getValue("username");
      const email = this.getValue("email");
      const password = this.getValue("password");

      const nk = validateNickname(nickname);
      const un = validateUsername(username);
      const em = validateEmail(email);
      const pw = validatePassword(password);

      this.applyFieldResult("nickname", nk);
      this.applyFieldResult("username", un);
      this.applyFieldResult("email", em);
      this.applyFieldResult("password", pw);

      if (!(nk.status && un.status && em.status && pw.status)) return;

      const use2FACheckbox = document.getElementById("use-2fa") as HTMLInputElement;
      const use2FA = use2FACheckbox?.checked || false;

      const payload = {
        username: nkfc(username),
        password,
        email: emailSan(email),
        display_name: nkfc(nickname),
        use_2fa: use2FA
      };

      this.setFormBusy(true);
      this.clearFormMessages();

      try {
        const response = await createUser(payload);
        
        // Check if 2FA was enabled
        if (use2FA && (response as any).requires2FA) {
          // Fetch QR code
          await this.show2FASetup(username);
          // Keep form busy while modal is shown
          return;
        } else {
          this.setFormSuccess("Account created! Redirecting…");
          setTimeout(() => this.router.navigate("/login"), 1200);
        }
      } catch (err) {
        // Friendlier message for common conflict case
        const raw =
          err instanceof Error ? err.message : "Registration failed. Please try again.";
        const msg =
          /409|exists|UNIQUE/i.test(raw)
            ? "That username, display name or email is already taken."
            : raw;
        this.setFormError(msg);
      } finally {
        this.setFormBusy(false);
      }
    };

    this.formEl.addEventListener("submit", this.onSubmit);
  }

  cleanup(): void {
    if (this.formEl && this.onSubmit) this.formEl.removeEventListener("submit", this.onSubmit);
    if (this.formEl && this.onInput) {
      this.formEl.removeEventListener("input", this.onInput);
      this.formEl.removeEventListener("blur", this.onInput, true);
    }
    this.formEl = null;
    this.submitBtn = null;
    this.onSubmit = undefined;
    this.onInput = undefined;
  }

  // --------- helpers ---------
  private getInput(name: FieldName): HTMLInputElement | null {
    return ((this.formEl?.elements.namedItem(name) as HTMLInputElement) || null);
  }
  private getValue(name: FieldName): string {
    return this.getInput(name)?.value ?? "";
  }
  private setError(name: FieldName, message: string): void {
    const input = this.getInput(name);
    const el = document.getElementById(`${name}-error`);
    if (input) input.setAttribute("aria-invalid", "true");
    if (el) el.textContent = message;
  }
  private clearError(name: FieldName): void {
    const input = this.getInput(name);
    const el = document.getElementById(`${name}-error`);
    if (input) input.removeAttribute("aria-invalid");
    if (el) el.textContent = "";
  }
  private applyFieldResult(name: FieldName, result: FieldResult): void {
    result.status ? this.clearError(name) : this.setError(name, result.err_msg);
  }
  private validateField(name: FieldName): void {
    const res = VALIDATORS[name](this.getValue(name));
    this.applyFieldResult(name, res);
  }
  private clearFormMessages(): void {
    ["form-error", "form-success"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "";
    });
  }
  private setFormError(message: string): void {
    const el = document.getElementById("form-error");
    if (el) el.textContent = message;
  }
  private setFormSuccess(message: string): void {
    const el = document.getElementById("form-success");
    if (el) el.textContent = message;
  }
  private setFormBusy(busy: boolean): void {
    if (!this.submitBtn) return;
    this.submitBtn.disabled = busy;
    this.submitBtn.textContent = busy ? "Creating account…" : "Create account";
  }

  private async show2FASetup(username: string): Promise<void> {
    try {
      const response = await fetch(`https://localhost/api/users/2fa/setup?username=${encodeURIComponent(username)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch 2FA setup');
      }

      const data = await response.json();
      
      const modal = document.getElementById("twofa-modal");
      const qrImage = document.getElementById("qr-code-image") as HTMLImageElement;
      const secretText = document.getElementById("secret-text");
      const continueBtn = document.getElementById("2fa-continue-btn");

      if (!modal || !qrImage || !secretText || !continueBtn) {
        throw new Error('2FA modal elements not found');
      }

      qrImage.src = data.qrCode;
      secretText.textContent = data.secret;
      modal.classList.remove("hidden");

      continueBtn.addEventListener("click", () => {
        this.router.navigate("/login");
      });
    } catch (err) {
      this.setFormError("Failed to setup 2FA. Please contact support.");
      this.setFormBusy(false);
    }
  }
}
