import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

export default class LoginView extends AbstractView {
  private isLoggedIn: boolean = false;

  constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
    super(router, pathParams, queryParams);
    this.isLoggedIn = this.checkIfLoggedIn();
  }

  async getHtml(): Promise<string> {
    const buttonClass = this.isLoggedIn 
      ? 'bg-red-500 hover:bg-red-600' 
      : 'bg-sky-500 hover:bg-sky-600';
    const buttonText = this.isLoggedIn ? 'Logout' : 'Login';
    const formDisplay = this.isLoggedIn ? 'hidden' : 'flex';

    return `
      <main class="h-screen flex flex-col justify-center items-center bg-neutral-100 dark:bg-neutral-900">
        <h1 class="txt-light-dark-sans text-3xl mb-6">${this.isLoggedIn ? 'Account' : 'Login to'} ${APP_NAME}</h1>
        <form id="login-form" class="${formDisplay} flex-col gap-4 w-64" novalidate>
          <input id="username" type="text" placeholder="Username" class="txt-light-dark-sans p-2 rounded border" />
          <input id="password" type="password" placeholder="Password" class="txt-light-dark-sans p-2 rounded border" />
          <button type="submit" id="auth-button" class="${buttonClass} text-white py-2 rounded shadow transition-colors">
            ${buttonText}
          </button>
        </form>
        <button id="logout-button" class="${this.isLoggedIn ? 'block' : 'hidden'} ${buttonClass} text-white py-2 px-6 rounded shadow transition-colors">
          ${buttonText}
        </button>
        <p id="error-msg" role="alert" aria-live="polite" class="text-red-500 mt-2" hidden></p>
        <p id="success-msg" role="alert" aria-live="polite" class="text-green-500 mt-2" hidden></p>
        <div class="mt-6">
          <a href="/" data-link class="txt-light-dark-sans underline">Back to Home</a>
        </div>
      </main>
    `;
  }

  setDocumentTitle(): void {
    document.title = `${APP_NAME} - Login`;
  }

  setup(): void {
    const form = document.getElementById('login-form') as HTMLFormElement | null;
    const logoutButton = document.getElementById('logout-button') as HTMLButtonElement | null;
    const usernameInput = document.getElementById('username') as HTMLInputElement | null;
    const passwordInput = document.getElementById('password') as HTMLInputElement | null;
    const errorMsg = document.getElementById('error-msg') as HTMLElement | null;
    const successMsg = document.getElementById('success-msg') as HTMLElement | null;

    if (!errorMsg || !successMsg) return;

    // Setup login form handler
    if (form && usernameInput && passwordInput && !this.isLoggedIn) {
      const onSubmit = async (e: Event) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
          this.showError('Please enter both username and password.', errorMsg, successMsg);
          return;
        }

        // Call login API
        await this.login(username, password, errorMsg, successMsg);
      };

      form.addEventListener('submit', onSubmit);
      (form as any)._onSubmit = onSubmit;
    }

    // Setup logout button handler
    if (logoutButton && this.isLoggedIn) {
      const onLogout = async () => {
        await this.logout(errorMsg, successMsg);
      };

      logoutButton.addEventListener('click', onLogout);
      (logoutButton as any)._onLogout = onLogout;
    }
  }

  private checkIfLoggedIn(): boolean {
    // Check if access token cookie exists
    return document.cookie.split(';').some(cookie => cookie.trim().startsWith('accessToken='));
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

  private async login(username: string, password: string, errorMsg: HTMLElement, successMsg: HTMLElement): Promise<void> {
    try {
      const response = await fetch(`${window.location.origin}/api/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include' // Important: include cookies
      });

      const data = await response.json();

      if (!response.ok) {
        this.showError(data.error || 'Login failed', errorMsg, successMsg);
        return;
      }

      // Store tokens in HttpOnly cookies
      if (data.accessToken) {
        document.cookie = `accessToken=${data.accessToken}; path=/; secure; samesite=strict`;
      }
      if (data.refreshToken) {
        document.cookie = `refreshToken=${data.refreshToken}; path=/; secure; samesite=strict`;
      }

      this.showSuccess(`Welcome, ${username}!`, errorMsg, successMsg);
      
      // Reload page to show logout button
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      this.showError('Network error. Please try again.', errorMsg, successMsg);
      console.error('Login error:', error);
    }
  }

  private async logout(errorMsg: HTMLElement, successMsg: HTMLElement): Promise<void> {
    // Clear cookies
    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    this.showSuccess('Logged out successfully', errorMsg, successMsg);

    // Reload page to show login form
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  cleanup(): void {
    const form = document.getElementById('login-form') as (HTMLFormElement & { _onSubmit?: (e: Event) => void }) | null;
    if (form && form._onSubmit) {
      form.removeEventListener('submit', form._onSubmit);
      delete form._onSubmit;
    }

    const logoutButton = document.getElementById('logout-button') as (HTMLButtonElement & { _onLogout?: () => void }) | null;
    if (logoutButton && logoutButton._onLogout) {
      logoutButton.removeEventListener('click', logoutButton._onLogout);
      delete logoutButton._onLogout;
    }
  }
}
