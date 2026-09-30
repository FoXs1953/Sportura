import { useQuery } from "@tanstack/react-query";
import { disputeAction } from "@/lib/competition-admin.functions";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SPORTS, formatKzt } from "@/lib/sportura";
import {
  type HostWorkspace,
  type EventReview,
  localDateTime,
  eventPhase,
} from "@/lib/event-model";
import {
  Panel,
  Empty,
  useEventAction,
  ErrorNotice,
  dateLabel,
} from "../shared";
export function HostInsights({
  data,
  onSelect,
}: {
  data: HostWorkspace;
  onSelect: (id: string) => void;
}) {
  const disputes = useQuery({
    queryKey: ["disputes", "all"],
    queryFn: () => disputeAction({ data: { action: "list", payload: {} } }),
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sport, setSport] = useState("all");
  const [stars, setStars] = useState("all");
  const events = data.activities.filter(
    (a) =>
      (sport === "all" || a.sport === sport) &&
      (!from || localDateTime(a.date_time).slice(0, 10) >= from) &&
      (!to || localDateTime(a.date_time).slice(0, 10) <= to),
  );
  const ids = new Set(events.map((a) => a.id));
  const regs = data.registrations.filter((r) => ids.has(r.activity_id));
  const users = new Map<string, number>();
  regs.forEach((r) => {
    if (!["cancelled", "rejected"].includes(r.status))
      users.set(r.user_id, (users.get(r.user_id) ?? 0) + 1);
  });
  const participantDates = new Map<string, number[]>();
  regs
    .filter((r) => ["registered", "attended"].includes(r.status))
    .forEach((r) => {
      const date = events.find((a) => a.id === r.activity_id)?.date_time;
      if (date)
        participantDates.set(r.user_id, [
          ...(participantDates.get(r.user_id) ?? []),
          Date.parse(date),
        ]);
    });
  const eligible = [...participantDates.values()].filter((d) =>
    d.some((t) => t <= Date.now() - 14 * 86400000),
  );
  const returned14 = eligible.filter((d) =>
    d.some((t) => d.some((next) => next > t && next <= t + 14 * 86400000)),
  ).length;
  const completed = events.filter((a) => a.status === "completed");
  const reviews = data.reviews.filter((r) => ids.has(r.activity_id));
  const active = regs.filter(
    (r) => !["cancelled", "rejected"].includes(r.status),
  );
  const received = regs
    .filter((r) => ["paid", "refunded"].includes(r.payment_status))
    .reduce((s, r) => s + (r.amount_due ?? 0), 0);
  const returned = data.refunds
    .filter(
      (f) =>
        f.status === "completed" &&
        regs.some((r) => r.id === f.registration_id),
    )
    .reduce((s, f) => s + (f.amount ?? 0), 0);
  const occupancy = events.filter((a) => a.status !== "cancelled");
  const groups = (key: (a: (typeof events)[number]) => string) =>
    Object.entries(
      events
        .filter((a) => a.status !== "cancelled")
        .reduce<Record<string, number>>((acc, a) => {
          const k = key(a);
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  return (
    <>
      <Panel
        title="Статистика и отзывы"
        description="Период относится к дате события. Показатели рассчитаны по вашим событиям и записям."
      >
        <div className="event-filters mb-5">
          <label>
            С
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            По
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
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
        </div>
        <div className="event-stats">
          {[
            ["Проведено", completed.length],
            [
              "Возврат за 14 дней · цель 40%",
              eligible.length
                ? `${Math.round((returned14 / eligible.length) * 100)}%`
                : "—",
            ],
            [
              "Без споров · цель 90%",
              completed.length && disputes.data
                ? `${Math.round((completed.filter((a) => !disputes.data.some((d) => d.activity_id === a.id)).length / completed.length) * 100)}%`
                : "—",
            ],
            ["Отменено", events.filter((a) => a.status === "cancelled").length],
            ["Записей всего", regs.length],
            ["Уникальных участников", users.size],
            [
              "Заполненность · цель 80%",
              occupancy.length
                ? Math.round(
                    (occupancy.reduce(
                      (s, a) => s + a.registered_count / a.max_participants,
                      0,
                    ) /
                      occupancy.length) *
                      100,
                  ) + "%"
                : "—",
            ],
            ["Посетили", regs.filter((r) => r.status === "attended").length],
            ["Не пришли", regs.filter((r) => r.status === "no_show").length],
            [
              "Отмены участия",
              regs.filter((r) => r.status === "cancelled").length,
            ],
            [
              "Повторные участники",
              users.size
                ? Math.round(
                    ([...users.values()].filter((n) => n > 1).length /
                      users.size) *
                      100,
                  ) + "%"
                : "—",
            ],
            [
              "Ожидают отметки",
              active.filter(
                (r) =>
                  r.status === "registered" &&
                  eventPhase(events.find((a) => a.id === r.activity_id)!) ===
                    "past",
              ).length,
            ],
          ].map(([l, n]) => (
            <a key={l} href="#insight-source" className="event-muted-box">
              <small>{l}</small>
              <p className="text-xl font-bold">{n}</p>
            </a>
          ))}
        </div>
        <p className="event-count-note mt-3">
          Возврат за 14 дней считается по датам событий для участников, у
          которых прошло полное окно наблюдения. Повторные — участники с двумя и
          более активными записями за выбранный период.
        </p>
        <div className="event-grid mt-5">
          {[
            ["Популярные площадки", groups((a) => a.location_text)],
            [
              "Дни и время",
              groups((a) =>
                a.date_time
                  ? new Date(a.date_time).toLocaleString("ru-RU", {
                      weekday: "long",
                      hour: "2-digit",
                      timeZone: "Asia/Almaty",
                    })
                  : "Без даты",
              ),
            ],
          ].map(([title, items]) => (
            <div className="event-muted-box" key={String(title)}>
              <h3 className="font-bold mb-2">{String(title)}</h3>
              {(items as [string, number][]).map(([name, count]) => (
                <p key={name} className="event-line text-sm">
                  <span>{name}</span>
                  <strong>{count}</strong>
                </p>
              ))}
            </div>
          ))}
        </div>
        <details className="mt-5" id="insight-source">
          <summary>Исходные события ({events.length})</summary>
          <div className="event-rows mt-3">
            {events.map((a) => (
              <button
                key={a.id}
                className="event-row text-left"
                onClick={() => onSelect(a.id)}
              >
                {a.title} · {dateLabel(a.date_time)} ·{" "}
                {regs.filter((r) => r.activity_id === a.id).length} записей
              </button>
            ))}
          </div>
        </details>
      </Panel>
      <Panel
        title="Отзывы об организации"
        description={
          reviews.length
            ? `${(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)} из 5 · ${reviews.length} оценок${reviews.length < 5 ? " · Пока мало отзывов" : ""}`
            : "Оценок пока нет"
        }
      >
        <div className="event-actions mb-5">
          {[5, 4, 3, 2, 1].map((n) => (
            <Button
              key={n}
              variant={stars === String(n) ? "default" : "outline"}
              onClick={() => setStars(stars === String(n) ? "all" : String(n))}
            >
              {n} ★ · {reviews.filter((r) => r.rating === n).length}
            </Button>
          ))}
        </div>
        <div className="event-rows">
          {reviews
            .filter((r) => stars === "all" || r.rating === Number(stars))
            .map((r) => (
              <ReviewReply
                key={r.id}
                review={r}
                title={
                  data.activities.find((a) => a.id === r.activity_id)?.title ??
                  ""
                }
              />
            ))}
          {!reviews.length && (
            <Empty
              title="Отзывы появятся после игр"
              text="Оценку может оставить участник с подтверждённым посещением завершённого события."
            />
          )}
        </div>
      </Panel>
    </>
  );
}
function ReviewReply({
  review: r,
  title,
}: {
  review: EventReview;
  title: string;
}) {
  const [text, setText] = useState(r.reply ?? "");
  const action = useEventAction();
  return (
    <article className="event-row space-y-3">
      <div className="event-line">
        <h3>
          {r.author} · {r.rating} ★
        </h3>
        <small>{dateLabel(r.created_at)}</small>
      </div>
      <p className="workspace-muted">{title}</p>
      <p className="event-description">{r.comment || "Без комментария"}</p>
      <label>
        Ответ организатора
        <textarea
          value={text}
          rows={3}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="event-actions">
        <Button
          size="sm"
          disabled={action.busy || text.trim().length < 2 || text === r.reply}
          onClick={() =>
            void action.mutate("review_reply", { id: r.id, body: text })
          }
        >
          Сохранить ответ
        </Button>
        <Link
          className="profile-link"
          to="/profile"
          search={{
            tab: "help",
            activity: r.activity_id,
            topic: "review",
            review: r.id,
          }}
        >
          Пожаловаться на отзыв
        </Link>
      </div>
      <ErrorNotice message={action.error} />
    </article>
  );
}
