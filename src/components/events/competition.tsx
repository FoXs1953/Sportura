import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readEvent, mutateCompetition } from "@/lib/event.functions";
import {
  localDateTime,
  isoDateTime,
  type CompetitionData,
  type Event,
  type Match,
  type Registration,
} from "@/lib/event-model";
import { formatKzt } from "@/lib/sportura";
import {
  Panel,
  Empty,
  ErrorNotice,
  Confirm,
  useEventAction,
  HelpLink,
  dateLabel,
} from "./shared";
export function CompetitionView({ data }: { data: CompetitionData }) {
  return (
    <div className="space-y-5">
      {data.activity.results_submitted_at && (
        <div className="profile-callout">
          <h3 className="font-bold">Опубликованные итоги</h3>
          {data.results.map((r) => (
            <p key={r.id}>
              {r.placement}. {r.participant_name}
            </p>
          ))}
          <p className="text-xs">
            Вопросы по результатам принимаются через поддержку. Окно споров: до{" "}
            {dateLabel(data.activity.dispute_window_ends_at)}.
          </p>
        </div>
      )}
      {(data.activity.type === "league" ||
        data.activity.competition_format === "round_robin") && (
        <Standings data={data} />
      )}
      <div className="event-grid">
        {data.matches.map((m) => (
          <article className="event-match" key={m.id}>
            <p className="workspace-kicker">
              Раунд {m.round} · Матч {m.position}
            </p>
            <h3>
              {m.home_name} — {m.away_name}
            </h3>
            <p className="event-match-score">
              {m.home_score ?? "—"} : {m.away_score ?? "—"}
            </p>
            {m.winner_id && (
              <p className="text-sm">
                Победитель:{" "}
                {m.winner_id === m.home_id ? m.home_name : m.away_name}
              </p>
            )}
            <p className="workspace-muted text-sm">
              {m.starts_at ? dateLabel(m.starts_at) : "Время уточняется"} ·{" "}
              {m.location || "Площадка уточняется"}
            </p>
          </article>
        ))}
      </div>
      {!data.matches.length && (
        <Empty
          title="Расписание готовится"
          text="Организатор опубликует пары и время матчей после набора участников."
        />
      )}
    </div>
  );
}
export function Standings({ data }: { data: CompetitionData }) {
  return (
    <div className="event-table-wrap">
      <table className="event-table">
        <caption className="text-left mb-2">
          Таблица лиги · победа {data.activity.win_points}, ничья{" "}
          {data.activity.draw_points}
        </caption>
        <thead>
          <tr>
            {["Участник", "И", "В", "Н", "П", "Мячи", "Разница", "Очки"].map(
              (h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {data.standings.map((s) => (
            <tr key={s.registration_id}>
              <th scope="row">{s.name}</th>
              <td>{s.played}</td>
              <td>{s.won}</td>
              <td>{s.drawn}</td>
              <td>{s.lost}</td>
              <td>
                {s.scored}:{s.conceded}
              </td>
              <td>{s.difference}</td>
              <td>
                <strong>{s.points}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function HostCompetition({
  event: a,
  registrations,
}: {
  event: Event;
  registrations: Registration[];
}) {
  const q = useQuery({
    queryKey: ["event-public", a.id, "host"],
    queryFn: () => readEvent({ data: { id: a.id } }),
  });
  const action = useEventAction();
  const [decision, setDecision] = useState<
    "generate" | "advance" | "publish_results" | null
  >(null);
  const [reason, setReason] = useState("");
  const [winner, setWinner] = useState("");
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const received = registrations
    .filter(
      (r) =>
        r.payment_status === "paid" &&
        !["cancelled", "rejected"].includes(r.status),
    )
    .reduce((s, r) => s + (r.amount_due ?? 0), 0);
  const unknown = registrations.some(
    (r) => r.amount_due === null && r.payment_status === "paid",
  );
  if (q.isPending)
    return (
      <Panel title="Соревнование">
        <p>Загружаем расписание…</p>
      </Panel>
    );
  if (q.error)
    return (
      <Panel title="Соревнование">
        <ErrorNotice message={q.error.message} />
        <Button onClick={() => void q.refetch()}>Повторить</Button>
      </Panel>
    );
  if (!q.data)
    return (
      <Empty
        title="Соревнование недоступно"
        text="Обновите страницу или обратитесь в поддержку."
      />
    );
  const d = q.data;
  return (
    <Panel
      title={a.title}
      description={
        a.type === "league" || a.competition_format === "round_robin"
          ? "Лига: один круг, каждый играет с каждым."
          : "Турнир на выбывание. Нечётный участник получает проход без матча."
      }
    >
      <div className="space-y-5">
        <p className="event-description">
          {a.rules || "Дополнительный регламент не указан."}
        </p>
        <div className="event-actions">
          {!d.matches.length ? (
            <Button onClick={() => setDecision("generate")}>
              Сформировать расписание
            </Button>
          ) : (
            <>
              {a.type === "tournament" &&
                a.competition_format !== "round_robin" &&
                !a.results_submitted_at && (
                  <Button
                    variant="outline"
                    onClick={() => setDecision("advance")}
                  >
                    Следующий раунд
                  </Button>
                )}
              <Button variant="outline" onClick={() => setPreview(!preview)}>
                {preview ? "Редактировать матчи" : "Предпросмотр итогов"}
              </Button>
              <Button onClick={() => setDecision("publish_results")}>
                {a.results_submitted_at
                  ? "Обновить публикацию"
                  : "Опубликовать итоги"}
              </Button>
            </>
          )}
          <HelpLink activity={a.id}>Вопрос по результатам</HelpLink>
        </div>
        <ErrorNotice message={action.error} />
        {preview ? (
          <CompetitionView data={d} />
        ) : (
          <>
            {(a.type === "league" ||
              a.competition_format === "round_robin") && <Standings data={d} />}
            <div className="event-grid">
              {d.matches.map((m) => (
                <MatchEditor
                  key={`${m.id}:${m.home_score}:${m.away_score}:${m.starts_at}`}
                  match={m}
                  event={a}
                />
              ))}
            </div>
          </>
        )}

        <Confirm
          open={!!decision}
          title={
            decision === "generate"
              ? "Сформировать пары?"
              : decision === "advance"
                ? "Создать следующий раунд?"
                : "Опубликовать результаты?"
          }
          description={
            decision === "generate"
              ? "В сетку войдут текущие активные участники. Новая запись будет закрыта. Проверьте состав до подтверждения."
              : decision === "advance"
                ? "Результаты текущего раунда будут зафиксированы для следующих матчей."
                : "Итоги станут доступны участникам. Все матчи должны иметь результат. При равенстве показателей выберите победителя по регламенту."
          }
          busy={action.busy}
          onClose={() => setDecision(null)}
          onConfirm={async () => {
            if (
              decision &&
              (await action.run(
                () =>
                  mutateCompetition({
                    data: {
                      action: decision,
                      payload: {
                        activity_id: a.id,
                        reason,
                        winner_id: winner,
                        placements,
                      },
                    },
                  }),
                "Соревнование обновлено",
              ))
            )
              setDecision(null);
          }}
        >
          {decision === "publish_results" && (
            <div className="event-form">
              <label>
                Победитель при полном равенстве
                <select
                  value={winner}
                  onChange={(e) => setWinner(e.target.value)}
                >
                  <option value="">По результатам матчей</option>
                  {d.standings.map((s) => (
                    <option key={s.registration_id} value={s.registration_id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Причина исправления / правило разрешения ничьей
                <textarea
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
          )}
        </Confirm>
      </div>
    </Panel>
  );
}
function MatchEditor({ match: m, event: a }: { match: Match; event: Event }) {
  const [form, setForm] = useState({
    starts_at: localDateTime(m.starts_at),
    duration_minutes: m.duration_minutes,
    location: m.location,
    home_score: m.home_score === null ? "" : String(m.home_score),
    away_score: m.away_score === null ? "" : String(m.away_score),
    winner_id: m.winner_id ?? "",
    reason: "",
  });
  const action = useEventAction();
  return (
    <form
      className="event-match event-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await action.run(
          () =>
            mutateCompetition({
              data: {
                action: "match",
                payload: {
                  activity_id: a.id,
                  id: m.id,
                  ...form,
                  starts_at: isoDateTime(form.starts_at),
                  home_score:
                    form.home_score === "" ? null : Number(form.home_score),
                  away_score:
                    form.away_score === "" ? null : Number(form.away_score),
                },
              },
            }),
          "Матч сохранён",
        );
      }}
    >
      <p className="workspace-kicker">
        Раунд {m.round} · Матч {m.position}
      </p>
      <h3 className="font-bold">
        {m.home_name} — {m.away_name}
      </h3>
      <div className="event-form-grid">
        <label>
          Начало, UTC+5
          <input
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
          />
        </label>
        <label>
          Минут
          <input
            type="number"
            min="5"
            max="600"
            value={form.duration_minutes}
            onChange={(e) =>
              setForm({ ...form, duration_minutes: Number(e.target.value) })
            }
          />
        </label>
        <label className="wide">
          Площадка
          <input
            maxLength={200}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
        <label>
          {m.home_name}
          <input
            type="number"
            min="0"
            max="1000"
            value={form.home_score}
            onChange={(e) => setForm({ ...form, home_score: e.target.value })}
          />
        </label>
        <label>
          {m.away_name}
          <input
            type="number"
            min="0"
            max="1000"
            value={form.away_score}
            onChange={(e) => setForm({ ...form, away_score: e.target.value })}
          />
        </label>
      </div>
      {a.type === "tournament" && a.competition_format !== "round_robin" && (
        <label>
          Победитель при равном счёте
          <select
            value={form.winner_id}
            onChange={(e) => setForm({ ...form, winner_id: e.target.value })}
          >
            <option value="">По счёту</option>
            <option value={m.home_id}>{m.home_name}</option>
            <option value={m.away_id}>{m.away_name}</option>
          </select>
        </label>
      )}
      <label>
        Причина изменения
        <input
          value={form.reason}
          maxLength={1000}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
      </label>
      <ErrorNotice message={action.error} />
      <Button type="submit" variant="outline" disabled={action.busy}>
        Сохранить матч
      </Button>
    </form>
  );
}
