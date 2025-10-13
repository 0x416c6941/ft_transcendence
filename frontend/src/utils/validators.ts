/**
 * A field validation result used across forms.
 * - { status: true }  -> valid
 * - { status: false, err_msg } -> invalid with human-readable message
 */
export type FieldResult = { status: true } | { status: false; err_msg: string };

/** Username: 3–20 ASCII letters, digits, underscore */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
/** Nickname/Display name: 1–20 ASCII letters, digits, underscore */
const NICKNAME_RE = /^[a-zA-Z0-9_]{1,20}$/;
/** Email: simple RFC-like sanity check (keep it lightweight client-side) */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Password: at least 8 chars incl. lower, upper, and a digit (single-pass) */
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/** Small helpers to keep code concise */
const ok = (): FieldResult => ({ status: true });
const err = (msg: string): FieldResult => ({ status: false, err_msg: msg });

/**
 * Normalizes identifier-like text (e.g., username/nickname) to Unicode NFKC and trims.
 * NFKC helps collapse full-width and compatibility characters into canonical ASCII where possible.
 */
function normId(val: string): string {
	return (val ?? "").trim().normalize("NFKC");
}

/**
 * Validates a username.
 * Rules: 3–20 chars, ASCII letters/digits/underscore only.
 */
export function validateUsername(val: string): FieldResult {
	const value = normId(val);
	if (!value) return err("Username is required.");
	if (!USERNAME_RE.test(value)) {
		return err("Use 3–20 letters, numbers, or underscores.");
	}
	return ok();
}

/**
 * Validates an email.
 * Note: We intentionally do NOT Unicode-normalize emails; only trim + lowercase.
 * The server is the final authority for email format and deliverability.
 */
export function validateEmail(val: string): FieldResult {
	const value = (val ?? "").trim().toLowerCase();
	if (!value) return err("Email is required.");
	return EMAIL_RE.test(value)
		? ok()
		: err("Enter a valid email address.");
}

/**
 * Validates a password.
 * Rules: ≥ 8 chars, must include at least one lowercase, one uppercase, and one digit.
 * We keep client rules simple; server can enforce stronger policies.
 */
export function validatePassword(val: string): FieldResult {
	const value = val ?? "";
	if (!value) return err("Password is required.");
	return PASSWORD_RE.test(value)
		? ok()
		: err("Min 8 chars with upper, lower, and a number.");
}

/**
 * Validates a display nickname.
 * Rules: 1–20 chars, ASCII letters/digits/underscore only.
 */
export function validateNickname(val: string): FieldResult {
	const value = normId(val);
	if (!value) return err("Nickname is required.");
	return NICKNAME_RE.test(value)
		? ok()
		: err("Use 1–20 letters, numbers, or underscores.");
}
