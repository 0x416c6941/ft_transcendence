/**
 * Normalizes identifier-like user input to Unicode NFKC and trims whitespace.
 * Use for fields like username, display_name, etc.
 */
export const nkfc = (s: string): string => (s ?? "").trim().normalize("NFKC");

/**
 * Light email sanitizer for the client: trims and lowercases.
 * We intentionally avoid Unicode normalization or aggressive transformations.
 */
export const emailSan = (s: string): string => (s ?? "").trim().toLowerCase();
