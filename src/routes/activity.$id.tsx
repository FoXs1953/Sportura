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
import { supabase } from "@/integrations/supabase/client";
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
  validateSearch: (s: { code?: string } & SearchSchemaInput) => search.parse(s),
  head: () => ({ meta: [{ title: "Событие — Sportura" }] }),
  component: EventPage,
});
function EventPage() {
  const { id } = Route.useParams();
  const { code } = Route.useSearch();
  const [user, setUser] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(data.session?.user.id ?? null);
        setAuthReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user.id ?? null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
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
      title={a?.title ?? "Событие"}
      subtitle={
        a
          ? `${ACTIVITY_TYPE_LABEL[a.type]} · ${a.city} · ${a.sport}`
          : "Условия участия и подробности"
      }
    >
      <div className="events-workspace">
        {q.isPending ? (
          <Panel title="Загружаем событие…">
            <p role="status">Проверяем актуальные места и время.</p>
          </Panel>
        ) : q.error ? (
          <Panel title="Не удалось открыть событие">
            <ErrorNotice message={q.error.message} />
            <Button onClick={() => void q.refetch()}>Повторить</Button>
          </Panel>
        ) : !a ? (
          <Panel title="Событие недоступно">
            <p className="workspace-muted">
              Проверьте ссылку или код приглашения. Для ранее оформленной
              закрытой записи войдите в аккаунт.
            </p>
            <div className="event-actions mt-4">
              <Link className="profile-link" to="/join">
                Ввести код
              </Link>
              {!user && (
                <Link className="profile-link" to="/auth" search={{ redirect }}>
                  Войти
                </Link>
              )}
              <Link className="profile-link" to="/">
                К ленте
              </Link>
            </div>
          </Panel>
        ) : (
          <>
            <section className="workspace-panel overflow-hidden">
              <img
                src={a.cover_url || sportImage(a.sport)}
                alt=""
                className="w-full h-56 sm:h-80 object-cover"
              />
              <div className="p-5 sm:p-7 space-y-5">
                <div className="event-line">
                  <span className="workspace-tag">
                    {eventPhase(a) === "live"
                      ? "Идёт сейчас"
                      : a.status === "cancelled"
                        ? "Отменено"
                        : eventPhase(a) === "past"
                          ? "Завершилось"
                          : registrationOpen(a)
                            ? "Идёт набор"
                            : "Регистрация закрыта"}
                  </span>
                  <span className="workspace-tag">
                    {a.participation_mode === "team"
                      ? "Командная запись"
                      : "Индивидуальное участие"}{" "}
                    · {a.skill_level}
                  </span>
                </div>
                <div className="event-grid">
                  <div className="space-y-3">
                    <h2 className="event-section-title">{a.title}</h2>
                    <p>
                      {dateLabel(a.date_time, true)}
                      {a.duration_minutes
                        ? ` · ${a.duration_minutes} мин.`
                        : ""}
                    </p>
                    {a.duration_minutes && a.date_time && (
                      <p className="workspace-muted text-sm">
                        Окончание:{" "}
                        {dateLabel(new Date(eventEnd(a)!).toISOString(), true)}{" "}
                        · UTC+5
                      </p>
                    )}
                    <p>
                      {a.city}, {a.location_text}
                      {a.district ? ` · ${a.district}` : ""}
                    </p>
                    <p className="workspace-muted">
                      {a.venue_type === "indoor"
                        ? "В помещении"
                        : a.venue_type === "outdoor"
                          ? "На улице"
                          : "Тип площадки не указан"}
                    </p>
                    <div className="event-actions">
                      <MapLink event={a} />
                      <CalendarButton event={a} />
                    </div>
                  </div>
                  <div className="event-muted-box space-y-4">
                    <p className="text-3xl font-bold">
                      {a.is_free ? "Бесплатно" : formatKzt(a.entry_fee)}
                    </p>
                    <p className="workspace-muted text-sm">
                      {a.participation_mode === "team"
                        ? "За команду"
                        : "За участника"}
                    </p>
                    <CapacityMeter
                      registered={a.registered_count}
                      max={a.max_participants}
                    />
                    {a.registration_deadline && (
                      <p className="text-xs workspace-muted">
                        Запись до {dateLabel(a.registration_deadline, true)}
                      </p>
                    )}
                  </div>
                </div>
                {a.status === "cancelled" && (
                  <p className="profile-callout">
                    Событие отменено:{" "}
                    {a.cancellation_reason ||
                      "Подробности уточняйте у организатора"}
                    .
                  </p>
                )}
                {!!conflict?.length && (
                  <p className="profile-callout">
                    Пересекается с вашими играми:{" "}
                    {conflict.map((r) => r.activity.title).join(", ")}.
                    Проверьте расписание перед записью.
                  </p>
                )}
                {waiting && (
                  <div className="event-muted-box">
                    <h3 className="font-bold">
                      Вы в листе ожидания · № {waiting.position}
                    </h3>
                    <p>
                      Сообщим в приложении, когда освободится место. Очередь не
                      является записью на событие.
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
                      Выйти из очереди
                    </Button>
                  </div>
                )}
                {!waiting &&
                  !isActive &&
                  user &&
                  a.registered_count >= a.max_participants &&
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
                      Встать в лист ожидания
                    </Button>
                  )}
                {user && player.isPending ? (
                  <p role="status">Проверяем вашу запись…</p>
                ) : user && player.error ? (
                  <>
                    <ErrorNotice message="Не удалось проверить вашу запись." />
                    <Button
                      variant="outline"
                      onClick={() => void player.refetch()}
                    >
                      Повторить проверку
                    </Button>
                  </>
                ) : isActive ? (
                  <div className="event-muted-box space-y-3">
                    <h3 className="font-bold">
                      Ваша запись: {REGISTRATION_STATUS_LABEL[r.status]}
                    </h3>

                    {r.team_name && (
                      <p>
                        Команда: {r.team_name} · {r.team_members.join(", ")}
                      </p>
                    )}
                    <div className="event-actions">
                      <Link
                        className="profile-link"
                        to="/my-games"
                        search={{ registration: r.id }}
                      >
                        Управлять записью →
                      </Link>
                      {r.status === "registered" &&
                        eventPhase(a) === "upcoming" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCancel(true)}
                          >
                            Отменить участие
                          </Button>
                        )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {r && (
                      <p className="profile-callout">
                        Предыдущая запись: {REGISTRATION_STATUS_LABEL[r.status]}
                        . {r.cancellation_reason}
                      </p>
                    )}
                    {registrationOpen(a) ? (
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
                          {r ? "Записаться снова" : "Записаться на событие"}
                        </Button>
                      ) : (
                        <Link
                          className="workspace-primary-link"
                          to="/auth"
                          onClick={() => trackEvent("register_click")}
                          search={{ redirect }}
                        >
                          Войти и записаться →
                        </Link>
                      )
                    ) : (
                      <p className="workspace-muted">
                        {a.registered_count >= a.max_participants
                          ? "Свободных мест нет."
                          : "Запись на это событие закрыта."}
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
                          {saved ? "♥ Сохранено" : "♡ Сохранить"}
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
                            Напомнить в приложении за сутки
                          </label>
                        )}
                      </>
                    ) : (
                      <Link
                        className="profile-link"
                        to="/auth"
                        search={{ redirect }}
                      >
                        Войти, чтобы сохранить
                      </Link>
                    ))}
                  <Link
                    className="profile-link"
                    to="/organizer/$id"
                    params={{ id: a.manager_id ?? a.organizer_id ?? "" }}
                  >
                    Организатор: {a.host_name} ↗
                  </Link>
                </div>
                <ErrorNotice message={action.error} />
              </div>
            </section>
            <Panel title="Об игре">
              <p className="event-description">
                {a.description || "Описание пока не добавлено."}
              </p>
              {a.notes && (
                <div className="mt-5">
                  <h3 className="font-bold">Что взять и как подготовиться</h3>
                  <p className="event-description workspace-muted mt-2">
                    {a.notes}
                  </p>
                </div>
              )}
            </Panel>
            <Panel title="Правила участия и отмены">
              {a.match_settings && (
                <dl className="mb-4 grid gap-2">
                  {(DISCIPLINE_FIELDS[a.discipline_id ?? ""] ?? []).map((f) => (
                    <div key={f.key}>
                      <dt className="inline text-muted-foreground">
                        {f.label}:{" "}
                      </dt>
                      <dd className="inline">
                        {a.match_settings?.[f.key] ?? f.default}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {r?.status === "registered" && (
                <div className="my-4">
                  <p className="text-sm">
                    Чек-ин открывается за час до начала и закрывается через 30
                    минут после старта.
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
                    {r.checked_in_at
                      ? "Вы отметились"
                      : "Подтвердить присутствие"}
                  </Button>
                </div>
              )}
              <p className="event-description">
                {a.rules || "Дополнительных ограничений организатор не указал."}
              </p>
              <p className="event-description workspace-muted mt-4">
                {a.cancellation_policy ||
                  "Уточните условия участия у организатора."}
              </p>

              <Link className="profile-link inline-block mt-4" to="/legal">
                Общие правила Sportura ↗
              </Link>
            </Panel>

            {a.type !== "daily_game" && q.data && (
              <section id="competition-results">
                <Panel title="Расписание и результаты">
                  <CompetitionView data={q.data} />
                  {user && (
                    <div className="mt-5">
                      <HelpLink activity={a.id}>
                        Вопрос или спор по результатам
                      </HelpLink>
                    </div>
                  )}
                </Panel>
              </section>
            )}
            <Confirm
              open={confirm}
              title={
                joiningWaitlist
                  ? "Встать в лист ожидания"
                  : r
                    ? "Подтвердить повторную запись"
                    : "Подтвердить участие"
              }
              description={`${a.title} · ${dateLabel(a.date_time, true)} · ${a.is_free ? "Бесплатно" : formatKzt(a.entry_fee)} ${a.participation_mode === "team" ? "за команду" : ""}`}
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
                      Название команды
                      <input
                        value={team}
                        maxLength={100}
                        onChange={(e) => setTeam(e.target.value)}
                      />
                    </label>
                    <label>
                      Состав — имя каждого игрока с новой строки
                      <textarea
                        value={members}
                        maxLength={3000}
                        rows={4}
                        onChange={(e) => setMembers(e.target.value)}
                      />
                    </label>
                    <p className="workspace-muted text-sm">
                      Вы будете капитаном и контактным лицом команды.
                    </p>
                  </>
                )}
                <p className="event-description text-sm">
                  {a.cancellation_policy}
                </p>
                <label className="event-check">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                  />
                  Принимаю правила участия и условия отмены
                </label>
                {!terms && (
                  <small className="workspace-muted">
                    Для записи подтвердите условия.
                  </small>
                )}
                <ErrorNotice message={action.error} />
              </div>
            </Confirm>
            <Confirm
              open={cancel}
              title="Отменить участие?"
              description={
                r?.terms_snapshot?.cancellation_policy ??
                a.cancellation_policy ??
                "Запись сохранится в истории."
              }
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
                Причина
                <textarea
                  value={reason}
                  maxLength={600}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <ErrorNotice message={action.error} />
            </Confirm>
          </>
        )}
      </div>
    </AppShell>
  );
}
