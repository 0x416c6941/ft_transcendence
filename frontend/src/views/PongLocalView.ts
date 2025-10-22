import AbstractView from './AbstractView.js';
import Router from '../router.js';
import { APP_NAME } from '../app.config.js';

export default class PongLocalView extends AbstractView {
    constructor(router: Router, pathParams: Map<string, string>, queryParams: URLSearchParams) {
        super(router, pathParams, queryParams);
    }

    async getHtml(): Promise<string> {
        return `
            <main class="h-screen flex justify-center items-center flex-col bg-neutral-200 dark:bg-neutral-900">
                <h1 class="txt-light-dark-sans text-3xl mb-4">Local Pong - ${APP_NAME}</h1>
                <p class="text-lg">Local game coming soon...</p>
                <button id="back-btn" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded">Back to Home</button>
            </main>
        `;
    }

    setDocumentTitle(): void {
        document.title = `${APP_NAME} - Local Pong`;
    }

    setup(): void {
        document.getElementById('back-btn')?.addEventListener('click', () => {
            this.router.navigate('/');
        });
    }

    cleanup(): void {}
}