import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { mutateCompetition } from "@/lib/event.functions";
import type { CompetitionData, Registration, Event } from "@/lib/event-model";
import { localDateTime, isoDateTime } from "@/lib/event-model";
import { ErrorNotice, useEventAction, dateLabel } from "./shared";
export function ItemPrizes({
  data,
  registrations,
}: {
  data: CompetitionData;
  registrations?: Registration[];
}) {
  const { tr, language } = useI18n();
  const action = useEventAction();
  const [name, setName] = useState("");
  const [sponsor, setSponsor] = useState("");
  if (!registrations && !data.item_prizes?.length) return null;
  return (
    <section className="space-y-3">
      <h3 className="font-bold">{tr("Вещевые призы")}</h3>
      {data.item_prizes?.map((p) => (
        <article className="event-muted-box" key={p.id}>
          <strong>{tr(p.name)}</strong>
          {tr(
            p.sponsor && (
              <p className="workspace-muted text-sm">
                {tr("От ")}
                {tr(p.sponsor)}
              </p>
            ),
          )}
          {tr(
            p.recipient && (
              <p>
                {tr("Получатель: ")}
                {tr(p.recipient)}
              </p>
            ),
          )}
          {p.delivered_at ? (
            <p className="text-sm">
              {tr("Выдан {date}", {
                date: dateLabel(p.delivered_at, false, language),
              })}
            </p>
          ) : (
            registrations && (
              <PrizeAward
                key={p.id + ":" + p.registration_id}
                activity={data.activity.id}
                prize={p}
                registrations={registrations}
              />
            )
          )}
        </article>
      ))}
      {registrations && (
        <details className="event-muted-box">
          <summary>{tr("Добавить приз до начала регистрации")}</summary>
          <form
            className="event-form mt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action.run(
                  () =>
                    mutateCompetition({
                      data: {
                        action: "prize_add",
                        payload: {
                          activity_id: data.activity.id,
                          name,
                          sponsor,
                        },
                      },
                    }),
                  "Приз добавлен",
                )
              ) {
                setName("");
                setSponsor("");
              }
            }}
          >
            <label>
              {tr("Приз")}
              <input
                required
                minLength={2}
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr("Например, футбольный мяч")}
              />
            </label>
            <label>
              {tr("Спонсор")}
              <input
                maxLength={120}
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
              />
            </label>
            <ErrorNotice message={tr(action.error)} />
            <Button disabled={action.busy}>{tr("Добавить приз")}</Button>
          </form>
        </details>
      )}
    </section>
  );
}
function PrizeAward({
  activity,
  prize: p,
  registrations,
}: {
  activity: string;
  prize: NonNullable<CompetitionData["item_prizes"]>[number];
  registrations: Registration[];
}) {
  const { tr } = useI18n();
  const [recipient, setRecipient] = useState(p.registration_id ?? "");
  const [note, setNote] = useState("");
  const action = useEventAction();
  return (
    <form
      className="event-form mt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await action.run(
          () =>
            mutateCompetition({
              data: {
                action: p.registration_id ? "prize_deliver" : "prize_award",
                payload: {
                  activity_id: activity,
                  id: p.id,
                  registration_id: recipient,
                  note,
                },
              },
            }),
          "Приз обновлён",
        );
      }}
    >
      {!p.registration_id ? (
        <label>
          {tr("Получатель")}
          <select
            required
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          >
            <option value="">{tr("Выберите участника")}</option>
            {registrations
              .filter((r) => ["registered", "attended"].includes(r.status))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {tr(r.team_name || r.name)}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <label>
          {tr("Примечание о выдаче")}
          <input
            required
            minLength={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tr("Передан лично на награждении")}
          />
        </label>
      )}
      <Button size="sm" variant="outline" disabled={action.busy}>
        {tr(p.registration_id ? "Подтвердить выдачу" : "Назначить получателя")}
      </Button>
      <ErrorNotice message={tr(action.error)} />
    </form>
  );
}
export function WeatherReschedule({ event: a }: { event: Event }) {
  const { tr } = useI18n();
  const [start, setStart] = useState(localDateTime(a.date_time));
  const [reason, setReason] = useState("");
  const action = useEventAction();
  if (
    a.venue_type !== "outdoor" ||
    ["cancelled", "completed"].includes(a.status)
  )
    return null;
  return (
    <details className="event-muted-box mt-4">
      <summary>{tr("Перенести из-за погоды")}</summary>
      <form
        className="event-form mt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await action.run(
            () =>
              mutateCompetition({
                data: {
                  action: "weather",
                  payload: {
                    activity_id: a.id,
                    starts_at: isoDateTime(start),
                    reason,
                  },
                },
              }),
            "Событие перенесено",
          );
        }}
      >
        <p className="workspace-muted text-sm">
          {tr(
            "До 48 часов от текущего начала, до первого результата. Время назначенных матчей сдвинется вместе с событием.",
          )}
        </p>
        <label>
          {tr("Новое начало, UTC+5")}
          <input
            required
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          {tr("Причина")}
          <textarea
            required
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <ErrorNotice message={tr(action.error)} />
        <Button disabled={action.busy}>{tr("Перенести событие")}</Button>
      </form>
    </details>
  );
}
