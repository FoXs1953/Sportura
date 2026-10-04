function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

/** Authentication may continue only to an internal, absolute application path. */
export function safeAuthRedirect(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    containsControlCharacters(value)
  ) {
    return "/";
  }
  try {
    const url = new URL(value, "https://sportura.invalid");
    const decoded = decodeURIComponent(value);
    const pathname = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://sportura.invalid" ||
      pathname.startsWith("//") ||
      decoded.includes("\\") ||
      containsControlCharacters(decoded)
    ) {
      return "/";
    }
    return value;
  } catch {
    return "/";
  }
}

/** Keep the same validated destination in emailed links and auth callbacks. */
export function authContinuationPath(
  path: "/auth" | "/reset-password" | "/api/auth/confirm",
  redirect: unknown,
  search: Record<string, string> = {},
): string {
  const parameters = new URLSearchParams(search);
  const destination = safeAuthRedirect(redirect);
  if (destination !== "/") parameters.set("redirect", destination);
  else parameters.delete("redirect");
  const query = parameters.toString();
  return query ? `${path}?${query}` : path;
}
