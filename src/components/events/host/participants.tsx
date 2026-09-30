import { useState } from "react";
import { Button } from "@/components/ui/button";
import { REGISTRATION_STATUS_LABEL } from "@/lib/sportura";
import type { HostWorkspace, Registration } from "@/lib/event-model";
import {
  Panel,
  Empty,
  ErrorNotice,
  useEventAction,
  Confirm,
  History,
  exportCsv,
  dateLabel,
} from "../shared";
export function Participants({
  data,
  eventId = "",
  initialStatus = "all",
}: {
  data: HostWorkspace;
  eventId?: string;
  initialStatus?: string;
}) {
  const [event, setEvent] = useState(eventId),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(initialStatus);
  const action = useEventAction();
  const [release, setRelease] = useState(false);
  const rows = data.registrations.filter(
    (r) =>
      (!event || r.activity_id === event) &&
      `${r.name} ${r.team_name}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" ||
        (status === "checked_in" && !!r.checked_in_at) ||
        (status === "missing" &&
          r.status === "registered" &&
          !r.checked_in_at) ||
        r.status === status),
  );
  const selected = data.activities.find((a) => a.id === event);
  const queue = (data.waitlist ?? []).filter(
    (w) => !event || w.activity_id === event,
  );
  return (
    <Panel
      title="Участники"
      description="Состав команд, чек-ин, посещаемость и очередь на свободные места."
    >
      <div className="event-filters mb-5">
        <label>
          Событие
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">Все события</option>
            {data.activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Поиск
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя или команда"
          />
        </label>
        <label>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Все</option>
            {Object.entries(REGISTRATION_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
            <option value="checked_in">Прошли чек-ин</option>
            <option value="missing">Ожидают чек-ин</option>
          </select>
        </label>
      </div>
      <div className="event-actions mb-5">
        <Button
          variant="outline"
          disabled={!rows.length}
          onClick={() =>
            exportCsv(
              [
                ["Участник", "Команда", "Состав", "Статус", "Чек-ин"],
                ...rows.map((r) => [
                  r.name ?? "",
                  r.team_name,
                  r.team_members.join("; "),
                  REGISTRATION_STATUS_LABEL[r.status],
                  r.checked_in_at ? dateLabel(r.checked_in_at) : "Не пройден",
                ]),
              ],
              "sportura-participants.csv",
            )
          }
        >
          Скачать список CSV
        </Button>
        {selected?.date_time &&
          Date.now() > Date.parse(selected.date_time) + 30 * 60000 &&
          !data.matches.some((m) => m.activity_id === event) &&
          !["completed", "cancelled"].includes(selected.status) && (
            <Button variant="outline" onClick={() => setRelease(true)}>
              Отметить не прошедших чек-ин
            </Button>
          )}
      </div>
      <ErrorNotice message={action.error} />
      {queue.length > 0 && (
        <section className="event-muted-box mb-5">
          <h3 className="font-bold">Лист ожидания · {queue.length}</h3>
          <p className="workspace-muted">
            Места предлагаются по порядку записи. На подтверждение — до 15
            минут, но не позже закрытия регистрации или начала события. Затем
            место предлагается следующему участнику.
          </p>
          {queue.map((w) => (
            <p key={w.id}>
              {w.name || "Участник"}
              {w.team_name ? ` · ${w.team_name}` : ""} ·{" "}
              {dateLabel(w.created_at)}
              {w.offer_expires_at && Date.parse(w.offer_expires_at) > Date.now()
                ? ` · Ждём подтверждения до ${dateLabel(w.offer_expires_at, true)} (UTC+5)`
                : " · Ожидает места"}
            </p>
          ))}
        </section>
      )}
      <div className="event-rows">
        {rows.map((r) => (
          <Participant key={r.id} reg={r} data={data} />
        ))}
        {!rows.length && (
          <Empty
            title="Записей не найдено"
            text="Измените фильтры или дождитесь первых участников."
          />
        )}
      </div>
      <Confirm
        open={release}
        title="Отметить неявки?"
        description="У всех записанных участников без чек-ина будет отметка «Не пришёл». Действие доступно через 30 минут после старта до формирования сетки. Проверьте присутствующих перед подтверждением."
        busy={action.busy}
        onClose={() => setRelease(false)}
        onConfirm={async () => {
          if (await action.mutate("close_checkin", { activity_id: event }))
            setRelease(false);
        }}
      />
    </Panel>
  );
}
function Participant({
  reg: r,
  data,
}: {
  reg: Registration;
  data: HostWorkspace;
}) {
  const a = data.activities.find((a) => a.id === r.activity_id)!;
  const action = useEventAction();
  const [decision, setDecision] = useState(""),
    [reason, setReason] = useState("");
  return (
    <article className="event-row space-y-3">
      <div className="event-line">
        <div>
          <h3>{r.team_name || r.name || "Участник"}</h3>
          <p className="workspace-muted text-sm">
            {a.title} · {dateLabel(r.created_at)}
          </p>
        </div>
        <span className="workspace-tag">
          {REGISTRATION_STATUS_LABEL[r.status]}
        </span>
      </div>
      <p>
        {r.checked_in_at
          ? `Чек-ин: ${dateLabel(r.checked_in_at)}`
          : "Чек-ин не пройден"}
      </p>
      {!!r.team_members.length && <p>Состав: {r.team_members.join(", ")}</p>}
      {!["cancelled", "rejected"].includes(r.status) &&
        a.status !== "cancelled" && (
          <div className="event-actions">
            {a.date_time && Date.parse(a.date_time) <= Date.now() && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDecision("attended")}
                >
                  Посетил
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDecision("no_show")}
                >
                  Не пришёл
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDecision("rejected")}
            >
              Исключить
            </Button>
          </div>
        )}
      <details>
        <summary>Контакт и история</summary>
        {r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>}
        {r.cancellation_reason && <p>{r.cancellation_reason}</p>}
        <History
          items={data.history.filter((h) => h.registration_id === r.id)}
        />
      </details>
      <ErrorNotice message={action.error} />
      <Confirm
        open={!!decision}
        title="Изменить статус участника?"
        description="Решение и причина сохранятся в истории и будут видны участнику."
        busy={action.busy}
        onClose={() => setDecision("")}
        onConfirm={async () => {
          if (
            await action.mutate("participant", {
              registration_id: r.id,
              status: decision,
              reason,
            })
          ) {
            setDecision("");
            setReason("");
          }
        }}
      >
        <label className="event-form">
          Причина / комментарий
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={3}
            maxLength={600}
          />
        </label>
      </Confirm>
    </article>
  );
}
