import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarCheck,
  CompassIcon,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const TABS = [
  { to: "/", label: "Лента", icon: CompassIcon },
  { to: "/my-games", label: "Мои игры", icon: CalendarCheck },
  { to: "/host", label: "Организатор", icon: ShieldCheck },
  { to: "/profile", label: "Профиль", icon: UserRound },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  action,
  workspace = false,
}: {
  children: ReactNode;
  title?: string | undefined;
  subtitle?: string | undefined;
  action?: ReactNode | undefined;
  workspace?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scrollRef = useRef<HTMLElement | null>(null);
  const lastScrollY = useRef(0);
  const [headerHidden, setHeaderHidden] = useState(false);

  // New page always opens scrolled to the top of the content area.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setHeaderHidden(false);
    lastScrollY.current = 0;
  }, [pathname]);

  // Hide header while scrolling down, bring it back when scrolling up.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const y = el.scrollTop;
    const delta = y - lastScrollY.current;
    if (Math.abs(delta) > 4) {
      if (delta > 0 && y > 48) setHeaderHidden(true);
      else if (delta < 0) setHeaderHidden(false);
    }
    lastScrollY.current = y;
  };

  if (workspace) {
    return (
      <div className="workspace-shell">
        <a className="workspace-skip" href="#workspace-content">
          К содержимому
        </a>
        <header className="workspace-header">
          <div className="workspace-header-inner">
            <Link
              to="/"
              className="workspace-brand"
              aria-label="Sportura — на главную"
            >
              <span className="workspace-brand-mark" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Sportura<span className="workspace-brand-dot">.</span>
            </Link>
            <nav
              className="workspace-desktop-nav"
              aria-label="Основная навигация"
            >
              {TABS.map((tab) => {
                const active =
                  tab.to === "/"
                    ? pathname === "/"
                    : pathname.startsWith(tab.to);
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    aria-current={active ? "page" : undefined}
                    className={active ? "is-active" : ""}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
        <main
          id="workspace-content"
          ref={scrollRef}
          onScroll={handleScroll}
          className="workspace-scroll"
          tabIndex={-1}
        >
          <div className="workspace-main">
            {(title || subtitle || action) && (
              <div className="workspace-page-heading">
                <div>
                  <p className="workspace-eyebrow">
                    Sportura / {title ?? "Кабинет"}
                  </p>
                  {title && <h1>{title}</h1>}
                  {subtitle && <p className="workspace-subtitle">{subtitle}</p>}
                </div>
                {action}
              </div>
            )}
            {children}
          </div>
        </main>
        <nav className="workspace-mobile-nav" aria-label="Основная навигация">
          {TABS.map((tab) => {
            const active =
              tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={active ? "is-active" : ""}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.4 : 1.8}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[520px] flex-col overflow-hidden">
      <header
        className={`fixed top-0 left-1/2 z-50 w-full max-w-[520px] -translate-x-1/2 panel-frost px-4 pt-5 pb-4 transition-transform duration-300 ease-out ${
          headerHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              to="/"
              className="font-display text-sm tracking-[0.18em] text-brand uppercase"
            >
              Sportura
            </Link>
            {title ? (
              <h1 className="mt-1 text-2xl leading-tight font-semibold">
                {title}
              </h1>
            ) : null}
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </div>
      </header>

      <main
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-dvh overflow-y-auto px-4 pt-36 pb-28"
      >
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[520px] -translate-x-1/2 panel-frost-2 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <ul className="grid grid-cols-4">
          {TABS.map((tab) => {
            const active =
              tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  className={`press flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] ${
                    active ? "text-brand" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
