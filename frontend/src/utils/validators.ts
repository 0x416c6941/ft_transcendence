export type FieldResult = { status: true } | { status: false; err_msg: string };

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/**
 *
 * @param val
 * @returns
 */
export function validateUsername(val: string): FieldResult {
  const value = (val ?? "").trim().normalize("NFKC");
  if (!value) {
    return { status: false, err_msg: "Username is required." };
  }
  if (!USERNAME_RE.test(value)) {
    return {
      status: false,
      err_msg: "Use 3–20 letters, numbers, or underscores.",
    };
  }
  return { status: true };
}

export function validateEmail(val: string): FieldResult {
  const value = (val ?? "").trim().toLowerCase();
  if (!value) {
    return { status: false, err_msg: "Email is required." };
  }
  const status = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  return status
    ? { status: true }
    : { status: false, err_msg: "Enter a valid email address." };
}

export function validatePassword(val: string): FieldResult {
  const value = val ?? "";
  if (!value) return { status: false, err_msg: "Password is required." };
  const lengthOk = value.length >= 8;
  const upperOk = /[A-Z]/.test(value);
  const lowerOk = /[a-z]/.test(value);
  const digitOk = /[0-9]/.test(value);
  if (!lengthOk || !upperOk || !lowerOk || !digitOk) {
    return {
      status: false,
      err_msg: "Min 8 chars with upper, lower, and a number.",
    };
  }
  return { status: true };
}
