import { useI18n, formatDate } from "@/lib/i18n";
import { disputeAction } from "@/lib/competition-admin.functions";
import { WeatherReschedule } from "@/components/events/prizes";
import { EventDisputes } from "@/components/events/disputes";
import { OrganizerTrust } from "@/components/events/host/trust";
import { GettingStarted } from "@/components/events/host/getting-started";
import { useState } from "react";
import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { UnsavedChanges } from "@/components/profile/shared";
import { getHostEvents, mutateEvent } from "@/lib/event.functions";
import { getMe, type MyProfile } from "@/lib/me.functions";
import {
  eventDraft,
  eventPhase,
  localDateTime,
  type Event,
  type HostWorkspace,
  type HostDocument,
} from "@/lib/event-model";
import {
  ACTIVITY_TYPE_LABEL,
  ACTIVITY_STATUS_LABEL,
  ROLE_LABEL,
  SPORTS,
  formatKzt,
  sportImage,
} from "@/lib/sportura";
import {
  Panel,
  Empty,
  ErrorNotice,
  History,
  Confirm,
  CalendarButton,
  MapLink,
  HelpLink,
  useEventAction,
  dateLabel,
} from "@/components/events/shared";
import { EventWizard } from "@/components/events/host/wizard";
import { Participants } from "@/components/events/host/participants";
import { HostCompetition } from "@/components/events/competition";
import { HostInsights } from "@/components/events/host/insights";
import { HostSettings } from "@/components/events/host/settings";
import "@/styles/profile.css";
import "@/styles/events.css";
const tabs = {
  overview: "Обзор",
  events: "Мои события",
  participants: "Участники",
  payments: "",
  competitions: "Турниры и лиги",
  disputes: "Споры",
  insights: "Статистика и отзывы",
  settings: "Настройки и помощь",
};
const schema = z.object({
  tab: z
    .enum([
      "overview",
      "events",
      "participants",
      "payments",
      "competitions",
      "disputes",
      "insights",
      "settings",
    ])
    .catch("overview")
    .default("overview"),
  event: z.string().uuid().optional(),
  section: z
    .enum(["overview", "participants", "payments", "results", "history"])
    .catch("overview")
    .default("overview"),
  status: z.string().optional(),
});
export const Route = createFileRoute("/_authenticated/host")({
  validateSearch: (
    s: {
      tab?: string;
      event?: string;
      section?: string;
      status?: string;
    } & SearchSchemaInput,
  ) =>
    schema.parse({
      ...s,
      ...(s.tab === "payments" ? { tab: "overview" } : {}),
      ...(s.section === "payments" ? { section: "overview" } : {}),
    }),
  head: () => ({ meta: [{ title: "Кабинет организатора — Sportura" }] }),
  component: HostPage,
});
function HostPage() {
  const { tr } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const q = useQuery({
    queryKey: ["event-host"],
    queryFn: () => getHostEvents(),
    enabled: !!me.data,
    refetchInterval: 30000,
  });
  return (
    <AppShell
      workspace
      title={tr("Кабинет организатора")}
      subtitle={tr("События, участники и результаты в одном месте")}
    >
      <UnsavedChanges>
        <div className="events-workspace">
          {me.isPending || (!!me.data && q.isPending) ? (
            <Panel title={tr("Загружаем кабинет…")}>
              <p className="workspace-muted">
                {tr("Получаем события и последние изменения.")}
              </p>
            </Panel>
          ) : me.error || q.error ? (
            <Panel title={tr("Не удалось загрузить кабинет")}>
              <ErrorNotice
                message={tr(me.error?.message ?? q.error?.message ?? "")}
              />
              <Button
                onClick={() => {
                  void me.refetch();
                  void q.refetch();
                }}
              >
                {tr("Повторить")}
              </Button>
            </Panel>
          ) : me.data &&
            !me.data.roles.some((r) =>
              ["admin", "sports_manager", "tournament_organizer"].includes(r),
            ) ? (
            <Panel title={tr("Станьте организатором")}>
              <p className="workspace-muted mb-4">
                {tr("Подайте заявку, чтобы создавать игры или соревнования.")}
              </p>
              <Link
                className="workspace-primary-link"
                to="/profile"
                search={{ tab: "organizer" }}
              >
                {tr("Подать заявку →")}
              </Link>
            </Panel>
          ) : me.data && q.data ? (
            <Workspace data={q.data} me={me.data} />
          ) : null}
        </div>
      </UnsavedChanges>
    </AppShell>
  );
}
function Workspace({ data, me }: { data: HostWorkspace; me: MyProfile }) {
  const { tr } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [editor, setEditor] = useState<{
    key: string;
    document?: HostDocument;
    event?: Event;
  } | null>(null);
  const action = useEventAction();
  const a = data.activities.find((a) => a.id === search.event);
  const canComp =
    me.roles.includes("admin") || me.roles.includes("tournament_organizer");
  const go = (
    tab: keyof typeof tabs,
    event?: string,
    section = "overview",
    status?: string,
  ) =>
    void navigate({
      search: {
        tab,
        section,
        ...(event ? { event } : {}),
        ...(status ? { status } : {}),
      },
    });
  const open = (id: string) => {
    setEditor(null);
    go("events", id);
  };
  async function duplicate(a: Event, template = false) {
    await action.run(
      async () => {
        const d = await mutateEvent({
          data: {
            action: "document",
            payload: {
              id: crypto.randomUUID(),
              kind: template ? "template" : "draft",
              name: a.title,
              data: {
                ...eventDraft(a),
                date_time: "",
                registration_deadline: "",
              },
            },
          },
        });
        if (!template) setEditor({ key: d.id, document: d });
      },
      template ? "Шаблон сохранён" : "Создан новый черновик",
    );
  }
  return (
    <>
      {(search.tab !== "overview" || data.activities.length > 0) && (
        <div className="event-toolbar justify-end">
          <Button
            disabled={!!editor && search.tab === "events"}
            onClick={() => {
              setEditor({ key: crypto.randomUUID() });
              go("events");
            }}
          >
            {tr("+ Создать событие")}
          </Button>
        </div>
      )}
      <nav className="event-tabs" aria-label={tr("Кабинет организатора")}>
        {Object.entries(tabs)
          .filter(([key]) => key !== "payments")
          .filter(([k]) => k !== "competitions" || canComp)
          .map(([k, l]) => (
            <button
              key={k}
              aria-current={search.tab === k ? "page" : undefined}
              className={search.tab === k ? "is-active" : ""}
              onClick={() => go(k as keyof typeof tabs)}
            >
              {tr(l)}
            </button>
          ))}
      </nav>
      <ErrorNotice message={tr(action.error)} />
      {search.tab === "events" && editor ? (
        <EventWizard
          key={editor.key}
          document={editor.document}
          event={editor.event}
          documents={data.documents}
          qualifiers={data.activities}
          competition={canComp}
          onClose={() => setEditor(null)}
          onDone={open}
        />
      ) : search.tab === "overview" ? (
        <Overview
          data={data}
          me={me}
          go={go}
          onCreate={() => {
            setEditor({ key: crypto.randomUUID() });
            go("events");
          }}
          onDraft={(document) => {
            setEditor({ key: document.id, document });
            go("events");
          }}
        />
      ) : search.tab === "events" && a ? (
        <EventManagement
          event={a}
          data={data}
          section={search.section}
          select={(s) => go("events", a.id, s)}
          edit={() => setEditor({ key: crypto.randomUUID(), event: a })}
          duplicate={() => void duplicate(a)}
          template={() => void duplicate(a, true)}
          back={() => go("events")}
        />
      ) : search.tab === "events" ? (
        <EventList
          data={data}
          select={open}
          draft={(d) => setEditor({ key: d.id, document: d })}
          edit={(a) => setEditor({ key: crypto.randomUUID(), event: a })}
          duplicate={(a) => void duplicate(a)}
        />
      ) : search.tab === "participants" ? (
        <Participants
          key={`${search.tab}:${search.event}:${search.status}`}
          data={data}
          eventId={search.event ?? ""}
          initialStatus={search.status ?? "all"}
        />
      ) : search.tab === "competitions" ? (
        <>
          <Panel title={tr("Турниры и лиги")}>
            <div className="event-rows">
              {data.activities
                .filter((a) => a.type !== "daily_game")
                .map((a) => (
                  <button
                    className="event-row text-left"
                    key={a.id}
                    onClick={() => go("competitions", a.id)}
                  >
                    <h3>{tr(a.title)}</h3>
                    <p className="workspace-muted">
                      {tr(ACTIVITY_TYPE_LABEL[a.type])} ·{tr(" ")}
                      {tr(ACTIVITY_STATUS_LABEL[a.status])} ·{" "}
                      {a.registered_count}
                      {tr(" ")}
                      {tr(
                        a.participation_mode === "team"
                          ? "команд"
                          : "участников",
                      )}
                      {tr(" ")}·{tr(" ")}
                      {tr(
                        data.matches.some((m) => m.activity_id === a.id)
                          ? "Расписание создано"
                          : "Подготовка расписания",
                      )}
                    </p>
                  </button>
                ))}
              {!data.activities.some((a) => a.type !== "daily_game") && (
                <Empty
                  title={tr("Первое соревнование впереди")}
                  text="Создайте турнир или лигу и откройте набор участников."
                />
              )}
            </div>
          </Panel>
          {a && a.type !== "daily_game" && (
            <HostCompetition
              key={a.id}
              event={a}
              registrations={data.registrations.filter(
                (r) => r.activity_id === a.id,
              )}
            />
          )}
        </>
      ) : search.tab === "disputes" ? (
        <EventDisputes host />
      ) : search.tab === "insights" ? (
        <HostInsights data={data} onSelect={open} />
      ) : search.tab === "settings" ? (
        <>
          {canComp && <OrganizerTrust />}
          <HostSettings
            data={data}
            onTemplate={(d) => {
              setEditor({
                key: crypto.randomUUID(),
                document: {
                  ...d,
                  id: crypto.randomUUID(),
                  kind: "draft",
                  updated_at: "",
                  data: { ...d.data, date_time: "", registration_deadline: "" },
                },
              });
              go("events");
            }}
          />
        </>
      ) : null}
    </>
  );
}
function Overview({
  data: d,
  me,
  go,
  onCreate,
  onDraft,
}: {
  data: HostWorkspace;
  me: MyProfile;
  onCreate: () => void;
  onDraft: (document: HostDocument) => void;
  go: (
    tab: keyof typeof tabs,
    event?: string,
    section?: string,
    status?: string,
  ) => void;
}) {
  const { tr, language } = useI18n();
  const hasCompetitions = d.activities.some((a) => a.type !== "daily_game");
  const disputes = useQuery({
    queryKey: ["disputes", "all"],
    queryFn: () => disputeAction({ data: { action: "list", payload: {} } }),
    enabled: hasCompetitions,
  });
  const openDisputes =
    disputes.data?.filter(
      (item) =>
        item.status === "open" &&
        d.activities.some((a) => a.id === item.activity_id),
    ).length ?? 0;
  const future = d.activities
    .filter((a) => ["upcoming", "live"].includes(eventPhase(a)))
    .sort((a, b) => (a.date_time ?? "z").localeCompare(b.date_time ?? "z"));
  const today = localDateTime(new Date().toISOString()).slice(0, 10);
  const todayEvents = d.activities
    .filter(
      (a) =>
        a.status !== "cancelled" &&
        localDateTime(a.date_time).startsWith(today),
    )
    .sort((a, b) => (a.date_time ?? "z").localeCompare(b.date_time ?? "z"));
  const attention = d.activities.filter(
    (a) =>
      a.status !== "cancelled" &&
      ((a.registered_count < a.max_participants / 2 &&
        eventPhase(a) === "upcoming") ||
        (eventPhase(a) === "past" &&
          d.registrations.some(
            (r) => r.activity_id === a.id && r.status === "registered",
          )) ||
        (a.type !== "daily_game" &&
          eventPhase(a) === "past" &&
          !a.results_submitted_at)),
  );
  return (
    <>
      {!d.activities.length && (
        <GettingStarted data={d} onCreate={onCreate} onDraft={onDraft} />
      )}
      <Panel
        title={tr(me.name)}
        description={`${tr(me.city)} · ${me.roles
          .filter((r) => r !== "participant")
          .map((r) => tr(ROLE_LABEL[r]))
          .join(", ")}`}
      >
        <div className="event-line">
          <span className="workspace-tag">
            {tr(
              me.verified ? "Контакт подтверждён" : "Роль организатора активна",
            )}
          </span>
          <Link
            className="profile-link"
            to="/organizer/$id"
            params={{ id: me.id }}
          >
            {tr("Публичная страница ↗")}
          </Link>
        </div>
      </Panel>
      {d.activities.length > 0 && (
        <div className="event-stats event-overview-stats">
          {[
            [future.length, "Предстоящие", () => go("events")],
            [
              d.registrations.filter(
                (r) =>
                  r.status === "registered" &&
                  future.some((a) => a.id === r.activity_id),
              ).length,
              "Записаны",
              () => go("participants", undefined, undefined, "registered"),
            ],
          ].map(([n, l, fn]) => (
            <button
              key={String(l)}
              className="workspace-stat"
              onClick={fn as () => void}
            >
              <strong>{Number(n)}</strong>
              <span>{tr(String(l))}</span>
            </button>
          ))}
        </div>
      )}
      {future[0] && (
        <Panel title={tr("Ближайшее событие")}>
          <EventSummary a={future[0]} data={d} />
          <div className="event-actions mt-4">
            <Button onClick={() => go("events", future[0]!.id)}>
              {tr("Управлять событием")}
            </Button>
            <CalendarButton event={future[0]} />
          </div>
        </Panel>
      )}
      {(d.activities.length > 0 || d.notifications.length > 0) && (
        <Panel title={tr("Требует внимания")}>
          {hasCompetitions && disputes.isPending && (
            <p className="workspace-muted" role="status">
              {tr("Проверяем открытые споры…")}
            </p>
          )}
          {hasCompetitions && disputes.isError && (
            <div className="space-y-3" role="alert">
              <p className="workspace-muted">
                {tr(
                  "Не удалось проверить споры. Повторите загрузку или откройте раздел «Споры».",
                )}
              </p>
              <div className="event-actions">
                <Button
                  variant="outline"
                  onClick={() => void disputes.refetch()}
                >
                  {tr("Повторить")}
                </Button>
                <Button variant="outline" onClick={() => go("disputes")}>
                  {tr("Споры")}
                </Button>
              </div>
            </div>
          )}
          {openDisputes > 0 && (
            <Button
              className="mb-3"
              variant="outline"
              onClick={() => go("disputes")}
            >
              {tr("Открытые споры: ")}
              {openDisputes} →
            </Button>
          )}
          <div className="event-rows">
            {attention.map((a) => (
              <button
                key={a.id}
                className="event-row text-left"
                onClick={() => go("events", a.id)}
              >
                {tr(a.title)}:{tr(" ")}
                {tr(
                  eventPhase(a) === "upcoming"
                    ? "набрано меньше половины состава"
                    : "проверьте посещение и результаты",
                )}
                {tr(" ")}→
              </button>
            ))}
            {d.notifications.slice(0, 5).map((n) => (
              <a
                key={n.id}
                className="event-row"
                href={
                  n.href.startsWith("/") && !n.href.startsWith("//")
                    ? n.href
                    : "/host"
                }
              >
                <strong>{tr(n.title)}</strong>
                <p className="workspace-muted text-sm">{tr(n.body)}</p>
              </a>
            ))}
            {!attention.length &&
              !d.notifications.length &&
              openDisputes === 0 &&
              (!hasCompetitions || disputes.isSuccess) && (
                <Empty
                  title={tr("Всё спокойно")}
                  text="Новые задачи появятся здесь."
                />
              )}
          </div>
        </Panel>
      )}
      {d.activities.length > 0 && (
        <Panel title={tr("План на сегодня")}>
          <div className="event-rows">
            {todayEvents.map((a) => (
              <button
                key={a.id}
                className="event-row text-left"
                onClick={() => go("events", a.id)}
              >
                {tr(dateLabel(a.date_time, true, language))} · {tr(a.title)} →
              </button>
            ))}
          </div>
          {todayEvents.length === 0 && (
            <p className="workspace-muted">
              {tr("Сегодня событий нет. Можно подготовить следующую игру.")}
            </p>
          )}
        </Panel>
      )}
      {d.history.length > 0 && (
        <Panel title={tr("Последние изменения")}>
          <History items={d.history.slice(0, 8)} />
        </Panel>
      )}
    </>
  );
}
function EventSummary({ a, data }: { a: Event; data: HostWorkspace }) {
  const { tr, language } = useI18n();
  const regs = data.registrations.filter((r) => r.activity_id === a.id);
  return (
    <div className="event-line">
      <div>
        <h3 className="event-title">{tr(a.title)}</h3>
        <p className="workspace-muted mt-2">
          {tr(dateLabel(a.date_time, true, language))} · {tr(a.location_text)}
        </p>
        <p className="text-sm mt-2">
          {tr(ACTIVITY_TYPE_LABEL[a.type])} ·{" "}
          {tr(ACTIVITY_STATUS_LABEL[a.status])} ·{tr(" ")}
          {a.registered_count}/{a.max_participants}
          {tr(" мест · Бесплатное участие")}
        </p>
      </div>
    </div>
  );
}
function EventList({
  data,
  select,
  draft,
  edit,
  duplicate,
}: {
  data: HostWorkspace;
  select: (id: string) => void;
  draft: (d: HostDocument) => void;
  edit: (a: Event) => void;
  duplicate: (a: Event) => void;
}) {
  const { tr, language } = useI18n();
  const [tab, setTab] = useState("upcoming");
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [calendar, setCalendar] = useState(false);
  const [remove, setRemove] = useState<HostDocument | null>(null);
  const action = useEventAction();
  const rows = data.activities.filter(
    (a) =>
      (tab === "cancelled"
        ? a.status === "cancelled"
        : tab === "past"
          ? eventPhase(a) === "past"
          : !["past", "cancelled"].includes(eventPhase(a))) &&
      (sport === "all" || a.sport === sport) &&
      (type === "all" || a.type === type) &&
      (status === "all" || a.status === status) &&
      (!date || localDateTime(a.date_time).startsWith(date)) &&
      `${a.title} ${a.location_text}`.toLowerCase().includes(q.toLowerCase()),
  );
  const drafts = data.documents.filter(
    (d) => d.kind === "draft" && !d.published_id,
  );
  return (
    <Panel title={tr("Мои события")}>
      <div className="event-actions mb-4">
        {[
          ["upcoming", "Предстоящие"],
          ["drafts", tr("Черновики ({count})", { count: drafts.length })],
          ["past", "Завершённые"],
          ["cancelled", "Отменённые"],
        ].map(([k, l]) => (
          <Button
            key={k}
            variant={tab === k ? "default" : "outline"}
            onClick={() => setTab(k!)}
          >
            {tr(l)}
          </Button>
        ))}
      </div>
      {tab === "drafts" ? (
        <div className="event-rows">
          {drafts.map((d) => (
            <div className="event-row event-line" key={d.id}>
              <div>
                <h3>{tr(d.name)}</h3>
                <small>{tr(dateLabel(d.updated_at, false, language))}</small>
              </div>
              <div className="event-actions">
                <Button onClick={() => draft(d)}>{tr("Продолжить")}</Button>
                <Button variant="ghost" onClick={() => setRemove(d)}>
                  {tr("Удалить")}
                </Button>
              </div>
            </div>
          ))}
          {!drafts.length && (
            <Empty
              title={tr("Нет черновиков")}
              text="Создайте событие — его можно сохранить на любом этапе."
            />
          )}
        </div>
      ) : (
        <>
          <div className="event-filters mb-5">
            <label>
              {tr("Поиск")}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tr("Название или площадка")}
              />
            </label>
            <label>
              {tr("Спорт")}
              <select value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="all">{tr("Все")}</option>
                {SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {tr(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Формат")}
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">{tr("Все")}</option>
                {Object.entries(ACTIVITY_TYPE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {tr(l)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Статус")}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{tr("Все")}</option>
                {Object.entries(ACTIVITY_STATUS_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {tr(l)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Дата")}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <Button
            variant="outline"
            className="mb-4"
            onClick={() => setCalendar(!calendar)}
          >
            {tr(calendar ? "Показать карточки" : "Календарь по датам")}
          </Button>
          <div className="event-rows">
            {rows.map((a, i) => (
              <div key={a.id}>
                {calendar &&
                  (i === 0 ||
                    localDateTime(rows[i - 1]?.date_time).slice(0, 10) !==
                      localDateTime(a.date_time).slice(0, 10)) && (
                    <h3 className="event-date-heading">
                      {formatDate(
                        a.date_time ?? "",
                        { day: "numeric", month: "long" },
                        language,
                      )}
                    </h3>
                  )}
                <article className="event-row">
                  <EventSummary a={a} data={data} />
                  <div className="event-actions mt-4">
                    <Button size="sm" onClick={() => select(a.id)}>
                      {tr("Управлять")}
                    </Button>
                    <Link
                      className="profile-link"
                      to="/activity/$id"
                      params={{ id: a.id }}
                    >
                      {tr("Вид игрока ↗")}
                    </Link>
                    {!["completed", "cancelled"].includes(a.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => edit(a)}
                      >
                        {tr("Редактировать")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => duplicate(a)}
                    >
                      {tr("Создать похожее")}
                    </Button>
                    <CopyEvent event={a} />
                  </div>
                </article>
              </div>
            ))}
            {!rows.length && (
              <Empty
                title={tr("Нет событий по этим условиям")}
                text="Измените фильтры или создайте новое событие."
              />
            )}
          </div>
        </>
      )}
      <Confirm
        open={!!remove}
        title={tr("Удалить черновик?")}
        description={tr(remove?.name ?? "")}
        busy={action.busy}
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          if (
            remove &&
            (await action.mutate("delete_document", { id: remove.id }))
          )
            setRemove(null);
        }}
      />
      <ErrorNotice message={tr(action.error)} />
    </Panel>
  );
}
function CopyEvent({ event: a }: { event: Event }) {
  const { tr } = useI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            `https://sportura.kz/activity/${a.id}${a.is_private && a.invite_code ? "?code=" + encodeURIComponent(a.invite_code) : ""}`,
          );
          toast.success(tr("Ссылка скопирована"));
        } catch {
          toast.error(
            tr(
              "Браузер не разрешил копирование. Откройте событие и скопируйте адрес.",
            ),
          );
        }
      }}
    >
      {tr("Скопировать ссылку")}
    </Button>
  );
}
function EventManagement({
  event: a,
  data,
  section,
  select,
  edit,
  duplicate,
  template,
  back,
}: {
  event: Event;
  data: HostWorkspace;
  section: string;
  select: (s: string) => void;
  edit: () => void;
  duplicate: () => void;
  template: () => void;
  back: () => void;
}) {
  const { tr } = useI18n();
  const [actionName, setActionName] = useState("");
  const [reason, setReason] = useState("");
  const action = useEventAction();
  const regs = data.registrations.filter((r) => r.activity_id === a.id);
  return (
    <>
      <WeatherReschedule event={a} />
      <Panel
        title={tr(a.title)}
        description={`${tr(ACTIVITY_TYPE_LABEL[a.type])} · ${tr(ACTIVITY_STATUS_LABEL[a.status])}`}
      >
        <div className="event-actions">
          <Button variant="ghost" onClick={back}>
            {tr("← Все события")}
          </Button>
          <Link
            className="profile-link"
            to="/activity/$id"
            params={{ id: a.id }}
          >
            {tr("Открыть как игрок")}
          </Link>
          <CopyEvent event={a} />
        </div>
        {a.is_private && (
          <div className="profile-callout mt-4">
            <p>
              {tr("Код приглашения:")}
              {tr(" ")}
              <strong className="break-all">{tr(a.invite_code)}</strong>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(a.invite_code ?? "")
                  .then(() => toast.success(tr("Код скопирован")))
                  .catch(() => toast.error(tr("Скопируйте код вручную")))
              }
            >
              {tr("Копировать код")}
            </Button>
          </div>
        )}
      </Panel>
      <nav className="event-tabs" aria-label={tr("Управление событием")}>
        {Object.entries({
          overview: "Обзор",
          participants: "Участники",
          results: "Результаты",
          history: "История",
        }).map(([k, l]) => (
          <button
            key={k}
            className={section === k ? "is-active" : ""}
            onClick={() => select(k)}
          >
            {tr(l)}
          </button>
        ))}
      </nav>
      {section === "overview" ? (
        <Panel title={tr("Сведения и действия")}>
          <img
            src={a.cover_url || sportImage(a.sport)}
            className="h-48 w-full object-cover rounded-xl mb-5"
            alt={tr("")}
          />
          <EventSummary a={a} data={data} />
          <p className="event-description mt-4">{tr(a.description)}</p>
          <div className="event-actions mt-5">
            <MapLink event={a} />
            <CalendarButton event={a} />
            {!["completed", "cancelled"].includes(a.status) && (
              <>
                <Button variant="outline" onClick={edit}>
                  {tr("Редактировать")}
                </Button>
                {a.type === "daily_game" && (
                  <Button
                    variant="outline"
                    onClick={() => setActionName("completed")}
                  >
                    {tr("Завершить")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setActionName("cancelled")}
                >
                  {tr("Отменить событие")}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={duplicate}>
              {tr("Создать похожее")}
            </Button>
            <Button variant="outline" onClick={template}>
              {tr("Сохранить как шаблон")}
            </Button>
            <HelpLink activity={a.id} />
          </div>
        </Panel>
      ) : section === "participants" ? (
        <Participants key={section} data={data} eventId={a.id} />
      ) : section === "results" ? (
        a.type === "daily_game" ? (
          <Panel title={tr("Результат игры")}>
            <p className="workspace-muted">
              {tr(
                "Для обычной игры результатом служит подтверждённая посещаемость. Отметьте участников и завершите событие — после этого они смогут оставить отзывы.",
              )}
            </p>
            <Button className="mt-4" onClick={() => select("participants")}>
              {tr("Отметить посещение")}
            </Button>
          </Panel>
        ) : (
          <HostCompetition event={a} registrations={regs} />
        )
      ) : (
        <Panel title={tr("История события")}>
          <History items={data.history.filter((h) => h.activity_id === a.id)} />
        </Panel>
      )}
      <Confirm
        open={!!actionName}
        title={tr(
          actionName === "cancelled"
            ? "Отменить событие?"
            : "Завершить событие?",
        )}
        description={tr(
          actionName === "cancelled"
            ? tr("Будут уведомлены {count} участников.", {
                count: regs.filter(
                  (r) => !["cancelled", "rejected"].includes(r.status),
                ).length,
              })
            : "После завершения участники с отмеченным посещением смогут оставить отзыв.",
        )}
        busy={action.busy}
        onClose={() => setActionName("")}
        onConfirm={async () => {
          if (
            await action.mutate("event_status", {
              activity_id: a.id,
              status: actionName,
              reason,
            })
          ) {
            setActionName("");
            setReason("");
          }
        }}
      >
        <label className="event-form">
          {tr("Причина / комментарий")}
          <textarea
            value={reason}
            maxLength={600}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <ErrorNotice message={tr(action.error)} />
      </Confirm>
    </>
  );
}
