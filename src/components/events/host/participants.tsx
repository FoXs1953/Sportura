import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReceiptLink } from "@/components/sportura/receipt-link";
import {
  REGISTRATION_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  formatKzt,
} from "@/lib/sportura";
import type { HostWorkspace, Registration, Refund } from "@/lib/event-model";
import { refundLabels, localDateTime } from "@/lib/event-model";
import {
  Panel,
  Empty,
  ErrorNotice,
  useEventAction,
  Confirm,
  History,
  exportCsv,
  dateLabel,
  HelpLink,
} from "../shared";
const amount = (n: number | null) =>
  n === null ? "Сумма не зафиксирована" : formatKzt(n);
export function Participants({
  data,
  eventId = "",
  payments = false,
  initialStatus = "all",
}: {
  data: HostWorkspace;
  eventId?: string;
  payments?: boolean;
  initialStatus?: string;
}) {
  const [event, setEvent] = useState(eventId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [date, setDate] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [fields, setFields] = useState(["name", "status", "payment", "team"]);
  const rows = data.registrations.filter(
    (r) =>
      (!event || r.activity_id === event) &&
      (!date || localDateTime(r.created_at).startsWith(date)) &&
      (!min || (r.amount_due !== null && r.amount_due >= Number(min))) &&
      (!max || (r.amount_due !== null && r.amount_due <= Number(max))) &&
      (!query ||
        `${r.name} ${r.team_name} ${r.payment_reference ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (status === "all" ||
        (status === "refund"
          ? data.refunds.some((f) => f.registration_id === r.id)
          : status === "cancelled"
            ? ["cancelled", "rejected"].includes(r.status)
            : payments
              ? r.payment_status === status
              : r.status === status)),
  );
  const columns: Record<string, [string, (r: Registration) => string]> = {
    name: ["Участник", (r) => r.name ?? ""],
    status: ["Участие", (r) => REGISTRATION_STATUS_LABEL[r.status]],
    payment: ["Оплата", (r) => PAYMENT_STATUS_LABEL[r.payment_status]],
    team: [
      "Команда / состав",
      (r) => [r.team_name, ...r.team_members].join("; "),
    ],
    phone: ["Телефон", (r) => r.phone ?? ""],
    date: ["Дата записи", (r) => dateLabel(r.created_at)],
    event: [
      "Событие",
      (r) => data.activities.find((a) => a.id === r.activity_id)?.title ?? "",
    ],
  };
  const received = data.registrations
    .filter(
      (r) =>
        (!event || r.activity_id === event) &&
        ["paid", "refunded"].includes(r.payment_status),
    )
    .reduce((s, r) => s + (r.amount_due ?? 0), 0);
  const refunds = data.refunds.filter(
    (f) =>
      !event ||
      data.registrations.some(
        (r) => r.id === f.registration_id && r.activity_id === event,
      ),
  );
  return (
    <Panel
      title={payments ? "Оплаты и возвраты" : "Участники"}
      description={
        payments
          ? "Ручная проверка переводов. Все суммы относятся к условиям конкретной записи."
          : "Состав, посещаемость и история собственных событий."
      }
    >
      {payments && (
        <div className="event-stats mb-5">
          {[
            [
              "Получено, без возвратов",
              Math.max(
                0,
                received -
                  refunds
                    .filter(
                      (f) =>
                        f.status === "completed" &&
                        data.registrations.some(
                          (r) =>
                            r.id === f.registration_id && r.amount_due !== null,
                        ),
                    )
                    .reduce((s, f) => s + (f.amount ?? 0), 0),
              ),
            ],
            [
              "Ожидается",
              data.registrations
                .filter(
                  (r) =>
                    (!event || r.activity_id === event) &&
                    r.status === "registered" &&
                    ["pending", "rejected"].includes(r.payment_status),
                )
                .reduce((s, r) => s + (r.amount_due ?? 0), 0),
            ],
            [
              "Возвраты в работе",
              refunds
                .filter((f) => !["completed", "rejected"].includes(f.status))
                .reduce((s, f) => s + (f.amount ?? 0), 0),
            ],
            [
              "Возвращено",
              refunds
                .filter((f) => f.status === "completed")
                .reduce((s, f) => s + (f.amount ?? 0), 0),
            ],
          ].map(([l, n]) => (
            <div className="event-muted-box" key={l}>
              <small>{l}</small>
              <p className="text-xl font-bold">{formatKzt(Number(n))}</p>
            </div>
          ))}
        </div>
      )}
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
            placeholder="Имя, команда, код перевода"
          />
        </label>
        <label>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Все</option>
            {Object.entries(
              payments ? PAYMENT_STATUS_LABEL : REGISTRATION_STATUS_LABEL,
            ).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            {payments && <option value="refund">Возвраты</option>}
          </select>
        </label>
        <label>
          Дата записи
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {payments && (
          <>
            <label>
              Сумма от
              <input
                type="number"
                min="0"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </label>
            <label>
              Сумма до
              <input
                type="number"
                min="0"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      {!payments && (
        <details className="event-muted-box mb-5">
          <summary>Выгрузка списка ({rows.length})</summary>
          <div className="event-actions my-3">
            {Object.entries(columns).map(([k, [l]]) => (
              <label className="event-check" key={k}>
                <input
                  type="checkbox"
                  checked={fields.includes(k)}
                  onChange={(e) =>
                    setFields(
                      e.target.checked
                        ? [...fields, k]
                        : fields.filter((f) => f !== k),
                    )
                  }
                />
                {l}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={!fields.length || !rows.length}
            onClick={() =>
              exportCsv(
                [
                  fields.map((f) => columns[f]![0]),
                  ...rows.map((r) => fields.map((f) => columns[f]![1](r))),
                ],
                "sportura-participants.csv",
              )
            }
          >
            Скачать CSV
          </Button>
        </details>
      )}
      {payments && (
        <p className="event-count-note mb-4">
          Старые записи без зафиксированной суммы не входят в денежные итоги.
          Перед возвратом сумму нужно уточнить.
        </p>
      )}
      <div className="event-rows">
        {rows.map((r) => (
          <Participant key={r.id} reg={r} data={data} payments={payments} />
        ))}
        {!rows.length && (
          <Empty
            title="Записей не найдено"
            text="Измените фильтры или дождитесь первых участников."
          />
        )}
      </div>
    </Panel>
  );
}
function Participant({
  reg: r,
  data,
  payments,
}: {
  reg: Registration;
  data: HostWorkspace;
  payments: boolean;
}) {
  const a = data.activities.find((a) => a.id === r.activity_id)!;
  const refund = data.refunds.find((f) => f.registration_id === r.id);
  const [details, setDetails] = useState(false);
  const [decision, setDecision] = useState<{
    action: "payment" | "participant";
    status: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const action = useEventAction();
  const duplicated =
    !!r.payment_reference &&
    data.registrations.some(
      (x) => x.id !== r.id && x.payment_reference === r.payment_reference,
    );
  return (
    <article className="event-row space-y-3">
      <div className="event-line">
        <div>
          <h3>{r.team_name || r.name || "Участник"}</h3>
          {r.game_nickname && <p className="text-sm">Игровой ник: {r.game_nickname}</p>}
          {r.checked_in_at && <p className="text-sm text-brand">Чек-ин подтверждён</p>}
          <p className="workspace-muted text-sm">
            {a.title} · {dateLabel(r.created_at)}
          </p>
        </div>
        <div>
          <span className="workspace-kicker">
            {REGISTRATION_STATUS_LABEL[r.status]}
          </span>
          <p className="text-sm">
            {PAYMENT_STATUS_LABEL[r.payment_status]} · {amount(r.amount_due)}
          </p>
        </div>
      </div>
      {r.team_name && (
        <p className="text-sm">
          Капитан: {r.name} · {r.team_members.join(", ")}
        </p>
      )}
      {payments && (
        <>
          <p className="text-sm">
            Код перевода: {r.payment_reference || "Не указан"} · Kaspi, проверка
            вручную
          </p>
          {r.receipt_url && <ReceiptLink path={r.receipt_url} />}{" "}
          {duplicated && (
            <p className="profile-callout">
              Такой код перевода указан в другой записи. Сверьте чек и сумму
              перед подтверждением.
            </p>
          )}
          {r.participant_note && (
            <p className="event-description">{r.participant_note}</p>
          )}
          {!["cancelled", "rejected"].includes(r.status) &&
            ["pending", "needs_review", "rejected"].includes(
              r.payment_status,
            ) && (
              <div className="event-actions">
                <Button
                  size="sm"
                  onClick={() =>
                    setDecision({ action: "payment", status: "paid" })
                  }
                >
                  Подтвердить оплату
                </Button>
                {r.payment_status === "needs_review" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDecision({ action: "payment", status: "rejected" })
                    }
                  >
                    Отклонить чек
                  </Button>
                )}
              </div>
            )}
          {refund && <RefundEditor refund={refund} registration={r} />}
        </>
      )}
      {!payments &&
        r.status !== "cancelled" &&
        r.status !== "rejected" &&
        a.status !== "cancelled" && (
          <div className="event-actions">
            {a.date_time && Date.parse(a.date_time) <= Date.now() && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDecision({ action: "participant", status: "attended" })
                  }
                >
                  Посетил
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDecision({ action: "participant", status: "no_show" })
                  }
                >
                  Не пришёл
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDecision({ action: "participant", status: "rejected" })
              }
            >
              Исключить
            </Button>
          </div>
        )}
      <Button variant="ghost" size="sm" onClick={() => setDetails(!details)}>
        {details ? "Скрыть подробности" : "Подробности и история"}
      </Button>
      {details && (
        <div className="event-expanded space-y-3">
          {r.phone && (
            <p>
              Контакт участника: <a href={`tel:${r.phone}`}>{r.phone}</a>
            </p>
          )}
          {r.payment_note && <p>Решение по оплате: {r.payment_note}</p>}
          {r.cancellation_reason && <p>Причина: {r.cancellation_reason}</p>}
          {r.proofs?.map((p) => (
            <div key={p.id} className="profile-item">
              <p>
                {dateLabel(p.created_at)} · {p.payment_reference}
              </p>
              {p.receipt_url && <ReceiptLink path={p.receipt_url} />}
              <p>{p.note}</p>
            </div>
          ))}
          <History
            items={data.history.filter((h) => h.registration_id === r.id)}
          />
          <HelpLink activity={a.id} />
        </div>
      )}
      <ErrorNotice message={action.error} />
      <Confirm
        open={!!decision}
        title={
          decision?.status === "paid"
            ? "Подтвердить получение перевода?"
            : "Изменить статус участника?"
        }
        description={
          decision?.status === "rejected" && decision.action === "participant"
            ? "Участник получит уведомление. Для оплаченной записи будет создан запрос возврата."
            : "Решение и причина сохранятся в истории и будут видны участнику."
        }
        busy={action.busy}
        onClose={() => setDecision(null)}
        onConfirm={async () => {
          if (!decision) return;
          if (
            await action.mutate(decision.action, {
              registration_id: r.id,
              status: decision.status,
              reason,
            })
          ) {
            setDecision(null);
            setReason("");
          }
        }}
      >
        <label className="event-form">
          Причина / комментарий
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={600}
          />
        </label>
      </Confirm>
    </article>
  );
}
function RefundEditor({
  refund: f,
  registration: r,
}: {
  refund: Refund;
  registration: Registration;
}) {
  const action = useEventAction();
  const [status, setStatus] = useState("in_progress");
  const [reason, setReason] = useState("");
  const [sum, setSum] = useState(f.amount === null ? "" : String(f.amount));
  const [reference, setReference] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="event-muted-box space-y-3">
      <h4 className="font-bold">Возврат · {refundLabels[f.status]}</h4>
      <p>
        {f.reason} · {amount(f.amount)}
      </p>
      {f.response && <p>{f.response}</p>}
      {f.reference && <p>Подтверждение: {f.reference}</p>}
      {!["completed", "rejected"].includes(f.status) && (
        <>
          <div className="event-filters">
            <label>
              Решение
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {Object.entries(refundLabels)
                  .filter(([v]) => v !== "requested")
                  .map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Сумма возврата, ₸
              <input
                type="number"
                min="0"
                max={r.amount_due ?? undefined}
                value={sum}
                onChange={(e) => setSum(e.target.value)}
              />
            </label>
            <label>
              Объяснение
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1500}
              />
            </label>
            {status === "completed" && (
              <label>
                Номер фактического перевода
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={200}
                />
              </label>
            )}
          </div>
          <Button
            size="sm"
            disabled={reason.trim().length < 3 || sum === ""}
            onClick={() => setConfirm(true)}
          >
            Сохранить решение
          </Button>
          <Confirm
            open={confirm}
            title="Сохранить решение по возврату?"
            description={
              status === "completed"
                ? "Подтвердите, что перевод участнику уже выполнен. Кнопка записывает операцию в учёт."
                : "Участник получит уведомление с вашим решением."
            }
            busy={action.busy}
            onClose={() => setConfirm(false)}
            onConfirm={async () => {
              if (
                await action.mutate("refund", {
                  registration_id: r.id,
                  status,
                  reason,
                  amount: Number(sum),
                  reference,
                })
              )
                setConfirm(false);
            }}
          />
        </>
      )}
      <ErrorNotice message={action.error} />
    </div>
  );
}
