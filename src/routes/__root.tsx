import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "../components/ui/sonner";
import { AppShell } from "../components/sportura/shell";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <AppShell
      title="Страница не найдена"
      subtitle="Возможно, адрес изменился"
      layout="compact"
    >
      <div className="workspace-panel workspace-empty">
        <span className="workspace-overline">Ошибка 404</span>
        <p>Вернитесь в ленту и найдите подходящую игру.</p>
        <Link to="/" className="workspace-primary-link">
          Смотреть игры
        </Link>
      </div>
    </AppShell>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <AppShell
      title="Страница не загрузилась"
      subtitle="Попробуйте ещё раз или вернитесь в ленту"
      layout="compact"
    >
      <div className="workspace-panel workspace-empty">
        <p>
          Не удалось открыть страницу. Если ошибка повторится, попробуйте позже.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="workspace-primary-link"
          >
            Повторить
          </button>
          <Link to="/" className="feed-chip">
            К ленте
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Sportura — спорт в Астане" },
        {
          name: "description",
          content:
            "Игровые слоты и турниры по футболу, баскетболу и волейболу в Астане.",
        },
        { property: "og:title", content: "Sportura — спорт в Астане" },
        {
          property: "og:description",
          content: "Находите игры рядом, записывайтесь и играйте.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "theme-color", content: "#111617" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "mobile-web-app-capable", content: "yes" },
        {
          name: "apple-mobile-web-app-status-bar-style",
          content: "black-translucent",
        },
        { name: "apple-mobile-web-app-title", content: "Sportura" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Unbounded:wght@500;600;700&display=swap",
        },
        { rel: "icon", href: "/favicon.png", type: "image/png" },
        {
          rel: "apple-touch-icon",
          href: "/apple-touch-icon.png",
          sizes: "180x180",
        },
        { rel: "manifest", href: "/manifest.webmanifest" },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Some auth configurations redirect to the site root instead of the requested path.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (
      hash.get("type") === "recovery" &&
      window.location.pathname !== "/reset-password"
    ) {
      window.location.replace(`/reset-password${window.location.hash}`);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
