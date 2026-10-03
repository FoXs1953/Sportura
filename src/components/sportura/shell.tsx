import { useI18n } from "@/lib/i18n";
import { type ReactNode } from "react";
import { FeedShell } from "@/components/sportura/feed-shell";
import { BrandMark } from "@/components/sportura/brand-mark";
type PageLayout = "wide" | "standard" | "compact" | "admin";
export function AppShell({
  children,
  title,
  subtitle,
  action,
  workspace = false,
  layout,
  showBrandBadge = true,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  workspace?: boolean;
  layout?: PageLayout;
  showBrandBadge?: boolean;
}) {
  const { tr } = useI18n();
  const pageLayout = layout ?? (workspace ? "wide" : "standard");
  return (
    <FeedShell>
      <div className={`sportura-page sportura-page-${pageLayout}`}>
        {tr(
          (title || subtitle || action) && (
            <section
              className="feed-intro"
              aria-label={tr(title ?? "Раздел Sportura")}
            >
              <div>
                {showBrandBadge && (
                  <span className="feed-location">
                    <BrandMark size={18} /> Sportura
                  </span>
                )}
                {tr(
                  title && (
                    <h1>
                      {tr(title)}
                      {!/[.!?…]$/.test(tr(title).trimEnd()) && (
                        <span className="feed-title-dot" aria-hidden="true">
                          .
                        </span>
                      )}
                    </h1>
                  ),
                )}
                {tr(subtitle && <p>{tr(subtitle)}</p>)}
              </div>
              {tr(action)}
            </section>
          ),
        )}
        {tr(children)}
      </div>
    </FeedShell>
  );
}
