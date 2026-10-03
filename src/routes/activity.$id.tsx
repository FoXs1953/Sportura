import { useI18n } from "@/lib/i18n";
import { EVENT_SERIES } from "@/lib/event-series";
import { EventDisputes } from "@/components/events/disputes";
import { DISCIPLINES, DISCIPLINE_FIELDS } from "@/lib/disciplines";
import { trackEvent } from "@/lib/analytics";
import { useState, useEffect } from "react";
import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useSessionUser } from "@/lib/use-session";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { CapacityMeter } from "@/components/sportura/activity-card";
import { readEvent, getPlayerEvents } from "@/lib/event.functions";
import {
  registrationOpen,
  eventPhase,
  eventEnd,
  overlaps,
} from "@/lib/event-model";
import {
  ACTIVITY_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
  REGISTRATION_STATUS_LABEL,
  sportImage,
  formatKzt,
} from "@/lib/sportura";
import {
  Panel,
  Empty,
  ErrorNotice,
  Confirm,
  CalendarButton,
  MapLink,
  HelpLink,
  useEventAction,
  dateLabel,
} from "@/components/events/shared";
import { CompetitionView } from "@/components/events/competition";
import "@/styles/profile.css";
import "@/styles/events.css";
const search = z.object({ code: z.string().max(64).catch("").default("") });
export const Route = createFileRoute("/activity/$id")({
  validateSearch: (
    s: {
      code?: string;
    } & SearchSchemaInput,
  ) => search.parse(s),
  head: () => ({ meta: [{ title: "Событие — Sportura" }] }),
  component: EventPage,
});
function EventPage() {
  const { tr, language } = useI18n();
  const { id } = Route.useParams();
  const { code } = Route.useSearch();
  const session = useSessionUser();
  const user = session.data?.id ?? null;
  const authReady = !session.isPending;
  const q = useQuery({
    queryKey: ["event-public", id, code, user],
    queryFn: () => readEvent({ data: { id, code } }),
    enabled: authReady,
    refetchInterval: 30000,
  });
  const player = useQuery({
    queryKey: ["event-player"],
    queryFn: () => getPlayerEvents(),
    enabled: !!user,
    refetchInterval: 30000,
  });
  const action = useEventAction();
  const [confirm, setConfirm] = useState(false);
  const [terms, setTerms] = useState(false);
  const [team, setTeam] = useState("");
  const [members, setMembers] = useState("");
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const a = q.data?.activity;
  const r = player.data?.registrations.find((r) => r.activity_id === id);
  const isActive = r && !["cancelled", "rejected"].includes(r.status);
  const waiting = player.data?.waitlist?.find((w) => w.activity_id === id);
  const offered =
    !!waiting?.offer_expires_at &&
    Date.parse(waiting.offer_expires_at) > Date.now();
  const queueHasPriority = (q.data?.waitlist_count ?? 0) > 0 && !offered;
  useEffect(() => {
    if (waiting) {
      setTeam(waiting.team_name);
      setMembers(waiting.team_members.join("\n"));
    }
  }, [waiting?.id]);
  const saved = player.data?.saved.find((s) => s.activity_id === id);
  const conflict =
    a &&
    player.data?.registrations.filter(
      (r) =>
        r.activity_id !== id &&
        r.status === "registered" &&
        ["upcoming", "live"].includes(eventPhase(r.activity)) &&
        overlaps(a, r.activity),
    );
  const redirect = `/activity/${id}${code ? "?code=" + encodeURIComponent(code) : ""}`;
  const title = a?.title;
  useEffect(() => {
    if (title) document.title = `${title} — Sportura`;
  }, [title]);
  return (
    <AppShell
      workspace
      title={tr(a?.title ?? "Событие")}
      subtitle={tr(
        a
          ? `${tr(ACTIVITY_TYPE_LABEL[a.type])} · ${tr(a.city)} · ${tr(a.sport)}`
          : "Условия участия и подробности",
      )}
    >
      <div className="events-workspace">
        {q.isPending ? (
          <Panel title={tr("Загружаем событие…")}>
            <p role="status">{tr("Проверяем актуальные места и время.")}</p>
          </Panel>
        ) : q.error ? (
          <Panel title={tr("Не удалось открыть событие")}>
            <ErrorNotice message={tr(q.error.message)} />
            <Button onClick={() => void q.refetch()}>{tr("Повторить")}</Button>
          </Panel>
        ) : !a ? (
          <Panel title={tr("Событие недоступно")}>
            <p className="workspace-muted">
              {tr(
                "Проверьте ссылку или код приглашения. Для ранее оформленной закрытой записи войдите в аккаунт.",
              )}
            </p>
            <div className="event-actions mt-4">
              <Link className="profile-link" to="/join">
                {tr("Ввести код")}
              </Link>
              {!user && (
                <Link className="profile-link" to="/auth" search={{ redirect }}>
                  {tr("Войти")}
                </Link>
              )}
              <Link className="profile-link" to="/">
                {tr("К ленте")}
              </Link>
            </div>
          </Panel>
        ) : (
          <>
            <section className="workspace-panel overflow-hidden">
              <img
                src={a.cover_url || sportImage(a.sport)}
                alt={tr("")}
                className="w-full h-56 sm:h-80 object-cover"
              />
              <div className="p-5 sm:p-7 space-y-5">
                <div className="event-line">
                  <span className="workspace-tag">
                    {tr(
                      eventPhase(a) === "live"
                        ? "Идёт сейчас"
                        : a.status === "cancelled"
                          ? "Отменено"
                          : eventPhase(a) === "past"
                            ? "Завершилось"
                            : registrationOpen(a)
                              ? "Идёт набор"
                              : "Регистрация закрыта",
                    )}
                  </span>
                  <span className="workspace-tag">
                    {tr(
                      a.participation_mode === "team"
                        ? "Командная запись"
                        : "Индивидуальное участие",
                    )}
                    {tr(" ")}· {tr(a.skill_level)}
                  </span>
                </div>
                <div className="event-grid">
                  <div className="space-y-3">
                    <h2 className="event-section-title">{tr(a.title)}</h2>
                    <p>
                      {tr(dateLabel(a.date_time, true, language))}
                      {tr(
                        a.duration_minutes
                          ? tr("· {count} мин.", { count: a.duration_minutes })
                          : "",
                      )}
                    </p>
                    {tr(
                      a.duration_minutes && a.date_time && (
                        <p className="workspace-muted text-sm">
                          {tr("Окончание:")}
                          {tr(" ")}
                          {tr(
                            dateLabel(
                              new Date(eventEnd(a)!).toISOString(),
                              true,
                              language,
                            ),
                          )}
                          {tr(" ")}· UTC+5
                        </p>
                      ),
                    )}
                    <p>
                      {tr(a.city)}, {tr(a.location_text)}
                      {tr(a.district ? ` · ${a.district}` : "")}
                    </p>
                    <p className="workspace-muted">
                      {tr(
                        a.venue_type === "indoor"
                          ? "В помещении"
                          : a.venue_type === "outdoor"
                            ? "На улице"
                            : "Тип площадки не указан",
                      )}
                    </p>
                    <div className="event-actions">
                      <MapLink event={a} />
                      <CalendarButton event={a} />
                    </div>
                  </div>
                  <div className="event-muted-box space-y-4">
                    <p className="text-3xl font-bold">
                      {tr(a.is_free ? "Бесплатно" : formatKzt(a.entry_fee))}
                    </p>
                    <p className="workspace-muted text-sm">
                      {tr(
                        a.participation_mode === "team"
                          ? "За команду"
                          : "За участника",
                      )}
                    </p>
                    <CapacityMeter
                      registered={a.registered_count}
                      max={a.max_participants}
                    />
                    {a.type !== "daily_game" && (
                      <p className="workspace-muted text-sm">
                        {tr("Минимум для старта: ")}
                        {a.min_participants ?? 2}
                        {tr(" ")}
                        {tr(
                          a.participation_mode === "team"
                            ? "команд"
                            : "участников",
                        )}
                        {tr(
                          ". При недоборе к закрытию регистрации турнир отменится автоматически.",
                        )}
                      </p>
                    )}
                    {tr(
                      a.registration_deadline && (
                        <p className="text-xs workspace-muted">
                          {tr("Запись до ")}
                          {tr(
                            dateLabel(a.registration_deadline, true, language),
                          )}
                        </p>
                      ),
                    )}
                  </div>
                </div>
                {a.status === "cancelled" && (
                  <p className="profile-callout">
                    {tr("Событие отменено:")}
                    {tr(" ")}
                    {tr(
                      a.cancellation_reason ||
                        "Подробности уточняйте у организатора",
                    )}
                    .
                  </p>
                )}
                {!!conflict?.length && (
                  <p className="profile-callout">
                    {tr("Пересекается с вашими играми:")}
                    {tr(" ")}
                    {tr(conflict.map((r) => r.activity.title).join(", "))}
                    {tr(". Проверьте расписание перед записью.")}
                  </p>
                )}
                {waiting && (
                  <div className="event-muted-box">
                    <h3 className="font-bold">
                      {tr("Вы в листе ожидания · № ")}
                      {waiting.position}
                    </h3>
                    <p>
                      {tr(
                        offered
                          ? tr(
                              "Место предложено вам. Подтвердите участие до {date} (UTC+5).",
                              {
                                date: dateLabel(
                                  waiting.offer_expires_at ?? null,
                                  true,
                                  language,
                                ),
                              },
                            )
                          : "Сообщим в приложении, когда освободится место. На подтверждение — до 15 минут, но не позже закрытия регистрации или начала события.",
                      )}
                      {tr(" ")}
                      {tr("Очередь не является записью на событие.")}
                    </p>
                    <Button
                      variant="ghost"
                      disabled={action.busy}
                      onClick={() =>
                        void action.mutate(
                          "waitlist_leave",
                          { activity_id: id },
                          "Вы вышли из очереди",
                        )
                      }
                    >
                      {tr("Выйти из очереди")}
                    </Button>
                  </div>
                )}
                {tr(
                  !waiting &&
                    !isActive &&
                    user &&
                    (a.registered_count >= a.max_participants ||
                      queueHasPriority) &&
                    eventPhase(a) === "upcoming" &&
                    (!a.registration_deadline ||
                      Date.parse(a.registration_deadline) > Date.now()) &&
                    !q.data?.matches.length && (
                      <Button
                        variant="outline"
                        disabled={action.busy}
                        onClick={() => {
                          setJoiningWaitlist(true);
                          setTerms(false);
                          setConfirm(true);
                        }}
                      >
                        {tr("Встать в лист ожидания")}
                      </Button>
                    ),
                )}
                {user && player.isPending ? (
                  <p role="status">{tr("Проверяем вашу запись…")}</p>
                ) : user && player.error ? (
                  <>
                    <ErrorNotice
                      message={tr("Не удалось проверить вашу запись.")}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void player.refetch()}
                    >
                      {tr("Повторить проверку")}
                    </Button>
                  </>
                ) : isActive ? (
                  <div className="event-muted-box space-y-3">
                    <h3 className="font-bold">
                      {tr("Ваша запись: ")}
                      {tr(REGISTRATION_STATUS_LABEL[r.status])}
                    </h3>

                    {tr(
                      r.team_name && (
                        <p>
                          {tr("Команда: ")}
                          {tr(r.team_name)} · {tr(r.team_members.join(", "))}
                        </p>
                      ),
                    )}
                    <div className="event-actions">
                      <Link
                        className="profile-link"
                        to="/my-games"
                        search={{ registration: r.id }}
                      >
                        {tr("Управлять записью →")}
                      </Link>
                      {r.status === "registered" &&
                        eventPhase(a) === "upcoming" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCancel(true)}
                          >
                            {tr("Отменить участие")}
                          </Button>
                        )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {r && (
                      <p className="profile-callout">
                        {tr("Предыдущая запись: ")}
                        {tr(REGISTRATION_STATUS_LABEL[r.status])}.{" "}
                        {tr(r.cancellation_reason)}
                      </p>
                    )}
                    {registrationOpen(a) && !queueHasPriority ? (
                      user ? (
                        <Button
                          disabled={action.busy}
                          onClick={() => {
                            trackEvent("register_click");
                            setTerms(false);
                            setJoiningWaitlist(false);
                            setConfirm(true);
                          }}
                        >
                          {tr(
                            offered
                              ? "Подтвердить предложенное место"
                              : r
                                ? "Записаться снова"
                                : "Записаться на событие",
                          )}
                        </Button>
                      ) : (
                        <Link
                          className="workspace-primary-link"
                          to="/auth"
                          onClick={() => trackEvent("register_click")}
                          search={{ redirect }}
                        >
                          {tr("Войти и записаться →")}
                        </Link>
                      )
                    ) : (
                      <p className="workspace-muted">
                        {tr(
                          queueHasPriority && registrationOpen(a)
                            ? "Свободные места предложены участникам очереди. Дождитесь своего предложения."
                            : a.registered_count >= a.max_participants
                              ? "Свободных мест нет."
                              : "Запись на это событие закрыта.",
                        )}
                      </p>
                    )}
                  </div>
                )}
                <div className="event-actions">
                  {!a.is_private &&
                    (user ? (
                      <>
                        <Button
                          variant="outline"
                          disabled={action.busy}
                          onClick={() =>
                            void action.mutate(
                              "favorite",
                              {
                                activity_id: a.id,
                                saved: !saved,
                                reminder: saved?.reminder ?? false,
                              },
                              saved
                                ? "Удалено из сохранённых"
                                : "Событие сохранено",
                            )
                          }
                        >
                          {tr(saved ? "♥ Сохранено" : "♡ Сохранить")}
                        </Button>
                        {saved && (
                          <label className="event-check">
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
                            {tr("Напомнить в приложении за сутки")}
                          </label>
                        )}
                      </>
                    ) : (
                      <Link
                        className="profile-link"
                        to="/auth"
                        search={{ redirect }}
                      >
                        {tr("Войти, чтобы сохранить")}
                      </Link>
                    ))}
                  <Link
                    className="profile-link"
                    to="/organizer/$id"
                    params={{ id: a.manager_id ?? a.organizer_id ?? "" }}
                  >
                    {tr("Организатор: ")}
                    {tr(a.host_name)} ↗
                  </Link>
                </div>
                <ErrorNotice message={tr(action.error)} />
              </div>
            </section>
            <Panel title={tr("Об игре")}>
              <p className="event-description">
                {tr(a.description || "Описание пока не добавлено.")}
              </p>
              {tr(
                a.notes && (
                  <div className="mt-5">
                    <h3 className="font-bold">
                      {tr("Что взять и как подготовиться")}
                    </h3>
                    <p className="event-description workspace-muted mt-2">
                      {tr(a.notes)}
                    </p>
                  </div>
                ),
              )}
            </Panel>
            <Panel title={tr("Правила участия и отмены")}>
              {a.match_settings && (
                <dl className="mb-4 grid gap-2">
                  {(DISCIPLINE_FIELDS[a.discipline_id ?? ""] ?? []).map((f) => (
                    <div key={f.key}>
                      <dt className="inline text-muted-foreground">
                        {tr(f.label)}:{tr(" ")}
                      </dt>
                      <dd className="inline">
                        {tr(a.match_settings?.[f.key] ?? f.default)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {r?.status === "registered" && (
                <div className="my-4">
                  <p className="text-sm">
                    {tr(
                      "Чек-ин открывается за час до начала и закрывается через 30 минут после старта.",
                    )}
                  </p>
                  <Button
                    className="mt-2"
                    disabled={action.busy || !!r.checked_in_at}
                    onClick={() =>
                      action.mutate(
                        "checkin",
                        { activity_id: a.id },
                        "Участие подтверждено",
                      )
                    }
                  >
                    {tr(
                      r.checked_in_at
                        ? "Вы отметились"
                        : "Подтвердить присутствие",
                    )}
                  </Button>
                </div>
              )}
              <p className="event-description">
                {tr(
                  a.rules ||
                    "Дополнительных ограничений организатор не указал.",
                )}
              </p>
              <p className="event-description workspace-muted mt-4">
                {tr(
                  a.cancellation_policy ||
                    "Уточните условия участия у организатора.",
                )}
              </p>

              <Link className="profile-link inline-block mt-4" to="/legal">
                {tr("Общие правила Sportura ↗")}
              </Link>
            </Panel>

            {a.type !== "daily_game" && q.data && (
              <section id="competition-results">
                <Panel title={tr("Расписание и результаты")}>
                  {a.event_extras?.series && (
                    <p className="workspace-tag">
                      {tr(EVENT_SERIES[a.event_extras.series])}
                    </p>
                  )}
                  {a.event_extras?.series === "rookie_cup" && (
                    <p>
                      {tr("Рейтинг до ")}
                      {a.event_extras.rating_limit ?? 1100}
                    </p>
                  )}
                  {tr(
                    a.event_extras?.qualifier_id && (
                      <p>
                        {tr("Для призёров отборочного турнира, места 1–4.")}
                      </p>
                    ),
                  )}
                  <CompetitionView data={q.data} />
                  {r && (
                    <EventDisputes
                      activityId={a.id}
                      canOpen={
                        !!a.results_submitted_at &&
                        !!a.dispute_window_ends_at &&
                        Date.parse(a.dispute_window_ends_at) > Date.now()
                      }
                    />
                  )}
                  {tr(
                    user && (
                      <div className="mt-5">
                        <HelpLink activity={a.id}>
                          {tr("Вопрос или спор по результатам")}
                        </HelpLink>
                      </div>
                    ),
                  )}
                </Panel>
              </section>
            )}
            <Confirm
              open={confirm}
              title={tr(
                joiningWaitlist
                  ? "Встать в лист ожидания"
                  : r
                    ? "Подтвердить повторную запись"
                    : "Подтвердить участие",
              )}
              description={`${a.title} · ${dateLabel(a.date_time, true, language)} · ${a.is_free ? tr("Бесплатно") : formatKzt(a.entry_fee)}${a.participation_mode === "team" ? ` ${tr("за команду")}` : ""}`}
              busy={action.busy}
              onClose={() => setConfirm(false)}
              onConfirm={async () => {
                if (!terms) return;
                if (
                  await action.mutate(
                    joiningWaitlist ? "waitlist_join" : "join",
                    {
                      activity_id: a.id,
                      code,
                      accepted_terms: true,
                      team_name: team,
                      team_members: members
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                    joiningWaitlist ? "Вы в листе ожидания" : "Вы записаны",
                  )
                )
                  setConfirm(false);
              }}
            >
              <div className="event-form">
                {a.participation_mode === "team" && (
                  <>
                    <label>
                      {tr("Название команды")}
                      <input
                        value={team}
                        maxLength={100}
                        onChange={(e) => setTeam(e.target.value)}
                      />
                    </label>
                    <label>
                      {tr("Состав — имя каждого игрока с новой строки")}
                      <textarea
                        value={members}
                        maxLength={3000}
                        rows={4}
                        onChange={(e) => setMembers(e.target.value)}
                      />
                    </label>
                    <p className="workspace-muted text-sm">
                      {tr("Вы будете капитаном и контактным лицом команды.")}
                    </p>
                  </>
                )}
                <p className="event-description text-sm">
                  {tr(a.cancellation_policy)}
                </p>
                <label className="event-check">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                  />
                  {tr("Принимаю правила участия и условия отмены")}
                </label>
                {!terms && (
                  <small className="workspace-muted">
                    {tr("Для записи подтвердите условия.")}
                  </small>
                )}
                <ErrorNotice message={tr(action.error)} />
              </div>
            </Confirm>
            <Confirm
              open={cancel}
              title={tr("Отменить участие?")}
              description={tr(
                r?.terms_snapshot?.cancellation_policy ??
                  a.cancellation_policy ??
                  "Запись сохранится в истории.",
              )}
              busy={action.busy}
              onClose={() => setCancel(false)}
              onConfirm={async () => {
                if (
                  r &&
                  (await action.mutate(
                    "cancel",
                    { registration_id: r.id, reason },
                    "Запись отменена",
                  ))
                )
                  setCancel(false);
              }}
            >
              <label className="event-form">
                {tr("Причина")}
                <textarea
                  value={reason}
                  maxLength={600}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <ErrorNotice message={tr(action.error)} />
            </Confirm>
          </>
        )}
      </div>
    </AppShell>
  );
}
