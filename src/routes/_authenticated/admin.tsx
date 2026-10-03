import { formatDate, useI18n } from "@/lib/i18n";
import { OrganizerTrust } from "@/components/events/host/trust";
import { AnalyticsDashboard } from "@/components/analytics/dashboard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import {
  AuditTab,
  ContentTab,
  SettingsTab,
} from "@/components/sportura/admin-content";
import { ActivityEditor } from "@/components/sportura/admin-activity-edit";
import { moderateActivity, setUserRole } from "@/lib/cms-admin.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getSupportAdmin } from "@/lib/profile.functions";
import { Input } from "@/components/ui/input";
import { SupportAdmin } from "@/components/profile/support";
import { organizerApplicationLabel } from "@/components/profile/shared";
import "@/styles/profile.css";
import { getMe } from "@/lib/me.functions";
import {
  exportAdminCsv,
  getAdminOverview,
  getCommissionReport,
  listActivitiesAdmin,
  listApplicationsAdmin,
  listDisputesAdmin,
  listPaymentAudit,
  listPaymentEvents,
  listUsersAdmin,
  resolveDispute,
  reviewApplication,
  setAccountStatus,
} from "@/lib/admin.functions";
import {
  ACCOUNT_STATUS_LABEL,
  ACTIVITY_TYPE_LABEL,
  ACTIVITY_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  ROLE_LABEL,
  formatKzt,
  type AccountStatus,
  type ActivityStatus,
  type AppRole,
  type PaymentStatus,
} from "@/lib/sportura";
export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Администрирование — Sportura" },
      {
        name: "description",
        content: "Заявки, события, участники и результаты.",
      },
      { property: "og:title", content: "Администрирование — Sportura" },
      {
        property: "og:description",
        content: "Панель администратора Sportura.",
      },
    ],
  }),
  component: Admin,
});
type Tab =
  | "analytics"
  | "overview"
  | "applications"
  | "users"
  | "activities"
  | "payments"
  | "disputes"
  | "logs"
  | "reports"
  | "content"
  | "settings"
  | "audit"
  | "support";
