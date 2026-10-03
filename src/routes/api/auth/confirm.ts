import { createFileRoute } from "@tanstack/react-router";
import { renderLocalizedMessagePage } from "@/lib/i18n/message-page";

// Target of the links in confirmation and email-change messages.
async function confirm(request: Request): Promise<Response> {
  const { asService, isUniqueViolation } = await import("@/lib/db.server");
  const { findToken, invalidateIdentityTokens } =
    await import("@/lib/auth.server");
  const token = new URL(request.url).searchParams.get("token") ?? "";
  let confirmed: string | null = null;
  if (token.length >= 20 && token.length <= 100) {
    try {
      confirmed = await asService(async (tx) => {
        const found = await findToken(
          tx,
          token,
          ["confirm_email", "email_change"],
          true,
        );
        if (!found) return null;
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
        return updated.count === 1 ? found.purpose : null;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (confirmed) {
    // A new account gets no session before confirmation, so it continues at sign-in.
    const location =
      confirmed === "email_change"
        ? "/profile?tab=personal"
        : "/auth?confirmed=1";
    return new Response(null, { status: 303, headers: { location } });
  }
  return new Response(
    renderLocalizedMessagePage(
      "Ссылка недействительна",
      "Ссылка устарела или уже использована. Войдите в аккаунт, чтобы запросить новое письмо.",
      "/auth",
      "Войти",
    ),
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/auth/confirm")({
  server: { handlers: { GET: ({ request }) => confirm(request) } },
});
