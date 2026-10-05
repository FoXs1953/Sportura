import { useI18n } from "@/lib/i18n";
import { CITIES, SKILL_LEVELS } from "@/lib/sportura";
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
  const { tr } = useI18n();
  const action = useEventAction();
  const [remove, setRemove] = useState<HostDocument | null>(null);
  const [editing, setEditing] = useState<HostDocument | null | undefined>();
  return (
    <>
      <Panel
        title={tr("Настройки и помощь")}
        description={tr(
          "Публичная информация и уведомления синхронизированы с профилем.",
        )}
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
              <h3 className="font-bold">{tr(title)} ↗</h3>
              <p className="workspace-muted text-sm">{tr(text)}</p>
            </Link>
          ))}
        </div>
      </Panel>
      <Panel title={tr("Площадки и значения по умолчанию")}>
        <div className="event-actions mb-4">
          <Button variant="outline" onClick={() => setEditing(null)}>
            {tr("Добавить площадку")}
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
            {tr("Настроить значения по умолчанию")}
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
                  <h3>{tr(d.name)}</h3>
                  <p className="workspace-muted">
                    {tr(d.data.city)} · {tr(d.data.location_text)}
                  </p>
                </div>
                <div className="event-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(d)}
                  >
                    {tr("Изменить")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemove(d)}
                  >
                    {tr("Удалить")}
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </Panel>
      <Panel
        title={tr("Шаблоны")}
        description={tr(
          "Сохраните опубликованное событие как шаблон в его управлении. Дата новой игры выбирается заново.",
        )}
      >
        <div className="event-rows">
          {data.documents
            .filter((d) => d.kind === "template")
            .map((d) => (
              <div className="event-row event-line" key={d.id}>
                <h3>{tr(d.name)}</h3>
                <div className="event-actions">
                  <Button size="sm" onClick={() => onTemplate(d)}>
                    {tr("Создать по шаблону")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemove(d)}
                  >
                    {tr("Удалить")}
                  </Button>
                </div>
              </div>
            ))}
          {!data.documents.some((d) => d.kind === "template") && (
            <Empty
              title={tr("Шаблонов пока нет")}
              text="Откройте своё событие и нажмите «Сохранить как шаблон»."
            />
          )}
        </div>
      </Panel>
      <Panel title={tr("Как управлять событиями")}>
        <div className="event-help-list">
          {[
            [
              "Публикация",
              "Заполните шесть этапов, проверьте итоговую карточку и опубликуйте. Изменения сохраняются при переходе между этапами или кнопкой «Сохранить черновик».",
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
              <summary>{tr(title)}</summary>
              <p>{tr(text)}</p>
            </details>
          ))}
        </div>
        <div className="event-actions mt-5">
          <Link className="profile-link" to="/legal">
            {tr("Правила и дата обновления ↗")}
          </Link>
          <Link
            className="profile-link"
            to="/profile"
            search={{ tab: "organizer" }}
          >
            {tr("Права и ограничения ↗")}
          </Link>
        </div>
      </Panel>
      <ErrorNotice message={tr(action.error)} />
      <Confirm
        open={!!remove}
        title={tr("Удалить сохранённый документ?")}
        description={tr(remove?.name ?? "")}
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
  const { tr } = useI18n();
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
        {tr(kind === "venue" ? "Площадка" : "Настройки новых событий")}
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
              {tr(l)}
              {k === "city" ? (
                <select
                  value={v.city}
                  onChange={(e) => form.patch({ city: e.target.value })}
                >
                  {!CITIES.some((city) => city === v.city) && (
                    <option value={v.city}>{tr(v.city)}</option>
                  )}
                  {CITIES.map((city) => (
                    <option key={city} value={city}>
                      {tr(city)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={String(v[k as keyof typeof v])}
                  onChange={(e) => form.patch({ [k!]: e.target.value })}
                />
              )}
            </label>
          ))}
          <label>
            {tr("Площадка")}
            <select
              value={v.venue_type}
              onChange={(e) => form.patch({ venue_type: e.target.value })}
            >
              <option value="unknown">{tr("Не указано")}</option>
              <option value="indoor">{tr("В помещении")}</option>
              <option value="outdoor">{tr("На улице")}</option>
            </select>
          </label>
        </div>
      ) : (
        <div className="event-form-grid">
          <label>
            {tr("Продолжительность, минут")}
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
            {tr("Количество мест")}
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
            {tr("Уровень")}
            <select
              value={v.skill_level}
              onChange={(e) => form.patch({ skill_level: e.target.value })}
            >
              {!SKILL_LEVELS.some((level) => level === v.skill_level) && (
                <option value={v.skill_level}>{tr(v.skill_level)}</option>
              )}
              {SKILL_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {tr(level)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Условия отмены")}
            <textarea
              value={tr(v.cancellation_policy)}
              onChange={(e) =>
                form.patch({ cancellation_policy: e.target.value })
              }
            />
          </label>
        </div>
      )}
      <ErrorNotice message={tr(form.error)} />
      <div className="event-actions">
        <Button
          disabled={form.busy}
          onClick={async () => {
            if (await form.submit()) onClose();
          }}
        >
          {tr("Сохранить")}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            if (!form.dirty || (await form.submit())) onClose();
          }}
        >
          {tr("Закрыть")}
        </Button>
      </div>
    </div>
  );
}
