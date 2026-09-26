import { z } from "zod";
import type { PublicActivity } from "./activities.functions";

export const feedSearchSchema = z.object({
  sport: z.string().catch("all").default("all"),
  type: z
    .enum(["all", "daily_game", "tournament", "league"])
    .catch("all")
    .default("all"),
  date: z.enum(["all", "today", "week", "weekend"]).catch("all").default("all"),
  q: z.string().max(200).catch("").default(""),
  free: z.boolean().catch(false).default(false),
  open: z.boolean().catch(false).default(false),
  sort: z
    .enum(["available", "date", "price", "personal"])
    .catch("available")
    .default("available"),
});

export type FeedFilters = z.infer<typeof feedSearchSchema>;
export const defaultFeedFilters = feedSearchSchema.parse({});

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Almaty",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY = 86_400_000;

function localDay(date: Date): number {
  const parts = dayFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

export function isRegistrationOpen(activity: PublicActivity): boolean {
  return (
    (activity.status === "open" || activity.status === "nearly_full") &&
    activity.registered_count < activity.max_participants
  );
}

export function filterFeed(
  activities: PublicActivity[],
  filters: FeedFilters,
  now = new Date(),
): PublicActivity[] {
  const today = localDay(now);
  const weekday = new Date(today).getUTCDay();
  const weekend = today + (weekday === 0 ? -1 : (6 - weekday + 7) % 7) * DAY;
  const search = filters.q.trim().toLocaleLowerCase("ru");
  const results = activities.filter((activity) => {
    if (filters.type !== "all" && activity.type !== filters.type) return false;
    if (filters.sport !== "all" && activity.sport !== filters.sport)
      return false;
    if (filters.free && !activity.is_free) return false;
    if (filters.open && !isRegistrationOpen(activity)) return false;
    if (
      search &&
      ![
        activity.title,
        activity.location_text,
        activity.sport,
        activity.host_name,
      ].some((text) => text.toLocaleLowerCase("ru").includes(search))
    )
      return false;
    if (filters.date !== "all") {
      if (!activity.date_time) return false;
      const date = new Date(activity.date_time);
      if (Number.isNaN(date.getTime())) return false;
      const day = localDay(date);
      if (day < today) return false;
      if (filters.date === "today" && day !== today) return false;
      if (filters.date === "week" && day >= today + 7 * DAY) return false;
      if (filters.date === "weekend" && (day < weekend || day > weekend + DAY))
        return false;
    }
    return true;
  });

  const timestamp = (a: PublicActivity) =>
    a.date_time ? new Date(a.date_time).getTime() : Infinity;
  return results.sort((a, b) => {
    if (filters.sort === "price") {
      const price = (item: PublicActivity) =>
        item.is_free ? 0 : (item.entry_fee ?? Infinity);
      return price(a) - price(b) || 0;
    }
    if (filters.sort === "date") return timestamp(a) - timestamp(b) || 0;
    return Number(isRegistrationOpen(b)) - Number(isRegistrationOpen(a));
  });
}

export function eventCountLabel(count: number): string {
  const rule = new Intl.PluralRules("ru").select(count);
  return `${count} ${rule === "one" ? "событие" : rule === "few" ? "события" : "событий"}`;
}
