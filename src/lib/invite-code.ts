/** Numeric invitations can be dictated or typed in two groups of four. */
export function normalizeInviteCode(code: string): string {
  const value = code.trim().toLowerCase();
  return /^[\d\s-]+$/.test(value) ? value.replace(/[\s-]/g, "") : value;
}

export function formatInviteCode(code: string): string {
  return /^\d{8}$/.test(code) ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

/** The router parses unquoted numeric URL parameters as numbers. */
export function inviteCodeFromSearch(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return typeof value === "string" ? normalizeInviteCode(value) : "";
}
