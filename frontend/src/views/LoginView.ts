import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

export default class LoginView extends AbstractView {
  constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
    super(router, pathParams, queryParams);
  }

  async getHtml(): Promise<string> {
    return `
      <main class="h-screen flex flex-col justify-center items-center bg-neutral-100 dark:bg-neutral-900">
        <h1 class="txt-light-dark-sans text-3xl mb-6">Login to ${APP_NAME}</h1>
        <form id="login-form" class="flex flex-col gap-4 w-64" novalidate>
          <input id="username" type="text" placeholder="Username" class="txt-light-dark-sans p-2 rounded border" />
          <input id="password" type="password" placeholder="Password" class="txt-light-dark-sans p-2 rounded border" />
          <button type="submit" class="bg-sky-500 text-white py-2 rounded shadow">Login</button>
        </form>
        <p id="error-msg" role="alert" aria-live="polite" class="text-red-500 mt-2" hidden>
          Please enter both username and password.
        </p>
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
    const usernameInput = document.getElementById('username') as HTMLInputElement | null;
    const passwordInput = document.getElementById('password') as HTMLInputElement | null;
    const errorMsg = document.getElementById('error-msg') as HTMLElement | null;

    if (!form || !usernameInput || !passwordInput || !errorMsg) return;

    const onSubmit = (e: Event) => {
      e.preventDefault();

      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!username || !password) {
        errorMsg.hidden = false; // show
        return;
      }

      errorMsg.hidden = true; // hide
      alert(`Welcome, ${username}!`);
      // TODO: call backend API
    };

    form.addEventListener('submit', onSubmit);

    // store handler so we can remove it later
    (form as any)._onSubmit = onSubmit;
  }

  cleanup(): void {
    const form = document.getElementById('login-form') as (HTMLFormElement & { _onSubmit?: (e: Event) => void }) | null;
    if (form && form._onSubmit) {
      form.removeEventListener('submit', form._onSubmit);
      delete form._onSubmit;
    }
  }
}
