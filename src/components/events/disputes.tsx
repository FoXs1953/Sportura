import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { disputeAction, type Dispute } from "@/lib/competition-admin.functions";
import {
  Panel,
  Empty,
  ErrorNotice,
  useEventAction,
  HelpLink,
  dateLabel,
} from "./shared";
import { Button } from "@/components/ui/button";
export function EventDisputes({
  activityId,
  host = false,
  canOpen = false,
}: {
  activityId?: string;
  host?: boolean;
  canOpen?: boolean;
}) {
  const q = useQuery({
    queryKey: ["disputes", activityId ?? "all"],
    queryFn: () =>
      disputeAction({
        data: { action: "list", payload: { activity_id: activityId } },
      }),
    refetchInterval: 30000,
  });
  const action = useEventAction();
  const [body, setBody] = useState("");
  return (
    <Panel
      title={host ? "Споры участников" : "Мои споры"}
      description="Результат подтверждает организатор. Решение можно обжаловать через поддержку."
    >
      {q.isPending ? (
        <p>Загружаем…</p>
      ) : q.error ? (
        <ErrorNotice message={q.error.message} />
      ) : q.data?.length ? (
        q.data.map((d) => (
          <DisputeItem
            key={d.id + ":" + d.status}
            dispute={d}
            host={host}
            refresh={() => void q.refetch()}
          />
        ))
      ) : (
        <Empty
          title="Открытых обращений нет"
          text="Здесь появится история споров по результатам."
        />
      )}
      {canOpen && (
        <form
          className="event-form mt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await action.run(
                () =>
                  disputeAction({
                    data: {
                      action: "open",
                      payload: { activity_id: activityId, body },
                    },
                  }),
                "Спор отправлен",
              )
            ) {
              setBody("");
              void q.refetch();
            }
          }}
        >
          <label>
            Что нужно проверить?
            <textarea
              value={body}
              minLength={10}
              maxLength={2000}
              required
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <Button disabled={action.busy}>Открыть спор</Button>
          <ErrorNotice message={action.error} />
        </form>
      )}
    </Panel>
  );
}
function DisputeItem({
  dispute: d,
  host,
  refresh,
}: {
  dispute: Dispute;
  host: boolean;
  refresh: () => void;
}) {
  const action = useEventAction();
  const [body, setBody] = useState("");
  const [decision, setDecision] = useState("reply");
  return (
    <article className="event-muted-box space-y-3 mb-4">
      <h3 className="font-bold">{d.title}</h3>
      <p className="workspace-muted text-xs">
        {dateLabel(d.created_at)} ·{" "}
        {d.status === "open"
          ? "На рассмотрении"
          : d.status === "approved"
            ? "Спор принят"
            : "Спор отклонён"}
      </p>
      <p className="whitespace-pre-wrap text-sm">{d.reason}</p>
      {d.messages.map((m) => (
        <div className="profile-callout" key={m.id}>
          <strong>{m.from_host ? "Организатор" : "Участник"}</strong>
          <p className="whitespace-pre-wrap text-sm">{m.body}</p>
          <small>{dateLabel(m.created_at)}</small>
        </div>
      ))}
      {d.status !== "open" && (
        <p className="text-sm">Решение: {d.admin_notes}</p>
      )}
      {d.status === "open" && (
        <form
          className="event-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await action.run(
                () =>
                  disputeAction({
                    data: {
                      action: decision === "reply" ? "reply" : "resolve",
                      payload: { id: d.id, body, status: decision },
                    },
                  }),
                "Ответ сохранён",
              )
            ) {
              setBody("");
              refresh();
            }
          }}
        >
          <label>
            {host ? "Ответ и основание решения" : "Дополнение"}
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {host && (
            <label>
              Действие
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="reply">Ответить, оставить спор открытым</option>
                <option value="approved">Принять спор и закрыть</option>
                <option value="rejected">Отклонить спор и закрыть</option>
              </select>
            </label>
          )}
          {decision === "approved" && (
            <p className="workspace-muted text-sm">
              При необходимости исправьте счёт в разделе матчей и заново
              опубликуйте итоги.
            </p>
          )}
          <ErrorNotice message={action.error} />
          <Button disabled={action.busy}>Сохранить ответ</Button>
        </form>
      )}
      <HelpLink activity={d.activity_id}>Обратиться в поддержку</HelpLink>
    </article>
  );
}
