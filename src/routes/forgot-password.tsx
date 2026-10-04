import { useI18n } from "@/lib/i18n";
import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAuthCapabilities,
  requestPasswordReset,
} from "@/lib/auth.functions";
import { AuthFrame } from "@/components/sportura/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeAuthRedirect } from "@/lib/auth-redirect";
export const Route = createFileRoute("/forgot-password")({
  validateSearch: (search: { redirect?: unknown } & SearchSchemaInput) => ({
    redirect: safeAuthRedirect(search.redirect),
  }),
  head: () => ({
    meta: [
      { title: "Забыли пароль — Sportura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});
function ForgotPasswordPage() {
  const { tr } = useI18n();
  const { redirect } = Route.useSearch();
  const capabilities = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: () => getAuthCapabilities(),
  });
  const emailUnavailable = capabilities.data?.email === false;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function sendReset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset({ data: { email: email.trim(), redirect } });
      setSent(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        /rate limit|too many|Слишком много/i.test(message)
          ? "Слишком много запросов. Попробуй позже."
          : message.startsWith("Отправка писем") ||
              message.startsWith("Не удалось отправить письмо")
            ? message
            : "Не удалось обработать запрос. Попробуйте ещё раз позже.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title={tr("Забыли пароль?")}
      subtitle={tr("Восстановление доступа к Sportura")}
    >
      {sent ? (
        <div className="auth-message space-y-4">
          <p role="status" className="text-sm">
            {tr(
              "Запрос восстановления принят. Проверьте входящие и папку «Спам» для адреса {email}.",
              { email: email.trim() },
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {tr(
              "Откройте последнюю ссылку из письма и задайте новый пароль. Если письмо не приходит, повторите запрос позже или обратитесь в поддержку.",
            )}
          </p>
          <button
            type="button"
            className="text-sm text-brand underline"
            onClick={() => setSent(false)}
          >
            {tr("Отправить на другой адрес")}
          </button>
        </div>
      ) : (
        <form onSubmit={sendReset} className="space-y-5" aria-busy={busy}>
          <p className="text-sm text-muted-foreground">
            {tr(
              emailUnavailable
                ? "Отправка писем пока недоступна. Попробуйте позже или обратитесь в поддержку."
                : "Введите почту аккаунта, чтобы запросить ссылку для смены пароля.",
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="reset-email">{tr("E-mail")}</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {tr(
            error && (
              <p role="alert" className="text-sm text-destructive">
                {tr(error)}
              </p>
            ),
          )}
          <Button
            type="submit"
            disabled={busy || emailUnavailable}
            className="w-full"
          >
            {tr(busy ? "Отправляем…" : "Отправить ссылку")}
          </Button>
        </form>
      )}
      <Link
        to="/auth"
        search={{ redirect }}
        className="mt-4 block text-center text-sm text-brand underline"
      >
        {tr("Вернуться ко входу")}
      </Link>
    </AuthFrame>
  );
}
