import { useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { ANALYTICS_CONSENT, trackEvent } from "@/lib/analytics";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const SETTINGS_EVENT = "sportura:analytics-settings";

export function AnalyticsSettingsButton() {
  const { tr } = useI18n();
  return (
    <button
      type="button"
      onClick={(event) =>
        window.dispatchEvent(
          new CustomEvent(SETTINGS_EVENT, { detail: event.currentTarget }),
        )
      }
    >
      {tr("Аналитика")}
    </button>
  );
}

export function AnalyticsConsent() {
  const { tr } = useI18n();
  const path = useLocation({ select: (l) => l.pathname });
  const [consent, setConsent] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const settingsTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ANALYTICS_CONSENT);
      setConsent(stored);
      setOpen(stored !== "yes" && stored !== "no");
    } catch {
      setConsent("no");
    }
    const showSettings = (event: Event) => {
      const trigger = (event as CustomEvent<unknown>).detail;
      settingsTrigger.current = trigger instanceof HTMLElement ? trigger : null;
      try {
        setConsent(localStorage.getItem(ANALYTICS_CONSENT));
      } catch {
        setConsent("no");
      }
      setOpen(true);
    };
    window.addEventListener(SETTINGS_EVENT, showSettings);
    return () => window.removeEventListener(SETTINGS_EVENT, showSettings);
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
        sessionStorage.removeItem("sportura.visit-time");
        sessionStorage.removeItem("sportura.source");
      }
    } catch {
      /* The dialog remains usable when browser storage is unavailable. */
    }
    setConsent(value);
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-lg"
        onCloseAutoFocus={(event) => {
          if (settingsTrigger.current?.isConnected) {
            event.preventDefault();
            settingsTrigger.current.focus({ preventScroll: true });
          }
          settingsTrigger.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle>{tr("Настройки аналитики")}</DialogTitle>
          <DialogDescription>
            {tr(
              "С вашего согласия учитываем посещения и действия без имени, почты и телефона. Выбор можно изменить через кнопку «Аналитика».",
            )}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {tr(
            consent === "yes"
              ? "Сейчас аналитика разрешена. Вы можете отключить её в любой момент."
              : "Сейчас аналитика отключена. Сайт работает и без неё.",
          )}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="feed-chip"
            onClick={() => choose("no")}
          >
            {tr("Без аналитики")}
          </button>
          <button
            type="button"
            className="workspace-primary-link"
            onClick={() => choose("yes")}
          >
            {tr("Разрешить")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
