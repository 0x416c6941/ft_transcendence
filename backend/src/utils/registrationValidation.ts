export type RawRegistrationPayload = {
  username: unknown;
  password: unknown;
  email: unknown;
  display_name: unknown;
  use_2fa?: unknown;
};

export type NormalizedRegistrationPayload = {
  username: string;
  password: string;
  email: string;
  display_name: string;
  use_2fa: boolean;
};

export class RegistrationValidationError extends Error {
  public readonly messages: string[];

  constructor(messages: string[]) {
    super(messages.join('\n'));
    this.name = 'RegistrationValidationError';
    this.messages = messages;
  }
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const DISPLAY_NAME_RE = /^[a-zA-Z0-9_]{1,20}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,16}$/;
const MAX_EMAIL_LENGTH = 254;

const normalizeIdentifier = (value: unknown): string =>
  typeof value === 'string' ? value.trim().normalize('NFKC') : '';

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return false;
};

const isEmail = (value: string): boolean => {
  if (!value || value.length > MAX_EMAIL_LENGTH) return false;
  // Lightweight email validation similar to client-side regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

export function validateAndNormalizeRegistrationPayload(
  payload: RawRegistrationPayload
): NormalizedRegistrationPayload {
  const errors: string[] = [];

  const username = normalizeIdentifier(payload.username);
  if (!username) {
    errors.push('Username is required.');
  } else if (!USERNAME_RE.test(username)) {
    errors.push('Username must be 3–20 characters using letters, numbers, or underscores.');
  }

  const displayName = normalizeIdentifier(payload.display_name);
  if (!displayName) {
    errors.push('Display name is required.');
  } else if (!DISPLAY_NAME_RE.test(displayName)) {
    errors.push('Display name must be 1–20 characters using letters, numbers, or underscores.');
  }

  const email = normalizeEmail(payload.email);
  if (!email) {
    errors.push('Email is required.');
  } else if (!isEmail(email)) {
    errors.push('Email must be a valid email address.');
  }

  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!password) {
    errors.push('Password is required.');
  } else if (!PASSWORD_RE.test(password)) {
    errors.push('Password must be 8–16 characters and include upper, lower, and numeric characters.');
  }

  if (errors.length > 0) {
    throw new RegistrationValidationError(errors);
  }

  const use2fa = toBoolean(payload.use_2fa);

  return {
    username,
    password,
    email,
    display_name: displayName,
    use_2fa: use2fa,
  };
}
