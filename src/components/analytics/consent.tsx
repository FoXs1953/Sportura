import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { ANALYTICS_CONSENT, trackEvent } from "@/lib/analytics";
// Hidden for now: the floating toggle overlaps the bottom nav's profile tab.
const SHOW_CONSENT_TOGGLE = false;
export function AnalyticsConsent() {
  const { tr } = useI18n();
  const path = useLocation({ select: (l) => l.pathname });
  const [consent, setConsent] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    try {
      setConsent(localStorage.getItem(ANALYTICS_CONSENT));
    } catch {
      setConsent("no");
    }
  }, []);
  useEffect(() => {
    if (consent === "yes") {
      trackEvent("page_view");
      if (path.startsWith("/activity/")) trackEvent("activity_view");
    }
  }, [path, consent]);
  const choose = (value: string) => {
    try {
      localStorage.setItem(ANALYTICS_CONSENT, value);
      if (value === "no") {
        localStorage.removeItem("sportura.visitor");
        sessionStorage.removeItem("sportura.visit");
      }
    } catch {}
    setConsent(value);
  };
  return (
    <>
      {consent === null ? (
        <section
          aria-label={tr("Настройки аналитики")}
          className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-2xl border border-white/15 bg-zinc-950 p-5 shadow-xl"
        >
          <h2 className="font-semibold">{tr("Поможете улучшить Sportura?")}</h2>
          <p className="my-3 text-sm text-zinc-400">
            {tr(
              "С вашего согласия учитываем посещения и действия без имени, почты и телефона. Выбор можно изменить через кнопку «Аналитика».",
            )}
          </p>
          <div className="flex gap-3">
            <button className="feed-chip" onClick={() => choose("no")}>
              {tr("Без аналитики")}
            </button>
            <button
              className="workspace-primary-link"
              onClick={() => choose("yes")}
            >
              {tr("Разрешить")}
            </button>
          </div>
        </section>
      ) : SHOW_CONSENT_TOGGLE && consent !== undefined ? (
        <button
          className="fixed bottom-1 right-2 z-40 rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-400"
          onClick={() => setConsent(null)}
        >
          {tr("Аналитика")}
        </button>
      ) : null}
    </>
  );
}
