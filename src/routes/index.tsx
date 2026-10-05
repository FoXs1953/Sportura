import { useI18n } from "@/lib/i18n";
import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
  stripSearchParams,
} from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  Bookmark,
  ArrowRight,
  Check,
} from "lucide-react";
import { useSessionUser } from "@/lib/use-session";
import { FeedShell } from "@/components/sportura/feed-shell";
import { CitySelect } from "@/components/sportura/city-select";
import { ActivityCard } from "@/components/sportura/activity-card";
import { ContentBlocks } from "@/components/sportura/content-blocks";
import { HowItWorks } from "@/components/sportura/guest-info";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const { tr, language } = useI18n();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useSessionUser().data?.id ?? null;
  const [expanded, setExpanded] = useState(false);
  const [readyCity, setReadyCity] = useState(false);
  const accountPromptTrigger = useRef<HTMLButtonElement | null>(null);
  const [accountPrompt, setAccountPrompt] = useState<{
    feature: "personal" | "saved";
    redirect: string;
  } | null>(null);
  const explainAccount = (
    feature: "personal" | "saved",
    trigger: HTMLButtonElement,
  ) => {
    accountPromptTrigger.current = trigger;
    const params = new URLSearchParams(window.location.search);
    if (feature === "personal") {
      params.set("sort", "personal");
      params.set("view", "all");
      params.set("open", "true");
    } else {
      params.set("view", "saved");
    }
    setAccountPrompt({ feature, redirect: `/?${params.toString()}` });
  };
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
          <CitySelect
            city={filters.city}
            cities={[...CITIES, ...(site.data?.catalog.cities ?? [])]}
            onCityChange={(city) => set({ city, district: "" })}
          />
          <h1>
            {tr("Спорт рядом")}
            <span className="feed-title-dot">.</span>
          </h1>
          <p>{tr("Находи свою команду. Выходи на площадку.")}</p>
        </div>
        <Link to="/join" className="feed-invite">
          <span>
            <strong>{tr("Есть приглашение?")}</strong>
            <span>{tr("Войти в игру по коду")}</span>
          </span>
          <ArrowRight size={20} />
        </Link>
      </section>
      {tr(
        site.data?.general.announcement_enabled &&
          site.data.general.announcement && (
            <p className="feed-notice">{tr(site.data.general.announcement)}</p>
          ),
      )}
      {site.data?.general.maintenance_mode && (
        <p className="feed-notice">
          {tr(site.data.general.maintenance_message)}
        </p>
      )}
      {!!site.data?.blocks.length && (
        <div className="feed-cms">
          <ContentBlocks blocks={site.data.blocks} />
        </div>
      )}
      {nearest && (
        <Link to="/my-games" className="feed-notice block">
          {tr("Ближайшая игра: ")}
          <strong>{tr(nearest.activity.title)}</strong> ·{tr(" ")}
          {tr(dateLabel(nearest.activity.date_time, true, language))} →
        </Link>
      )}
      <section className="feed-discovery" aria-label={tr("Поиск и фильтры")}>
        <div className="feed-search-row">
          <div className="feed-search">
            <Search size={20} />
            <input
              aria-label={tr("Поиск событий")}
              type="search"
              value={filters.q}
              maxLength={200}
              onChange={(e) => set({ q: e.target.value })}
              placeholder={tr("Игра, площадка или организатор")}
            />
            {tr(
              filters.q && (
                <button
                  aria-label={tr("Очистить поиск")}
                  onClick={() => set({ q: "" })}
                >
                  <X size={18} />
                </button>
              ),
            )}
          </div>
          <button
            className={`feed-filter-toggle ${expanded ? "is-active" : ""}`}
            aria-expanded={expanded}
            aria-controls="discovery-filters"
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={18} />
            {tr("Фильтры")}
            {active.length > 0 && <b>{active.length}</b>}
          </button>
        </div>
        <div
          className="feed-sports"
          role="group"
          aria-label={tr("Виды спорта")}
        >
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
              {tr(s === "all" ? "Все виды спорта" : s)}
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
                <h2>{tr("Найти свою игру")}</h2>
                <p>{tr("Выберите удобные дату, время и условия")}</p>
              </div>
              <button
                className="feed-icon-button"
                aria-label={tr("Закрыть фильтры")}
                onClick={() => setExpanded(false)}
              >
                <X size={20} />
              </button>
            </div>
            <fieldset className="feed-filter-group">
              <legend>{tr("Когда играем")}</legend>
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
                    {tr(label)}
                  </button>
                ))}
              </div>
              {filters.date === "custom" && (
                <div className="feed-date-range">
                  <label>
                    {tr("С")}
                    <input
                      type="date"
                      value={filters.from}
                      max={filters.to || undefined}
                      onChange={(e) => set({ from: e.target.value })}
                    />
                  </label>
                  <span aria-hidden="true">—</span>
                  <label>
                    {tr("По")}
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
                {tr("Время начала ")}
                <span>{tr("по Казахстану")}</span>
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
                    {tr(label)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="feed-filter-columns">
              <fieldset className="feed-filter-group">
                <legend>{tr("Уровень игроков")}</legend>
                <div className="feed-filter-options">
                  {["all", ...SKILL_LEVELS].map((skill) => (
                    <button
                      key={skill}
                      className={`feed-chip ${filters.skill === skill ? "is-active" : ""}`}
                      aria-pressed={filters.skill === skill}
                      onClick={() => set({ skill })}
                    >
                      {tr(
                        skill === "all"
                          ? "Все уровни"
                          : skill === "Любой"
                            ? "Без ограничений"
                            : skill,
                      )}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="feed-filter-group">
                <legend>{tr("Площадка")}</legend>
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
                      {tr(label)}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="feed-filter-bottom">
              <label className="feed-district">
                {tr("Район")}
                <select
                  value={filters.district}
                  onChange={(e) => set({ district: e.target.value })}
                >
                  <option value="">{tr("Все районы")}</option>
                  {districts.map((district) => (
                    <option value={district} key={district}>
                      {tr(district)}
                    </option>
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
                  {tr("Можно записаться")}
                  <small>{tr("Есть места и открыта регистрация")}</small>
                </span>
              </label>
              <button
                className="feed-primary"
                onClick={() => setExpanded(false)}
              >
                {tr("Показать события")}
                {tr(!feed.isFetching && ` · ${total}`)}
              </button>
            </div>
          </div>
        )}
        {!!active.length && (
          <div className="event-actions mt-4">
            {active.map(([k, v]) => (
              <button
                className="feed-active-filter"
                aria-label={tr(`Убрать фильтр «${names[k]}»`)}
                key={k}
                onClick={() =>
                  set({
                    [k]: discoveryDefaults[k as keyof DiscoveryFilters],
                    ...(k === "date" ? { from: "", to: "" } : {}),
                  })
                }
              >
                {tr(names[k])}
                {tr(
                  v === true
                    ? ""
                    : `: ${Array.isArray(v) ? v.map((item) => tr(item)).join(", ") : tr(values[String(v)] ?? v)}`,
                )}
                <span className="feed-filter-remove">
                  <X size={13} aria-hidden="true" />
                </span>
              </button>
            ))}
            <button
              className="feed-reset"
              onClick={() => set(discoveryDefaults)}
            >
              {tr("Сбросить всё")}
            </button>
          </div>
        )}
      </section>
      <section className="feed-results" aria-label={tr("События")}>
        <div className="event-tabs mb-4">
          <button
            className={
              filters.view === "all" && filters.sort !== "personal"
                ? "is-active"
                : ""
            }
            onClick={() => set({ view: "all", sort: "available" })}
          >
            {tr("Все события")}
          </button>
          <button
            className={filters.sort === "personal" ? "is-active" : ""}
            onClick={(event) =>
              user
                ? set({ view: "all", sort: "personal", open: true })
                : explainAccount("personal", event.currentTarget)
            }
          >
            {tr("Для вас")}
          </button>
          <button
            onClick={() => set({ view: "all", sort: "date", open: true })}
          >
            {tr("Ближайшие")}
          </button>
          <button
            className={filters.view === "saved" ? "is-active" : ""}
            onClick={(event) =>
              user
                ? set({ view: "saved" })
                : explainAccount("saved", event.currentTarget)
            }
          >
            {tr("Сохранённые")}
          </button>
          <button
            className={filters.view === "archive" ? "is-active" : ""}
            onClick={() => set({ view: "archive", open: false, date: "all" })}
          >
            {tr("Архив и результаты")}
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
                {tr(l)}
              </button>
            ))}
          </div>
          <div className="feed-results-meta">
            <span aria-live="polite">
              {tr(feed.isPending ? "Загружаем…" : eventCountLabel(total))}
            </span>
            <label className="feed-sort">
              <select
                aria-label={tr("Сортировка")}
                value={filters.sort}
                onChange={(e) =>
                  set({ sort: e.target.value as DiscoveryFilters["sort"] })
                }
              >
                <option value="available">{tr("Сначала открытые")}</option>
                <option value="date">{tr("По времени")}</option>

                {tr(user && <option value="personal">{tr("Для вас")}</option>)}
              </select>
            </label>
          </div>
        </div>
        {filters.sort === "personal" && !prefs.data?.sports.length && (
          <p className="feed-notice">
            {tr("Выберите виды спорта в")}
            {tr(" ")}
            <Link to="/profile" search={{ tab: "personal" }}>
              {tr("профиле")}
            </Link>
            {tr(", чтобы уточнить подборку.")}
          </p>
        )}
        {filters.view === "saved" && (
          <p className="event-count-note mb-4">
            {tr(
              "Сохранение не резервирует место. Напоминание можно включить отдельно у каждой игры.",
            )}
          </p>
        )}
        {feed.isError ? (
          <div className="feed-empty">
            <h2>{tr("Не удалось загрузить игры")}</h2>
            <p>{tr(feed.error.message)}</p>
            <button
              className="feed-primary"
              onClick={() => void feed.refetch()}
            >
              {tr("Повторить")}
            </button>
          </div>
        ) : feed.isPending ? (
          <div className="feed-grid" aria-label={tr("Загружаем события")}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="feed-skeleton feed-skeleton-card" />
            ))}
          </div>
        ) : !list.length ? (
          <div className="feed-empty">
            <span className="feed-empty-icon">
              <Search size={26} aria-hidden="true" />
            </span>
            <h3>
              {tr(
                active.length > 0 || filters.sort === "personal"
                  ? "Пока без совпадений"
                  : filters.view === "saved"
                    ? "Сохранённых игр пока нет"
                    : filters.view === "archive"
                      ? "Завершённых событий пока нет"
                      : "Новые игры скоро появятся",
              )}
            </h3>
            <p>
              {tr(
                active.length > 0 || filters.sort === "personal"
                  ? "Попробуйте изменить город, дату или убрать часть фильтров."
                  : filters.view === "saved"
                    ? "Нажмите на закладку у интересной игры — она появится здесь. Сохранение не резервирует место."
                    : filters.view === "archive"
                      ? "Здесь появятся прошедшие игры и результаты соревнований. Пока можно выбрать предстоящую игру."
                      : "Пока нет предстоящих публичных событий. Включите уведомления о новых играх или организуйте свою.",
              )}
            </p>
            <div className="feed-empty-actions">
              {(active.length > 0 ||
                filters.sort === "personal" ||
                filters.view !== "all") && (
                <button
                  className="feed-primary"
                  onClick={() => set(discoveryDefaults)}
                >
                  {tr("Показать все события")}
                </button>
              )}
              <Link
                to="/game-alerts"
                search={{
                  city: filters.city,
                  sport: filters.sport.length === 1 ? filters.sport[0] : "all",
                }}
                className={
                  active.length === 0 &&
                  filters.view === "all" &&
                  filters.sort !== "personal"
                    ? "feed-primary"
                    : "feed-chip"
                }
              >
                {tr("Узнавать о новых играх")}
              </Link>
              <Link to="/for-organizers" className="feed-chip">
                {tr("Организовать игру")}
              </Link>
            </div>
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
                          {tr(
                            reg.status === "cancelled"
                              ? "Вы отменили запись"
                              : reg.status === "rejected"
                                ? "Запись отклонена"
                                : `Вы записаны · ${reg.amount_due === 0 ? "бесплатно" : PAYMENT_STATUS_LABEL[reg.payment_status]}`,
                          )}
                        </Link>
                      )}
                      {filters.sort === "personal" && prefs.data && (
                        <p className="event-count-note">
                          {tr(a.city === prefs.data.city ? "Ваш город" : "")}
                          {tr(
                            prefs.data.sports.includes(a.sport)
                              ? " · Ваш вид спорта"
                              : "",
                          )}
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
                          {tr("Напомнить за сутки")}
                        </label>
                      )}
                    </div>
                    <button
                      className="event-favorite"
                      aria-label={tr(
                        saved ? "Убрать из сохранённых" : "Сохранить событие",
                      )}
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
              {tr(feed.isFetchingNextPage ? "Загружаем…" : "Показать ещё")}
            </button>
          </div>
        )}
      </section>
      {!user && <HowItWorks />}
      <Dialog
        open={accountPrompt !== null}
        onOpenChange={(open) => {
          if (!open) setAccountPrompt(null);
        }}
      >
        <DialogContent
          className="max-w-md"
          onCloseAutoFocus={(event) => {
            if (accountPromptTrigger.current?.isConnected) {
              event.preventDefault();
              accountPromptTrigger.current.focus({ preventScroll: true });
            }
            accountPromptTrigger.current = null;
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {tr(
                accountPrompt?.feature === "personal"
                  ? "Игры по вашим интересам"
                  : "Сохраняйте интересные игры",
              )}
            </DialogTitle>
            <DialogDescription>
              {tr(
                accountPrompt?.feature === "personal"
                  ? "Укажите город и любимые виды спорта в профиле — Sportura подберёт подходящие события. Для персональной подборки нужен аккаунт."
                  : "С аккаунтом ваши сохранённые игры доступны с любого устройства. Это удобный список, но место нужно бронировать отдельно.",
              )}
            </DialogDescription>
          </DialogHeader>
          <Link
            to="/auth"
            search={{
              mode: "signup",
              redirect: accountPrompt?.redirect ?? "/",
            }}
            className="feed-primary"
          >
            {tr("Создать аккаунт")}
          </Link>
          <Link
            to="/auth"
            search={{ redirect: accountPrompt?.redirect ?? "/" }}
            className="feed-chip text-center"
          >
            {tr("Уже есть аккаунт? Войти")}
          </Link>
        </DialogContent>
      </Dialog>
    </FeedShell>
  );
}
