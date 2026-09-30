import { ItemPrizes } from "./prizes";
import {
  COMPETITION_FORMATS,
  hasStandings,
  matchStageLabel,
} from "@/lib/competition-formats";
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
import { downloadText } from "./shared";
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
      {hasStandings(data.activity.competition_format) && (
        <Standings data={data} />
      )}
      <ItemPrizes data={data} />
      <MatchCalendar data={data} />
      <div className="event-grid">
        {data.matches.map((m) => (
          <article className="event-match" key={m.id}>
            <p className="workspace-kicker">
              {matchStageLabel(m.stage, m.group_number)} · Раунд {m.round} ·
              Матч {m.position}
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
      {!!data.byes?.length && (
        <div className="profile-callout">
          <h3 className="font-bold">Проходы без матча</h3>
          {data.byes.map((b) => (
            <p key={`${b.round}:${b.registration_id}`}>
              Раунд {b.round}: {b.name}
              {b.points > 0 ? ` · +${b.points} очка` : ""}
            </p>
          ))}
        </div>
      )}
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
          Турнирная таблица · победа {data.activity.win_points}, ничья{" "}
          {data.activity.draw_points}. При равенстве:{" "}
          {data.activity.competition_format === "swiss"
            ? "очки соперников"
            : "очки личных встреч"}
          , разница, забитые
          {data.activity.competition_format === "round_robin"
            ? "; полный итоговый паритет решает организатор по регламенту"
            : ", посев"}
          .
        </caption>
        <thead>
          <tr>
            {[
              "Участник",
              "И",
              "В",
              "Н",
              "П",
              "Мячи",
              "Разница",
              "Очки",
              ...(data.activity.competition_format === "swiss"
                ? ["Очки соперников"]
                : []),
            ].map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.standings.map((s) => (
            <tr key={s.registration_id}>
              <th scope="row">
                {s.group_number &&
                data.activity.competition_format === "groups_playoff"
                  ? `Группа ${s.group_number} · `
                  : ""}
                {s.name}
              </th>
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
              {data.activity.competition_format === "swiss" && (
                <td>{s.buchholz ?? 0}</td>
              )}
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
  const [seeding, setSeeding] = useState("registration");
  const [seedOrder, setSeedOrder] = useState<string[]>([]);
  const active = registrations.filter((r) =>
    ["registered", "attended"].includes(r.status),
  );
  const ordered = [
    ...seedOrder.filter((id) => active.some((r) => r.id === id)),
    ...active.filter((r) => !seedOrder.includes(r.id)).map((r) => r.id),
  ];
  const advanced = [
    "single_elimination",
    "round_robin",
    "double_elimination",
    "groups_playoff",
    "swiss",
    "league_playoff",
  ].includes(a.competition_format ?? "");
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
        COMPETITION_FORMATS[a.competition_format ?? "single_elimination"]
          .description
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
              {a.competition_format !== "round_robin" &&
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
        {!a.results_submitted_at &&
          d.matches.some((m) => !m.starts_at && m.home_score === null) && (
            <AutoSchedule event={a} />
          )}
        {preview ? (
          <CompetitionView data={d} />
        ) : (
          <>
            {hasStandings(a.competition_format) && <Standings data={d} />}
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

        <ItemPrizes data={d} registrations={registrations} />
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
                        seeding,
                        seeds: ordered,
                      },
                    },
                  }),
                "Соревнование обновлено",
              ))
            )
              setDecision(null);
          }}
        >
          {decision === "generate" && advanced && (
            <div className="event-form">
              <label>
                Посев
                <select
                  value={seeding}
                  onChange={(e) => setSeeding(e.target.value)}
                >
                  <option value="registration">По порядку регистрации</option>
                  <option value="random">Случайная жеребьёвка</option>
                  <option value="rating">По спортивному рейтингу</option>
                  <option value="manual">Выбрать порядок</option>
                </select>
              </label>
              {seeding === "manual" &&
                ordered.map((id, index) => (
                  <label key={index}>
                    Место посева {index + 1}
                    <select
                      value={id}
                      onChange={(e) => {
                        const next = [...ordered];
                        const from = next.indexOf(e.target.value);
                        if (from >= 0) {
                          const previous = next[index]!;
                          next[index] = next[from]!;
                          next[from] = previous;
                        }
                        setSeedOrder(next);
                      }}
                    >
                      {active.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.team_name || r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
            </div>
          )}
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
        {matchStageLabel(m.stage, m.group_number)} · Раунд {m.round} · Матч{" "}
        {m.position}
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
            max="999"
            value={form.home_score}
            onChange={(e) => setForm({ ...form, home_score: e.target.value })}
          />
        </label>
        <label>
          {m.away_name}
          <input
            type="number"
            min="0"
            max="999"
            value={form.away_score}
            onChange={(e) => setForm({ ...form, away_score: e.target.value })}
          />
        </label>
      </div>
      {(a.competition_format === "single_elimination" ||
        a.competition_format === "double_elimination" ||
        m.stage === "playoff") && (
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

function AutoSchedule({ event: a }: { event: Event }) {
  const action = useEventAction();
  const [start, setStart] = useState(localDateTime(a.date_time));
  const [minutes, setMinutes] = useState(60);
  const [gap, setGap] = useState(10);
  const [perDay, setPerDay] = useState(4);
  return (
    <details className="event-muted-box">
      <summary className="font-bold">Распределить матчи по дням</summary>
      <form
        className="event-form mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await action.run(
            () =>
              mutateCompetition({
                data: {
                  action: "schedule",
                  payload: {
                    activity_id: a.id,
                    starts_at: isoDateTime(start),
                    minutes,
                    gap,
                    per_day: perDay,
                  },
                },
              }),
            "Расписание опубликовано",
          );
        }}
      >
        <div className="event-form-grid">
          <label>
            Первый матч, UTC+5
            <input
              required
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Минут на матч
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Перерыв
            <select
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
            >
              {[0, 5, 10, 15, 20, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} мин
                </option>
              ))}
            </select>
          </label>
          <label>
            Матчей в день
            <select
              value={perDay}
              onChange={(e) => setPerDay(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="workspace-muted text-sm">
          Матчи без времени пройдут последовательно на площадке события.
          Следующий день начинается в то же время. Участники получат
          уведомление.
        </p>
        <ErrorNotice message={action.error} />
        <Button disabled={action.busy}>Опубликовать расписание</Button>
      </form>
    </details>
  );
}
function MatchCalendar({ data }: { data: CompetitionData }) {
  const matches = data.matches.filter((m) => m.starts_at);
  if (!matches.length) return null;
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const clean = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/\r/g, "");
  return (
    <Button
      variant="outline"
      onClick={() =>
        downloadText(
          [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Sportura//Matches//RU",
            ...matches.flatMap((m) => [
              "BEGIN:VEVENT",
              `UID:${m.id}@sportura.vercel.app`,
              `DTSTAMP:${stamp(new Date())}`,
              `DTSTART:${stamp(new Date(m.starts_at!))}`,
              `DTEND:${stamp(new Date(Date.parse(m.starts_at!) + m.duration_minutes * 60000))}`,
              `SUMMARY:${clean(`${m.home_name} — ${m.away_name}`)}`,
              `LOCATION:${clean(m.location || data.activity.location_text)}`,
              `URL:https://sportura.vercel.app/activity/${data.activity.id}`,
              "END:VEVENT",
            ]),
            "END:VCALENDAR",
          ].join("\r\n"),
          "sportura-matches.ics",
          "text/calendar;charset=utf-8",
        )
      }
    >
      Скачать календарь матчей
    </Button>
  );
}
