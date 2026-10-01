import { recordAnalyticsEvent } from "./analytics.functions";
export const ANALYTICS_CONSENT = "sportura.analytics-consent";
export function trackEvent(
  event: "page_view" | "activity_view" | "register_click",
) {
  try {
    if (localStorage.getItem(ANALYTICS_CONSENT) !== "yes") return;
    let visitor = localStorage.getItem("sportura.visitor");
    if (!visitor) {
      visitor = crypto.randomUUID();
      localStorage.setItem("sportura.visitor", visitor);
    }
    let session = sessionStorage.getItem("sportura.visit");
    const last = Number(sessionStorage.getItem("sportura.visit-time") || 0);
    if (!session || Date.now() - last > 30 * 60 * 1000) {
      session = crypto.randomUUID();
      sessionStorage.setItem("sportura.visit", session);
      sessionStorage.removeItem("sportura.source");
    }
    sessionStorage.setItem("sportura.visit-time", String(Date.now()));
    let source = sessionStorage.getItem("sportura.source");
    if (!source) {
      const raw = (
        new URLSearchParams(location.search).get("utm_source") ||
        document.referrer ||
        ""
      ).toLowerCase();
      source = /instagram/.test(raw)
        ? "instagram"
        : /telegram|t\.me/.test(raw)
          ? "telegram"
          : /google|yandex|bing|duckduckgo/.test(raw)
            ? "search"
            : raw
              ? "other"
              : "direct";
      sessionStorage.setItem("sportura.source", source);
    }
    void recordAnalyticsEvent({
      data: {
        event,
        visitor_id: visitor,
        session_id: session,
        path: location.pathname,
        source,
        device: matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
      },
    }).then(
      () => {},
      () => {},
    );
  } catch {
    /* Analytics must never interrupt the application. */
  }
}
