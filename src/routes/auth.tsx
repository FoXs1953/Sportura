import { useI18n } from "@/lib/i18n";
import {
  createFileRoute,
  useNavigate,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getAuthCapabilities, signIn, signUp } from "@/lib/auth.functions";
import { AuthFrame } from "@/components/sportura/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export const Route = createFileRoute("/auth")({
  validateSearch: (
    s: {
      redirect?: string;
      confirmed?: unknown;
      mode?: unknown;
    } & SearchSchemaInput,
  ) => ({
    mode: s.mode === "signup" ? ("signup" as const) : undefined,
    confirmed: s.confirmed === 1 || s.confirmed === "1" ? true : undefined,
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
  const { tr } = useI18n();
  const navigate = useNavigate();
  const { redirect, confirmed, mode: initialMode } = Route.useSearch();
  const capabilities = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: () => getAuthCapabilities(),
  });
  const [mode, setMode] = useState<"signin" | "signup">(
    initialMode ?? "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailUnavailable = capabilities.data?.email === false;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp({ data: { email, password, name } });
        // Sign-in becomes possible only after the emailed link is opened.
        setSentTo(email.trim());
        setPassword("");
        setMode("signin");
        return;
      }
      await signIn({ data: { email, password } });
      // Full reload so every query starts with the new session cookie.
      window.location.assign(redirect);
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
      toast.error(tr(message));
    } finally {
      setBusy(false);
    }
  }
  function google() {
    setBusy(true);
    window.location.assign(
      `/api/auth/google?redirect=${encodeURIComponent(redirect)}`,
    );
  }
  return (
    <AuthFrame
      title={tr(mode === "signin" ? "Вход" : "Регистрация")}
      subtitle={tr("Играйте, записывайтесь и создавайте игры")}
    >
      <form onSubmit={submit} className="space-y-5">
        {sentTo ? (
          <p role="status" className="text-sm text-muted-foreground">
            {tr(
              "Мы отправили ссылку для подтверждения на {email}. Откройте её, затем войдите.",
              { email: sentTo },
            )}
          </p>
        ) : confirmed && mode === "signin" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {tr("E-mail подтверждён. Теперь войдите в аккаунт.")}
          </p>
        ) : null}
        {mode === "signup" ? (
          <div className="space-y-2">
            <Label htmlFor="name">{tr("Имя")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("Ваше имя")}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">{tr("E-mail")}</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tr("you@mail.kz")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{tr("Пароль")}</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            data-1p-ignore
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {mode === "signup" && (
          <p role="status" className="text-sm text-muted-foreground">
            {tr(
              emailUnavailable
                ? "Регистрация по e-mail пока недоступна. Попробуйте позже."
                : "На почту придёт письмо со ссылкой для подтверждения адреса.",
            )}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || (mode === "signup" && emailUnavailable)}
          className="press w-full"
        >
          {tr(mode === "signin" ? "Войти" : "Создать аккаунт")}
        </Button>
        {mode === "signin" && (
          <Link
            to="/forgot-password"
            className="block text-center text-sm text-brand underline"
          >
            {tr("Забыли пароль?")}
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
            {tr("Продолжить с Google")}
          </Button>
        )}
        <button
          type="button"
          className="auth-switch w-full text-center text-sm"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {tr(
            mode === "signin"
              ? "Нет аккаунта? Зарегистрируйтесь"
              : "Уже есть аккаунт? Войти",
          )}
        </button>
      </form>

      <p className="auth-bottom-note text-center text-xs text-muted-foreground">
        {tr("Продолжая, вы принимаете")}
        {tr(" ")}
        <Link to="/legal" className="text-brand underline">
          {tr("правила и политики платформы")}
        </Link>
        .
      </p>
    </AuthFrame>
  );
}
