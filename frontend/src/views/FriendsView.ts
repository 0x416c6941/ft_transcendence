import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import { APP_NAME } from "../app.config.js";

import {
	getFriendsList,
	addFriend,
	removeFriend,
	getUserById,
	getUserByUsername,
	getUserAvatarURL,
} from "../api/users.js";
import { getEl } from "../utils/utils.js";


type Friend = {
  	id:number,
  	username:string,
  	displayName:string,
  	avatarUrl:string,
  	isOnline:boolean
}

/**
 * FriendsView
 * Renders a simple UI to list, add, and remove friends.
 *
 * API:
 *  GET    /api/friends                -> { ids:number[] }
 *  POST   /api/friends/:username      -> { message }
 *  DELETE /api/friends/:username      -> { message }
 */
export default class FriendsView extends AbstractView {
	private aborter?: AbortController;
  	private avatarObjectUrls: Set<string> = new Set();

	//DOM refs
	private refs!: {
		form: HTMLFormElement;
		input: HTMLInputElement;
		status: HTMLDivElement;
		list: HTMLUListElement;
		empty: HTMLParagraphElement;
		tpl: HTMLTemplateElement;
	}
	// Bound handlers (for cleanup)
  	private onFormSubmit!: (e: Event) => void;

	constructor(
		router: Router,
		pathParams: Map<string, string>,
		queryParams: URLSearchParams
	) {
		super(router, pathParams, queryParams);
	}

	setDocumentTitle(): void {
		document.title = `${APP_NAME} - Friends`;
	}

  async getHtml(): Promise<string> {
    return `
<div
  class="flex flex-1 items-center justify-center bg-neutral-100 dark:bg-neutral-900"
>
  <section
    class="w-full max-w-lg flex-1 bg-white dark:bg-neutral-800 rounded shadow p-4 flex flex-col"
  >
    <!-- Add friend -->
    <form
      id="friends-add-form"
      class="flex gap-2 my-4 items-stretch bg-white dark:bg-neutral-800"
    >
      <input
        id="friends-add-input"
        type="text"
        name="username"
        placeholder="Add friend by @username"
        autocomplete="off"
        class="flex-1 border rounded px-3 py-2 txt-light-dark-sans"
        aria-label="Username"
        required
        pattern="^[A-Za-z0-9_.-]+$"
      />
      <button type="submit" class="button button-login px-3 py-2 rounded">
        Add
      </button>
    </form>

    <!-- Status / errors -->
    <div id="friends-status" class="text-sm" aria-live="polite"></div>

    <!-- List window -->
    <div
      class="friends-window border rounded-lg shadow-sm bg-white dark:bg-neutral-800"
    >
      <h2 class="text-lg txt-light-dark-sans font-bold p-3 border-b">
        Your friends
      </h2>

      <!-- Scrollable list -->
      <div
        id="friends-list-container"
        class="flex-1 overflow-y-auto divide-y txt-light-dark-sans"
      >
        <ul
          id="friends-list"
          class="divide-y divide-neutral-300 dark:divide-neutral-700"
        >
          <!-- populated by TS -->
        </ul>
        <p id="friends-empty" class="text-sm opacity-70 p-3 hidden">
          No friends yet.
        </p>
      </div>
    </div>

    <!-- Optional: template for one friend row -->
    <template id="friend-item-tpl">
      <li class="p-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img
            class="h-10 w-10 rounded-full object-cover bg-neutral-200 dark:bg-neutral-700"
            alt="Friend avatar"
          />
          <div class="flex flex-col leading-tight">
            <span class="friend-display font-medium txt-light-dark-sans"></span>
            <span class="friend-username text-sm opacity-75"></span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span
            class="status-dot inline-block w-3 h-3 rounded-full"
            title=""
          ></span>
          <button
            class="remove-btn button button-logout py-2 px-3 rounded text-sm txt-light-dark-sans"
          >
            Remove
          </button>
        </div>
      </li>
    </template>
  </section>
</div>
    `;
  }

	private initRefs(): void {
		this.refs = {
			form: getEl<HTMLFormElement>("friends-add-form"),
			input: getEl<HTMLInputElement>("friends-add-input"),
			status: getEl<HTMLDivElement>("friends-status"),
			list: getEl<HTMLUListElement>("friends-list"),
			empty: getEl<HTMLParagraphElement>("friends-empty"),
			tpl: getEl<HTMLTemplateElement>("friend-item-tpl"),
		};
	}

	private showMsg(msg: string, type: "info" | "ok" | "err" = "info") {
		const colors = {
			info: "text-blue-500",
			ok: "text-green-500",
			err: "text-red-500",
		};
		this.refs.status.className = `text-sm mt-2 ${colors[type]}`;
		this.refs.status.textContent = msg;
	}

	private sanitizeUsername(username: string): string {
		return username.trim().replace(/^@+/, "");
	}

	private onlineStatus(online?: boolean): string {
    	return online ? "bg-green-500" : "bg-gray-400";
  	}

	// ---------- API calls

	private async apiList(): Promise<Friend[]> {
		const { ids } = await getFriendsList();
		if (!Array.isArray(ids) || !ids.length) return [];

		// clean old avatar URLs
		for (const url of this.avatarObjectUrls) {
			try {
				URL.revokeObjectURL(url);
			} catch {}
		}
		this.avatarObjectUrls.clear();

		// expand each id -> user (+avatar). continue on partial failures.
		const results = await Promise.allSettled(
			ids.map(async (id) => {
				const user = await getUserById(id);
				let avatarUrl = "";
				try {
					avatarUrl = await getUserAvatarURL(id);
					if (avatarUrl) this.avatarObjectUrls.add(avatarUrl);
				} catch {
					// ignore avatar errors
				}
				const displayName = user.display_name || user.username;
				return {
					id: user.id,
					username: user.username,
					displayName,
					avatarUrl,
					isOnline: false, // no online status endpoint available here
				} as Friend;
			})
		);

		return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
	}