function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function Stat({ label, value }: { label: string; value: string | number }) {
  const { tr } = useI18n();
  return (
    <div className="admin-stat">
      <strong>{tr(value)}</strong>
      <span>{tr(label)}</span>
    </div>
  );
}
function Admin() {
  const { tr, language } = useI18n();
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const isAdmin = Boolean(me?.roles.includes("admin"));
  const isStaff = isAdmin || Boolean(me?.roles.includes("moderator"));
  const [tab, setTab] = useState<Tab>("overview");
  const [notes, setNotes] = useState("");
  const [restrictionNotes, setRestrictionNotes] = useState<
    Record<string, string>
  >({});
  const [restrictionDates, setRestrictionDates] = useState<
    Record<string, string>
  >({});
  const support = useQuery({
    queryKey: ["support-admin"],
    queryFn: () => getSupportAdmin(),
    enabled: isAdmin,
    refetchInterval: 30000,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => getAdminOverview(),
    enabled: isStaff,
  });
  const applications = useQuery({
    queryKey: ["admin", "applications"],
    queryFn: () => listApplicationsAdmin(),
    enabled: isStaff && tab === "applications",
  });
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsersAdmin(),
    enabled: isAdmin && tab === "users",
  });
  const activities = useQuery({
    queryKey: ["admin", "activities"],
    queryFn: () => listActivitiesAdmin(),
    enabled: isStaff && tab === "activities",
  });
  const disputes = useQuery({
    queryKey: ["admin", "disputes"],
    queryFn: () => listDisputesAdmin(),
    enabled: isStaff && tab === "disputes",
  });
  async function exportCsv(
    kind: "users" | "activities" | "registrations" | "payments",
  ) {
    try {
      const result = await exportAdminCsv({ data: { kind, language } });
      downloadCsv(result.filename, result.csv);
      toast.success(tr("Файл выгружен"));
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Не удалось выгрузить файл"),
      );
    }
  }
  if (me && !isStaff) {
    return (
      <AppShell title={tr("Администрирование")}>
        <div className="panel-frost rounded-3xl p-6 text-center text-sm text-muted-foreground">
          {tr("Раздел доступен лидам и администраторам.")}
          <Link to="/" className="mt-3 block text-brand underline">
            {tr("На главную")}
          </Link>
        </div>
      </AppShell>
    );
  }
  async function run(
    action: () => Promise<unknown>,
    success: string,
    keys: string[],
  ) {
    try {
      await action();
      toast.success(tr(success));
      for (const key of keys)
        await queryClient.invalidateQueries({ queryKey: ["admin", key] });
    } catch (err) {
      toast.error(tr(err instanceof Error ? err.message : "Ошибка"));
    }
  }
  const o = overview.data;
  return (
    <AppShell
      title={tr(isAdmin ? "Администрирование" : "Кабинет лида")}
      subtitle={tr("Пользователи, события и управление платформой")}
      layout="admin"
    >
      <div className="admin-page">
        {(o?.applicationsPending ?? 0) > 0 || (o?.disputesOpen ?? 0) > 0 ? (
          <div className="mb-4 space-y-2">
            {(o?.applicationsPending ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setTab("applications")}
                className="press panel-frost flex w-full items-center justify-between rounded-2xl border border-warning/40 p-4 text-left"
              >
                <span className="text-sm font-semibold">
                  {tr("Новые заявки организаторов")}
                </span>
                <span className="rounded-full bg-warning/20 px-2.5 py-1 text-xs font-semibold text-warning">
                  {o?.applicationsPending}
                </span>
              </button>
            ) : null}

            {(o?.disputesOpen ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setTab("disputes")}
                className="press panel-frost flex w-full items-center justify-between rounded-2xl p-4 text-left"
              >
                <span className="text-sm font-semibold">
                  {tr("Открытые споры")}
                </span>
                <span className="rounded-full bg-destructive/20 px-2.5 py-1 text-xs font-semibold text-destructive">
                  {o?.disputesOpen}
                </span>
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className="admin-tabs"
          role="tablist"
          aria-label={tr("Разделы панели администратора")}
        >
          {(
            [
              ["overview", "Обзор", 0],
              ["analytics", "Аналитика", 0],
              ["applications", "Заявки", o?.applicationsPending ?? 0],
              ["users", "Пользователи", 0],
              ["activities", "Активности", 0],
              ["disputes", "Споры", o?.disputesOpen ?? 0],
              ["reports", "Отчёты", 0],
              ["content", "Контент", 0],
              ["settings", "Настройки", 0],
              ["audit", "Действия", 0],
              [
                "support",
                "Поддержка",
                support.data?.filter((t) => t.status !== "resolved").length ??
                  0,
              ],
            ] as [Tab, string, number][]
          )
            .filter(
              ([key]) =>
                isAdmin ||
                !["users", "settings", "audit", "logs", "support"].includes(
                  key,
                ),
            )
            .map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className="press"
              >
                {tr(label)}
                {count > 0 ? (
                  <span className="ml-1.5 rounded-full bg-warning/25 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                    {count}
                  </span>
                ) : null}
              </button>
            ))}
        </div>

        {tab === "analytics" && isStaff && <AnalyticsDashboard />}

        {tab === "overview" ? (
          <div className="admin-stats">
            <Stat label={tr("Пользователей")} value={o?.users.total ?? "—"} />
            <Stat
              label={tr("С ограничениями")}
              value={o?.users.flagged ?? "—"}
            />
            <Stat
              label={tr("Игровых слотов")}
              value={o?.activities.dailyGames ?? "—"}
            />
            <Stat
              label={tr("Соревнований")}
              value={o?.activities.competitions ?? "—"}
            />

            <Stat
              label={tr("Открытых споров")}
              value={o?.disputesOpen ?? "—"}
            />
            <Stat
              label={tr("Заявок в ожидании")}
              value={o?.applicationsPending ?? "—"}
            />
          </div>
        ) : null}

        {tab === "applications" ? (
          <div className="admin-list">
            {(applications.data ?? []).length === 0 ? (
              <p className="admin-empty panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
                {tr("Заявок нет.")}
              </p>
            ) : (
              [...(applications.data ?? [])]
                .sort((x, y) =>
                  x.status === y.status
                    ? 0
                    : x.status === "pending"
                      ? -1
                      : y.status === "pending"
                        ? 1
                        : 0,
                )
                .map((a) => (
                  <div
                    key={a.id}
                    className="panel-frost space-y-2 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {tr(a.profile?.name ?? "Пользователь")} →{tr(" ")}
                        {tr(ROLE_LABEL[a.requested_role as AppRole])}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          a.status === "pending"
                            ? "bg-warning/20 text-warning"
                            : a.status === "approved"
                              ? "bg-brand/20 text-brand"
                              : "bg-destructive/20 text-destructive"
                        }`}
                      >
                        {tr(
                          a.status === "pending"
                            ? "на рассмотрении"
                            : a.status === "approved"
                              ? "одобрена"
                              : "отклонена",
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tr(a.profile?.email ?? "—")} ·{tr(" ")}
                      {tr(a.profile?.phone ?? "телефон не указан")} ·{tr(" ")}
                      {tr(
                        a.profile?.verified ? "подтверждён" : "не подтверждён",
                      )}{" "}
                      ·{tr(" ")}
                      {tr(
                        formatDate(
                          a.created_at,
                          { day: "numeric", month: "long", year: "numeric" },
                          language,
                        ),
                      )}
                    </p>
                    {a.motivation ? (
                      <p className="whitespace-pre-wrap text-xs">
                        «{organizerApplicationLabel(a.motivation, tr)}»
                      </p>
                    ) : null}
                    {a.status !== "pending" && a.admin_notes ? (
                      <p className="text-xs text-muted-foreground">
                        {tr("Комментарий: ")}
                        {tr(a.admin_notes)}
                      </p>
                    ) : null}
                    {a.status === "pending" ? (
                      <>
                        <Textarea
                          placeholder={tr("Комментарий (необязательно)")}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="press"
                            onClick={() =>
                              run(
                                () =>
                                  reviewApplication({
                                    data: {
                                      applicationId: a.id,
                                      approve: true,
                                      notes,
                                    },
                                  }),
                                "Заявка одобрена",
                                ["applications", "overview", "users"],
                              )
                            }
                          >
                            {tr("Одобрить")}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="press"
                            onClick={() =>
                              run(
                                () =>
                                  reviewApplication({
                                    data: {
                                      applicationId: a.id,
                                      approve: false,
                                      notes,
                                    },
                                  }),
                                "Заявка отклонена",
                                ["applications", "overview"],
                              )
                            }
                          >
                            {tr("Отклонить")}
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ))
            )}
          </div>
        ) : null}

        {tab === "users" ? (
          <div className="admin-list">
            {(users.data ?? []).map((u) => (
              <div key={u.id} className="panel-frost space-y-2 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{tr(u.name)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {tr(u.email ?? u.phone ?? "—")} · {tr(u.city)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {tr(
                        (u.roles as AppRole[])
                          .map((r) => tr(ROLE_LABEL[r]))
                          .join(", ") || "Участник",
                      )}
                    </p>
                  </div>
                  <span className="panel-frost-2 rounded-full px-2.5 py-1 text-[11px]">
                    {tr(
                      ACCOUNT_STATUS_LABEL[u.account_status as AccountStatus],
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {tr("Рейтинг ")}
                  {tr(u.rating ?? "—")}
                  {tr(" · пропуски ")}
                  {u.no_show_count}
                  {tr(" · споры")}
                  {tr(" ")}
                  {u.dispute_count}
                  {tr(" · отмены ")}
                  {u.cancellation_count}
                </p>
                {(u.roles as AppRole[]).includes("tournament_organizer") && (
                  <OrganizerTrust id={u.id} admin />
                )}
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "participant",
                      "sports_manager",
                      "tournament_organizer",
                      "moderator",
                      "admin",
                    ] as AppRole[]
                  ).map((r) => {
                    const hasRole = (u.roles as AppRole[]).includes(r);
                    return (
                      <Button
                        key={r}
                        size="sm"
                        variant={hasRole ? "default" : "secondary"}
                        className="press"
                        onClick={() =>
                          run(
                            () =>
                              setUserRole({
                                data: {
                                  userId: u.id,
                                  role: r,
                                  grant: !hasRole,
                                },
                              }),
                            hasRole ? "Роль снята" : "Роль выдана",
                            ["users", "overview", "auditlog"],
                          )
                        }
                      >
                        {tr(hasRole ? "✓ " : "")}
                        {tr(ROLE_LABEL[r])}
                      </Button>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs">
                    {tr("Причина ограничения (видна пользователю)")}
                    <Input
                      value={restrictionNotes[u.id] ?? ""}
                      maxLength={600}
                      onChange={(e) =>
                        setRestrictionNotes((v) => ({
                          ...v,
                          [u.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs">
                    {tr("Срок ограничения (необязательно)")}
                    <Input
                      type="datetime-local"
                      value={restrictionDates[u.id] ?? ""}
                      onChange={(e) =>
                        setRestrictionDates((v) => ({
                          ...v,
                          [u.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "active",
                      "flagged",
                      "suspended",
                      "banned",
                    ] as AccountStatus[]
                  ).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={u.account_status === s ? "default" : "secondary"}
                      className="press"
                      onClick={() =>
                        run(
                          () =>
                            setAccountStatus({
                              data: {
                                userId: u.id,
                                status: s,
                                notes: restrictionNotes[u.id] ?? null,
                                restrictionUntil: restrictionDates[u.id]
                                  ? new Date(
                                      restrictionDates[u.id]!,
                                    ).toISOString()
                                  : null,
                              },
                            }),
                          "Статус обновлён",
                          ["users", "overview"],
                        )
                      }
                    >
                      {tr(ACCOUNT_STATUS_LABEL[s])}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "activities" ? (
          <div className="admin-list">
            {(activities.data ?? []).map((a) => (
              <div key={a.id} className="panel-frost rounded-2xl p-4">
                <Link
                  to="/activity/$id"
                  params={{ id: a.id }}
                  className="text-sm font-semibold"
                >
                  {tr(a.title)}
                </Link>
                <p className="text-[11px] text-muted-foreground">
                  {tr(ACTIVITY_TYPE_LABEL[a.type as "daily_game"])} ·{" "}
                  {tr(a.sport)} ·{tr(" ")}
                  {tr(a.city)} · {tr(a.host_name)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {a.registered_count}/{a.max_participants} ·{tr(" ")}
                  {tr(a.is_free ? "бесплатно" : formatKzt(a.entry_fee))} ·
                  {tr(" ")}
                  {tr(
                    ACTIVITY_STATUS_LABEL[a.status as ActivityStatus] ??
                      a.status,
                  )}{" "}
                  · {tr(a.is_private ? "скрыта" : "в ленте")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="press"
                    onClick={() =>
                      setEditingId(editingId === a.id ? null : a.id)
                    }
                  >
                    {tr(editingId === a.id ? "Закрыть" : "Изменить")}
                  </Button>
                  {(
                    [
                      ["reopen", "Открыть"],
                      ["cancel", "Отменить"],
                      ["complete", "Завершить"],
                      ["hide", "Убрать из ленты"],
                      ["publish", "Вернуть в ленту"],
                    ] as [
                      "reopen" | "cancel" | "complete" | "hide" | "publish",
                      string,
                    ][]
                  ).map(([action, label]) => (
                    <Button
                      key={action}
                      size="sm"
                      variant="secondary"
                      className="press"
                      onClick={() =>
                        run(
                          () =>
                            moderateActivity({
                              data: { activityId: a.id, action },
                            }),
                          "Готово",
                          ["activities", "overview", "auditlog"],
                        )
                      }
                    >
                      {tr(label)}
                    </Button>
                  ))}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="press"
                      onClick={() => {
                        if (
                          !confirm(
                            tr(
                              `Удалить «${a.title}» вместе с записями участников?`,
                            ),
                          )
                        )
                          return;
                        void run(
                          () =>
                            moderateActivity({
                              data: { activityId: a.id, action: "delete" },
                            }),
                          "Активность удалена",
                          ["activities", "overview", "auditlog"],
                        );
                      }}
                    >
                      {tr("Удалить")}
                    </Button>
                  )}
                </div>
                {editingId === a.id ? (
                  <ActivityEditor
                    canEditCommission={isAdmin}
                    activity={a}
                    onClose={() => setEditingId(null)}
                    onSaved={() => {
                      void queryClient.invalidateQueries({
                        queryKey: ["admin", "activities"],
                      });
                      void queryClient.invalidateQueries({
                        queryKey: ["feed"],
                      });
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {tab === "disputes" ? (
          <div className="space-y-3">
            {(disputes.data ?? []).length === 0 ? (
              <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
                {tr("Споров нет.")}
              </p>
            ) : (
              (disputes.data ?? []).map((d) => (
                <div
                  key={d.id}
                  className="panel-frost space-y-2 rounded-2xl p-4"
                >
                  <p className="text-sm font-semibold">
                    {tr(d.activity?.title ?? "Активность")}
                  </p>
                  <p className="text-xs">{tr(d.reason)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {tr("Статус: ")}
                    {tr(
                      (
                        {
                          open: "Открыт",
                          resolved: "Решено",
                          rejected: "Отклонено",
                        } as Record<string, string>
                      )[d.status] ?? d.status,
                    )}
                  </p>
                  <Textarea
                    placeholder={tr("Решение администратора")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="press"
                      onClick={() =>
                        run(
                          () =>
                            resolveDispute({
                              data: {
                                disputeId: d.id,
                                status: "approved",
                                notes,
                              },
                            }),
                          "Спор удовлетворён",
                          ["disputes", "overview"],
                        )
                      }
                    >
                      {tr("Удовлетворить")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="press"
                      onClick={() =>
                        run(
                          () =>
                            resolveDispute({
                              data: {
                                disputeId: d.id,
                                status: "rejected",
                                notes,
                              },
                            }),
                          "Спор отклонён",
                          ["disputes", "overview"],
                        )
                      }
                    >
                      {tr("Отклонить")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "reports" ? (
          <div className="space-y-4">
            <div className="panel-frost space-y-3 rounded-2xl p-5">
              <p className="text-sm font-semibold">{tr("Выгрузка таблиц")}</p>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "Файлы в формате CSV — открываются в Excel и Google Таблицах.",
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="press"
                  onClick={() => void exportCsv("users")}
                >
                  {tr("Пользователи")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="press"
                  onClick={() => void exportCsv("activities")}
                >
                  {tr("Активности")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="press"
                  onClick={() => void exportCsv("registrations")}
                >
                  {tr("Записи")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "content" ? <ContentTab /> : null}
        {tab === "settings" ? <SettingsTab /> : null}
        {tab === "support" && (
          <div className="profile-main">
            <SupportAdmin />
          </div>
        )}
        {tab === "audit" ? <AuditTab /> : null}
      </div>
    </AppShell>
  );
}
