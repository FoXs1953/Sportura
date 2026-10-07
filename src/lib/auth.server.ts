// Self-hosted authentication: scrypt password hashes, opaque session cookies
// backed by auth.sessions, and single-use email tokens in auth.one_time_tokens.
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { isIP } from "node:net";
import {
  getCookie,
  getRequestHeader,
  getRequestIP,
  getRequestUrl,
  setCookie,
} from "@tanstack/react-start/server";
import { asService, type Caller, type Tx } from "./db.server";
import { newToken, sha256 } from "./auth-tokens.server";
export {
  newToken,
  sha256,
  issueToken,
  findToken,
  invalidateIdentityTokens,
} from "./auth-tokens.server";
export { requireEmailConfirmation } from "./auth-confirmation.server";

export const SESSION_COOKIE = "sportura_session";
const SESSION_SECONDS = 30 * 24 * 3600;

/* ---------------- Passwords ---------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, 64, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  // Hash something even without a stored hash so response time does not reveal
  // whether an account exists.
  const [scheme, n, r, p, salt, key] = (stored ?? "").split("$");
  const valid = scheme === "scrypt" && salt && key;
  const expected = valid ? Buffer.from(key, "base64") : Buffer.alloc(64);
  const actual = await derive(
    password,
    valid ? Buffer.from(salt, "base64") : Buffer.alloc(16),
    valid
      ? { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem }
      : SCRYPT,
  );
  return Boolean(valid) && timingSafeEqual(actual, expected);
}

/* ---------------- Request context ---------------- */

/** Public base URL for links in emails and OAuth redirects. */
export function appUrl(): string {
  const configured = process.env["APP_URL"];
  if (configured) return configured.replace(/\/+$/, "");
  return getRequestUrl({ xForwardedHost: true, xForwardedProto: true }).origin;
}

function requestMeta() {
  const ip = getRequestIP({ xForwardedFor: true })?.split(",")[0]?.trim();
  return {
    userAgent: getRequestHeader("user-agent")?.slice(0, 500) ?? null,
    ip: ip && isIP(ip) ? ip : null,
  };
}

/* ---------------- Sessions ---------------- */

export function sessionCookieHeader(token: string | null): string {
  const secure = appUrl().startsWith("https://") ? "; Secure" : "";
  return token
    ? `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`
    : `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function writeSessionCookie(token: string | null) {
  setCookie(SESSION_COOKIE, token ?? "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl().startsWith("https://"),
    maxAge: token ? SESSION_SECONDS : 0,
  });
}

/** Creates a session row and returns the cookie value. */
export async function createSession(tx: Tx, userId: string): Promise<string> {
  const token = newToken();
  const { userAgent, ip } = requestMeta();
  await tx`INSERT INTO auth.sessions (user_id, user_agent, ip, token_hash, refreshed_at, not_after)
           VALUES (${userId}, ${userAgent}, ${ip}, ${sha256(token)}, now(), now() + make_interval(secs => ${SESSION_SECONDS}))`;
  await tx`UPDATE auth.users SET last_sign_in_at = now() WHERE id = ${userId}`;
  return token;
}

/** For server functions: create the session and set the cookie. */
export async function signInUser(tx: Tx, userId: string) {
  writeSessionCookie(await createSession(tx, userId));
}

export function clearSessionCookie() {
  writeSessionCookie(null);
}

/** Resolves the session cookie of the current request. */
export async function currentCaller(): Promise<Caller | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const session = await asService(async (tx) => {
    // Accounts count as signed in only once their contact has been confirmed.
    const [row] = await tx<{ id: string; user_id: string; stale: boolean }[]>`
      SELECT s.id, s.user_id, s.refreshed_at < now() - interval '1 day' AS stale
      FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id
      WHERE s.token_hash = ${sha256(token)} AND (s.not_after IS NULL OR s.not_after > now())
        AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)`;
    if (row?.stale) {
      // Sliding expiry: active sessions stay valid, idle ones lapse after 30 days.
      await tx`UPDATE auth.sessions
               SET refreshed_at = now(), not_after = now() + make_interval(secs => ${SESSION_SECONDS})
               WHERE id = ${row.id}`;
    }
    return row ?? null;
  });
  if (!session) return null;
  if (session.stale) {
    try {
      writeSessionCookie(token);
    } catch {
      // Some response contexts cannot set cookies; the next request retries.
    }
  }
  return { userId: session.user_id, sessionId: session.id };
}

/* ---------------- Rate limiting ---------------- */

const attempts = new Map<string, { count: number; resetAt: number }>();

/** In-memory limiter; enough for a single application instance. */
export function rateLimit(key: string, max: number, windowMinutes: number) {
  const now = Date.now();
  if (attempts.size > 10000) {
    for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
  }
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMinutes * 60000 });
    return;
  }
  entry.count += 1;
  if (entry.count > max) {
    throw new Error("Слишком много попыток. Попробуйте позже.");
  }
}

export function clientKey(): string {
  return requestMeta().ip ?? "unknown";
}
