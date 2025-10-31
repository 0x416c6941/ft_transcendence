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
import {getEl} from "../utils/utils.js";

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

	private refs!: {
		form: HTMLFormElement;
    	msg: HTMLParagraphElement;
    	logoutBtn: HTMLButtonElement;
    	deleteBtn: HTMLButtonElement;
    	updateBtn: HTMLButtonElement;
    	editBtn: HTMLButtonElement;
    	avatarImg: HTMLImageElement;
    	avatarFile: HTMLInputElement;
    	avatarUploadBtn: HTMLButtonElement;
    	avatarResetBtn: HTMLButtonElement;
    	avatarMsg: HTMLParagraphElement;
    	usernameEl: HTMLInputElement;
    	displayNameEl: HTMLInputElement;
    	emailEl: HTMLInputElement;
    	passwordEl: HTMLInputElement;
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
      <main
        class="flex flex-1 items-center justify-center bg-neutral-100 dark:bg-neutral-900"
      >
        <section
          class="w-full max-w-96 bg-white dark:bg-neutral-800 rounded shadow p-4"
        >
          <div class="flex flex-col items-center gap-3 mb-4">
            <img
              id="avatar"
              alt="Avatar"
              class="h-30 w-30 rounded-full object-cover bg-neutral-200 dark:bg-neutral-700"
            />
            <div class="flex items-center gap-3">
              <input
                id="avatar-file"
                type="file"
                accept="image/*"
                class="hidden"
              />
              <button
                id="avatar-upload-btn"
                type="button"
                class="button py-2 px-3 w-35 rounded"
              >
                Change avatar
              </button>
              <button
                id="avatar-reset-btn"
                type="button"
                class="button button-reset py-2 px-3 w-35 rounded"
              >
                Reset avatar
              </button>
            </div>
            <p
              id="avatar-msg"
              class="text-sm text-center txt-light-dark-sans"
            ></p>
            <p
              id="profile-msg"
              class="text-sm text-center txt-light-dark-sans"
            ></p>
          </div>

          <form id="profile-form" class="space-y-4">
            <div>
              <label class="block txt-light-dark-sans text-sm" for="username"
                >Username</label
              >
              <input
                id="username"
                name="username"
                class="w-full border rounded p-2 txt-light-dark-sans"
                type="text"
                minlength="3"
                maxlength="20"
                required
                disabled
              />
            </div>

            <!-- Display name -->
            <div>
              <label
                class="block text-sm txt-light-dark-sans"
                for="display_name"
                >Display name</label
              >
              <input
                id="display_name"
                name="display_name"
                class="w-full border rounded p-2 txt-light-dark-sans"
                type="text"
                minlength="1"
                maxlength="20"
                required
                disabled
              />
            </div>

            <div>
              <label class="block text-sm txt-light-dark-sans" for="email"
                >Email</label
              >
              <input
                id="email"
                name="email"
                class="w-full border rounded p-2 txt-light-dark-sans"
                type="email"
                required
                disabled
              />
            </div>

            <div>
              <label class="block text-sm txt-light-dark-sans" for="password"
                >New Password (optional)</label
              >
              <input
                id="password"
                name="password"
                class="w-full border rounded p-2 txt-light-dark-sans"
                type="password"
                minlength="8"
                placeholder="Leave blank to keep current"
              />
            </div>

            <div class="flex items-center gap-2">
              <button
                id="edit-btn"
                type="button"
                class="button flex-1 py-2 px-3 rounded shadow"
              >
                Edit profile data
              </button>
              <button
                id="update-btn"
                type="submit"
                class="button button-login flex-1 py-2 px-3 rounded shadow"
                hidden
              >
                Save changes
              </button>
            </div>
          </form>

          <div class="mt-6 text-center space-x-4">
            <button id="logout-btn" class="button w-35 py-2 px-3 rounded">
              Logout
            </button>
            <button
              id="delete-btn"
              class="button button-logout w-35 py-2 px-3 rounded"
            >
              Delete Account
            </button>
          </div>
        </section>
      </main>
		`;
	}

  // ----------  utils ----------
  private initRefs() {
    this.refs = {
      form: getEl<HTMLFormElement>("profile-form"),
      msg: getEl<HTMLParagraphElement>("profile-msg"),
      logoutBtn: getEl<HTMLButtonElement>("logout-btn"),
      deleteBtn: getEl<HTMLButtonElement>("delete-btn"),
      updateBtn: getEl<HTMLButtonElement>("update-btn"),
      editBtn: getEl<HTMLButtonElement>("edit-btn"),
      avatarImg: getEl<HTMLImageElement>("avatar"),
      avatarFile: getEl<HTMLInputElement>("avatar-file"),
      avatarUploadBtn: getEl<HTMLButtonElement>("avatar-upload-btn"),
      avatarResetBtn: getEl<HTMLButtonElement>("avatar-reset-btn"),
      avatarMsg: getEl<HTMLParagraphElement>("avatar-msg"),
      usernameEl: getEl<HTMLInputElement>("username"),
      displayNameEl: getEl<HTMLInputElement>("display_name"),
      emailEl: getEl<HTMLInputElement>("email"),
      passwordEl: getEl<HTMLInputElement>("password"),
    };
  }

  private showMsg(text: string, error: boolean) {
    this.refs.msg.textContent = text;
	this.refs.msg.className = error ? "text-red-500 text-sm text-center" : "text-green-600 text-sm text-center";
  }
  private setBtnBusy(btn: HTMLButtonElement, text: string) {
    btn.dataset.prevText = btn.textContent ?? "";
    btn.disabled = true;
    btn.textContent = text;
  }
  private clearBtnBusy(btn: HTMLButtonElement, fallback: string) {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevText || fallback;
    delete btn.dataset.prevText;
  }

  // ---------- validation ----------
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

  private readSanitized() {
    const u = nkfc(this.refs.usernameEl.value);
    const d = nkfc(this.refs.displayNameEl.value);
    const e = emailSan(this.refs.emailEl.value);
    const p = this.refs.passwordEl.value;
    return { username: u, display_name: d, email: e, password: p };
  }

  private validateAll(): boolean {
    const { username, display_name, email, password } = this.readSanitized();
    const valUser   = username      ? validateUsername(username)        : ({ status: false, err_msg: "Username is required." } as FieldResult);
    const valDisp   = display_name  ? validateDisplayName(display_name) : ({ status: false, err_msg: "Nickname is required." } as FieldResult);
    const valEmailR = email         ? validateEmail(email)              : ({ status: false, err_msg: "Email is required." } as FieldResult);
    const valPass   = password      ? validatePassword(password)        : ({ status: true } as FieldResult);

    this.showFieldError(this.refs.usernameEl, valUser);
    this.showFieldError(this.refs.displayNameEl, valDisp);
    this.showFieldError(this.refs.emailEl, valEmailR);
    this.showFieldError(this.refs.passwordEl, valPass);

    return valUser.status && valDisp.status && valEmailR.status && valPass.status;
  }

  private hasChanges(): boolean {
    const { username, display_name, email, password } = this.readSanitized();
    return (
      username !== this.original.username ||
      display_name !== this.original.display_name ||
      email !== this.original.email ||
      password.length > 0
    );
  }

  // ---------- avatar ----------
  private async refreshAvatar(userId: number) {
    try {
      const url = await getUserAvatarURL(userId);
      if (this.currentAvatarObjectUrl) {
        URL.revokeObjectURL(this.currentAvatarObjectUrl);
        this.currentAvatarObjectUrl = null;
      }
      this.currentAvatarObjectUrl = url;
      this.refs.avatarImg.src = url;
      this.refs.avatarImg.onload = () => {
        if (this.currentAvatarObjectUrl) {
          URL.revokeObjectURL(this.currentAvatarObjectUrl);
          this.currentAvatarObjectUrl = null;
        }
      };
    } catch {
      /* optional default image */
    }
  }

  private async changeAvatar(userId: number) {
    const { avatarFile, avatarUploadBtn, avatarResetBtn, avatarMsg } = this.refs;

    avatarMsg.textContent = "";
    avatarFile.value = "";
    avatarFile.click();

    const file: File | null = await new Promise((resolve) => {
      const h = () => {
        avatarFile.removeEventListener("change", h);
        resolve(avatarFile.files?.[0] ?? null);
      };
      avatarFile.addEventListener("change", h, { once: true });
    });
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      this.showMsg("Please choose an image file.", true);
      return;
    }

    avatarUploadBtn.disabled = true;
    avatarResetBtn.disabled = true;
    this.refs.avatarMsg.className = "text-neutral-500 text-sm text-center";
    this.refs.avatarMsg.textContent = "Uploading…";

    try {
      await uploadUserAvatar(userId, file);
      await this.refreshAvatar(userId);
      this.showMsg("Avatar updated!", false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Upload failed.";
      this.showMsg(m, true);
    } finally {
      avatarUploadBtn.disabled = false;
      avatarResetBtn.disabled = false;
    }
  }

  private async resetAvatar(userId: number) {
    const ok = window.confirm("Reset your avatar to default?");
    if (!ok) return;

    this.refs.avatarUploadBtn.disabled = true;
    this.refs.avatarResetBtn.disabled  = true;
    this.refs.avatarMsg.className = "text-neutral-500 text-sm text-center";
    this.refs.avatarMsg.textContent = "Resetting…";

    try {
      await resetUserAvatar(userId);
      await this.refreshAvatar(userId);
      this.showMsg("Avatar reset to default.", false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Reset failed.";
      this.showMsg(m, true);
    } finally {
      this.refs.avatarUploadBtn.disabled = false;
      this.refs.avatarResetBtn.disabled  = false;
    }
  }

  // ---------- editing ----------
  private setEditing(on: boolean) {
    const { updateBtn, usernameEl, displayNameEl, emailEl, passwordEl, editBtn } = this.refs;
    this.editing = on;

    updateBtn.hidden = !on;
    [usernameEl, displayNameEl, emailEl, passwordEl, updateBtn].forEach(el => (el.disabled = !on));
    editBtn.textContent = on ? "Cancel" : "Edit data";

    if (!on) {
      passwordEl.value = "";
      usernameEl.value = this.original.username;
      displayNameEl.value = this.original.display_name;
      emailEl.value = this.original.email;

      [usernameEl, displayNameEl, emailEl, passwordEl].forEach(el => {
        el.classList.remove("border-red-500");
        el.removeAttribute("title");
        el.setAttribute("aria-invalid", "false");
      });
    }
  }

  private bindEvents(currentUserId: number) {
    // avatar
    this.refs.avatarUploadBtn.addEventListener("click", () => this.changeAvatar(currentUserId));
    this.refs.avatarResetBtn.addEventListener("click",  () => this.resetAvatar(currentUserId));

    // edit toggle
    this.refs.editBtn.addEventListener("click", () => {
      this.setEditing(!this.editing);
      if (this.editing) this.refs.displayNameEl.focus();
    });

    // submit (only validation here)
    this.refs.form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      this.showMsg("", false);

      if (!this.validateAll()) {
        this.showMsg("Please fix the highlighted fields.", true);
        return;
      }
      if (!this.hasChanges()) {
        this.showMsg("No changes to save.", false);
        return;
      }

      const { username, display_name, email, password } = this.readSanitized();

      const payload: UpdateUserInput = {};
      if (username      !== this.original.username)      (payload as any).username = username;
      if (display_name  !== this.original.display_name)  payload.display_name = display_name;
      if (email         !== this.original.email)         payload.email = email;
      if (password && password.length > 0)               payload.password = password;

      this.setBtnBusy(this.refs.updateBtn, "Saving…");
      try {
        await updateUser(payload);
        this.original.username = username;
        this.original.display_name = display_name;
        this.original.email = email;
        this.refs.passwordEl.value = "";

        this.showMsg("Profile updated successfully!", false);
        this.setEditing(false);
      } catch (err) {
        this.showMsg(err instanceof Error ? err.message : "Update failed.", true);
        this.setEditing(true);
      } finally {
        this.clearBtnBusy(this.refs.updateBtn, "Save changes");
      }
    });

    // logout
    this.refs.logoutBtn.addEventListener("click", async () => {
      this.setBtnBusy(this.refs.logoutBtn, "Logging out…");
      try {
        await auth.signOut();
        this.router.navigate("/login");
      } finally {
        this.clearBtnBusy(this.refs.logoutBtn, "Logout");
      }
    });

    // delete
    this.refs.deleteBtn.addEventListener("click", async () => {
      const confirmed = window.confirm("Delete your account permanently?");
      if (!confirmed) return;

      this.setBtnBusy(this.refs.deleteBtn, "Deleting…");
      try {
        await deleteUser();
        await auth.signOut();
        this.showMsg("Account deleted.", false);
        setTimeout(() => this.router.navigate("/"), 1000);
      } catch (err) {
        this.showMsg(err instanceof Error ? err.message : "Deletion failed.", true);
        this.clearBtnBusy(this.refs.deleteBtn, "Delete Account");
      }
    });
  }

  // ---------- lifecycle ----------
  async setup(): Promise<void> {
    await auth.bootstrap();
    if (!auth.isAuthed()) {
      this.router.navigate("/login");
      return;
    }

    try {
      this.initRefs();
    } catch {
      return;
    }

    // start read-only
    this.setEditing(false);

    // load user + avatar
    let currentUserId = 0;
    try {
      const user = await getCurrentUser();
      const { username, email, display_name, id } = user;
      currentUserId = id;

      this.original.username = nkfc(username ?? "");
      this.original.display_name = nkfc(display_name ?? "");
      this.original.email = emailSan(email);

      this.refs.usernameEl.value = this.original.username;
      this.refs.displayNameEl.value = this.original.display_name;
      this.refs.emailEl.value = this.original.email;

      this.showMsg(`Logged in as ${username}`, false);
      await this.refreshAvatar(currentUserId);
    } catch (error) {
      this.showMsg(error instanceof Error ? error.message : "Failed to load profile.", true);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await auth.signOut();
        setTimeout(() => this.router.navigate("/login"), 800);
      }
      return;
    }

    this.bindEvents(currentUserId);
  }
}
