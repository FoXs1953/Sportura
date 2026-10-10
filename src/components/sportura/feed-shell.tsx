import { useI18n } from "@/lib/i18n";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarCheck,
  Compass,
  LogIn,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useSessionUser } from "@/lib/use-session";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-toggle";
import { BrandMark } from "./brand-mark";
import { AnalyticsSettingsButton } from "@/components/analytics/consent";
import "@/styles/feed.css";
const navigation = [
  { to: "/", label: "Лента", icon: Compass },
  { to: "/my-games", label: "Мои игры", icon: CalendarCheck },
  { to: "/host", label: "Организатор", icon: ShieldCheck },
  { to: "/profile", label: "Профиль", icon: UserRound },
] as const;
export function FeedShell({ children }: { children: ReactNode }) {
  const { tr } = useI18n();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // Shown only once the session is known to be absent, so signed-in users never see a flash.
  const session = useSessionUser();
  return (
    <div className="feed-shell">
      <a className="feed-skip-link" href="#feed-content">
        {tr("К содержимому")}
      </a>
      <header className="feed-header">
        <div className="feed-header-inner">
          <Link
            to="/"
            className="feed-wordmark"
            aria-label={tr("Sportura — главная")}
          >
            <BrandMark className="feed-brand-mark" />
            SPORTURA<span className="feed-wordmark-dot">.</span>
          </Link>
          <nav
            className="feed-navigation"
            aria-label={tr("Основная навигация")}
          >
            {navigation.map(({ to, label, icon: Icon }) => {
              const active =
                to === "/"
                  ? pathname === "/"
                  : to === "/host"
                    ? pathname.startsWith("/host") ||
                      pathname.startsWith("/organizer/") ||
                      pathname === "/for-organizers"
                    : to === "/profile"
                      ? pathname.startsWith("/profile") ||
                        pathname.startsWith("/admin")
                      : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={
                    to === "/host" && session.data === null
                      ? "/for-organizers"
                      : to
                  }
                  aria-current={active ? "page" : undefined}
                  className={active ? "is-active" : ""}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{tr(label)}</span>
                </Link>
              );
            })}
          </nav>
          <div className="feed-header-actions">
            <LanguageToggle />
            <ThemeToggle />
            {session.data && (
              <Link
                to="/profile"
                className="feed-account-link"
                aria-label={tr("Перейти в профиль")}
                title={tr("Перейти в профиль")}
                aria-current={
                  pathname.startsWith("/profile") ? "page" : undefined
                }
              >
                <span className="feed-account-icon" aria-hidden="true">
                  <UserRound size={19} />
                  <span className="feed-account-status" />
                </span>
                <span className="feed-account-label">{tr("Профиль")}</span>
              </Link>
            )}
            {session.data === null && (
              <div className="feed-auth-actions">
                <Link
                  to="/auth"
                  className="feed-chip feed-auth-signin"
                  aria-label={tr("Войти")}
                >
                  <LogIn size={18} aria-hidden="true" />
                  <span>{tr("Войти")}</span>
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="feed-primary feed-auth-signup"
                >
                  {tr("Регистрация")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="feed-main" id="feed-content" tabIndex={-1}>
        {tr(children)}
      </main>
      <footer className="feed-footer">
        <span>{tr("Sportura · Игра начинается с тебя")}</span>
        <nav
          className="feed-footer-links"
          aria-label={tr("Помощь и настройки")}
        >
          <Link to="/help">{tr("Помощь")}</Link>
          <Link to="/for-organizers">{tr("Организаторам")}</Link>
          <Link to="/game-alerts">{tr("Новые игры")}</Link>
          <Link to="/legal">{tr("Правила и документы")}</Link>
          <AnalyticsSettingsButton />
        </nav>
      </footer>
    </div>
  );
}
