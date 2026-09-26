import {
  createFileRoute,
  useNavigate,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getAuthCapabilities } from "@/lib/profile.functions";
import { AuthFrame } from "@/components/sportura/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: { redirect?: string } & SearchSchemaInput) => ({
    redirect:
      typeof s.redirect === "string" &&
      s.redirect.startsWith("/") &&
      !s.redirect.startsWith("//") &&
      !s.redirect.includes("\\")
        ? s.redirect
        : "/",
  }),
  head: () => ({
    meta: [
      { title: "Вход — Sportura" },
      {
        name: "description",
        content: "Войдите или зарегистрируйтесь, чтобы записываться на игры.",
      },
      { property: "og:title", content: "Вход — Sportura" },
      {
        property: "og:description",
        content: "Вход и регистрация участников Sportura.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const capabilities = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: () => getAuthCapabilities(),
  });
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
          toast.success(
            "Мы отправили письмо для подтверждения. Проверьте почту.",
          );
          return;
        }
        window.location.assign(redirect);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.assign(redirect);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const low = raw.toLowerCase();
      let message = raw || "Не удалось выполнить вход";
      if (
        low.includes("pwned") ||
        low.includes("compromised") ||
        low.includes("leak")
      ) {
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
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${redirect}` },
      });
      if (error) throw error;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось войти через Google",
      );
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={mode === "signin" ? "Вход" : "Регистрация"}
      subtitle="Играйте, записывайтесь и создавайте игры"
    >
      <form onSubmit={submit} className="space-y-5">
        {mode === "signup" ? (
          <div className="space-y-2">
            <Label htmlFor="name">Имя</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
            />
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
          <Link
            to="/forgot-password"
            className="block text-center text-sm text-brand underline"
          >
            Забыли пароль?
          </Link>
        )}
        {capabilities.data?.google && (
          <Button
            disabled={busy}
            type="button"
            variant="secondary"
            className="press w-full"
            onClick={google}
          >
            Продолжить с Google
          </Button>
        )}
        <button
          type="button"
          className="auth-switch w-full text-center text-sm"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin"
            ? "Нет аккаунта? Зарегистрируйтесь"
            : "Уже есть аккаунт? Войти"}
        </button>
      </form>

      <p className="auth-bottom-note text-center text-xs text-muted-foreground">
        Продолжая, вы принимаете{" "}
        <Link to="/legal" className="text-brand underline">
          правила и политики платформы
        </Link>
        .
      </p>
    </AuthFrame>
  );
}
