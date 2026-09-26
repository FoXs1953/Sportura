import { type ReactNode } from "react";
import { Compass } from "lucide-react";
import { FeedShell } from "@/components/sportura/feed-shell";

type PageLayout = "wide" | "standard" | "compact";

export function AppShell({
  children,
  title,
  subtitle,
  action,
  workspace = false,
  layout,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  workspace?: boolean;
  layout?: PageLayout;
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
              <span className="feed-location">
                <Compass size={14} aria-hidden="true" /> Sportura
              </span>
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