	private renderOne(friend: Friend): HTMLLIElement {
		const node = this.refs.tpl.content.firstElementChild!.cloneNode(true) as HTMLLIElement;

		const img = node.querySelector<HTMLImageElement>("img")!;
		const display = node.querySelector<HTMLSpanElement>(".friend-display")!;
		const uname = node.querySelector<HTMLSpanElement>(".friend-username")!;
		const dot = node.querySelector<HTMLElement>(".status-dot")!;
		const removeBtn = node.querySelector<HTMLButtonElement>(".remove-btn")!;

		// avatar
		if (friend.avatarUrl) {
			img.src = friend.avatarUrl;
		}
		img.alt = `${friend.username} avatar`;

		// text
		display.textContent = friend.displayName || friend.username;
		uname.textContent = `@${friend.username}`;

		// status dot
		dot.classList.add(this.onlineStatus(friend.isOnline));
		dot.title = friend.isOnline ? "Online" : "Offline";
		dot.setAttribute("aria-label", dot.title);

		// row click → navigate
		node.addEventListener("click", () => {
			this.router.navigate(`/profile/${friend.username}`);
		});

		// remove (stop navigation)
		removeBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			try {
				await removeFriend(friend.username);
				// optional: free just this avatar URL immediately
				if (friend.avatarUrl) {
					try { URL.revokeObjectURL(friend.avatarUrl); } catch {}
					this.avatarObjectUrls.delete(friend.avatarUrl);
				}
				node.remove();
				if (!this.refs.list.children.length) {
					this.refs.empty.classList.remove("hidden");
				}
				this.showMsg(`Removed @${friend.username}`, "ok");
			} catch (err) {
				this.showMsg(
					err instanceof Error ? err.message : `Failed to remove @${friend.username}`,
					"err"
				);
			}
		});

		return node;
	}


	private renderList(friends: Friend[]) {
		this.refs.list.innerHTML = "";

		if (!friends.length) {
			this.refs.empty.classList.remove("hidden");
			return;
		}

		this.refs.empty.classList.add("hidden");

		const frag = document.createDocumentFragment();
		friends.forEach((f) => frag.appendChild(this.renderOne(f)));
		this.refs.list.appendChild(frag);
	}


	private async loadFriends() {
		try {
			this.showMsg("Loading friends…", "info");

			const friends = await this.apiList();       // fetch from backend
			this.renderList(friends);                   // update DOM

			if (friends.length === 0) {
				this.showMsg(
					"You don’t have any friends yet. Try adding one above 👆",
					"info"
				);
			} else {
				this.showMsg(
				`Loaded ${friends.length} friend${friends.length === 1 ? "" : "s"}.`,
				"ok"
			);}

		} catch (err) {
			this.showMsg(
				err instanceof Error ? err.message : "Failed to load friends.",
				"err"
			);
		}
	}


  // ---------- Lifecycle

	setup(): void {
		// init abort controller for this view
		this.aborter = new AbortController();

		// collect refs
		try {
			this.initRefs();
		} catch {
			return;
		}

		// bind: add form
		this.onFormSubmit = async (e: Event) => {
			e.preventDefault();

			const raw = this.refs.input.value;
			const username = this.sanitizeUsername(raw);
			if (!username) {
				this.showMsg("Please enter a username.", "err");
				return;
			}

			// disable form during request
			const btn = this.refs.form.querySelector<HTMLButtonElement>("button[type='submit']")!;
			btn.disabled = true;

			try {
				await addFriend(username);
				this.refs.input.value = "";

				// simplest + reliable: re-fetch from server
				await this.loadFriends();

				this.showMsg(`Added @${username}`, "ok");
			} catch (err) {
				this.showMsg(
					err instanceof Error ? err.message : `Failed to add @${username}`,
					"err"
				);
			} finally {
				btn.disabled = false;
			}
		};

		// attach listener
		this.refs.form.addEventListener("submit", this.onFormSubmit);

		// initial load to render existing friends
		this.loadFriends();
	}


	cleanup(): void {
		try {
			// 1️⃣ Remove event listeners (only if refs were initialized)
			if (this.refs?.form && this.onFormSubmit) {
				this.refs.form.removeEventListener("submit", this.onFormSubmit);
			}
		} catch (err) {
			console.warn("[FriendsView] cleanup: failed to remove form listener", err);
		}

		// 2️⃣ Abort any pending requests
		if (this.aborter) {
			try {
				this.aborter.abort();
			} catch (err) {
				console.warn("[FriendsView] cleanup: abort failed", err);
			}
			this.aborter = undefined;
		}

		// 3️⃣ Revoke any created avatar object URLs to prevent memory leaks
		if (this.avatarObjectUrls?.size) {
			for (const url of this.avatarObjectUrls) {
				try {
					URL.revokeObjectURL(url);
				} catch (err) {
					console.warn("[FriendsView] cleanup: revoke failed", err);
				}
			}
			this.avatarObjectUrls.clear();
		}

		// 4️⃣ Optional: clear DOM refs to release memory faster (helps in SPAs)
		this.refs = undefined as any;


		console.debug("[FriendsView] cleanup completed");
	}

}
