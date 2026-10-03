/**
 * Path to return to after sign-in. Only same-site paths are allowed; anything
 * else becomes "/".
 *
 * Browsers drop tab and newline characters before parsing a URL, so
 * "/\t/evil.example" would navigate to "//evil.example". Those characters and
 * backslashes are rejected, and the value must still resolve to this origin.
 */
export function safeRedirectPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\t\n\r]/.test(value)
  ) {
    return "/";
  }
  try {
    const base = "https://sportura.invalid";
    return new URL(value, base).origin === base ? value : "/";
  } catch {
    return "/";
  }
}
