import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Восстановление пароля — Sportura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [mode, setMode] = useState<
    "checking" | "request" | "change" | "sent" | "done"
  >("checking");
  const [email, setEmail] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) {
        setAccountEmail(session.user.email ?? "");
        setMode("change");
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setAccountEmail(data.session.user.email ?? "");
        setMode("change");
      } else {
        setMode("request");
      }
    });
    return () => {
      active = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  async function sendReset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: requestError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      },
    );
    setBusy(false);
    if (requestError) {
      setError(requestError.message);
      return;
    }
    setMode("sent");
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    setConfirm("");
    setMode("done");
  }

  return (
    <AppShell
      title="Восстановление пароля"
      subtitle="Доступ к аккаунту Sportura"
    >
      {mode === "checking" && (
        <p className="text-sm text-muted-foreground">Проверяем ссылку…</p>
      )}
      {mode === "request" && (
        <form
          onSubmit={sendReset}
          className="panel-frost space-y-4 rounded-3xl p-5"
        >
          <p className="text-sm text-muted-foreground">
            Отправим ссылку для смены пароля на почту аккаунта.
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
          <Button type="submit" disabled={busy} className="w-full">
            Отправить ссылку
          </Button>
        </form>
      )}
      {mode === "sent" && (
        <p className="panel-frost rounded-3xl p-5 text-sm">
          Если такой аккаунт существует, письмо для смены пароля отправлено.
          Проверь почту и папку «Спам».
        </p>
      )}
      {mode === "change" && (
        <form
          onSubmit={changePassword}
          className="panel-frost space-y-4 rounded-3xl p-5"
        >
          <p className="text-sm text-muted-foreground">
            Новый пароль для {accountEmail || "твоего аккаунта"}.
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
          <Button type="submit" disabled={busy} className="w-full">
            Сохранить новый пароль
          </Button>
        </form>
      )}
      {mode === "done" && (
        <p className="panel-frost rounded-3xl p-5 text-sm">
          Пароль обновлён. Теперь можно войти в Sportura.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Link
        to="/auth"
        className="mt-4 block text-center text-sm text-brand underline"
      >
        Вернуться ко входу
      </Link>
    </AppShell>
  );
}
