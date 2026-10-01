import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
  stripSearchParams,
} from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  Bookmark,
  MapPin,
  ArrowRight,
  ChevronDown,
  Check,
} from "lucide-react";
import { useSessionUser } from "@/lib/use-session";
import { FeedShell } from "@/components/sportura/feed-shell";
import { ActivityCard } from "@/components/sportura/activity-card";
import { ContentBlocks } from "@/components/sportura/content-blocks";
import { getSiteContent } from "@/lib/cms.functions";
import { getFeedPreferences } from "@/lib/profile.functions";
import {
  discoverEvents,
  discoveryDefaults,
  feedSchema,
  getPlayerEvents,
  type DiscoveryFilters,
} from "@/lib/event.functions";
import {
  CITIES,
  SPORTS,
  SKILL_LEVELS,
  PAYMENT_STATUS_LABEL,
} from "@/lib/sportura";
import { eventCountLabel } from "@/lib/feed-filters";
import { useEventAction, dateLabel } from "@/components/events/shared";
import { eventPhase } from "@/lib/event-model";
import "@/styles/events.css";
export const Route = createFileRoute("/")({
  validateSearch: (s: Partial<DiscoveryFilters> & SearchSchemaInput) =>
    feedSchema.parse(s),
  search: { middlewares: [stripSearchParams(discoveryDefaults)] },
  head: () => ({
    meta: [
      { title: "Sportura — игры и турниры рядом" },
      {
        name: "description",
        content:
          "Найдите игру по спорту, городу, времени и уровню. Записывайтесь и играйте.",
      },
    ],
  }),
  component: Feed,
});
function Feed() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useSessionUser().data?.id ?? null;
  const [expanded, setExpanded] = useState(false);
  const [readyCity, setReadyCity] = useState(false);
  const action = useEventAction();
  const prefs = useQuery({
    queryKey: ["feed-preferences", user],
    queryFn: () => getFeedPreferences(),
    enabled: !!user,
    retry: false,
  });
  const player = useQuery({
    queryKey: ["event-player"],
    queryFn: () => getPlayerEvents(),
    enabled: !!user,
    refetchInterval: 30000,
    retry: false,
  });
  const site = useQuery({
    queryKey: ["site", "home"],
    queryFn: () => getSiteContent({ data: { page: "home" } }),
    retry: false,
  });
  const set = useCallback(
    (patch: Partial<DiscoveryFilters>) => {
      if (patch.city !== undefined) {
        setReadyCity(true);
        try {
          localStorage.setItem("sportura-feed-city", patch.city);
        } catch {
          /* Storage is optional in private browser modes. */
        }
      }
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );
  useEffect(() => {
    if (readyCity) return;
    if (new URLSearchParams(window.location.search).has("city")) {
      setReadyCity(true);
      return;
    }
    let saved = "";
    try {
      saved = localStorage.getItem("sportura-feed-city") ?? "";
    } catch {
      /* Storage is optional in private browser modes. */
    }
    if (saved) {
      set({ city: saved });
      setReadyCity(true);
    } else if (prefs.data) {
      set({ city: prefs.data.city });
      setReadyCity(true);
    }
  }, [prefs.data, readyCity, set]);
  const feed = useInfiniteQuery({
    queryKey: ["event-feed", filters, user],
    queryFn: ({ pageParam }) =>
      discoverEvents({ data: { filters, page: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      (last.page + 1) * 24 < last.total ? last.page + 1 : undefined,
    refetchInterval: 30000,
  });
  const list = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const total = feed.data?.pages[0]?.total ?? 0;
  const nearest = player.data?.registrations
    .filter(
      (r) =>
        r.status === "registered" &&
        ["upcoming", "live"].includes(eventPhase(r.activity)),
    )
    .sort((a, b) =>
      (a.activity.date_time ?? "z").localeCompare(b.activity.date_time ?? "z"),
    )[0];
  const active = Object.entries(filters).filter(
    ([k, v]) =>
      !["view", "sort"].includes(k) &&
      v !== discoveryDefaults[k as keyof DiscoveryFilters] &&
      v !== "" &&
      v !== null &&
      (!Array.isArray(v) || v.length > 0),
  );
  const districts = [
    ...new Set(
      [...(feed.data?.pages[0]?.districts ?? []), filters.district].filter(
        Boolean,
      ),
    ),
  ];
  const names: Record<string, string> = {
    city: "Город",
    district: "Район",
    sport: "Спорт",
    type: "Формат",
    date: "Дата",
    from: "С",
    to: "По",
    q: "Поиск",
    free: "Бесплатно",
    open: "Есть места",
    skill: "Уровень",
    venue: "Площадка",
    min: "Цена от",
    max: "Цена до",
    time_from: "Время с",
    time_to: "Время до",
  };
  const values: Record<string, string> = {
    today: "Сегодня",
    tomorrow: "Завтра",
    week: "7 дней",
    weekend: "Выходные",
    custom: "Выбранные даты",
    daily_game: "Игры",
    tournament: "Турниры",
    league: "Лиги",
    indoor: "В помещении",
    outdoor: "На улице",
  };
  return (
    <FeedShell>
      <section className="feed-intro">
        <div>
          <label className="feed-location">
            <MapPin size={17} aria-hidden="true" />
            <select
              aria-label="Город"
              value={filters.city}
              onChange={(e) => {
                set({ city: e.target.value, district: "" });
              }}
            >
              <option value="all">Все города</option>
              {[
                ...new Set([...CITIES, ...(site.data?.catalog.cities ?? [])]),
              ].map((c) => (
                <option className="bg-[#1b2123]" key={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
          <h1>
            Игры здесь<span className="feed-title-dot">.</span>
          </h1>
          <p>Находи свою команду. Выходи на площадку.</p>
        </div>
        <Link to="/join" className="feed-invite">
          <span>
            <strong>Есть приглашение?</strong>
            <span>Войти в игру по коду</span>
          </span>
          <ArrowRight size={20} />
        </Link>
      </section>
      {site.data?.general.announcement_enabled &&
        site.data.general.announcement && (
          <p className="feed-notice">{site.data.general.announcement}</p>
        )}
      {site.data?.general.maintenance_mode && (
        <p className="feed-notice">{site.data.general.maintenance_message}</p>
      )}
      {!!site.data?.blocks.length && (
        <div className="feed-cms">
          <ContentBlocks blocks={site.data.blocks} />
        </div>
      )}
      {nearest && (
        <Link to="/my-games" className="feed-notice block">
          Ближайшая игра: <strong>{nearest.activity.title}</strong> ·{" "}
          {dateLabel(nearest.activity.date_time, true)} →
        </Link>
      )}
      <section className="feed-discovery" aria-label="Поиск и фильтры">
        <div className="feed-search-row">
          <div className="feed-search">
            <Search size={20} />
            <input
              aria-label="Поиск событий"
              type="search"
              value={filters.q}
              maxLength={200}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Игра, площадка или организатор"
            />
            {filters.q && (
              <button
                aria-label="Очистить поиск"
                onClick={() => set({ q: "" })}
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            className={`feed-filter-toggle ${expanded ? "is-active" : ""}`}
            aria-expanded={expanded}
            aria-controls="discovery-filters"
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={18} />
            Фильтры{active.length > 0 && <b>{active.length}</b>}
          </button>
        </div>
        <div className="feed-sports" role="group" aria-label="Виды спорта">
          {[
            "all",
            ...[...new Set([...SPORTS, ...(site.data?.catalog.sports ?? [])])],
          ].map((s) => (
            <button
              className={`feed-chip ${(s === "all" ? filters.sport.length === 0 : filters.sport.includes(s)) ? "is-active" : ""}`}
              key={s}
              aria-pressed={
                s === "all"
                  ? filters.sport.length === 0
                  : filters.sport.includes(s)
              }
              onClick={() =>
                set({
                  sport:
                    s === "all"
                      ? []
                      : filters.sport.includes(s)
                        ? filters.sport.filter((sport) => sport !== s)
                        : [...filters.sport, s],
                })
              }
            >
              {s !== "all" && filters.sport.includes(s) && (
                <Check size={14} aria-hidden="true" />
              )}
              {s === "all" ? "Все виды спорта" : s}
            </button>
          ))}
        </div>
        {expanded && (
          <div
            className="feed-filter-panel feed-discovery-panel"
            id="discovery-filters"
          >
            <div className="feed-filter-heading">
              <div>
                <h2>Найти свою игру</h2>
                <p>Выберите удобные дату, время и условия</p>
              </div>
              <button
                className="feed-icon-button"
                aria-label="Закрыть фильтры"
                onClick={() => setExpanded(false)}
              >
                <X size={20} />
              </button>
            </div>
            <fieldset className="feed-filter-group">
              <legend>Когда играем</legend>
              <div className="feed-filter-options">
                {(
                  [
                    ["all", "Любая дата"],
                    ["today", "Сегодня"],
                    ["tomorrow", "Завтра"],
                    ["weekend", "Выходные"],
                    ["week", "Ближайшие 7 дней"],
                    ["custom", "Выбрать даты"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`feed-chip ${filters.date === value ? "is-active" : ""}`}
                    aria-pressed={filters.date === value}
                    onClick={() =>
                      set({
                        date: value,
                        ...(value !== "custom" ? { from: "", to: "" } : {}),
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {filters.date === "custom" && (
                <div className="feed-date-range">
                  <label>
                    С
                    <input
                      type="date"
                      value={filters.from}
                      max={filters.to || undefined}
                      onChange={(e) => set({ from: e.target.value })}
                    />
                  </label>
                  <span aria-hidden="true">—</span>
                  <label>
                    По
                    <input
                      type="date"
                      value={filters.to}
                      min={filters.from || undefined}
                      onChange={(e) => set({ to: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </fieldset>
            <fieldset className="feed-filter-group">
              <legend>
                Время начала <span>по Казахстану</span>
              </legend>
              <div className="feed-filter-options">
                {(
                  [
                    ["", "", "Любое время"],
                    ["06:00", "11:59", "Утром · 06–12"],
                    ["12:00", "17:59", "Днём · 12–18"],
                    ["18:00", "23:59", "Вечером · 18–24"],
                  ] as const
                ).map(([from, to, label]) => (
                  <button
                    key={label}
                    className={`feed-chip ${filters.time_from === from && filters.time_to === to ? "is-active" : ""}`}
                    aria-pressed={
                      filters.time_from === from && filters.time_to === to
                    }
                    onClick={() => set({ time_from: from, time_to: to })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="feed-filter-columns">
              <fieldset className="feed-filter-group">
                <legend>Уровень игроков</legend>
                <div className="feed-filter-options">
                  {["all", ...SKILL_LEVELS].map((skill) => (
                    <button
                      key={skill}
                      className={`feed-chip ${filters.skill === skill ? "is-active" : ""}`}
                      aria-pressed={filters.skill === skill}
                      onClick={() => set({ skill })}
                    >
                      {skill === "all"
                        ? "Все уровни"
                        : skill === "Любой"
                          ? "Без ограничений"
                          : skill}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="feed-filter-group">
                <legend>Площадка</legend>
                <div className="feed-filter-options">
                  {(
                    [
                      ["all", "Любая"],
                      ["indoor", "В помещении"],
                      ["outdoor", "На улице"],
                    ] as const
                  ).map(([venue, label]) => (
                    <button
                      key={venue}
                      className={`feed-chip ${filters.venue === venue ? "is-active" : ""}`}
                      aria-pressed={filters.venue === venue}
                      onClick={() => set({ venue })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="feed-filter-bottom">
              <label className="feed-district">
                Район
                <select
                  value={filters.district}
                  onChange={(e) => set({ district: e.target.value })}
                >
                  <option value="">Все районы</option>
                  {districts.map((district) => (
                    <option key={district}>{district}</option>
                  ))}
                </select>
              </label>
              <label className="feed-availability">
                <input
                  type="checkbox"
                  checked={filters.open}
                  onChange={(e) => set({ open: e.target.checked })}
                />
                <span>
                  Можно записаться
                  <small>Есть места и открыта регистрация</small>
                </span>
              </label>
              <button
                className="feed-primary"
                onClick={() => setExpanded(false)}
              >
                Показать события{!feed.isFetching && ` · ${total}`}
              </button>
            </div>
          </div>
        )}
        {!!active.length && (
          <div className="event-actions mt-4">
            {active.map(([k, v]) => (
              <button
                className="feed-active-filter"
                aria-label={`Убрать фильтр «${names[k]}»`}
                key={k}
                onClick={() =>
                  set({
                    [k]: discoveryDefaults[k as keyof DiscoveryFilters],
                    ...(k === "date" ? { from: "", to: "" } : {}),
                  })
                }
              >
                {names[k]}
                {v === true
                  ? ""
                  : `: ${Array.isArray(v) ? v.join(", ") : (values[String(v)] ?? v)}`}
                <span className="feed-filter-remove">
                  <X size={13} aria-hidden="true" />
                </span>
              </button>
            ))}
            <button
              className="feed-reset"
              onClick={() => set(discoveryDefaults)}
            >
              Сбросить всё
            </button>
          </div>
        )}
      </section>
      <section className="feed-results" aria-label="События">
        <div className="event-tabs mb-4">
          <button
            className={
              filters.view === "all" && filters.sort !== "personal"
                ? "is-active"
                : ""
            }
            onClick={() => set({ view: "all", sort: "available" })}
          >
            Все события
          </button>
          <button
            className={filters.sort === "personal" ? "is-active" : ""}
            onClick={() =>
              user
                ? set({ view: "all", sort: "personal", open: true })
                : void navigate({
                    to: "/auth",
                    search: { redirect: "/?sort=personal" },
                  })
            }
          >
            Для вас
          </button>
          <button
            onClick={() => set({ view: "all", sort: "date", open: true })}
          >
            Ближайшие
          </button>
          <button
            className={filters.view === "saved" ? "is-active" : ""}
            onClick={() =>
              user
                ? set({ view: "saved" })
                : void navigate({
                    to: "/auth",
                    search: { redirect: "/?view=saved" },
                  })
            }
          >
            Сохранённые
          </button>
          <button
            className={filters.view === "archive" ? "is-active" : ""}
            onClick={() => set({ view: "archive", open: false, date: "all" })}
          >
            Архив и результаты
          </button>
        </div>
        <div className="feed-results-toolbar">
          <div className="feed-types">
            {[
              ["all", "Все форматы"],
              ["daily_game", "Игры"],
              ["tournament", "Турниры"],
              ["league", "Лиги"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={filters.type === v ? "is-active" : ""}
                onClick={() => set({ type: v as DiscoveryFilters["type"] })}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="feed-results-meta">
            <span aria-live="polite">
              {feed.isPending ? "Загружаем…" : eventCountLabel(total)}
            </span>
            <label className="feed-sort">
              <select
                aria-label="Сортировка"
                value={filters.sort}
                onChange={(e) =>
                  set({ sort: e.target.value as DiscoveryFilters["sort"] })
                }
              >
                <option value="available">Сначала открытые</option>
                <option value="date">По времени</option>

                {user && <option value="personal">Для вас</option>}
              </select>
            </label>
          </div>
        </div>
        {filters.sort === "personal" && !prefs.data?.sports.length && (
          <p className="feed-notice">
            Выберите виды спорта в{" "}
            <Link to="/profile" search={{ tab: "personal" }}>
              профиле
            </Link>
            , чтобы уточнить подборку.
          </p>
        )}
        {filters.view === "saved" && (
          <p className="event-count-note mb-4">
            Сохранение не резервирует место. Напоминание можно включить отдельно
            у каждой игры.
          </p>
        )}
        {feed.isError ? (
          <div className="feed-empty">
            <h2>Не удалось загрузить игры</h2>
            <p>{feed.error.message}</p>
            <button
              className="feed-primary"
              onClick={() => void feed.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : feed.isPending ? (
          <div className="feed-grid" aria-label="Загружаем события">
            {[1, 2, 3].map((n) => (
              <div key={n} className="feed-skeleton feed-skeleton-card" />
            ))}
          </div>
        ) : !list.length ? (
          <div className="feed-empty">
            <Search size={26} />
            <h3>Пока без совпадений</h3>
            <p>Попробуйте изменить город, дату или убрать часть фильтров.</p>
            <button
              className="feed-primary"
              onClick={() => set(discoveryDefaults)}
            >
              Показать все события
            </button>
          </div>
        ) : (
          <div className="feed-grid">
            {list.map((a, index) => {
              const reg = player.data?.registrations.find(
                (r) => r.activity_id === a.id,
              );
              const saved = player.data?.saved.find(
                (s) => s.activity_id === a.id,
              );
              return (
                <div key={a.id}>
                  <ActivityCard activity={a} priority={index === 0} />
                  <div className="event-card-controls">
                    <div>
                      {reg && (
                        <Link className="event-user-tag" to="/my-games">
                          {reg.status === "cancelled"
                            ? "Вы отменили запись"
                            : reg.status === "rejected"
                              ? "Запись отклонена"
                              : `Вы записаны · ${reg.amount_due === 0 ? "бесплатно" : PAYMENT_STATUS_LABEL[reg.payment_status]}`}
                        </Link>
                      )}
                      {filters.sort === "personal" && prefs.data && (
                        <p className="event-count-note">
                          {a.city === prefs.data.city ? "Ваш город" : ""}
                          {prefs.data.sports.includes(a.sport)
                            ? " · Ваш вид спорта"
                            : ""}
                        </p>
                      )}
                      {filters.view === "saved" && saved && (
                        <label className="event-check text-xs">
                          <input
                            type="checkbox"
                            checked={saved.reminder}
                            disabled={action.busy}
                            onChange={(e) =>
                              void action.mutate("favorite", {
                                activity_id: a.id,
                                saved: true,
                                reminder: e.target.checked,
                              })
                            }
                          />
                          Напомнить за сутки
                        </label>
                      )}
                    </div>
                    <button
                      className="event-favorite"
                      aria-label={
                        saved ? "Убрать из сохранённых" : "Сохранить событие"
                      }
                      aria-pressed={!!saved}
                      disabled={action.busy}
                      onClick={() =>
                        user
                          ? void action.mutate(
                              "favorite",
                              { activity_id: a.id, saved: !saved },
                              saved
                                ? "Убрано из сохранённых"
                                : "Событие сохранено",
                            )
                          : void navigate({
                              to: "/auth",
                              search: {
                                redirect:
                                  window.location.pathname +
                                  window.location.search,
                              },
                            })
                      }
                    >
                      <Bookmark
                        size={18}
                        fill={saved ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {feed.hasNextPage && (
          <div className="flex justify-center mt-8">
            <button
              className="feed-primary"
              disabled={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              {feed.isFetchingNextPage ? "Загружаем…" : "Показать ещё"}
            </button>
          </div>
        )}
      </section>
    </FeedShell>
  );
}
