import { AnalyticsConsent } from "@/components/analytics/consent";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import { Toaster } from "../components/ui/sonner";
import { AppShell } from "../components/sportura/shell";
import { themeScript } from "@/lib/theme";
import appCss from "../styles.css?url";

function brandImageUrl() {
  const origin = import.meta.env.SSR
    ? process.env["APP_URL"] || "https://sportura.vercel.app"
    : window.location.origin;
  return new URL("/icons/sportura-s-512.png", origin).href;
}

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
        { property: "og:image", content: brandImageUrl() },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "512" },
        { property: "og:image:height", content: "512" },
        {
          property: "og:image:alt",
          content: "Иконка Sportura: синяя буква S",
        },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:image", content: brandImageUrl() },
        {
          name: "twitter:image:alt",
          content: "Иконка Sportura: синяя буква S",
        },
        { name: "theme-color", content: "#ffffff" },
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
        {
          rel: "icon",
          href: "/favicon.ico?v=s-motion",
          type: "image/x-icon",
          sizes: "16x16 32x32 48x48",
        },
        {
          rel: "icon",
          href: "/icons/sportura-favicon-32.png",
          type: "image/png",
          sizes: "32x32",
        },
        {
          rel: "apple-touch-icon",
          href: "/icons/sportura-apple-touch-180.png",
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
    <html lang="ru" className="light" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet />
      <AnalyticsConsent /> breaks all child routes. */}
      <Outlet />
      <AnalyticsConsent />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
