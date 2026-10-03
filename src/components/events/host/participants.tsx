import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { REGISTRATION_STATUS_LABEL } from "@/lib/sportura";
import type {
  HostWorkspace,
  Registration,
  WaitlistEntry,
} from "@/lib/event-model";
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
  const { tr, language } = useI18n();
  const [event, setEvent] = useState(eventId),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(initialStatus);
  const action = useEventAction();
  const [release, setRelease] = useState(false);
  const [replacement, setReplacement] = useState<{
    waiter: WaitlistEntry;
    skip: boolean;
  } | null>(null);
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
  const canReplace =
    !!selected?.date_time &&
    (data.checkin_closures ?? []).includes(selected.id) &&
    Date.now() <
      Date.parse(selected.date_time) +
        (selected.duration_minutes ?? 120) * 60000 &&
    !["completed", "cancelled"].includes(selected.status) &&
    !data.matches.some((match) => match.activity_id === selected.id);
  const hasAbsent = data.registrations.some(
    (r) =>
      r.activity_id === event &&
      r.status === "no_show" &&
      !(data.replaced_registrations ?? []).includes(r.id),
  );
  return (
    <Panel
      title={tr("Участники")}
      description={tr(
        "Состав команд, чек-ин, посещаемость и очередь на свободные места.",
      )}
    >
      <div className="event-filters mb-5">
        <label>
          {tr("Событие")}
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">{tr("Все события")}</option>
            {data.activities.map((a) => (
              <option key={a.id} value={a.id}>
                {tr(a.title)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Поиск")}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Имя или команда")}
          />
        </label>
        <label>
          {tr("Статус")}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{tr("Все")}</option>
            {Object.entries(REGISTRATION_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {tr(v)}
              </option>
            ))}
            <option value="checked_in">{tr("Прошли чек-ин")}</option>
            <option value="missing">{tr("Ожидают чек-ин")}</option>
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
                ["Участник", "Команда", "Состав", "Статус", "Чек-ин"].map(
                  (label) => tr(label),
                ),
                ...rows.map((r) => [
                  r.name ?? "",
                  r.team_name,
                  r.team_members.join("; "),
                  tr(REGISTRATION_STATUS_LABEL[r.status]),
                  r.checked_in_at
                    ? dateLabel(r.checked_in_at, false, language)
                    : tr("Не пройден"),
                ]),
              ],
              "sportura-participants.csv",
            )
          }
        >
          {tr("Скачать список CSV")}
        </Button>
        {tr(
          selected?.date_time &&
            Date.now() > Date.parse(selected.date_time) + 30 * 60000 &&
            !(data.checkin_closures ?? []).includes(event) &&
            !data.matches.some((m) => m.activity_id === event) &&
            !["completed", "cancelled"].includes(selected.status) && (
              <Button variant="outline" onClick={() => setRelease(true)}>
                {tr("Отметить не прошедших чек-ин")}
              </Button>
            ),
        )}
      </div>
      <ErrorNotice message={tr(action.error)} />
      {queue.length > 0 && (
        <section className="event-muted-box mb-5">
          <h3 className="font-bold">
            {tr("Лист ожидания · ")}
            {queue.length}
          </h3>
          <p className="workspace-muted">
            {tr(
              canReplace
                ? "Чек-ин закрыт. Подтвердите присутствие первого участника очереди, чтобы заменить неявившегося. Если его нет на площадке, отметьте отсутствие и переходите к следующему. После создания сетки замены закрываются."
                : "Места предлагаются по порядку записи. На подтверждение — до 15 минут, но не позже закрытия регистрации или начала события. Затем место предлагается следующему участнику.",
            )}
          </p>
          {queue.map((w) => (
            <div key={w.id} className="mt-3">
              <p>
                {tr(w.name || "Участник")}
                {tr(w.team_name ? ` · ${w.team_name}` : "")} ·{tr(" ")}
                {tr(dateLabel(w.created_at, false, language))}
                {tr(
                  w.offer_expires_at &&
                    Date.parse(w.offer_expires_at) > Date.now()
                    ? tr("· Ждём подтверждения до {date} (UTC+5)", {
                        date: dateLabel(w.offer_expires_at, true, language),
                      })
                    : " · Ожидает места",
                )}
              </p>
              {canReplace && w.id === queue[0]?.id && (
                <div className="event-actions mt-2">
                  <Button
                    size="sm"
                    disabled={!hasAbsent || action.busy}
                    onClick={() => setReplacement({ waiter: w, skip: false })}
                  >
                    {tr("На площадке · добавить")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.busy}
                    onClick={() => setReplacement({ waiter: w, skip: true })}
                  >
                    {tr("Не пришёл · следующий")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="event-rows">
        {rows.map((r) => (
          <Participant key={r.id} reg={r} data={data} />
        ))}
        {!rows.length && (
          <Empty
            title={tr("Записей не найдено")}
            text="Измените фильтры или дождитесь первых участников."
          />
        )}
      </div>
      <Confirm
        open={!!replacement}
        title={tr(
          replacement?.skip
            ? "Участника нет на площадке?"
            : "Добавить участника из очереди?",
        )}
        description={tr(
          replacement?.skip
            ? tr(
                "{name} будет удалён из очереди и получит уведомление. Следующим станет участник за ним.",
                {
                  name:
                    replacement.waiter.team_name ||
                    replacement.waiter.name ||
                    tr("Участник"),
                },
              )
            : tr(
                "{name} должен быть на площадке и готов играть. Его запись и состав сохранятся, чек-ин будет подтверждён, одна неявка будет заменена.",
                {
                  name:
                    replacement?.waiter.team_name ||
                    replacement?.waiter.name ||
                    tr("Участник"),
                },
              ),
        )}
        busy={action.busy}
        onClose={() => setReplacement(null)}
        onConfirm={async () => {
          if (
            replacement &&
            (await action.mutate(
              replacement.skip ? "skip_waiter" : "replace_no_show",
              {
                activity_id: replacement.waiter.activity_id,
                waitlist_id: replacement.waiter.id,
                confirmed_present: !replacement.skip,
                confirmed_absent: replacement.skip,
              },
            ))
          )
            setReplacement(null);
        }}
      />
      <Confirm
        open={release}
        title={tr("Отметить неявки?")}
        description={tr(
          "У всех записанных участников без чек-ина будет отметка «Не пришёл». Действие доступно через 30 минут после старта до формирования сетки. Проверьте присутствующих перед подтверждением.",
        )}
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
  const { tr, language } = useI18n();
  const a = data.activities.find((a) => a.id === r.activity_id)!;
  const action = useEventAction();
  const [decision, setDecision] = useState(""),
    [reason, setReason] = useState("");
  return (
    <article className="event-row space-y-3">
      <div className="event-line">
        <div>
          <h3>{tr(r.team_name || r.name || "Участник")}</h3>
          <p className="workspace-muted text-sm">
            {tr(a.title)} · {tr(dateLabel(r.created_at, false, language))}
          </p>
        </div>
        <span className="workspace-tag">
          {tr(REGISTRATION_STATUS_LABEL[r.status])}
        </span>
      </div>
      <p>
        {tr(
          r.checked_in_at
            ? tr("Чек-ин: {date}", {
                date: dateLabel(r.checked_in_at, false, language),
              })
            : "Чек-ин не пройден",
        )}
      </p>
      {!!r.team_members.length && (
        <p>
          {tr("Состав: ")}
          {tr(r.team_members.join(", "))}
        </p>
      )}
      {(data.replaced_registrations ?? []).includes(r.id) && (
        <p className="workspace-muted">
          {tr("Место передано участнику очереди. История неявки сохранена.")}
        </p>
      )}
      {!(data.replaced_registrations ?? []).includes(r.id) &&
        !["cancelled", "rejected"].includes(r.status) &&
        a.status !== "cancelled" && (
          <div className="event-actions">
            {tr(
              a.date_time && Date.parse(a.date_time) <= Date.now() && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDecision("attended")}
                  >
                    {tr("Посетил")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDecision("no_show")}
                  >
                    {tr("Не пришёл")}
                  </Button>
                </>
              ),
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDecision("rejected")}
            >
              {tr("Исключить")}
            </Button>
          </div>
        )}
      <details>
        <summary>{tr("Контакт и история")}</summary>
        {tr(r.phone && <a href={`tel:${r.phone}`}>{tr(r.phone)}</a>)}
        {tr(r.cancellation_reason && <p>{tr(r.cancellation_reason)}</p>)}
        <History
          items={data.history.filter((h) => h.registration_id === r.id)}
        />
      </details>
      <ErrorNotice message={tr(action.error)} />
      <Confirm
        open={!!decision}
        title={tr("Изменить статус участника?")}
        description={tr(
          "Решение и причина сохранятся в истории и будут видны участнику.",
        )}
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
          {tr("Причина / комментарий")}
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
