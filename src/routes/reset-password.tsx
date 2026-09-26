import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthFrame } from "@/components/sportura/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Новый пароль — Sportura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

type Screen = "checking" | "change" | "expired" | "done";

function ResetPasswordPage() {
  const [screen, setScreen] = useState<Screen>("checking");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    // Read the callback before Supabase processes and removes the URL fragment.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const recoveryLink = hash.get("type") === "recovery";
    const callbackError =
      hash.get("error_description") ?? query.get("error_description");
    if (callbackError) {
      setScreen("expired");
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active || !session) return;
        if (
          event === "PASSWORD_RECOVERY" ||
          (recoveryLink && event === "SIGNED_IN")
        ) {
          setAccountEmail(session.user.email ?? "");
          setScreen("change");
        }
      },
    );

    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (recoveryLink && !sessionError && data.session) {
          setAccountEmail(data.session.user.email ?? "");
          setScreen("change");
        } else if (!data.session) {
          setScreen("expired");
        } else {
          // A normal signed-in session must not be mistaken for a recovery link.
          setScreen((current) => (current === "change" ? current : "expired"));
        }
      })
      .catch(() => {
        if (active) setScreen("expired");
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    if (password.length < 12) {
      setError("Пароль должен содержать не менее 12 символов.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      setPassword("");
      setConfirm("");
      setScreen("done");
      void supabase.auth.signOut().catch(() => undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        /weak|pwned|compromised|leak/i.test(message)
          ? "Этот пароль слишком простой или встречался в утечках. Придумай другой."
          : "Не удалось сохранить пароль. Проверь соединение и попробуй ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Новый пароль"
      subtitle="Восстановление доступа к Sportura"
    >
      {screen === "checking" && (
        <p role="status" className="text-sm text-muted-foreground">
          Проверяем ссылку…
        </p>
      )}
      {screen === "expired" && (
        <div className="auth-message space-y-4">
          <h2 className="text-lg font-semibold">
            Ссылка недействительна или истекла
          </h2>
          <p className="text-sm text-muted-foreground">
            Запроси новое письмо и открой последнюю полученную ссылку.
          </p>
          <Link
            to="/forgot-password"
            className="block text-center text-sm text-brand underline"
          >
            Отправить новую ссылку
          </Link>
        </div>
      )}
      {screen === "change" && (
        <form onSubmit={changePassword} className="space-y-5" aria-busy={busy}>
          <p className="text-sm text-muted-foreground">
            Установи новый пароль для {accountEmail || "своего аккаунта"}.
          </p>
          <div className="space-y-2">
            <Label htmlFor="new-password">Новый пароль</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Не менее 12 символов.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Повтори пароль</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Сохраняем…" : "Сохранить пароль"}
          </Button>
        </form>
      )}
      {screen === "done" && (
        <div className="auth-message space-y-4">
          <p role="status" className="text-sm">
            Пароль сохранён. Войди с новым паролем.
          </p>
          <Link
            to="/auth"
            className="block text-center text-sm text-brand underline"
          >
            Перейти ко входу
          </Link>
        </div>
      )}
      {screen !== "done" && (
        <Link
          to="/auth"
          className="mt-4 block text-center text-sm text-brand underline"
        >
          Вернуться ко входу
        </Link>
      )}
    </AuthFrame>
  );
}
