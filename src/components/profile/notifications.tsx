import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { saveProfileSection } from "@/lib/profile.functions";
import { type ProfileWorkspace, safeInternalHref } from "@/lib/profile-model";
import {
  Panel,
  Empty,
  Toggle,
  SaveRow,
  ErrorNotice,
  useSectionForm,
  errorText,
  dateLabel,
} from "./shared";
export function NotificationsTab({
  data,
  isHost,
}: {
  data: ProfileWorkspace;
  isHost: boolean;
}) {
  const [view, setView] = useState("inbox");
  const [unread, setUnread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const form = useSectionForm(
    "notifications",
    data.preferences.notifications,
    "notifications",
  );
  async function read(id?: string) {
    setBusy(true);
    setError("");
    try {
      await saveProfileSection({
        data: { action: "read", payload: id ? { id } : {} },
      });
      await qc.invalidateQueries({ queryKey: ["profile-workspace"] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const list = data.notifications.filter((n) => !unread || !n.read_at);
  return (
    <Panel
      title="Уведомления"
      subtitle="Изменения игр и ответы поддержки в одном месте"
    >
      <div className="profile-tabs-row">
        <button
          className={`feed-chip ${view === "inbox" ? "is-active" : ""}`}
          onClick={() => setView("inbox")}
        >
          Входящие
        </button>
        <button
          className={`feed-chip ${view === "settings" ? "is-active" : ""}`}
          onClick={() => setView("settings")}
        >
          Настройки
        </button>
      </div>
      {view === "inbox" ? (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <label className="flex! flex-row items-center gap-2">
              <input
                type="checkbox"
                checked={unread}
                onChange={(e) => setUnread(e.target.checked)}
              />{" "}
              Только непрочитанные
            </label>
            <Button
              variant="ghost"
              disabled={busy || !data.notifications.some((n) => !n.read_at)}
              onClick={() => void read()}
            >
              Прочитать все
            </Button>
          </div>
          <ErrorNotice message={error} />
          {list.length ? (
            list.map((n) => (
              <article className="profile-item" key={n.id}>
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-[#455054]" : "bg-brand"}`}
                  />
                  <div className="min-w-0 grow">
                    <h3 className="text-sm font-bold">{n.title}</h3>
                    <p className="workspace-muted mt-2 text-sm">{n.body}</p>
                    <p className="workspace-muted mt-2 text-xs">
                      {dateLabel(n.created_at, true)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <a
                        className="profile-link"
                        href={safeInternalHref(n.href)}
                      >
                        Открыть
                      </a>
                      {!n.read_at && (
                        <button
                          className="text-xs underline"
                          disabled={busy}
                          onClick={() => void read(n.id)}
                        >
                          Прочитано
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <Empty title={unread ? "Всё прочитано" : "Уведомлений пока нет"}>
              Новые события появятся здесь автоматически. История хранится с
              момента подключения раздела.
            </Empty>
          )}
        </>
      ) : (
        <>
          <Toggle
            label="Изменения и отмены игр"
            checked={form.value.games}
            onChange={(games) => form.patch({ games })}
          />

          <Toggle
            label="Заявки организатора"
            checked={form.value.applications}
            onChange={(applications) => form.patch({ applications })}
          />
          <Toggle
            label="Ответы поддержки"
            checked={form.value.support}
            onChange={(support) => form.patch({ support })}
          />
          {isHost && (
            <Toggle
              label="События организатора"
              description="Новые участники, отмены записей и чеки на проверку"
              checked={form.value.host}
              onChange={(host) => form.patch({ host })}
            />
          )}
          <Toggle
            label="Рекомендации новых игр"
            description="Не чаще одного раза в сутки, по городу и видам спорта. По умолчанию выключены."
            checked={form.value.recommendations}
            onChange={(recommendations) => form.patch({ recommendations })}
          />
          <label className="mt-5">
            Напоминание об игре
            <select
              value={form.value.reminder}
              onChange={(e) => form.patch({ reminder: Number(e.target.value) })}
            >
              {[
                [0, "Выключено"],
                [30, "За 30 минут"],
                [60, "За 1 час"],
                [180, "За 3 часа"],
                [1440, "За сутки"],
              ].map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <small>
              Напоминания внутри приложения. Для закрытого браузера нужна
              отдельная доставка push.
            </small>
          </label>
          <SaveRow form={form} />
          <div className="workspace-panel-raised mt-6 p-4">
            <h3 className="text-sm font-bold">Каналы доставки</h3>
            <p className="mt-3 text-sm">Внутри Sportura · подключено</p>
            <p className="workspace-muted mt-2 text-xs">
              Email и push для игровых уведомлений пока не подключены. Письма
              входа и восстановления пароля работают отдельно.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}
