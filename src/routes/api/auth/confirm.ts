import { createFileRoute } from "@tanstack/react-router";

// Target of the links in confirmation and email-change messages.
async function confirm(request: Request): Promise<Response> {
  const { asService, isUniqueViolation } = await import("@/lib/db.server");
  const { findToken, invalidateIdentityTokens } =
    await import("@/lib/auth.server");
  const token = new URL(request.url).searchParams.get("token") ?? "";
  let ok = false;
  if (token.length >= 20 && token.length <= 100) {
    try {
      ok = await asService(async (tx) => {
        const found = await findToken(
          tx,
          token,
          ["confirm_email", "email_change"],
          true,
        );
        if (!found) return false;
        // Updating auth.users fires sync_profile_identity, which updates the profile.
        const updated =
          found.purpose === "email_change"
            ? await tx`UPDATE auth.users
                       SET email = ${found.email}, email_confirmed_at = now(), updated_at = now()
                       WHERE id = ${found.user_id}`
            : await tx`UPDATE auth.users
                       SET email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
                       WHERE id = ${found.user_id} AND email = ${found.email}`;
        if (updated.count === 1 && found.purpose === "email_change") {
          await invalidateIdentityTokens(tx, found.user_id);
        }
        return updated.count === 1;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (ok) {
    return new Response(null, {
      status: 303,
      headers: { location: "/profile?tab=personal" },
    });
  }
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sportura</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Ссылка недействительна</h1><p>Ссылка устарела или уже использована. Запросите новое письмо в профиле.</p><p><a href="/">На главную</a></p>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/auth/confirm")({
  server: { handlers: { GET: ({ request }) => confirm(request) } },
});
