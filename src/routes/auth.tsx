import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход — Sportura" },
      { name: "description", content: "Войдите или зарегистрируйтесь, чтобы записываться на игры." },
      { property: "og:title", content: "Вход — Sportura" },
      { property: "og:description", content: "Вход и регистрация участников Sportura." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { name: name || "Игрок" },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Мы отправили письмо для подтверждения. Проверьте почту.");
          return;
        }
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const low = raw.toLowerCase();
      let message = raw || "Не удалось выполнить вход";
      if (low.includes("pwned") || low.includes("compromised") || low.includes("leak")) {
        message = "Этот пароль уже утёк в интернет. Придумайте другой.";
      } else if (low.includes("weak")) {
        message = "Пароль должен быть не короче 6 символов.";
      } else if (low.includes("invalid login")) {
        message = "Неверный e-mail или пароль.";
      } else if (low.includes("already registered")) {
        message = "Такой e-mail уже зарегистрирован. Войдите.";
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Не удалось войти через Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <AppShell
      title={mode === "signin" ? "Вход" : "Регистрация"}
      subtitle="Играйте, записывайтесь и создавайте игры"
    >
      <form onSubmit={submit} className="panel-frost space-y-4 rounded-3xl p-5">
        {mode === "signup" ? (
          <div className="space-y-2">
            <Label htmlFor="name">Имя</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@mail.kz"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "off"}
            data-1p-ignore
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy} className="press w-full">
          {mode === "signin" ? "Войти" : "Создать аккаунт"}
        </Button>
        {mode === "signin" && (
          <Link to="/forgot-password" className="block text-center text-sm text-brand underline">
            Забыли пароль?
          </Link>
        )}
        <Button type="button" variant="secondary" className="press w-full" onClick={google}>
          Продолжить с Google
        </Button>
        <button
          type="button"
          className="w-full text-center text-sm text-muted-foreground"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Нет аккаунта? Зарегистрируйтесь" : "Уже есть аккаунт? Войти"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Продолжая, вы принимаете{" "}
        <Link to="/legal" className="text-brand underline">
          правила и политики платформы
        </Link>
        .
      </p>
    </AppShell>
  );
}
