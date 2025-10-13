import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";

import {
  validateUsername,
  validateEmail,
  validatePassword,
  validateNickname,
  type FieldResult,
} from "../utils/validators.js";

type SubmitHandler = (e: Event) => void;
type InputHandler = (e: Event) => void;
type FieldName = "username" | "email" | "password" | "nickname";

export default class RegisterView extends AbstractView {
  private formEl: HTMLFormElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private onSubmit?: SubmitHandler;
  private onInput?: InputHandler;

  constructor(
    router: Router,
    pathParams: Map<string, string>,
    queryParams: URLSearchParams
  ) {
    super(router, pathParams, queryParams);
  }

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Register`;
  }

  async getHtml(): Promise<string> {
    return `
      <main class="flex-1 flex flex-col items-center justify-center bg-neutral-200 dark:bg-neutral-900">
        <section class="w-full max-w-64 bg-neutral-100 rounded shadow p-2">
          <h1 class="txt-light-dark-sans text-3xl mb-4 text-center">Create your account</h1>

          <form id="register-form" novalidate>
            <!-- Nickname -->
            <div class="mb-4">
              <label class="txt-light-dark-sans" for="nickname">Nickname</label>
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
              />
              <p id="nickname-help" class="text-neutral-500 text-sm mt-2">
                1–20 chars, letters, numbers, underscores only.
              </p>
              <p id="nickname-error" class="text-red-500 text-sm mt-2" role="alert" aria-live="polite"></p>
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
              <p id="username-error" class="text-red-500 text-sm mt-2" role="alert" aria-live="polite"></p>
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
              <p id="email-error" class="text-red-500 text-sm mt-2" role="alert" aria-live="polite"></p>
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
              <p id="password-error" class="text-red-500 text-sm mt-2" role="alert" aria-live="polite"></p>
            </div>

            <!-- Submit -->
            <button
              id="register-submit"
              type="submit"
              class="w-full bg-sky-500 text-white py-2 px-4 rounded shadow"
            >
              Create account
            </button>

            <p id="form-error" class="text-red-500 text-sm mt-2" role="alert" aria-live="polite"></p>
            <p id="form-success" class="text-green-600 text-sm mt-2" role="status" aria-live="polite"></p>
          </form>
        </section>
      </main>
    `;
  }

  setup(): void {
    this.formEl = document.getElementById(
      "register-form"
    ) as HTMLFormElement | null;
    this.submitBtn = document.getElementById(
      "register-submit"
    ) as HTMLButtonElement | null;

    // Live field validation
    this.onInput = (e: Event) => {
      const target = e.target as HTMLInputElement | null;
      if (!target || !target.name) return;
      this.validateField(target.name as FieldName);
    };

    if (this.formEl) {
      this.formEl.addEventListener("input", this.onInput);
      this.formEl.addEventListener("blur", this.onInput, true);
    }

    // Form submission
    this.onSubmit = async (e: Event) => {
      e.preventDefault();
      if (!this.formEl || !this.submitBtn) return;

      // Grab raw values
      const nickname = this.getValue("nickname");
      const username = this.getValue("username");
      const email = this.getValue("email");
      const password = this.getValue("password");

      // Run validators
      const nk = validateNickname(nickname);
      const un = validateUsername(username);
      const em = validateEmail(email);
      const pw = validatePassword(password);

      // Paint results
      this.applyFieldResult("nickname", nk);
      this.applyFieldResult("username", un);
      this.applyFieldResult("email", em);
      this.applyFieldResult("password", pw);

      const allOk = nk.status && un.status && em.status && pw.status;
      if (!allOk) return;

      // Sanitize payload
      const payload = {
        username: (username ?? "").trim().normalize("NFKC"),
        password,
        email: (email ?? "").trim().toLowerCase(),
        display_name: (nickname ?? "").trim().normalize("NFKC"),
      };

      this.setFormBusy(true);
      this.clearFormMessages();

      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = await this.safeErrorMessage(res);
          this.setFormError(msg || "Registration failed. Please try again.");
          return;
        }

        this.setFormSuccess("Account created! Redirecting…");
        setTimeout(() => this.router.navigate("/login"), 600);
      } catch {
        this.setFormError("Network error. Please try again.");
      } finally {
        this.setFormBusy(false);
      }
    };

    if (this.formEl && this.onSubmit) {
      this.formEl.addEventListener("submit", this.onSubmit);
    }
  }

  // ---------- Helpers ----------

  private getInput(name: FieldName): HTMLInputElement | null {
    return (this.formEl?.elements.namedItem(name) as HTMLInputElement) || null;
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
    if (result.status) this.clearError(name);
    else this.setError(name, result.err_msg);
  }

  private validateField(name: FieldName): void {
    switch (name) {
      case "nickname": {
        const res = validateNickname(this.getValue("nickname"));
        this.applyFieldResult("nickname", res);
        break;
      }
      case "username": {
        const res = validateUsername(this.getValue("username"));
        this.applyFieldResult("username", res);
        break;
      }
      case "email": {
        const res = validateEmail(this.getValue("email"));
        this.applyFieldResult("email", res);
        break;
      }
      case "password": {
        const res = validatePassword(this.getValue("password"));
        this.applyFieldResult("password", res);
        break;
      }
    }
  }

  private clearFormMessages(): void {
    const ids = ["form-error", "form-success"];
    ids.forEach((id) => {
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

  private async safeErrorMessage(res: Response): Promise<string | null> {
    try {
      const data = await res.json();
      const msg = (data && (data.error || data.message)) as string | undefined;
      if (typeof msg === "string" && msg.length <= 200) return msg;
    } catch {
      /* ignore */
    }
    return null;
  }

  cleanup(): void {
    if (this.formEl && this.onSubmit) {
      this.formEl.removeEventListener("submit", this.onSubmit);
    }
    if (this.formEl && this.onInput) {
      this.formEl.removeEventListener("input", this.onInput);
      this.formEl.removeEventListener("blur", this.onInput, true);
    }

    this.formEl = null;
    this.submitBtn = null;
    this.onSubmit = undefined;
    this.onInput = undefined;
  }
}
