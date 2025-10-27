import AbstractView from "./AbstractView.js";
import Router from "../router.js";
import {
	validateEmail,
	validateNickname as validateDisplayName,
	validatePassword,
	validateUsername,
	FieldResult,
} from "../utils/validators.js";
import type { UpdateUserInput } from "../api/users.js";
import { nkfc, emailSan } from "../utils/sanitize.js";
import { APP_NAME } from "../app.config.js";
import {
	ApiError,
	getCurrentUser,
	deleteUser,
	updateUser,
	getUserAvatarURL,
	uploadUserAvatar,
	resetUserAvatar
} from "../api/users.js";
import { auth } from "../auth.js";

/**
 * ProfileView (cookie-based auth)
 * --------------------------------
 * - Uses HttpOnly cookies for session
 * - Fetches user data from /api/users/me
 * - Allows updating profile (username, display name, email, password)
 * - Allows avatar upload & reset
 * - Allows logout and account deletion
 * - Redirects to /login if unauthenticated
 */
export default class ProfileView extends AbstractView {
	private editing = false;
	private currentAvatarObjectUrl: string | null = null;
	private original = {
		username: "",
		display_name: "",
		email: ""
	};

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
<main class="flex flex-1 items-center justify-center bg-neutral-100 dark:bg-neutral-900">
	<section class="w-full max-w-96 bg-white dark:bg-neutral-800 rounded shadow p-4">
		<h1 class="txt-light-dark-sans text-2xl mb-4">
			Your profile
		</h1>

		<div class="flex flex-col items-center gap-3 mb-4">
			<img id="avatar" alt="Avatar" class="h-20 w-20 rounded-full object-cover bg-neutral-200 dark:bg-neutral-700" />
			<div class="flex items-center gap-2">
				<input id="avatar-file" type="file" accept="image/*" class="hidden" />
				<button id="avatar-upload-btn" type="button" class="bg-neutral-700 text-white py-1 px-3 rounded">Change avatar</button>
				<button id="avatar-reset-btn" type="button" class="bg-red-500 text-white py-1 px-3 rounded">Reset</button>
			</div>
			<p id="avatar-msg" class="text-sm text-center text-neutral-500"></p>
			<p id="profile-msg" class="text-sm text-center text-neutral-500"></p>
		</div>

		<form id="profile-form" class="space-y-4">
			<div>
				<label class="block text-sm text-neutral-500" for="username">Username</label>
				<input id="username" name="username"
					class="w-full border rounded p-2 bg-neutral-50 dark:bg-neutral-700"
					type="text" minlength="3" maxlength="20" required disabled />
			</div>

			<!-- Display name -->
			<div>
				<label class="block text-sm text-neutral-500" for="display_name">Display name</label>
				<input id="display_name" name="display_name"
					class="w-full border rounded p-2 bg-neutral-50 dark:bg-neutral-700"
					type="text" minlength="1" maxlength="20" required disabled />
			</div>

			<div>
				<label class="block text-sm text-neutral-500" for="email">Email</label>
				<input id="email" name="email"
					class="w-full border rounded p-2 bg-neutral-50 dark:bg-neutral-700"
					type="email" required disabled />
			</div>

			<div>
				<label class="block text-sm text-neutral-500" for="password">New Password (optional)</label>
				<input id="password" name="password"
					class="w-full border rounded p-2 bg-neutral-50 dark:bg-neutral-700"
					type="password" minlength="8" placeholder="Leave blank to keep current" />
			</div>

			<div class="flex items-center gap-2">
				<button id="edit-btn" type="button"
					class="flex-1 bg-neutral-700 text-white py-2 rounded shadow">
					Change profile data
				</button>
				<button id="update-btn" type="submit"
					class="w-full bg-sky-500 text-white py-2 rounded shadow">
					Save changes
				</button>
			</div>
		</form>

