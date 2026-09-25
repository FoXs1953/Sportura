import {
  createFileRoute,
  Link,
  useRouter,
  stripSearchParams,
  type ErrorComponentProps,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  MapPin,
  Search,
  SlidersHorizontal,
  Ticket,
  X,
} from "lucide-react";
import { FeedShell } from "@/components/sportura/feed-shell";
import { ActivityCard } from "@/components/sportura/activity-card";
import { ContentBlocks } from "@/components/sportura/content-blocks";
import { listActivities } from "@/lib/activities.functions";
import { getSiteContent } from "@/lib/cms.functions";
import {
  defaultFeedFilters,
  eventCountLabel,
  feedSearchSchema,
  filterFeed,
  type FeedFilters,
} from "@/lib/feed-filters";

const feedQuery = queryOptions({
  queryKey: ["activities", "feed"],
  queryFn: () => listActivities({ data: {} }),
});
const siteQuery = queryOptions({
  queryKey: ["site", "home"],
  queryFn: () => getSiteContent({ data: { page: "home" } }),
});

export const Route = createFileRoute("/")({
  validateSearch: (search: Partial<FeedFilters> & SearchSchemaInput) =>
    feedSearchSchema.parse(search),
  search: { middlewares: [stripSearchParams(defaultFeedFilters)] },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(feedQuery),
      context.queryClient.ensureQueryData(siteQuery),
    ]);
    return { now: new Date().toISOString() };
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
        content:
          "Ежедневные игровые слоты и соревнования. Записывайтесь и играйте.",
      },
    ],
  }),
  component: Feed,
  pendingMs: 200,
  pendingComponent: FeedLoading,
  errorComponent: FeedError,
});

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`feed-chip ${active ? "is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Feed() {
  const { data: activities } = useSuspenseQuery(feedQuery);
  const { data: site } = useSuspenseQuery(siteQuery);
  const { now } = Route.useLoaderData();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const [expanded, setExpanded] = useState(false);
  const setFilters = (patch: Partial<FeedFilters>) => {
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
  };
  const resetFilters = () => setFilters(defaultFeedFilters);
  const extraCount =
    Number(filters.date !== "all") +
    Number(filters.free) +
    Number(filters.open);
  const hasFilters =
    extraCount > 0 ||
    filters.sport !== "all" ||
    filters.type !== "all" ||
    !!filters.q;
  const list = filterFeed(activities, filters, new Date(now));
  const sports = [
    ...new Set([
      ...site.catalog.sports,
      ...activities.map((activity) => activity.sport),
    ]),
  ];

  return (
    <FeedShell>
      <section className="feed-intro" aria-labelledby="feed-title">
        <div>
          <span className="feed-location">
            <MapPin size={14} aria-hidden="true" />
            {site.general.default_city}
          </span>
          <h1 id="feed-title">
            Игры рядом<span className="feed-title-dot">.</span>
          </h1>
          <p>Находи свою команду. Выходи на площадку.</p>
        </div>
        <Link to="/join" className="feed-invite">
          <span className="feed-invite-icon">
            <Ticket size={22} aria-hidden="true" />
          </span>
          <span>
            <strong>Есть своя команда?</strong>
            <span>Войти в игру по коду</span>
          </span>
          <ArrowRight size={19} aria-hidden="true" />
        </Link>
      </section>

      {site.general.maintenance_mode && (
        <p className="feed-notice" role="status">
          {site.general.maintenance_message}
        </p>
      )}
      {site.general.announcement_enabled && site.general.announcement && (
        <p className="feed-notice">{site.general.announcement}</p>
      )}
      {site.blocks.length > 0 && (
        <div className="feed-cms">
          <ContentBlocks blocks={site.blocks} />
        </div>
      )}

      <section className="feed-discovery" aria-label="Поиск и фильтры событий">
        <div className="feed-search-row">
          <div className="feed-search">
            <Search size={20} aria-hidden="true" />
            <label className="sr-only" htmlFor="feed-search">
              Поиск по названию, площадке, спорту или организатору
            </label>
            <input
              id="feed-search"
              name="q"
              type="search"
              autoComplete="off"
              value={filters.q}
              maxLength={200}
              onChange={(event) => setFilters({ q: event.target.value })}
              placeholder="Найти игру, площадку или команду…"
            />
            {filters.q && (
              <button
                type="button"
                className="feed-clear"
                onClick={() => setFilters({ q: "" })}
                aria-label="Очистить поиск"
              >
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="button"
            className={`feed-filter-toggle ${expanded || extraCount ? "is-active" : ""}`}
            aria-expanded={expanded}
            aria-controls="feed-extra-filters"
            onClick={() => setExpanded((value) => !value)}
          >
            <SlidersHorizontal size={19} aria-hidden="true" />
            <span>Фильтры</span>
            {extraCount > 0 && <b>{extraCount}</b>}
          </button>
        </div>
        <div className="feed-sports" role="group" aria-label="Вид спорта">
          <FilterButton
            active={filters.sport === "all"}
            onClick={() => setFilters({ sport: "all" })}
          >
            Все виды спорта
          </FilterButton>
          {sports.map((sport) => (
            <FilterButton
              key={sport}
              active={filters.sport === sport}
              onClick={() => setFilters({ sport })}
            >
              {sport}
            </FilterButton>
          ))}
        </div>
        <div
          id="feed-extra-filters"
          className="feed-extra-filters"
          hidden={!expanded}
        >
          <fieldset>
            <legend>Когда играем</legend>
            <div className="feed-date-options">
              {(
                [
                  ["all", "Любая дата"],
                  ["today", "Сегодня"],
                  ["week", "На неделе"],
                  ["weekend", "В выходные"],
                ] as const
              ).map(([date, label]) => (
                <FilterButton
                  key={date}
                  active={filters.date === date}
                  onClick={() => setFilters({ date })}
                >
                  {label}
                </FilterButton>
              ))}
            </div>
          </fieldset>
          <div className="feed-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={filters.free}
                onChange={(event) => setFilters({ free: event.target.checked })}
              />
              <span className="feed-check">
                <Check size={13} aria-hidden="true" />
              </span>
              Бесплатно
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.open}
                onChange={(event) => setFilters({ open: event.target.checked })}
              />
              <span className="feed-check">
                <Check size={13} aria-hidden="true" />
              </span>
              Есть места
            </label>
          </div>
        </div>
      </section>

      <section aria-labelledby="feed-results-title" className="feed-results">
        <h2 id="feed-results-title" className="sr-only">
          События Sportura
        </h2>
        <div className="feed-results-toolbar">
          <div className="feed-types" role="group" aria-label="Формат события">
            {(
              [
                ["all", "Все события"],
                ["daily_game", "Игры"],
                ["tournament", "Турниры"],
                ["league", "Лиги"],
              ] as const
            ).map(([type, label]) => (
              <button
                type="button"
                key={type}
                aria-pressed={filters.type === type}
                className={filters.type === type ? "is-active" : ""}
                onClick={() => setFilters({ type })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="feed-results-meta">
            <span aria-live="polite" aria-atomic="true">
              {eventCountLabel(list.length)}
            </span>
            <label className="feed-sort">
              <span className="sr-only">Сортировка событий</span>
              <select
                value={filters.sort}
                onChange={(event) =>
                  setFilters({
                    sort: event.target.value as FeedFilters["sort"],
                  })
                }
              >
                <option value="available">Сначала открытые</option>
                <option value="date">По дате</option>
                <option value="price">Сначала дешевле</option>
              </select>
            </label>
          </div>
        </div>
        {hasFilters && (
          <div className="feed-active-filters">
            <span>
              {[
                filters.date === "today"
                  ? "Сегодня"
                  : filters.date === "week"
                    ? "На неделе"
                    : filters.date === "weekend"
                      ? "В выходные"
                      : "",
                filters.free ? "Бесплатно" : "",
                filters.open ? "Есть места" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <button type="button" className="feed-reset" onClick={resetFilters}>
              <X size={14} aria-hidden="true" />
              Сбросить фильтры
            </button>
          </div>
        )}
        {list.length > 0 ? (
          <div className="feed-grid">
            {list.map((activity, index) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                priority={index === 0}
              />
            ))}
          </div>
        ) : (
          <div className="feed-empty">
            <span className="feed-empty-icon">
              <Search size={28} aria-hidden="true" />
            </span>
            <h3>
              {hasFilters ? "Пока без совпадений" : "Новые игры — впереди"}
            </h3>
            <p>
              {hasFilters
                ? "Попробуй другой вид спорта или убери часть фильтров. Твоя игра ещё найдётся."
                : "Здесь появятся игры и турниры. Загляни позже или присоединяйся к своей команде по коду."}
            </p>
            {hasFilters ? (
              <button
                type="button"
                className="feed-primary"
                onClick={resetFilters}
              >
                Показать все события
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ) : (
              <Link to="/join" className="feed-primary">
                Войти по коду
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </section>
    </FeedShell>
  );
}

function FeedLoading() {
  return (
    <FeedShell>
      <div
        className="feed-loading"
        aria-busy="true"
        aria-label="Загружаем события"
      >
        <div className="feed-skeleton feed-skeleton-heading" />
        <div className="feed-skeleton feed-skeleton-search" />
        <div className="feed-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="feed-skeleton feed-skeleton-card" />
          ))}
        </div>
        <span className="sr-only" role="status">
          Загружаем события…
        </span>
      </div>
    </FeedShell>
  );
}

function FeedError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <FeedShell>
      <div className="feed-empty feed-error">
        <span className="feed-empty-icon">
          <Search size={28} aria-hidden="true" />
        </span>
        <h1>Не удалось загрузить игры</h1>
        <p>Проверь подключение к интернету и попробуй ещё раз.</p>
        <button
          type="button"
          className="feed-primary"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
        >
          Попробовать снова
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </FeedShell>
  );
}
