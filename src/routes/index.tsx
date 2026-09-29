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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const [user, setUser] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [readyCity, setReadyCity] = useState(false);
  const action = useEventAction();
  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user.id ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
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
    (patch: Partial<DiscoveryFilters>) =>
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
        resetScroll: false,
      }),
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
      v !== null,
  );
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
            <MapPin size={14} />
            <select
              aria-label="Город"
              className="bg-transparent"
              value={filters.city}
              onChange={(e) => {
                set({ city: e.target.value });
                setReadyCity(true);
                try {
                  localStorage.setItem("sportura-feed-city", e.target.value);
                } catch {
                  /* Storage is optional in private browser modes. */
                }
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
          </label>
          <h1>
            Игры рядом<span className="feed-title-dot">.</span>
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
            className="feed-filter-toggle"
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
              className={`feed-chip ${filters.sport === s ? "is-active" : ""}`}
              key={s}
              aria-pressed={filters.sport === s}
              onClick={() => set({ sport: s })}
            >
              {s === "all" ? "Все виды спорта" : s}
            </button>
          ))}
        </div>
        <div className="event-actions mt-3">
          {[
            ["all", "Любая дата"],
            ["today", "Сегодня"],
            ["tomorrow", "Завтра"],
            ["weekend", "Выходные"],
            ["custom", "Выбрать даты"],
          ].map(([v, l]) => (
            <button
              className={`feed-chip ${filters.date === v ? "is-active" : ""}`}
              key={v}
              onClick={() => {
                set({ date: v as DiscoveryFilters["date"] });
                if (v === "custom") setExpanded(true);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {expanded && (
          <div className="feed-filter-panel" id="discovery-filters">
            <div className="event-form-grid">
              <label>
                Район
                <input
                  value={filters.district}
                  onChange={(e) => set({ district: e.target.value })}
                />
              </label>
              <label>
                Уровень
                <select
                  value={filters.skill}
                  onChange={(e) => set({ skill: e.target.value })}
                >
                  <option value="all">Все уровни</option>
                  {SKILL_LEVELS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Дата с
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) =>
                    set({ date: "custom", from: e.target.value })
                  }
                />
              </label>
              <label>
                Дата по
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => set({ date: "custom", to: e.target.value })}
                />
              </label>
              <label>
                Начало с · Казахстан
                <input
                  type="time"
                  value={filters.time_from}
                  onChange={(e) => set({ time_from: e.target.value })}
                />
              </label>
              <label>
                Начало до
                <input
                  type="time"
                  value={filters.time_to}
                  onChange={(e) => set({ time_to: e.target.value })}
                />
              </label>

              <label>
                Площадка
                <select
                  value={filters.venue}
                  onChange={(e) =>
                    set({ venue: e.target.value as DiscoveryFilters["venue"] })
                  }
                >
                  <option value="all">Любая</option>
                  <option value="indoor">В помещении</option>
                  <option value="outdoor">На улице</option>
                </select>
              </label>
              <div className="event-actions">
                <label className="event-check">
                  <input
                    type="checkbox"
                    checked={filters.open}
                    onChange={(e) => set({ open: e.target.checked })}
                  />
                  Регистрация открыта
                </label>
              </div>
            </div>
            <button
              className="feed-primary mt-5"
              onClick={() => setExpanded(false)}
            >
              Показать события
            </button>
          </div>
        )}
        {!!active.length && (
          <div className="event-actions mt-4">
            {active.map(([k, v]) => (
              <button
                className="feed-chip"
                key={k}
                onClick={() =>
                  set({ [k]: discoveryDefaults[k as keyof DiscoveryFilters] })
                }
              >
                {names[k]}
                {v === true ? "" : `: ${values[String(v)] ?? v}`}{" "}
                <X size={12} />
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