		<div class="mt-6 text-center space-x-4">
			<button id="logout-btn" class="bg-neutral-700 text-white py-1 px-3 rounded">Logout</button>
			<button id="delete-btn" class="bg-red-500 text-white py-1 px-3 rounded">Delete Account</button>
		</div>
	</section>
</main>
		`;
	}

	private showFieldError(input: HTMLInputElement, res: FieldResult) {
		if (res.status) {
			input.classList.remove("border-red-500");
			input.removeAttribute("title");
			input.setAttribute("aria-invalid", "false");
		} else {
			input.classList.add("border-red-500");
			input.setAttribute("title", res.err_msg);
			input.setAttribute("aria-invalid", "true");
		}
	}

	private readSanitized(
		usernameEl: HTMLInputElement,
		displayEl: HTMLInputElement,
		emailEl: HTMLInputElement,
		passwordEl: HTMLInputElement
	) {
		const username = nkfc(usernameEl.value);
		const display_name = nkfc(displayEl.value);
		const email = emailSan(emailEl.value);
		const password = passwordEl.value;
		return { username, display_name, email, password };
	}

	// Validate current values (password optional)
	private validateAll(
		usernameEl: HTMLInputElement,
		displayEl: HTMLInputElement,
		emailEl: HTMLInputElement,
		passwordEl: HTMLInputElement
	): boolean {
		const { username, display_name, email, password } = this.readSanitized(usernameEl, displayEl, emailEl, passwordEl);

		const valUser = username ? validateUsername(username) : ({ status: false, err_msg: "Username is required." } as FieldResult);
		const valDisplay = display_name ? validateDisplayName(display_name) : ({ status: false, err_msg: "Nickname is required." } as FieldResult);
		const valEmail = email ? validateEmail(email) : ({ status: false, err_msg: "Email is required." } as FieldResult);
		const valPass = password ? validatePassword(password) : ({ status: true } as FieldResult);

		this.showFieldError(usernameEl, valUser);
		this.showFieldError(displayEl, valDisplay);
		this.showFieldError(emailEl, valEmail);
		this.showFieldError(passwordEl, valPass);

		return valDisplay.status && valEmail.status && valPass.status && valUser.status;
	}

	private hasChanges(
		usernameEl: HTMLInputElement,
		displayEl: HTMLInputElement,
		emailEl: HTMLInputElement,
		passwordEl: HTMLInputElement
	): boolean {
		const { username, display_name, email, password } = this.readSanitized(usernameEl, displayEl, emailEl, passwordEl);
		return (
			username !== this.original.username ||
			display_name !== this.original.display_name ||
			email !== this.original.email ||
			password.length > 0
		);
	}

	async setup(): Promise<void> {
		await auth.bootstrap();
		if (!auth.isAuthed()) {
			this.router.navigate("/login");
			return;
		}

		const form = document.getElementById("profile-form") as HTMLFormElement | null;
		const msg = document.getElementById("profile-msg") as HTMLParagraphElement | null;
		const logoutBtn = document.getElementById("logout-btn") as HTMLButtonElement | null;
		const deleteBtn = document.getElementById("delete-btn") as HTMLButtonElement | null;
		const updateBtn = document.getElementById("update-btn") as HTMLButtonElement | null;
		const editBtn = document.getElementById("edit-btn") as HTMLButtonElement | null;
		const avatarImg = document.getElementById("avatar") as HTMLImageElement | null;

		// new avatar controls
		const avatarFile = document.getElementById("avatar-file") as HTMLInputElement | null;
		const avatarUploadBtn = document.getElementById("avatar-upload-btn") as HTMLButtonElement | null;
		const avatarResetBtn = document.getElementById("avatar-reset-btn") as HTMLButtonElement | null;
		const avatarMsg = document.getElementById("avatar-msg") as HTMLParagraphElement | null;

		if (!form || !msg || !logoutBtn || !deleteBtn || !updateBtn || !editBtn || !avatarImg || !avatarFile || !avatarUploadBtn || !avatarResetBtn || !avatarMsg) return;

		const usernameEl = document.getElementById("username") as HTMLInputElement;
		const displayNameEl = document.getElementById("display_name") as HTMLInputElement;
		const emailEl = document.getElementById("email") as HTMLInputElement;
		const passwordEl = document.getElementById("password") as HTMLInputElement;

		// Helper to set edit mode UI
		const setEditing = (on: boolean) => {
			this.editing = on;
			usernameEl.disabled = !on;
			displayNameEl.disabled = !on;
			emailEl.disabled = !on;
			passwordEl.disabled = !on;
			updateBtn.disabled = !on;
			editBtn.textContent = on ? "Cancel" : "Change profile data";
			if (!on) {
				passwordEl.value = ""; // reset password field when leaving edit mode
			}
		};

		// --- Load user data ---
		let currentUserId = 0;
		try {
			const user = await getCurrentUser();
			const { username, email, display_name, id } = user;
			currentUserId = id;

			this.original.username = nkfc(username ?? "");
			this.original.display_name = nkfc(display_name ?? "");
			this.original.email = emailSan(email);

			usernameEl.value = this.original.username;
			displayNameEl.value = this.original.display_name;
			emailEl.value = this.original.email;
			msg.textContent = `Logged in as ${username}`;
			msg.className = "text-neutral-500 text-sm text-center mt-2";

			// initial avatar
			try {
				const avatarUrl = await getUserAvatarURL(currentUserId);
				if (this.currentAvatarObjectUrl) {
					URL.revokeObjectURL(this.currentAvatarObjectUrl);
					this.currentAvatarObjectUrl = null;
				}
				this.currentAvatarObjectUrl = avatarUrl;
				avatarImg.src = avatarUrl;
				avatarImg.onload = () => {
					if (this.currentAvatarObjectUrl) {
						URL.revokeObjectURL(this.currentAvatarObjectUrl);
						this.currentAvatarObjectUrl = null;
					}
				};
			} catch {
				// Optionally set a static default asset here
				// avatarImg.src = "/default_avatar.webp";
			}
		} catch (error) {
			const err_msg = error instanceof Error ? error.message : "Failed to load profile.";
			msg.textContent = err_msg;
			msg.className = "text-red-500 text-sm text-center mt-2";

			if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
				await auth.signOut();
				setTimeout(() => this.router.navigate("/login"), 800);
			}
			return;
		}

		// helper to refresh avatar preview
		const refreshAvatar = async () => {
			try {
				const url = await getUserAvatarURL(currentUserId);
				if (this.currentAvatarObjectUrl) {
					URL.revokeObjectURL(this.currentAvatarObjectUrl);
					this.currentAvatarObjectUrl = null;
				}
				this.currentAvatarObjectUrl = url;
				avatarImg.src = url;
				avatarImg.onload = () => {
					if (this.currentAvatarObjectUrl) {
						URL.revokeObjectURL(this.currentAvatarObjectUrl);
						this.currentAvatarObjectUrl = null;
					}
				};
			} catch {
				/* ignore */
			}
		};

		// avatar upload: open picker
		avatarUploadBtn.addEventListener("click", () => {
			avatarMsg.textContent = "";
			avatarFile.value = "";
			avatarFile.click();
		});

		// avatar upload: on file chosen
		avatarFile.addEventListener("change", async () => {
			const file = avatarFile.files?.[0];
			if (!file) return;

			if (!file.type.startsWith("image/")) {
				avatarMsg.textContent = "Please choose an image file.";
				avatarMsg.className = "text-red-500 text-sm text-center";
				return;
			}

			avatarUploadBtn.disabled = true;
			avatarResetBtn.disabled = true;
			avatarMsg.textContent = "Uploading…";
			avatarMsg.className = "text-neutral-500 text-sm text-center";

			try {
				await uploadUserAvatar(currentUserId, file);
				await refreshAvatar();
				avatarMsg.textContent = "Avatar updated!";
				avatarMsg.className = "text-green-600 text-sm text-center";
			} catch (e) {
				const m = e instanceof Error ? e.message : "Upload failed.";
				avatarMsg.textContent = m;
				avatarMsg.className = "text-red-500 text-sm text-center";
			} finally {
				avatarUploadBtn.disabled = false;
				avatarResetBtn.disabled = false;
			}
		});

		// avatar reset
		avatarResetBtn.addEventListener("click", async () => {
			const ok = window.confirm("Reset your avatar to default?");
			if (!ok) return;

			avatarUploadBtn.disabled = true;
			avatarResetBtn.disabled = true;
			avatarMsg.textContent = "Resetting…";
			avatarMsg.className = "text-neutral-500 text-sm text-center";

			try {
				await resetUserAvatar(currentUserId);
				await refreshAvatar();
				avatarMsg.textContent = "Avatar reset to default.";
				avatarMsg.className = "text-green-600 text-sm text-center";
			} catch (e) {
				const m = e instanceof Error ? e.message : "Reset failed.";
				avatarMsg.textContent = m;
				avatarMsg.className = "text-red-500 text-sm text-center";
			} finally {
				avatarUploadBtn.disabled = false;
				avatarResetBtn.disabled = false;
			}
		});

		// start in non-editing mode + initialize save state
		setEditing(false);

		const updateSaveState = () => {
			// live-sanitize visible values (so comparisons are consistent)
			usernameEl.value = nkfc(usernameEl.value);
			displayNameEl.value = nkfc(displayNameEl.value);
			emailEl.value = emailSan(emailEl.value);

			const valid = this.validateAll(usernameEl, displayNameEl, emailEl, passwordEl);
			const changed = this.hasChanges(usernameEl, displayNameEl, emailEl, passwordEl);

			// Save is enabled only if we're editing, valid, and something actually changed
			updateBtn.disabled = !this.editing || !valid || !changed;
		};

		updateSaveState();

		// toggle edit mode
		editBtn.addEventListener("click", () => {
			setEditing(!this.editing);
			updateSaveState();
			if (this.editing) {
				displayNameEl.focus();
			}
		});

		// live state reactions
		["input", "blur", "change"].forEach(evt => {
			usernameEl.addEventListener(evt, updateSaveState);
			displayNameEl.addEventListener(evt, updateSaveState);
			emailEl.addEventListener(evt, updateSaveState);
			passwordEl.addEventListener(evt, updateSaveState);
		});

		// Update profile
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			msg.textContent = "";

			const valid = this.validateAll(usernameEl, displayNameEl, emailEl, passwordEl);
			if (!valid) {
				msg.textContent = "Please fix the highlighted fields.";
				msg.className = "text-red-500 text-sm text-center mt-2";
				return;
			}

			if (!this.hasChanges(usernameEl, displayNameEl, emailEl, passwordEl)) {
				msg.textContent = "No changes to save.";
				msg.className = "text-neutral-500 text-sm text-center mt-2";
				return;
			}

			const { username, display_name, email, password } =
				this.readSanitized(usernameEl, displayNameEl, emailEl, passwordEl);

			const payload: UpdateUserInput = {};
			if (username !== this.original.username) (payload as any).username = username;
			if (display_name !== this.original.display_name) payload.display_name = display_name;
			if (email !== this.original.email) payload.email = email;
			if (password && password.length > 0) payload.password = password;

			updateBtn.disabled = true;
			updateBtn.textContent = "Saving…";

			try {
				await updateUser(payload);
				this.original.username = username;
				this.original.display_name = display_name;
				this.original.email = email;
				passwordEl.value = "";
				msg.textContent = "Profile updated successfully!";
				msg.className = "text-green-600 text-sm text-center mt-2";
				setEditing(false);
				updateSaveState();
			} catch (err) {
				msg.textContent = err instanceof Error ? err.message : "Update failed.";
				msg.className = "text-red-500 text-sm text-center mt-2";
				setEditing(true);
				updateSaveState();
			} finally {
				const validNow = this.validateAll(usernameEl, displayNameEl, emailEl, passwordEl);
				const changedNow = this.hasChanges(usernameEl, displayNameEl, emailEl, passwordEl);
				updateBtn.disabled = !this.editing || !validNow || !changedNow;
				updateBtn.textContent = "Save changes";
			}
		});

		// Logout
		logoutBtn.addEventListener("click", async () => {
			logoutBtn.disabled = true;
			const prev = logoutBtn.textContent;
			logoutBtn.textContent = "Logging out…";
			try {
				await auth.signOut();
				this.router.navigate("/login");
			} finally {
				logoutBtn.disabled = false;
				logoutBtn.textContent = prev || "Logout";
			}
		});

		// Delete account
		deleteBtn.addEventListener("click", async () => {
			const confirmed = window.confirm("Delete your account permanently?");
			if (!confirmed) return;

			deleteBtn.disabled = true;
			const prev = deleteBtn.textContent;
			deleteBtn.textContent = "Deleting…";
			try {
				await deleteUser();
				await auth.signOut();
				msg.textContent = "Account deleted.";
				msg.className = "text-green-600 text-sm text-center mt-2";
				setTimeout(() => this.router.navigate("/"), 1000);
			} catch (err) {
				msg.textContent = err instanceof Error ? err.message : "Deletion failed.";
				msg.className = "text-red-500 text-sm text-center mt-2";
				deleteBtn.disabled = false;
				deleteBtn.textContent = prev || "Delete Account";
			}
		});
	}
}
