import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  CalendarDays,
  Wallet,
  History as HistoryIcon,
  Star,
  LifeBuoy,
} from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getPlayerEvents } from "@/lib/event.functions";
import {
  eventPhase,
  overlaps,
  refundLabels,
  localDateTime,
  type Registration,
} from "@/lib/event-model";
import {
  sportImage,
  PAYMENT_STATUS_LABEL,
  REGISTRATION_STATUS_LABEL,
  formatKzt,
  SPORTS,
} from "@/lib/sportura";
import {
  Panel,
  Empty,
  ErrorNotice,
  Confirm,
  CalendarButton,
  MapLink,
  History,
  HelpLink,
  useEventAction,
  dateLabel,
} from "@/components/events/shared";
import "@/styles/profile.css";
import "@/styles/events.css";
const tabs = [
  "upcoming",
  "payments",
  "cancelled",
  "history",
  "reviews",
  "help",
] as const;
const labels = {
  upcoming: "Предстоящие",
  payments: "",
  cancelled: "Отменённые",
  history: "История",
  reviews: "Отзывы",
  help: "Помощь",
};
const schema = z.object({
  tab: z.enum(tabs).catch("upcoming").default("upcoming"),
  payment: z.string().optional(),
  registration: z.string().uuid().optional(),
});
export const Route = createFileRoute("/_authenticated/my-games")({
  validateSearch: (
    s: {
      tab?: string;
      payment?: string;
      registration?: string;
    } & SearchSchemaInput,
  ) =>
    schema.parse({
      ...s,
      ...(s.tab === "payments" ? { tab: "upcoming" } : {}),
    }),
  head: () => ({ meta: [{ title: "Мои игры — Sportura" }] }),
  component: MyGames,
});
function MyGames() {
  const query = useQuery({
    queryKey: ["event-player"],
    queryFn: () => getPlayerEvents(),
    refetchInterval: 30000,
  });
  const { tab, payment, registration } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const regs = query.data?.registrations ?? [];
  const active = regs.filter(
    (r) =>
      !["cancelled", "rejected"].includes(r.status) &&
      r.activity.status !== "cancelled",
  );
  const upcoming = active
    .filter((r) => eventPhase(r.activity) !== "past")
    .sort((a, b) =>
      (a.activity.date_time ?? "z").localeCompare(b.activity.date_time ?? "z"),
    );
  const due = active.filter(
    (r) =>
      ["pending", "rejected"].includes(r.payment_status) && r.amount_due !== 0,
  );
  const review = active.filter((r) => r.payment_status === "needs_review");
  const refunds = regs.filter(
    (r) => r.refund && !["completed", "rejected"].includes(r.refund.status),
  );
  const shown = regs
    .filter((r) => !registration || r.id === registration)
    .filter((r) => {
      const phase = eventPhase(r.activity);
      const cancelled =
        ["cancelled", "rejected"].includes(r.status) || phase === "cancelled";
      return tab === "upcoming"
        ? !cancelled && phase !== "past"
        : tab === "payments"
          ? r.amount_due !== 0 &&
            (!payment ||
              (payment === "action"
                ? ["pending", "rejected"].includes(r.payment_status)
                : r.payment_status === payment))
          : tab === "cancelled"
            ? cancelled || !!r.refund
            : tab === "history"
              ? !cancelled && phase === "past"
              : tab === "reviews"
                ? phase === "past"
                : true;
    })
    .filter(
      (r) =>
        (sport === "all" || r.activity.sport === sport) &&
        (status === "all" || r.status === status) &&
        `${r.activity.title} ${r.activity.location_text} ${r.activity.host_name}`
          .toLowerCase()
          .includes(q.toLowerCase()) &&
        (!from ||
          (!!r.activity.date_time &&
            localDateTime(r.activity.date_time).slice(0, 10) >= from)) &&
        (!to ||
          (!!r.activity.date_time &&
            localDateTime(r.activity.date_time).slice(0, 10) <= to)),
    )
    .sort((a, b) =>
      tab === "upcoming"
        ? (a.activity.date_time ?? "z").localeCompare(
            b.activity.date_time ?? "z",
          )
        : (b.activity.date_time ?? "").localeCompare(
            a.activity.date_time ?? "",
          ),
    );
  const go = (next: typeof tab, p?: string) =>
    void navigate({ search: { tab: next, ...(p ? { payment: p } : {}) } });
  return (
    <AppShell
      workspace
      title="Мои игры"
      subtitle="Ваше расписание, участие и результаты"
    >
      <div className="events-workspace">
        {!!query.data?.waitlist?.length && (
          <Panel
            title="Лист ожидания"
            description="После предложения места у вас до 15 минут на подтверждение, но не позже закрытия регистрации или начала события."
          >
            {query.data.waitlist.map((w) => (
              <div key={w.id} className="event-row">
                <Link
                  className="profile-link"
                  to="/activity/$id"
                  params={{ id: w.activity_id }}
                >
                  {w.activity?.title ?? "Событие"} →
                </Link>
                <p className="workspace-muted">Номер в очереди: {w.position}</p>
                {w.offer_expires_at &&
                  Date.parse(w.offer_expires_at) > Date.now() && (
                    <p className="font-semibold">
                      Место предложено · подтвердите до{" "}
                      {dateLabel(w.offer_expires_at, true)} (UTC+5)
                    </p>
                  )}
              </div>
            ))}
          </Panel>
        )}
        <div className="event-stats">
          {[[upcoming.length, "Впереди", () => go("upcoming")]].map(
            ([n, l, fn]) => (
              <button
                key={String(l)}
                className="workspace-stat"
                onClick={fn as () => void}
              >
                <strong>{query.isPending ? "—" : (n as number)}</strong>
                <span>{l as string}</span>
              </button>
            ),
          )}
        </div>
        {upcoming[0] && tab === "upcoming" && (
          <Panel
            title={
              eventPhase(upcoming[0].activity) === "live"
                ? "Идёт сейчас"
                : "Ваша ближайшая игра"
            }
          >
            <div className="event-line">
              <div>
                <h3 className="text-xl font-bold">
                  {upcoming[0].activity.title}
                </h3>
                <p className="workspace-muted">
                  {dateLabel(upcoming[0].activity.date_time, true)} ·{" "}
                  {upcoming[0].activity.location_text}
                </p>
              </div>
              <div className="event-actions">
                <Link
                  to="/activity/$id"
                  params={{ id: upcoming[0].activity.id }}
                  className="workspace-primary-link"
                >
                  Открыть игру
                </Link>
                <CalendarButton event={upcoming[0].activity} />
                <MapLink event={upcoming[0].activity} />
              </div>
            </div>
          </Panel>
        )}
        {!!query.data?.notifications.length && tab === "upcoming" && (
          <Panel title="Требует внимания">
            <div className="event-notices">
              {query.data.notifications.slice(0, 5).map((n) => (
                <a
                  className="profile-item"
                  href={
                    n.href.startsWith("/") && !n.href.startsWith("//")
                      ? n.href
                      : "/my-games"
                  }
                  key={n.id}
                >
                  <strong>{n.title} →</strong>
                  <p className="workspace-muted text-xs">{n.body}</p>
                </a>
              ))}
            </div>
          </Panel>
        )}
        <nav className="event-tabs" aria-label="Разделы моих игр">
          {tabs
            .filter((t) => t !== "payments")
            .map((t) => (
              <button
                key={t}
                className={tab === t ? "is-active" : ""}
                onClick={() => go(t)}
                aria-current={tab === t ? "page" : undefined}
              >
                {labels[t]}
              </button>
            ))}
        </nav>
        {tab === "help" ? (
          <Panel
            title="Помощь по вашим играм"
            subtitle="Обращения сохраняются в общей истории поддержки профиля."
          >
            <div className="event-actions">
              <HelpLink />
              <Link
                className="profile-link"
                to="/profile"
                search={{ tab: "help" }}
              >
                Мои обращения →
              </Link>
              <Link className="profile-link" to="/legal">
                Правила участия и отмены →
              </Link>
            </div>
            <p className="workspace-muted mt-4">
              Чтобы привязать проблему к игре, откройте нужную запись и нажмите
              «Обратиться в поддержку». Для споров о результатах срок указан в
              карточке соревнования.
            </p>
          </Panel>
        ) : (
          <>
            {registration && (
              <Button variant="outline" onClick={() => go(tab)}>
                Показать все мои игры
              </Button>
            )}
            <div className="event-filters">
              <label>
                Поиск
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Игра, площадка, организатор"
                />
              </label>
              <label>
                Спорт
                <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                >
                  <option value="all">Все виды</option>
                  {SPORTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Участие
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Все статусы</option>
                  {Object.entries(REGISTRATION_STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                С даты
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                По дату
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
            {query.isPending ? (
              <div className="workspace-panel p-8" role="status">
                Загружаем ваши игры…
              </div>
            ) : query.isError ? (
              <Panel title="Не удалось загрузить игры">
                <ErrorNotice message={query.error.message} />
                <Button onClick={() => void query.refetch()}>Повторить</Button>
              </Panel>
            ) : !shown.length ? (
              <Panel
                title={
                  regs.length
                    ? "Нет записей по выбранным условиям"
                    : "Самое время выбрать первую игру"
                }
              >
                <Empty title="Здесь появятся ваши записи">
                  <Link className="workspace-primary-link" to="/">
                    Найти игру →
                  </Link>
                </Empty>
              </Panel>
            ) : (
              <div className="event-records">
                {shown.map((r) => (
                  <GameRecord
                    key={`${tab}:${r.id}`}
                    r={r}
                    tab={tab}
                    conflict={upcoming.some(
                      (other) =>
                        other.id !== r.id &&
                        overlaps(other.activity, r.activity),
                    )}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
function GameRecord({
  r,
  tab,
  conflict,
}: {
  r: Registration;
  tab: string;
  conflict: boolean;
}) {
  const a = r.activity;
  const action = useEventAction();
  const [panel, setPanel] = useState(
    tab === "payments" ? "payment" : tab === "reviews" ? "review" : "",
  );
  const [dialog, setDialog] = useState("");
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const phase = eventPhase(a);
  const cancelled =
    ["cancelled", "rejected"].includes(r.status) || phase === "cancelled";
  const canReview =
    r.status === "attended" &&
    a.status === "completed" &&
    r.user_id !== (a.manager_id ?? a.organizer_id);
  const changed =
    r.terms_snapshot &&
    (r.terms_snapshot.date_time !== a.date_time ||
      r.terms_snapshot.location_text !== a.location_text);
  return (
    <article className="workspace-panel event-record">
      <img
        src={sportImage(a.sport)}
        alt=""
        className="event-record-image"
        loading="lazy"
      />
      <div className="event-record-body">
        <div className="event-line">
          <span className="workspace-tag">
            {a.sport} ·{" "}
            {a.type === "daily_game"
              ? "Игра"
              : a.type === "league"
                ? "Лига"
                : "Турнир"}
          </span>
          <span className="workspace-tag">
            {cancelled
              ? "Отменено"
              : phase === "live"
                ? "Идёт сейчас"
                : REGISTRATION_STATUS_LABEL[r.status]}
          </span>
        </div>
        <Link to="/activity/$id" params={{ id: a.id }} className="event-title">
          {a.title}
        </Link>
        <p className="workspace-muted text-sm">
          {dateLabel(a.date_time, true)}
          {a.duration_minutes ? ` · ${a.duration_minutes} мин` : ""} ·{" "}
          {a.location_text}
        </p>
        <div className="event-line text-sm">
          <Link
            className="profile-link"
            to="/organizer/$id"
            params={{ id: a.manager_id ?? a.organizer_id ?? r.user_id }}
          >
            {a.host_name}
          </Link>
        </div>
        {r.team_name && (
          <details>
            <summary>Команда: {r.team_name} · вы капитан</summary>
            <p>{r.team_members.join(", ")}</p>
          </details>
        )}
        {changed && !cancelled && (
          <p className="feed-notice">
            Время или площадка изменились после записи. Проверьте актуальные
            данные выше.
          </p>
        )}
        {conflict && !cancelled && (
          <p className="feed-notice">
            Пересекается по времени с другой вашей игрой.
          </p>
        )}
        {cancelled && (
          <p className="workspace-muted text-sm">
            {a.status === "cancelled"
              ? "Отмена организатором"
              : r.status === "rejected"
                ? "Запись отклонена"
                : "Вы отменили запись"}
            {r.cancelled_at ? ` · ${dateLabel(r.cancelled_at, true)}` : ""}.{" "}
            {a.cancellation_reason ?? r.cancellation_reason ?? ""}
          </p>
        )}
        <div className="event-actions">
          <Link
            className="profile-link"
            to="/activity/$id"
            params={{ id: a.id }}
          >
            Открыть игру →
          </Link>
          <MapLink event={a} />
          {!cancelled && phase !== "past" && <CalendarButton event={a} />}

          {r.status === "registered" && phase === "upcoming" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setReason("");
                setDialog("cancel");
              }}
            >
              Отменить запись
            </Button>
          )}
          {phase === "past" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPanel(panel === "review" ? "" : "review")}
            >
              Отзыв
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPanel(panel === "history" ? "" : "history")}
          >
            История
          </Button>
        </div>

        {panel === "history" && (
          <div className="event-expanded">
            <History items={r.history ?? []} />
          </div>
        )}
        {panel === "review" && (
          <div className="event-expanded">
            {r.review ? (
              <>
                <p>Ваша оценка: {"★".repeat(r.review.rating)}</p>
                <p>{r.review.comment}</p>
                {r.review.reply && (
                  <p className="feed-notice">
                    Ответ организатора: {r.review.reply}
                  </p>
                )}
                <p className="workspace-muted text-xs">
                  Для исправления опубликованного отзыва обратитесь в поддержку.
                </p>
              </>
            ) : canReview ? (
              <>
                <p className="text-sm">Оцените проведение игры</p>
                <div className="event-actions">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      className={`feed-chip ${rating === n ? "is-active" : ""}`}
                      aria-label={`${n} из 5`}
                      key={n}
                      onClick={() => setRating(n)}
                    >
                      {n} ★
                    </button>
                  ))}
                </div>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={600}
                  placeholder="Что понравилось или стоит улучшить?"
                  aria-label="Текст отзыва"
                />
                <Button className="mt-3" onClick={() => setDialog("review")}>
                  Предпросмотр отзыва
                </Button>
              </>
            ) : (
              <p className="workspace-muted">
                Отзыв доступен после завершения события и подтверждения вашего
                посещения организатором.
              </p>
            )}
          </div>
        )}

        <div className="event-actions mt-4">
          <HelpLink
            registration={r.id}
            topic={r.status === "no_show" ? "attendance" : "general"}
          >
            {r.status === "no_show"
              ? "Оспорить неявку"
              : "Обратиться в поддержку"}
          </HelpLink>
          {phase === "past" && (
            <Link
              to="/"
              search={{ sport: a.sport, city: a.city }}
              className="profile-link"
            >
              Найти похожую игру →
            </Link>
          )}
          {a.type !== "daily_game" && a.results_submitted_at && (
            <Link
              to="/activity/$id"
              params={{ id: a.id }}
              hash="competition-results"
              className="profile-link"
            >
              Результаты →
            </Link>
          )}
        </div>
        {a.dispute_window_ends_at && (
          <p className="workspace-muted text-xs mt-3">
            Спор по результатам можно подать до{" "}
            {dateLabel(a.dispute_window_ends_at, true)}. Связь с поддержкой
            доступна и позже.
          </p>
        )}
      </div>
      <Confirm
        open={!!dialog}
        title={
          dialog === "cancel"
            ? "Отменить участие?"
            : dialog === "review"
              ? "Опубликовать отзыв?"
              : "Отменить участие?"
        }
        description={
          dialog === "cancel"
            ? (r.terms_snapshot?.cancellation_policy ??
              a.cancellation_policy ??
              "Запись сохранится в истории.")
            : dialog === "review"
              ? "Отзыв увидит организатор. Исправления после публикации рассматривает поддержка."
              : "Запись сохранится в истории."
        }
        onClose={() => setDialog("")}
        busy={action.busy}
        onConfirm={() =>
          void (async () => {
            if (dialog === "review") {
              if (
                await action.mutate(
                  "review",
                  { registration_id: r.id, rating, comment },
                  "Отзыв опубликован",
                )
              )
                setDialog("");
            } else if (
              await action.mutate(
                "cancel",
                { registration_id: r.id, reason, status: "requested" },
                dialog === "cancel" ? "Запись отменена" : "Запрос создан",
              )
            )
              setDialog("");
          })()
        }
      >
        {dialog === "review" ? (
          <p>
            {rating} ★ · {comment || "Без комментария"}
          </p>
        ) : (
          <label>
            Причина
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={600}
            />
          </label>
        )}
        <ErrorNotice message={action.error} />
      </Confirm>
    </article>
  );
}
