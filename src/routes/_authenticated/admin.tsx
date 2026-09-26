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
  PAYMENT_STATUS_LABEL,
  ROLE_LABEL,
  formatKzt,
  type AccountStatus,
  type AppRole,
  type PaymentStatus,
} from "@/lib/sportura";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Администрирование — Sportura" },
      {
        name: "description",
        content: "Заявки, платежи, споры, комиссии и журналы.",
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
  | "audit";

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
  return (
    <div className="admin-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Admin() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const isAdmin = Boolean(me?.roles.includes("admin"));
  const [tab, setTab] = useState<Tab>("overview");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => getAdminOverview(),
    enabled: isAdmin,
  });
  const applications = useQuery({
    queryKey: ["admin", "applications"],
    queryFn: () => listApplicationsAdmin(),
    enabled: isAdmin && tab === "applications",
  });
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsersAdmin(),
    enabled: isAdmin && tab === "users",
  });
  const activities = useQuery({
    queryKey: ["admin", "activities"],
    queryFn: () => listActivitiesAdmin(),
    enabled: isAdmin && tab === "activities",
  });
  const audit = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => listPaymentAudit(),
    enabled: isAdmin && tab === "payments",
  });
  const disputes = useQuery({
    queryKey: ["admin", "disputes"],
    queryFn: () => listDisputesAdmin(),
    enabled: isAdmin && tab === "disputes",
  });
  const events = useQuery({
    queryKey: ["admin", "events"],
    queryFn: () => listPaymentEvents(),
    enabled: isAdmin && tab === "logs",
  });
  const commission = useQuery({
    queryKey: ["admin", "commission"],
    queryFn: () => getCommissionReport(),
    enabled: isAdmin && tab === "reports",
  });

  async function exportCsv(
    kind: "users" | "activities" | "registrations" | "payments",
  ) {
    try {
      const result = await exportAdminCsv({ data: { kind } });
      downloadCsv(result.filename, result.csv);
      toast.success("Файл выгружен");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось выгрузить файл",
      );
    }
  }

  if (me && !isAdmin) {
    return (
      <AppShell title="Администрирование">
        <div className="panel-frost rounded-3xl p-6 text-center text-sm text-muted-foreground">
          Раздел доступен только администраторам.
          <Link to="/" className="mt-3 block text-brand underline">
            На главную
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
      toast.success(success);
      for (const key of keys)
        await queryClient.invalidateQueries({ queryKey: ["admin", key] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    }
  }

  const o = overview.data;

  return (
    <AppShell
      title="Администрирование"
      subtitle="Пользователи, события, платежи и управление платформой"
      layout="admin"
    >
      <div className="admin-page">
        {(o?.applicationsPending ?? 0) > 0 ||
        (o?.payments.needsReview ?? 0) > 0 ||
        (o?.disputesOpen ?? 0) > 0 ? (
          <div className="mb-4 space-y-2">
            {(o?.applicationsPending ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setTab("applications")}
                className="press panel-frost flex w-full items-center justify-between rounded-2xl border border-warning/40 p-4 text-left"
              >
                <span className="text-sm font-semibold">
                  Новые заявки организаторов
                </span>
                <span className="rounded-full bg-warning/20 px-2.5 py-1 text-xs font-semibold text-warning">
                  {o?.applicationsPending}
                </span>
              </button>
            ) : null}
            {(o?.payments.needsReview ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setTab("payments")}
                className="press panel-frost flex w-full items-center justify-between rounded-2xl p-4 text-left"
              >
                <span className="text-sm font-semibold">
                  Платежи на проверке
                </span>
                <span className="rounded-full bg-brand/20 px-2.5 py-1 text-xs font-semibold text-brand">
                  {o?.payments.needsReview}
                </span>
              </button>
            ) : null}
            {(o?.disputesOpen ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => setTab("disputes")}
                className="press panel-frost flex w-full items-center justify-between rounded-2xl p-4 text-left"
              >
                <span className="text-sm font-semibold">Открытые споры</span>
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
          aria-label="Разделы панели администратора"
        >
          {(
            [
              ["overview", "Обзор", 0],
              ["applications", "Заявки", o?.applicationsPending ?? 0],
              ["users", "Пользователи", 0],
              ["activities", "Активности", 0],
              ["payments", "Платежи", o?.payments.needsReview ?? 0],
              ["disputes", "Споры", o?.disputesOpen ?? 0],
              ["logs", "Журналы", 0],
              ["reports", "Отчёты", 0],
              ["content", "Контент", 0],
              ["settings", "Настройки", 0],
              ["audit", "Действия", 0],
            ] as [Tab, string, number][]
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className="press"
            >
              {label}
              {count > 0 ? (
                <span className="ml-1.5 rounded-full bg-warning/25 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <div className="admin-stats">
            <Stat label="Пользователей" value={o?.users.total ?? "—"} />
            <Stat label="С ограничениями" value={o?.users.flagged ?? "—"} />
            <Stat
              label="Игровых слотов"
              value={o?.activities.dailyGames ?? "—"}
            />
            <Stat
              label="Соревнований"
              value={o?.activities.competitions ?? "—"}
            />
            <Stat label="Оплат подтверждено" value={o?.payments.paid ?? "—"} />
            <Stat label="На проверке" value={o?.payments.needsReview ?? "—"} />
            <Stat label="Открытых споров" value={o?.disputesOpen ?? "—"} />
            <Stat
              label="Заявок в ожидании"
              value={o?.applicationsPending ?? "—"}
            />
            <Stat label="Эскроу" value={formatKzt(o?.escrowBalance ?? 0)} />
            <Stat
              label="Комиссия"
              value={formatKzt(o?.commissionRevenue ?? 0)}
            />
          </div>
        ) : null}

        {tab === "applications" ? (
          <div className="admin-list">
            {(applications.data ?? []).length === 0 ? (
              <p className="admin-empty panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
                Заявок нет.
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
                        {a.profile?.name ?? "Пользователь"} →{" "}
                        {ROLE_LABEL[a.requested_role as AppRole]}
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
                        {a.status === "pending"
                          ? "на рассмотрении"
                          : a.status === "approved"
                            ? "одобрена"
                            : "отклонена"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {a.profile?.email ?? "—"} ·{" "}
                      {a.profile?.phone ?? "телефон не указан"} ·{" "}
                      {a.profile?.verified ? "подтверждён" : "не подтверждён"} ·{" "}
                      {new Date(a.created_at).toLocaleDateString("ru-RU")}
                    </p>
                    {a.motivation ? (
                      <p className="text-xs">«{a.motivation}»</p>
                    ) : null}
                    {a.status !== "pending" && a.admin_notes ? (
                      <p className="text-xs text-muted-foreground">
                        Комментарий: {a.admin_notes}
                      </p>
                    ) : null}
                    {a.status === "pending" ? (
                      <>
                        <Textarea
                          placeholder="Комментарий (необязательно)"
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
                            Одобрить
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
                            Отклонить
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
                    <p className="text-sm font-semibold">{u.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {u.email ?? u.phone ?? "—"} · {u.city}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {(u.roles as AppRole[])
                        .map((r) => ROLE_LABEL[r])
                        .join(", ") || "Участник"}
                    </p>
                  </div>
                  <span className="panel-frost-2 rounded-full px-2.5 py-1 text-[11px]">
                    {ACCOUNT_STATUS_LABEL[u.account_status as AccountStatus]}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Рейтинг {u.rating ?? "—"} · пропуски {u.no_show_count} · споры{" "}
                  {u.dispute_count} · отмены {u.cancellation_count}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "participant",
                      "sports_manager",
                      "tournament_organizer",
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
                        {hasRole ? "✓ " : ""}
                        {ROLE_LABEL[r]}
                      </Button>
                    );
                  })}
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
                              data: { userId: u.id, status: s },
                            }),
                          "Статус обновлён",
                          ["users", "overview"],
                        )
                      }
                    >
                      {ACCOUNT_STATUS_LABEL[s]}
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
                  {a.title}
                </Link>
                <p className="text-[11px] text-muted-foreground">
                  {ACTIVITY_TYPE_LABEL[a.type as "daily_game"]} · {a.sport} ·{" "}
                  {a.city} · {a.host_name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {a.registered_count}/{a.max_participants} ·{" "}
                  {a.is_free ? "бесплатно" : formatKzt(a.entry_fee)} ·{" "}
                  {a.status} · {a.is_private ? "скрыта" : "в ленте"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="press"
                    onClick={() =>
                      setEditingId(editingId === a.id ? null : a.id)
                    }
                  >
                    {editingId === a.id ? "Закрыть" : "Изменить"}
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
                      {label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="press"
                    onClick={() => {
                      if (
                        !confirm(
                          `Удалить «${a.title}» вместе с записями участников?`,
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
                    Удалить
                  </Button>
                </div>
                {editingId === a.id ? (
                  <ActivityEditor
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

        {tab === "payments" ? (
          <div className="space-y-3">
            {(audit.data ?? []).length === 0 ? (
              <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
                Изменений нет.
              </p>
            ) : (
              (audit.data ?? []).map((h) => (
                <div key={h.id} className="panel-frost rounded-2xl p-4 text-xs">
                  <p className="font-semibold">
                    {h.activity?.title ?? "Активность"}
                  </p>
                  <p className="text-muted-foreground">
                    {h.previous_status
                      ? PAYMENT_STATUS_LABEL[h.previous_status as PaymentStatus]
                      : "—"}{" "}
                    → {PAYMENT_STATUS_LABEL[h.new_status as PaymentStatus]}
                  </p>
                  <p className="text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("ru-RU")}
                    {h.payment_reference ? ` · ${h.payment_reference}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "disputes" ? (
          <div className="space-y-3">
            {(disputes.data ?? []).length === 0 ? (
              <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
                Споров нет.
              </p>
            ) : (
              (disputes.data ?? []).map((d) => (
                <div
                  key={d.id}
                  className="panel-frost space-y-2 rounded-2xl p-4"
                >
                  <p className="text-sm font-semibold">
                    {d.activity?.title ?? "Активность"}
                  </p>
                  <p className="text-xs">{d.reason}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Статус: {d.status}
                  </p>
                  <Textarea
                    placeholder="Решение администратора"
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
                      Удовлетворить
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
                      Отклонить
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "logs" ? (
          <div className="space-y-3">
            {(events.data ?? []).length === 0 ? (
              <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
                Событий платёжных провайдеров пока нет. Здесь появятся вебхуки
                Kaspi Pay Business, CloudPayments или Paybox после подключения.
              </p>
            ) : (
              (events.data ?? []).map((e) => (
                <div key={e.id} className="panel-frost rounded-2xl p-4 text-xs">
                  <p className="font-semibold">
                    {e.provider} · {e.event_type}
                  </p>
                  <p className="text-muted-foreground">
                    {e.external_payment_id ?? e.external_event_id ?? "—"} ·{" "}
                    {e.signature_valid
                      ? "подпись верна"
                      : "подпись не проверена"}{" "}
                    · {e.processed ? "обработано" : "в очереди"}
                  </p>
                  {e.processing_error ? (
                    <p className="text-destructive">{e.processing_error}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "reports" ? (
          <div className="space-y-4">
            <div className="panel-frost space-y-3 rounded-2xl p-5">
              <p className="text-sm font-semibold">Выгрузка таблиц</p>
              <p className="text-xs text-muted-foreground">
                Файлы в формате CSV — открываются в Excel и Google Таблицах.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="press"
                  onClick={() => void exportCsv("users")}
                >
                  Пользователи
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="press"
                  onClick={() => void exportCsv("activities")}
                >
                  Активности
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="press"
                  onClick={() => void exportCsv("registrations")}
                >
                  Записи
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="press"
                  onClick={() => void exportCsv("payments")}
                >
                  Журнал оплат
                </Button>
              </div>
            </div>

            <div className="panel-frost space-y-3 rounded-2xl p-5">
              <p className="text-sm font-semibold">Комиссия платформы</p>
              <p className="text-xs text-muted-foreground">
                Первые 10 платных соревнований — без комиссии. Осталось
                бесплатных: {commission.data?.freeRemaining ?? "—"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Сборы всего"
                  value={formatKzt(commission.data?.grossTotal ?? 0)}
                />
                <Stat
                  label="Комиссия"
                  value={formatKzt(commission.data?.commissionTotal ?? 0)}
                />
              </div>
              <div className="space-y-2">
                {(commission.data?.items ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Платных соревнований пока нет.
                  </p>
                ) : (
                  (commission.data?.items ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="panel-frost-2 rounded-2xl p-3 text-xs"
                    >
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-muted-foreground">
                        Сборы {formatKzt(item.gross)} · комиссия{" "}
                        {item.commission_free
                          ? "0 (без комиссии)"
                          : formatKzt(item.commission)}{" "}
                        · призовой фонд {formatKzt(item.prize_pool)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "content" ? <ContentTab /> : null}
        {tab === "settings" ? <SettingsTab /> : null}
        {tab === "audit" ? <AuditTab /> : null}
      </div>
    </AppShell>
  );
}
