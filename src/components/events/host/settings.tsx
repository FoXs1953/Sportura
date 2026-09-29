import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  eventDraft,
  type HostWorkspace,
  type HostDocument,
} from "@/lib/event-model";
import { useProfileForm } from "@/components/profile/shared";
import { mutateEvent } from "@/lib/event.functions";
import { Panel, Empty, Confirm, useEventAction, ErrorNotice } from "../shared";
export function HostSettings({
  data,
  onTemplate,
}: {
  data: HostWorkspace;
  onTemplate: (d: HostDocument) => void;
}) {
  const action = useEventAction();
  const [remove, setRemove] = useState<HostDocument | null>(null);
  const [editing, setEditing] = useState<HostDocument | null | undefined>();
  return (
    <>
      <Panel
        title="Настройки и помощь"
        description="Публичная информация и уведомления синхронизированы с профилем."
      >
        <div className="event-grid">
          {[
            [
              "organizer",
              "Информация организатора",
              "Название, описание, реквизиты и дополнительные роли.",
            ],
            ["personal", "Фотография и город", "Фото, город и виды спорта."],
            [
              "notifications",
              "Уведомления",
              "Записи, отмены, напоминания и поддержка.",
            ],
            ["help", "Поддержка", "Обращения и история ответов."],
          ].map(([tab, title, text]) => (
            <Link
              key={tab}
              className="event-muted-box"
              to="/profile"
              search={{ tab: tab! }}
            >
              <h3 className="font-bold">{title} ↗</h3>
              <p className="workspace-muted text-sm">{text}</p>
            </Link>
          ))}
        </div>
      </Panel>
      <Panel title="Площадки и значения по умолчанию">
        <div className="event-actions mb-4">
          <Button variant="outline" onClick={() => setEditing(null)}>
            Добавить площадку
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setEditing(
                data.documents.find((d) => d.kind === "defaults") ?? {
                  id: crypto.randomUUID(),
                  kind: "defaults",
                  name: "Значения по умолчанию",
                  data: eventDraft(),
                  activity_id: null,
                  published_id: null,
                  updated_at: "",
                },
              )
            }
          >
            Настроить значения по умолчанию
          </Button>
        </div>
        {editing !== undefined && (
          <DocumentEditor
            key={editing?.id ?? "new"}
            document={editing}
            onClose={() => setEditing(undefined)}
          />
        )}
        <div className="event-rows mt-4">
          {data.documents
            .filter((d) => d.kind === "venue")
            .map((d) => (
              <div className="event-row event-line" key={d.id}>
                <div>
                  <h3>{d.name}</h3>
                  <p className="workspace-muted">
                    {d.data.city} · {d.data.location_text}
                  </p>
                </div>
                <div className="event-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(d)}
                  >
                    Изменить
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemove(d)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </Panel>
      <Panel
        title="Шаблоны"
        description="Сохраните опубликованное событие как шаблон в его управлении. Дата новой игры выбирается заново."
      >
        <div className="event-rows">
          {data.documents
            .filter((d) => d.kind === "template")
            .map((d) => (
              <div className="event-row event-line" key={d.id}>
                <h3>{d.name}</h3>
                <div className="event-actions">
                  <Button size="sm" onClick={() => onTemplate(d)}>
                    Создать по шаблону
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemove(d)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            ))}
          {!data.documents.some((d) => d.kind === "template") && (
            <Empty
              title="Шаблонов пока нет"
              text="Откройте своё событие и нажмите «Сохранить как шаблон»."
            />
          )}
        </div>
      </Panel>
      <Panel title="Как управлять событиями">
        <div className="event-help-list">
          {[
            [
              "Публикация",
              "Заполните семь этапов, проверьте итоговую карточку и опубликуйте. Переходы между этапами сохраняют черновик в вашем аккаунте.",
            ],
            [
              "Чек-ин и посещаемость",
              "Проверьте отметки чек-ина в разделе участников. Через 30 минут после старта можно отметить не прошедших чек-ин. Проверьте присутствующих перед подтверждением.",
            ],
            [
              "Посещение",
              "После начала события откройте участников и отметьте присутствие. Любое исправление требует причины.",
            ],
            [
              "Турниры и лиги",
              "Проверьте состав, сформируйте пары, назначьте время матчей. После заполнения счёта проверьте таблицу и опубликуйте итоги.",
            ],
            [
              "Уведомления",
              "Внутри приложения работают уведомления об изменениях и ответах. Доступность почты и push указана в профиле.",
            ],
          ].map(([title, text]) => (
            <details key={title}>
              <summary>{title}</summary>
              <p>{text}</p>
            </details>
          ))}
        </div>
        <div className="event-actions mt-5">
          <Link className="profile-link" to="/legal">
            Правила и дата обновления ↗
          </Link>
          <Link
            className="profile-link"
            to="/profile"
            search={{ tab: "organizer" }}
          >
            Права и ограничения ↗
          </Link>
        </div>
      </Panel>
      <ErrorNotice message={action.error} />
      <Confirm
        open={!!remove}
        title="Удалить сохранённый документ?"
        description={remove?.name ?? ""}
        busy={action.busy}
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          if (
            remove &&
            (await action.mutate("delete_document", { id: remove.id }))
          )
            setRemove(null);
        }}
      />
    </>
  );
}
function DocumentEditor({
  document: d,
  onClose,
}: {
  document: HostDocument | null;
  onClose: () => void;
}) {
  const [id] = useState(d?.id ?? crypto.randomUUID());
  const [version, setVersion] = useState(d?.updated_at ?? "");
  const kind = d?.kind ?? "venue";
  const form = useProfileForm(
    "host-setting",
    { name: d?.name ?? "", ...eventDraft(), ...d?.data },
    async (v) => {
      const r = await mutateEvent({
        data: {
          action: "document",
          payload: {
            id,
            kind,
            name: v.name,
            data: v,
            ...(version ? { version } : {}),
          },
        },
      });
      setVersion(r.updated_at);
    },
  );
  const v = form.value;
  return (
    <div className="event-form event-muted-box">
      <h3 className="font-bold">
        {kind === "venue" ? "Площадка" : "Настройки новых событий"}
      </h3>
      {kind === "venue" ? (
        <div className="event-form-grid">
          {[
            ["name", "Название"],
            ["city", "Город"],
            ["district", "Район"],
            ["location_text", "Адрес"],
            ["two_gis_url", "Ссылка 2GIS"],
            ["notes", "Примечание"],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <input
                value={String(v[k as keyof typeof v])}
                onChange={(e) => form.patch({ [k!]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Площадка
            <select
              value={v.venue_type}
              onChange={(e) => form.patch({ venue_type: e.target.value })}
            >
              <option value="unknown">Не указано</option>
              <option value="indoor">В помещении</option>
              <option value="outdoor">На улице</option>
            </select>
          </label>
        </div>
      ) : (
        <div className="event-form-grid">
          <label>
            Продолжительность, минут
            <input
              type="number"
              min="15"
              max="10080"
              value={v.duration_minutes}
              onChange={(e) =>
                form.patch({ duration_minutes: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Количество мест
            <input
              type="number"
              min="2"
              max="200"
              value={v.max_participants}
              onChange={(e) =>
                form.patch({ max_participants: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Уровень
            <input
              value={v.skill_level}
              onChange={(e) => form.patch({ skill_level: e.target.value })}
            />
          </label>
          <label>
            Условия отмены
            <textarea
              value={v.cancellation_policy}
              onChange={(e) =>
                form.patch({ cancellation_policy: e.target.value })
              }
            />
          </label>
        </div>
      )}
      <ErrorNotice message={form.error} />
      <div className="event-actions">
        <Button
          disabled={form.busy}
          onClick={async () => {
            if (await form.submit()) onClose();
          }}
        >
          Сохранить
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            if (!form.dirty || (await form.submit())) onClose();
          }}
        >
          Закрыть
        </Button>
      </div>
    </div>
  );
}
