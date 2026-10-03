// Google sign-in (OpenID Connect authorization code flow with PKCE).
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; the authorized redirect URI
// in Google Cloud Console must be <APP_URL>/api/auth/google/callback.
import { createHash } from "node:crypto";
import { getCookie } from "@tanstack/react-start/server";
import {
  appUrl,
  createSession,
  currentCaller,
  newToken,
  sessionCookieHeader,
} from "./auth.server";
import { asService } from "./db.server";
import { safeRedirectPath } from "./safe-redirect";

const STATE_COOKIE = "sportura_oauth";

type State = {
  state: string;
  verifier: string;
  redirect: string;
  mode: "login" | "link";
};

function config() {
  const id = process.env["GOOGLE_CLIENT_ID"];
  const secret = process.env["GOOGLE_CLIENT_SECRET"];
  return id && secret ? { id, secret } : null;
}

const callbackUrl = () => `${appUrl()}/api/auth/google/callback`;

function stateCookie(value: string, maxAge: number) {
  const secure = appUrl().startsWith("https://") ? "; Secure" : "";
  return `${STATE_COOKIE}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function redirectTo(location: string, cookies: string[] = []) {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export function startGoogle(request: Request): Response {
  const google = config();
  if (!google) return new Response("Google sign-in is not configured", { status: 404 });
  const params = new URL(request.url).searchParams;
  const state: State = {
    state: newToken(),
    verifier: newToken(),
    redirect: safeRedirectPath(params.get("redirect")),
    mode: params.get("mode") === "link" ? "link" : "login",
  };
  const challenge = createHash("sha256").update(state.verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: google.id,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    state: state.state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  return redirectTo(url.toString(), [stateCookie(encoded, 600)]);
}

type Claims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

async function exchange(code: string, verifier: string): Promise<Claims> {
  const google = config()!;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      client_id: google.id,
      client_secret: google.secret,
      redirect_uri: callbackUrl(),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const { id_token } = (await response.json()) as { id_token?: string };
  // The ID token comes straight from Google's token endpoint over TLS, so its
  // signature check can be skipped (OpenID Connect Core 3.1.3.7); verify claims.
  const payload = JSON.parse(
    Buffer.from(id_token?.split(".")[1] ?? "", "base64url").toString(),
  ) as Claims & { aud?: string; iss?: string; exp?: number };
  if (
    payload.aud !== google.id ||
    !["https://accounts.google.com", "accounts.google.com"].includes(payload.iss ?? "") ||
    !payload.exp ||
    payload.exp * 1000 < Date.now() ||
    !payload.sub
  ) {
    throw new Error("Invalid Google ID token");
  }
  return payload;
}

function failure(message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sportura</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Не удалось войти через Google</h1><p>${message}</p><p><a href="/auth">Вернуться ко входу</a></p>`,
    {
      status: 400,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": stateCookie("", 0),
      },
    },
  );
}

export async function finishGoogle(request: Request): Promise<Response> {
  if (!config()) return new Response("Google sign-in is not configured", { status: 404 });
  const params = new URL(request.url).searchParams;
  let state: State;
  try {
    state = JSON.parse(
      Buffer.from(getCookie(STATE_COOKIE) ?? "", "base64url").toString(),
    ) as State;
  } catch {
    return failure("Сессия входа устарела. Попробуйте ещё раз.");
  }
  const code = params.get("code");
  if (!code || !state.state || params.get("state") !== state.state) {
    return failure("Сессия входа устарела. Попробуйте ещё раз.");
  }

  const claims = await exchange(code, state.verifier);
  const email = claims.email?.toLowerCase() ?? null;
  const verified = claims.email_verified === true && email !== null;

  if (state.mode === "link") {
    const caller = await currentCaller();
    if (!caller) return redirectTo("/auth", [stateCookie("", 0)]);
    const linked = await asService(async (tx) => {
      const [existing] = await tx<{ user_id: string }[]>`
        SELECT user_id FROM auth.identities WHERE provider = 'google' AND provider_id = ${claims.sub}`;
      if (existing && existing.user_id !== caller.userId) return false;
      await tx`INSERT INTO auth.identities (provider, provider_id, user_id, email)
               VALUES ('google', ${claims.sub}, ${caller.userId}, ${email})
               ON CONFLICT (user_id, provider) DO UPDATE SET provider_id = EXCLUDED.provider_id, email = EXCLUDED.email`;
      return true;
    });
    if (!linked) return failure("Этот аккаунт Google уже привязан к другому профилю Sportura.");
    return redirectTo("/profile?tab=security", [stateCookie("", 0)]);
  }

  const token = await asService(async (tx) => {
    const [identity] = await tx<{ user_id: string }[]>`
      SELECT user_id FROM auth.identities WHERE provider = 'google' AND provider_id = ${claims.sub}`;
    let userId = identity?.user_id;
    if (!userId && verified) {
      // Google has verified the address, so an existing account with it is the same person.
      const [user] = await tx<{ id: string }[]>`SELECT id FROM auth.users WHERE email = ${email}`;
      userId = user?.id;
      if (userId) {
        await tx`UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE id = ${userId}`;
      }
    }
    if (!userId) {
      const [user] = await tx<{ id: string }[]>`
        INSERT INTO auth.users (email, email_confirmed_at, raw_user_meta_data)
        VALUES (${email}, ${verified ? new Date() : null},
                ${tx.json({ name: claims.name ?? "Игрок", ...(claims.picture ? { avatar_url: claims.picture } : {}) })})
        RETURNING id`;
      userId = user!.id;
    }
    if (!identity) {
      await tx`INSERT INTO auth.identities (provider, provider_id, user_id, email)
               VALUES ('google', ${claims.sub}, ${userId}, ${email})
               ON CONFLICT (user_id, provider) DO UPDATE SET provider_id = EXCLUDED.provider_id, email = EXCLUDED.email`;
    }
    return createSession(tx, userId);
  });
  return redirectTo(state.redirect, [stateCookie("", 0), sessionCookieHeader(token)]);
}
