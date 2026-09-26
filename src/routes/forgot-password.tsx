import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthFrame } from "@/components/sportura/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Забыли пароль — Sportura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendReset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (requestError) throw requestError;
      setSent(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        /rate limit|too many/i.test(message)
          ? "Слишком много запросов. Попробуй позже."
          : "Не удалось отправить письмо. Проверь соединение и попробуй ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Забыли пароль?"
      subtitle="Восстановление доступа к Sportura"
    >
      {sent ? (
        <div className="auth-message space-y-4">
          <p role="status" className="text-sm">
            Если аккаунт с адресом {email.trim()} существует, мы отправили
            письмо со ссылкой. Проверь входящие и папку «Спам».
          </p>
          <p className="text-xs text-muted-foreground">
            Открой последнюю ссылку из письма и задай новый пароль.
          </p>
          <button
            type="button"
            className="text-sm text-brand underline"
            onClick={() => setSent(false)}
          >
            Отправить на другой адрес
          </button>
        </div>
      ) : (
        <form onSubmit={sendReset} className="space-y-5" aria-busy={busy}>
          <p className="text-sm text-muted-foreground">
            Введи почту аккаунта. Мы отправим ссылку для смены пароля.
          </p>
          <div className="space-y-2">
            <Label htmlFor="reset-email">E-mail</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Отправляем…" : "Отправить ссылку"}
          </Button>
        </form>
      )}
      <Link
        to="/auth"
        className="mt-4 block text-center text-sm text-brand underline"
      >
        Вернуться ко входу
      </Link>
    </AuthFrame>
  );
}
