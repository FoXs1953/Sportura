import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarCheck, Compass, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import "@/styles/feed.css";

const navigation = [
  { to: "/", label: "Лента", icon: Compass },
  { to: "/my-games", label: "Мои игры", icon: CalendarCheck },
  { to: "/host", label: "Организатор", icon: ShieldCheck },
  { to: "/profile", label: "Профиль", icon: UserRound },
] as const;

export function FeedShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  return (
    <div className="feed-shell">
      <a className="feed-skip-link" href="#feed-content">
        К содержимому
      </a>
      <header className="feed-header">
        <div className="feed-header-inner">
          <Link
            to="/"
            className="feed-wordmark"
            aria-label="Sportura — главная"
          >
            <span className="feed-brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            SPORTURA<span className="feed-wordmark-dot">.</span>
          </Link>
          <nav className="feed-navigation" aria-label="Основная навигация">
            {navigation.map(({ to, label, icon: Icon }) => {
              const active =
                to === "/"
                  ? pathname === "/"
                  : to === "/host"
                    ? pathname.startsWith("/host") ||
                      pathname.startsWith("/organizer/")
                    : to === "/profile"
                      ? pathname.startsWith("/profile") ||
                        pathname.startsWith("/admin")
                      : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={active ? "is-active" : ""}
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <span className="feed-header-note">Место встречи — спорт</span>
        </div>
      </header>
      <main className="feed-main" id="feed-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="feed-footer">
        <span>Sportura · Игра начинается с тебя</span>
        <Link to="/legal">Правила и документы</Link>
      </footer>
    </div>
  );
}
