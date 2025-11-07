export type AliasValidation =
  | { valid: true; value: string }
  | { valid: false; error: string };

// Validation for game aliases (used by Pong and Tetris)
// - Trims whitespace
// - Allows 1–20 characters: letters, numbers, underscore
export function validateGameAlias(alias: string): AliasValidation {
  const trimmed = (alias ?? '').trim();
  if (
    !trimmed ||
    trimmed.length < 1 ||
    trimmed.length > 20 ||
    !/^[a-zA-Z0-9_]+$/.test(trimmed)
  ) {
    return { valid: false, error: 'Use 1–20 letters, numbers, or underscores' };
  }
  return { valid: true, value: trimmed };
}

// Basic validation result used for other string fields
export type RoomValidation =
  | { valid: true; value: string }
  | { valid: false; error: string };

// Room name: required, 2–15, letters/numbers/underscore
export function validateRoomName(name: string): RoomValidation {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { valid: false, error: 'Room name required' };
  if (trimmed.length < 2 || trimmed.length > 15 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { valid: false, error: 'Use 2–15 letters, numbers or underscores' };
  }
  return { valid: true, value: trimmed };
}

// Room password: optional; if provided, must have lower, upper, number, min 8, max 16
export function validateRoomPassword(password: string): RoomValidation {
  const value = password ?? '';
  if (!value) return { valid: true, value: '' };
  if (value.length > 16) {
    return { valid: false, error: 'Max 16 characters' };
  }
  const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!strong.test(value)) {
    return { valid: false, error: 'Min 8 chars with upper, lower, and a number' };
  }
  return { valid: true, value };
}
