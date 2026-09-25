import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import { ActivityCard } from "@/components/sportura/activity-card";
import { ContentBlocks } from "@/components/sportura/content-blocks";
import { listActivities, type ActivityFilters } from "@/lib/activities.functions";
import { getSiteContent } from "@/lib/cms.functions";

const feedQuery = queryOptions({
  queryKey: ["activities", "feed"],
  queryFn: () => listActivities({ data: {} }),
});

const siteQuery = queryOptions({
  queryKey: ["site", "home"],
  queryFn: () => getSiteContent({ data: { page: "home" } }),
});

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(feedQuery),
      context.queryClient.ensureQueryData(siteQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Sportura — игры и турниры в Астане" },
      {
        name: "description",
        content:
          "Находите ежедневные игровые слоты и турниры по футболу, баскетболу и волейболу в Астане. Запись в пару касаний.",
      },
      { property: "og:title", content: "Sportura — игры и турниры в Астане" },
      {
        property: "og:description",
        content: "Ежедневные игровые слоты и соревнования. Записывайтесь и играйте.",
      },
    ],
  }),
  component: Feed,
});

type TypeFilter = ActivityFilters["type"];
type DateFilter = ActivityFilters["date"];

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
        active ? "bg-brand text-primary-foreground" : "panel-frost-2 text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Feed() {
  const { data: all } = useSuspenseQuery(feedQuery);
  const { data: site } = useSuspenseQuery(siteQuery);
  const [type, setType] = useState<TypeFilter>("all");
  const [sport, setSport] = useState("all");
  const [date, setDate] = useState<DateFilter>("all");
  const [freeOnly, setFreeOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");

  const now = Date.now();
  const list = all.filter((a) => {
    if (type !== "all" && a.type !== type) return false;
    if (sport !== "all" && a.sport !== sport) return false;
    if (freeOnly && !a.is_free) return false;
    if (openOnly && (a.status === "full" || a.status === "cancelled" || a.status === "completed"))
      return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !a.title.toLowerCase().includes(q) &&
        !a.location_text.toLowerCase().includes(q) &&
        !a.sport.toLowerCase().includes(q)
      )
        return false;
    }
    if (date !== "all" && a.date_time) {
      const t = new Date(a.date_time).getTime();
      if (date === "today" && t > now + 24 * 3600_000) return false;
      if (date === "week" && t > now + 7 * 24 * 3600_000) return false;
      if (date === "weekend") {
        const day = new Date(a.date_time).getDay();
        if (day !== 0 && day !== 6) return false;
      }
    }
    return true;
  });

  return (
    <AppShell title="Игры рядом" subtitle={`${site.general.default_city} · сегодня и дальше`}>
      {site.general.maintenance_mode ? (
        <p className="mb-3 rounded-2xl bg-destructive/15 px-4 py-3 text-sm">
          {site.general.maintenance_message}
        </p>
      ) : null}
      {site.general.announcement_enabled && site.general.announcement ? (
        <p className="mb-3 rounded-2xl bg-brand/15 px-4 py-3 text-sm">{site.general.announcement}</p>
      ) : null}

      <div className="mb-4">
        <ContentBlocks blocks={site.blocks} />
      </div>

      <div className="space-y-3">
        <label className="panel-frost flex items-center gap-2 rounded-2xl px-3 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: зал, вид спорта, название"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={type === "all"} onClick={() => setType("all")}>
            Все
          </Chip>
          <Chip active={type === "daily_game"} onClick={() => setType("daily_game")}>
            Игровые слоты
          </Chip>
          <Chip active={type === "tournament"} onClick={() => setType("tournament")}>
            Турниры
          </Chip>
          <Chip active={type === "league"} onClick={() => setType("league")}>
            Лиги
          </Chip>
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={sport === "all"} onClick={() => setSport("all")}>
            Любой спорт
          </Chip>
          {site.catalog.sports.map((s) => (
            <Chip key={s} active={sport === s} onClick={() => setSport(s)}>
              {s}
            </Chip>
          ))}
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <Chip active={date === "today"} onClick={() => setDate(date === "today" ? "all" : "today")}>
            Сегодня
          </Chip>
          <Chip active={date === "week"} onClick={() => setDate(date === "week" ? "all" : "week")}>
            Неделя
          </Chip>
          <Chip
            active={date === "weekend"}
            onClick={() => setDate(date === "weekend" ? "all" : "weekend")}
          >
            Выходные
          </Chip>
          <Chip active={freeOnly} onClick={() => setFreeOnly((v) => !v)}>
            Бесплатно
          </Chip>
          <Chip active={openOnly} onClick={() => setOpenOnly((v) => !v)}>
            Есть места
          </Chip>
        </div>
      </div>

      <Link
        to="/join"
        className="press panel-frost-2 mt-3 block rounded-2xl px-4 py-3 text-xs text-muted-foreground"
      >
        Есть код приглашения на закрытую игру? <span className="text-brand">Войти по коду</span>
      </Link>

      <div className="mt-5 space-y-4">
        {list.length === 0 ? (
          <p className="panel-frost rounded-2xl p-6 text-center text-sm text-muted-foreground">
            Ничего не нашлось. Попробуйте изменить фильтры.
          </p>
        ) : (
          list.map((a) => <ActivityCard key={a.id} activity={a} />)
        )}
      </div>
    </AppShell>
  );
}
