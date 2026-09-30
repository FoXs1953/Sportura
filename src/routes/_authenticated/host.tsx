import { disputeAction } from "@/lib/competition-admin.functions";
import { WeatherReschedule } from "@/components/events/prizes";
import { EventDisputes } from "@/components/events/disputes";
import { OrganizerTrust } from "@/components/events/host/trust";
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
      title="Кабинет организатора"
      subtitle="События, участники и результаты в одном месте"
    >
      <UnsavedChanges>
        <div className="events-workspace">
          {me.isPending || q.isPending ? (
            <Panel title="Загружаем кабинет…">
              <p className="workspace-muted">
                Получаем события и последние изменения.
              </p>
            </Panel>
          ) : me.error || q.error ? (
            <Panel title="Не удалось загрузить кабинет">
              <ErrorNotice
                message={me.error?.message ?? q.error?.message ?? ""}
              />
              <Button
                onClick={() => {
                  void me.refetch();
                  void q.refetch();
                }}
              >
                Повторить
              </Button>
            </Panel>
          ) : me.data &&
            !me.data.roles.some((r) =>
              ["admin", "sports_manager", "tournament_organizer"].includes(r),
            ) ? (
            <Panel title="Станьте организатором">
              <p className="workspace-muted mb-4">
                Подайте заявку, чтобы создавать игры или соревнования.
              </p>
              <Link
                className="workspace-primary-link"
                to="/profile"
                search={{ tab: "organizer" }}
              >
                Подать заявку →
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
      {["overview", "settings"].includes(search.tab) && (
        <OrganizerTrust
          firstSpark={data.activities.some(
            (a) => a.type === "tournament" && a.tier === "spark",
          )}
        />
      )}
      <div className="event-toolbar">
        <p className="workspace-kicker">SPORTURA / ORGANIZER</p>
        <Button
          disabled={!!editor && search.tab === "events"}
          onClick={() => {
            setEditor({ key: crypto.randomUUID() });
            go("events");
          }}
        >
          + Создать событие
        </Button>
      </div>
      <nav className="event-tabs" aria-label="Кабинет организатора">
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
              {l}
            </button>
          ))}
      </nav>
      <ErrorNotice message={action.error} />
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
        <Overview data={data} me={me} go={go} />
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
          <Panel title="Турниры и лиги">
            <div className="event-rows">
              {data.activities
                .filter((a) => a.type !== "daily_game")
                .map((a) => (
                  <button
                    className="event-row text-left"
                    key={a.id}
                    onClick={() => go("competitions", a.id)}
                  >
                    <h3>{a.title}</h3>
                    <p className="workspace-muted">
                      {ACTIVITY_TYPE_LABEL[a.type]} ·{" "}
                      {ACTIVITY_STATUS_LABEL[a.status]} · {a.registered_count}{" "}
                      {a.participation_mode === "team"
                        ? "команд"
                        : "участников"}{" "}
                      ·{" "}
                      {data.matches.some((m) => m.activity_id === a.id)
                        ? "Расписание создано"
                        : "Подготовка расписания"}
                    </p>
                  </button>
                ))}
              {!data.activities.some((a) => a.type !== "daily_game") && (
                <Empty
                  title="Первое соревнование впереди"
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
      ) : null}
    </>
  );
}
function Overview({
  data: d,
  me,
  go,
}: {
  data: HostWorkspace;
  me: MyProfile;
  go: (
    tab: keyof typeof tabs,
    event?: string,
    section?: string,
    status?: string,
  ) => void;
}) {
  const disputes = useQuery({
    queryKey: ["disputes", "all"],
    queryFn: () => disputeAction({ data: { action: "list", payload: {} } }),
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
  const checks = d.registrations.filter(
    (r) => r.payment_status === "needs_review",
  );
  const refunds = d.refunds.filter(
    (f) => !["completed", "rejected"].includes(f.status),
  );
  const today = localDateTime(new Date().toISOString()).slice(0, 10);
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
      <Panel
        title={me.name}
        description={`${me.city} · ${me.roles
          .filter((r) => r !== "participant")
          .map((r) => ROLE_LABEL[r])
          .join(", ")}`}
      >
        <div className="event-line">
          <span className="workspace-tag">
            {me.verified ? "Профиль проверен" : "Роль организатора активна"}
          </span>
          <Link
            className="profile-link"
            to="/organizer/$id"
            params={{ id: me.id }}
          >
            Публичная страница ↗
          </Link>
        </div>
      </Panel>
      <div className="event-stats">
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
            <span>{String(l)}</span>
          </button>
        ))}
      </div>
      {future[0] && (
        <Panel title="Ближайшее событие">
          <EventSummary a={future[0]} data={d} />
          <div className="event-actions mt-4">
            <Button onClick={() => go("events", future[0]!.id)}>
              Управлять событием
            </Button>
            <CalendarButton event={future[0]} />
          </div>
        </Panel>
      )}
      <Panel title="Требует внимания">
        {openDisputes > 0 && (
          <Button
            className="mb-3"
            variant="outline"
            onClick={() => go("disputes")}
          >
            Открытые споры: {openDisputes} →
          </Button>
        )}
        <div className="event-rows">
          {attention.map((a) => (
            <button
              key={a.id}
              className="event-row text-left"
              onClick={() => go("events", a.id)}
            >
              {a.title}:{" "}
              {eventPhase(a) === "upcoming"
                ? "набрано меньше половины состава"
                : "проверьте посещение и результаты"}{" "}
              →
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
              <strong>{n.title}</strong>
              <p className="workspace-muted text-sm">{n.body}</p>
            </a>
          ))}
          {!checks.length &&
            !refunds.length &&
            !attention.length &&
            !d.notifications.length && (
              <Empty title="Всё спокойно" text="Новые задачи появятся здесь." />
            )}
        </div>
      </Panel>
      <Panel title="План на сегодня">
        <div className="event-rows">
          {d.activities
            .filter(
              (a) =>
                a.status !== "cancelled" &&
                localDateTime(a.date_time).startsWith(today),
            )
            .map((a) => (
              <button
                key={a.id}
                className="event-row text-left"
                onClick={() => go("events", a.id)}
              >
                {dateLabel(a.date_time, true)} · {a.title} →
              </button>
            ))}
        </div>
        {!d.activities.some((a) =>
          localDateTime(a.date_time).startsWith(today),
        ) && (
          <p className="workspace-muted">
            Сегодня событий нет. Можно подготовить следующую игру.
          </p>
        )}
      </Panel>
      {!d.activities.length && (
        <Panel title="Первые шаги">
          <ol className="list-decimal ml-5 space-y-2">
            <li>
              <Link
                className="profile-link"
                to="/profile"
                search={{ tab: "organizer" }}
              >
                Заполните сведения организатора
              </Link>
            </li>
            <li>Создайте событие и сохраните черновик.</li>
            <li>Проверьте карточку и опубликуйте.</li>
          </ol>
        </Panel>
      )}
      <Panel title="Последние изменения">
        <History items={d.history.slice(0, 8)} />
      </Panel>
    </>
  );
}
function EventSummary({ a, data }: { a: Event; data: HostWorkspace }) {
  const regs = data.registrations.filter((r) => r.activity_id === a.id);
  return (
    <div className="event-line">
      <div>
        <h3 className="event-title">{a.title}</h3>
        <p className="workspace-muted mt-2">
          {dateLabel(a.date_time, true)} · {a.location_text}
        </p>
        <p className="text-sm mt-2">
          {ACTIVITY_TYPE_LABEL[a.type]} · {ACTIVITY_STATUS_LABEL[a.status]} ·{" "}
          {a.registered_count}/{a.max_participants} мест · Бесплатное участие
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
    <Panel title="Мои события">
      <div className="event-actions mb-4">
        {[
          ["upcoming", "Предстоящие"],
          ["drafts", `Черновики (${drafts.length})`],
          ["past", "Завершённые"],
          ["cancelled", "Отменённые"],
        ].map(([k, l]) => (
          <Button
            key={k}
            variant={tab === k ? "default" : "outline"}
            onClick={() => setTab(k!)}
          >
            {l}
          </Button>
        ))}
      </div>
      {tab === "drafts" ? (
        <div className="event-rows">
          {drafts.map((d) => (
            <div className="event-row event-line" key={d.id}>
              <div>
                <h3>{d.name}</h3>
                <small>{dateLabel(d.updated_at)}</small>
              </div>
              <div className="event-actions">
                <Button onClick={() => draft(d)}>Продолжить</Button>
                <Button variant="ghost" onClick={() => setRemove(d)}>
                  Удалить
                </Button>
              </div>
            </div>
          ))}
          {!drafts.length && (
            <Empty
              title="Нет черновиков"
              text="Создайте событие — его можно сохранить на любом этапе."
            />
          )}
        </div>
      ) : (
        <>
          <div className="event-filters mb-5">
            <label>
              Поиск
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Название или площадка"
              />
            </label>
            <label>
              Спорт
              <select value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="all">Все</option>
                {SPORTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Формат
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">Все</option>
                {Object.entries(ACTIVITY_TYPE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Статус
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Все</option>
                {Object.entries(ACTIVITY_STATUS_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Дата
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
            {calendar ? "Показать карточки" : "Календарь по датам"}
          </Button>
          <div className="event-rows">
            {rows.map((a, i) => (
              <div key={a.id}>
                {calendar &&
                  (i === 0 ||
                    localDateTime(rows[i - 1]?.date_time).slice(0, 10) !==
                      localDateTime(a.date_time).slice(0, 10)) && (
                    <h3 className="event-date-heading">
                      {new Date(a.date_time ?? "").toLocaleDateString("ru-RU", {
                        timeZone: "Asia/Almaty",
                        day: "numeric",
                        month: "long",
                      })}
                    </h3>
                  )}
                <article className="event-row">
                  <EventSummary a={a} data={data} />
                  <div className="event-actions mt-4">
                    <Button size="sm" onClick={() => select(a.id)}>
                      Управлять
                    </Button>
                    <Link
                      className="profile-link"
                      to="/activity/$id"
                      params={{ id: a.id }}
                    >
                      Вид игрока ↗
                    </Link>
                    {!["completed", "cancelled"].includes(a.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => edit(a)}
                      >
                        Редактировать
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => duplicate(a)}
                    >
                      Создать похожее
                    </Button>
                    <CopyEvent event={a} />
                  </div>
                </article>
              </div>
            ))}
            {!rows.length && (
              <Empty
                title="Нет событий по этим условиям"
                text="Измените фильтры или создайте новое событие."
              />
            )}
          </div>
        </>
      )}
      <Confirm
        open={!!remove}
        title="Удалить черновик?"
        description={remove?.name ?? ""}
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
      <ErrorNotice message={action.error} />
    </Panel>
  );
}
function CopyEvent({ event: a }: { event: Event }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            `https://sportura.vercel.app/activity/${a.id}${a.is_private && a.invite_code ? "?code=" + encodeURIComponent(a.invite_code) : ""}`,
          );
          toast.success("Ссылка скопирована");
        } catch {
          toast.error(
            "Браузер не разрешил копирование. Откройте событие и скопируйте адрес.",
          );
        }
      }}
    >
      Скопировать ссылку
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
  const [actionName, setActionName] = useState("");
  const [reason, setReason] = useState("");
  const action = useEventAction();
  const regs = data.registrations.filter((r) => r.activity_id === a.id);
  return (
    <>
      <WeatherReschedule event={a} />
      <Panel
        title={a.title}
        description={`${ACTIVITY_TYPE_LABEL[a.type]} · ${ACTIVITY_STATUS_LABEL[a.status]}`}
      >
        <div className="event-actions">
          <Button variant="ghost" onClick={back}>
            ← Все события
          </Button>
          <Link
            className="profile-link"
            to="/activity/$id"
            params={{ id: a.id }}
          >
            Открыть как игрок
          </Link>
          <CopyEvent event={a} />
        </div>
        {a.is_private && (
          <div className="profile-callout mt-4">
            <p>
              Код приглашения:{" "}
              <strong className="break-all">{a.invite_code}</strong>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(a.invite_code ?? "")
                  .then(() => toast.success("Код скопирован"))
                  .catch(() => toast.error("Скопируйте код вручную"))
              }
            >
              Копировать код
            </Button>
          </div>
        )}
      </Panel>
      <nav className="event-tabs" aria-label="Управление событием">
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
            {l}
          </button>
        ))}
      </nav>
      {section === "overview" ? (
        <Panel title="Сведения и действия">
          <img
            src={a.cover_url || sportImage(a.sport)}
            className="h-48 w-full object-cover rounded-xl mb-5"
            alt=""
          />
          <EventSummary a={a} data={data} />
          <p className="event-description mt-4">{a.description}</p>
          <div className="event-actions mt-5">
            <MapLink event={a} />
            <CalendarButton event={a} />
            {!["completed", "cancelled"].includes(a.status) && (
              <>
                <Button variant="outline" onClick={edit}>
                  Редактировать
                </Button>
                {a.type === "daily_game" && (
                  <Button
                    variant="outline"
                    onClick={() => setActionName("completed")}
                  >
                    Завершить
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setActionName("cancelled")}
                >
                  Отменить событие
                </Button>
              </>
            )}
            <Button variant="outline" onClick={duplicate}>
              Создать похожее
            </Button>
            <Button variant="outline" onClick={template}>
              Сохранить как шаблон
            </Button>
            <HelpLink activity={a.id} />
          </div>
        </Panel>
      ) : section === "participants" ? (
        <Participants key={section} data={data} eventId={a.id} />
      ) : section === "results" ? (
        a.type === "daily_game" ? (
          <Panel title="Результат игры">
            <p className="workspace-muted">
              Для обычной игры результатом служит подтверждённая посещаемость.
              Отметьте участников и завершите событие — после этого они смогут
              оставить отзывы.
            </p>
            <Button className="mt-4" onClick={() => select("participants")}>
              Отметить посещение
            </Button>
          </Panel>
        ) : (
          <HostCompetition event={a} registrations={regs} />
        )
      ) : (
        <Panel title="История события">
          <History items={data.history.filter((h) => h.activity_id === a.id)} />
        </Panel>
      )}
      <Confirm
        open={!!actionName}
        title={
          actionName === "cancelled"
            ? "Отменить событие?"
            : "Завершить событие?"
        }
        description={
          actionName === "cancelled"
            ? `Будут уведомлены ${regs.filter((r) => !["cancelled", "rejected"].includes(r.status)).length} участников. `
            : "После завершения участники с отмеченным посещением смогут оставить отзыв."
        }
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
          Причина / комментарий
          <textarea
            value={reason}
            maxLength={600}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <ErrorNotice message={action.error} />
      </Confirm>
    </>
  );
}
