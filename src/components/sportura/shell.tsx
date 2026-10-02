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
  const pageLayout = layout ?? (workspace ? "wide" : "standard");

  return (
    <FeedShell>
      <div className={`sportura-page sportura-page-${pageLayout}`}>
        {(title || subtitle || action) && (
          <section
            className="feed-intro"
            aria-label={title ?? "Раздел Sportura"}
          >
            <div>
              {showBrandBadge && (
                <span className="feed-location">
                  <BrandMark size={18} /> Sportura
                </span>
              )}
              {title && (
                <h1>
                  {title}
                  <span className="feed-title-dot">.</span>
                </h1>
              )}
              {subtitle && <p>{subtitle}</p>}
            </div>
            {action}
          </section>
        )}
        {children}
      </div>
    </FeedShell>
  );
}
