import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  checkAccountDeletion,
  exportMyData,
  getMySessions,
  revokeMySession,
  saveProfileSection,
} from "@/lib/profile.functions";
import {
  changePassword,
  getAuthCapabilities,
  getIdentities,
  signOut,
  unlinkGoogle,
} from "@/lib/auth.functions";
import { type MyProfile } from "@/lib/me.functions";
import { type ProfileWorkspace } from "@/lib/profile-model";
import { ACCOUNT_STATUS_LABEL } from "@/lib/sportura";
import {
  Panel,
  SaveRow,
  Toggle,
  Empty,
  ErrorNotice,
  useSectionForm,
  errorText,
  dateLabel,
} from "./shared";
import type { TicketDraft } from "./support";
export function SecurityTab({
  me,
  data,
  report,
}: {
  me: MyProfile;
  data: ProfileWorkspace;
  report: (draft: TicketDraft) => void;
}) {
  const { tr, language } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const prefs = useSectionForm("privacy", data.preferences.privacy, "privacy");
  const sessions = useQuery({
    queryKey: ["profile-sessions"],
    queryFn: () => getMySessions(),
  });
  const identity = useQuery({
    queryKey: ["profile-identity"],
    queryFn: () => getIdentities(),
  });
  const capabilities = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: () => getAuthCapabilities(),
  });
  const deletion = useQuery({
    queryKey: ["profile-deletion"],
    queryFn: () => checkAccountDeletion(),
    enabled: deleting,
  });
  const identities = identity.data ?? [];
  const google = identities.find((i) => i.provider === "google");
  const hasEmail = identities.some((i) => i.provider === "email");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ErrorNotice message={tr(error)} />
      <Panel
        title={tr("Вход и безопасность")}
        subtitle={tr(me.email ?? "Ваш аккаунт")}
      >
        <div className="workspace-panel-raised mb-5 p-4">
          <h3 className="text-sm font-bold">{tr("Способы входа")}</h3>
          {identity.isPending ? (
            <p className="workspace-muted mt-2 text-sm">{tr("Загружаем…")}</p>
          ) : identity.isError ? (
            <ErrorNotice message={tr(errorText(identity.error))} />
          ) : (
            <p className="workspace-muted mt-2 text-sm">
              {tr(
                identities
                  .map((i) =>
                    i.provider === "email"
                      ? tr("Email")
                      : i.provider === "google"
                        ? "Google"
                        : i.provider,
                  )
                  .join(", ") || "Способ входа не определён",
              )}
            </p>
          )}
          {capabilities.data?.google && !google && (
            <Button
              variant="outline"
              className="mt-3"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                window.location.assign("/api/auth/google?mode=link");
              }}
            >
              {tr("Подключить Google")}
            </Button>
          )}
          {google && (
            <Button
              variant="outline"
              className="mt-3"
              disabled={busy || identities.length < 2}
              onClick={() =>
                void run(async () => {
                  if (identities.length < 2)
                    throw new Error("Нельзя отключить последний способ входа");
                  await unlinkGoogle();
                  await qc.invalidateQueries({
                    queryKey: ["profile-identity"],
                  });
                  toast.success(tr("Google отключён"));
                })
              }
            >
              {tr("Отключить Google")}
            </Button>
          )}
          {!capabilities.data?.google && !google && (
            <p className="workspace-muted mt-3 text-xs">
              {tr("Вход через Google пока не подключён к Sportura.")}
            </p>
          )}
        </div>
        <h3 className="mb-4 text-sm font-bold">{tr("Сменить пароль")}</h3>
        <div className="grid gap-4">
          {hasEmail && (
            <label htmlFor="profile-current-password">
              {tr("Текущий пароль")}
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
          )}
          <label>
            {tr("Новый пароль")}
            <Input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>{tr("Не менее 12 символов")}</small>
          </label>
          <label>
            {tr("Повторите пароль")}
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {tr(
              confirm && password !== confirm && (
                <small className="text-destructive">
                  {tr("Пароли не совпадают")}
                </small>
              ),
            )}
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button
            disabled={
              busy ||
              password.length < 12 ||
              password !== confirm ||
              (hasEmail && !current)
            }
            onClick={() =>
              void run(async () => {
                await changePassword({
                  data: { password, ...(hasEmail ? { current } : {}) },
                });
                setCurrent("");
                setPassword("");
                setConfirm("");
                toast.success(
                  tr("Пароль обновлён. Вход на других устройствах завершён."),
                );
                await Promise.all([
                  qc.invalidateQueries({ queryKey: ["profile-identity"] }),
                  qc.invalidateQueries({ queryKey: ["profile-sessions"] }),
                ]);
              })
            }
          >
            {tr("Обновить пароль")}
          </Button>
          <Link className="profile-link" to="/forgot-password">
            {tr("Не помню пароль")}
          </Link>
        </div>
        <p className="workspace-muted mt-5 text-xs">
          {tr(
            "Двухфакторную защиту подключим отдельным этапом с кодами восстановления.",
          )}
        </p>
      </Panel>
      <Panel
        title={tr("Устройства и сеансы")}
        subtitle={tr(
          "Последняя активность — время обновления сессии, а не точное время последнего действия.",
        )}
      >
        {sessions.isPending ? (
          <p role="status">{tr("Загружаем устройства…")}</p>
        ) : sessions.isError ? (
          <>
            <ErrorNotice message={tr(errorText(sessions.error))} />
            <Button onClick={() => void sessions.refetch()}>
              {tr("Повторить")}
            </Button>
          </>
        ) : sessions.data?.length ? (
          sessions.data.map((s) => (
            <div className="profile-item" key={s.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <strong className="text-sm">
                    {tr(deviceLabel(s.user_agent))}
                  </strong>
                  <p className="workspace-muted mt-1 text-xs">
                    {tr(dateLabel(s.last_active, true, language))}
                  </p>
                </div>
                {s.current ? (
                  <span className="workspace-tag is-success">
                    {tr("Это устройство")}
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await revokeMySession({ data: { id: s.id } });
                        await sessions.refetch();
                        toast.success(tr("Сеанс завершён"));
                      })
                    }
                  >
                    {tr("Завершить")}
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty title={tr("Список устройств пуст")} />
        )}
        <Button
          variant="outline"
          className="mt-5"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await signOut({ data: { scope: "others" } });
              await sessions.refetch();
              toast.success(tr("Остальные сеансы завершены"));
            })
          }
        >
          {tr("Выйти на других устройствах")}
        </Button>
        <p className="workspace-muted mt-3 text-xs">
          {tr("Завершённые сеансы теряют доступ сразу.")}
        </p>
      </Panel>
      <Panel
        title={tr("Приватность")}
        subtitle={tr(
          "Имя и город доступны в публичном профиле. Контакты, чеки и обращения в поддержку никогда не публикуются.",
        )}
      >
        <Toggle
          label={tr("Показывать описание обо мне")}
          checked={prefs.value.bio}
          onChange={(bio) => prefs.patch({ bio })}
        />
        <Toggle
          label={tr("Показывать виды спорта")}
          checked={prefs.value.sports}
          onChange={(sports) => prefs.patch({ sports })}
        />
        <Toggle
          label={tr("Показывать рейтинг и статистику")}
          checked={prefs.value.stats}
          onChange={(stats) => prefs.patch({ stats })}
        />
        <SaveRow form={prefs} />
        <Link
          className="profile-link mt-4 inline-block"
          to="/player/$id"
          params={{ id: me.id }}
        >
          {tr("Проверить публичный профиль ↗")}
        </Link>
      </Panel>
      {me.account_status !== "active" && (
        <Panel title={tr("Ограничение аккаунта")}>
          <span className="workspace-tag is-warning">
            {tr(ACCOUNT_STATUS_LABEL[me.account_status])}
          </span>
          <p className="mt-4 text-sm">
            {tr(
              data.restriction.reason ??
                "Публичная причина не указана. Уточните её у поддержки.",
            )}
          </p>
          <p className="workspace-muted mt-2 text-xs">
            {tr("Срок:")}
            {tr(" ")}
            {tr(
              data.restriction.until
                ? dateLabel(data.restriction.until, false, language)
                : "Не указан",
            )}
            {tr(". Запись на новые события и подача заявок ограничены.")}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() =>
              report({
                topic: "restriction",
                subject: "Обжалование ограничения аккаунта",
              })
            }
          >
            {tr("Обжаловать")}
          </Button>
        </Panel>
      )}
      <Panel title={tr("Ваши данные")}>
        <p className="workspace-muted mb-4 text-sm">
          {tr(
            "Скачайте профиль, историю участия и обращений в формате JSON. Файл содержит личные сведения — храните его в безопасном месте.",
          )}
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const value = await exportMyData();
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(value, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `sportura-data-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              toast.success(tr("Данные подготовлены"));
            })
          }
        >
          {tr("Скачать мои данные")}
        </Button>
      </Panel>
      <Panel title={tr("Завершение работы")}>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await signOut({ data: { scope: "local" } });
                await qc.cancelQueries();
                qc.clear();
                await navigate({ to: "/auth", replace: true });
              })
            }
          >
            {tr("Выйти из аккаунта")}
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              setDeleting(true);
              setConfirmation("");
            }}
          >
            {tr("Удалить аккаунт")}
          </Button>
        </div>
        <Dialog open={deleting} onOpenChange={setDeleting}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Удаление аккаунта")}</DialogTitle>
              <DialogDescription>
                {tr(
                  "Сначала проверим незавершённые игры и платежи. Запрос поступит поддержке; до его обработки аккаунт остаётся доступным. Вы сможете уточнить детали или отозвать запрос в переписке.",
                )}
              </DialogDescription>
            </DialogHeader>
            {deletion.isPending ? (
              <p>{tr("Проверяем активные записи…")}</p>
            ) : deletion.isError ? (
              <ErrorNotice message={tr(errorText(deletion.error))} />
            ) : !deletion.data?.allowed ? (
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {deletion.data?.blockers.map((b) => (
                  <li key={b}>{tr(b)}</li>
                ))}
              </ul>
            ) : (
              <>
                <p className="text-sm">
                  {tr(
                    "После удаления доступ к профилю и истории будет утрачен. Сначала скачайте копию данных.",
                  )}
                </p>
                <label>
                  {tr("Введите «УДАЛИТЬ» для отправки запроса")}
                  <Input
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
                <Button
                  variant="destructive"
                  disabled={busy || confirmation !== tr("УДАЛИТЬ")}
                  onClick={() =>
                    void run(async () => {
                      const check = await checkAccountDeletion();
                      if (!check.allowed)
                        throw new Error(
                          check.blockers
                            .map((blocker) => tr(blocker))
                            .join(". "),
                        );
                      await saveProfileSection({
                        data: {
                          action: "ticket",
                          payload: {
                            topic: "deletion",
                            subject: "Запрос на удаление аккаунта",
                            body: "Я подтверждаю запрос на удаление моего аккаунта и данных. Последствия удаления мне понятны.",
                          },
                        },
                      });
                      setDeleting(false);
                      await qc.invalidateQueries({
                        queryKey: ["profile-workspace"],
                      });
                      toast.success(
                        tr("Запрос на удаление отправлен поддержке"),
                      );
                    })
                  }
                >
                  {tr("Отправить запрос на удаление")}
                </Button>
              </>
            )}
          </DialogContent>
        </Dialog>
      </Panel>
    </>
  );
}
function deviceLabel(ua: string | null) {
  if (!ua) return "Устройство не определено";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Macintosh/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Устройство";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Браузер";
  return `${browser} · ${os}`;
}
