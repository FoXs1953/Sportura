import {
  KASPI_LINK_MESSAGE,
  TWO_GIS_MESSAGE,
  parseKaspiLink,
  parseTwoGisLink,
} from "@/lib/kz-validation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Plus,
  UsersRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import {
  CapacityMeter,
  StatusBadge,
} from "@/components/sportura/activity-card";
import { ReceiptLink } from "@/components/sportura/receipt-link";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMe } from "@/lib/me.functions";
import {
  createCompetition,
  createDailyGame,
  getMyActivities,
  setActivityStatus,
  submitCompetitionResults,
} from "@/lib/host.functions";
import {
  listActivityParticipants,
  setPaymentStatus,
} from "@/lib/registrations.functions";
import {
  ACTIVITY_TYPE_LABEL,
  CITIES,
  COMPETITION_DISCLAIMER,
  KASPI_DISCLAIMER,
  PAYMENT_STATUS_LABEL,
  PRIZE_TEMPLATE,
  SKILL_LEVELS,
  SPORTS,
  priceLabel,
  timeLabel,
  type ActivityType,
  type ActivityStatus,
  type PaymentStatus,
} from "@/lib/sportura";

export const Route = createFileRoute("/_authenticated/host")({
  head: () => ({
    meta: [
      { title: "Кабинет организатора — Sportura" },
      {
        name: "description",
        content: "Создание игр и турниров, участники, статусы оплаты.",
      },
      { property: "og:title", content: "Кабинет организатора — Sportura" },
      {
        property: "og:description",
        content: "Управление играми, участниками и оплатой.",
      },
    ],
  }),
  component: HostDashboard,
});

type Tab = "list" | "create-game" | "create-competition";
type HostedActivity = {
  id: string;
  title: string;
  type: ActivityType;
  status: ActivityStatus;
  registered_count: number;
  max_participants: number;
  time_text: string | null;
  date_time: string | null;
  price_text: string | null;
  entry_fee: number | null;
  is_private: boolean;
  invite_code: string | null;
};
type ParticipantRegistration = {
  id: string;
  status: string;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  participant_note: string | null;
  receipt_url: string | null;
  profile: { name: string } | null;
};

function HostDashboard() {
  const queryClient = useQueryClient();
  const {
    data: me,
    isLoading: meLoading,
    isError: meError,
    refetch: refetchMe,
  } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const {
    data: mine,
    isLoading: activitiesLoading,
    isError: activitiesError,
    refetch: refetchActivities,
  } = useQuery({
    queryKey: ["host", "activities"],
    queryFn: () => getMyActivities(),
  });
  const [tab, setTab] = useState<Tab>("list");
  const [listFilter, setListFilter] = useState<"active" | "history">("active");
  const [openParticipants, setOpenParticipants] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isManager = Boolean(
    me?.roles.includes("sports_manager") || me?.roles.includes("admin"),
  );
  const isOrganizer = Boolean(
    me?.roles.includes("tournament_organizer") || me?.roles.includes("admin"),
  );
  const activities = (mine?.activities ?? []) as HostedActivity[];
  const active = activities.filter(
    (a) => a.status !== "cancelled" && a.status !== "completed",
  );
  const history = activities.filter(
    (a) => a.status === "cancelled" || a.status === "completed",
  );
  const shown = listFilter === "active" ? active : history;
  const totalPlayers = active.reduce(
    (sum, a) => sum + (a.registered_count ?? 0),
    0,
  );
  const toReview = Object.values(mine?.stats ?? {}).reduce(
    (sum, item) => sum + item.review,
    0,
  );

  async function changeStatus(
    activityId: string,
    status: ActivityStatus,
    success: string,
  ) {
    setBusyId(activityId);
    try {
      await setActivityStatus({ data: { activityId, status } });
      toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ["host", "activities"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось обновить статус",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (meLoading)
    return (
      <AppShell workspace title="Организатор">
        <div className="workspace-panel h-56 animate-pulse" />
      </AppShell>
    );
  if (meError)
    return (
      <AppShell workspace title="Организатор">
        <div className="workspace-panel workspace-empty" role="alert">
          <h2>Не удалось загрузить профиль</h2>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <Button onClick={() => void refetchMe()}>Повторить</Button>
        </div>
      </AppShell>
    );
  if (me && !isManager && !isOrganizer) {
    return (
      <AppShell
        workspace
        title="Организатор"
        subtitle="Создавайте события и управляйте участниками"
      >
        <div className="workspace-panel workspace-empty">
          <div className="workspace-empty-icon">
            <ClipboardList size={24} />
          </div>
          <h2>Начните проводить игры</h2>
          <p>
            Чтобы создавать игры и турниры, подайте заявку на роль организатора.
            Статус заявки появится в профиле.
          </p>
          <Link to="/profile" className="workspace-primary-link mt-2">
            Перейти в профиль <ArrowRight size={16} />
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      workspace
      title="Организатор"
      subtitle={me?.name ? `Кабинет ${me.name}` : "Игры, участники и оплата"}
    >
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="workspace-stat">
          <strong>{active.length}</strong>
          <span>Активных событий</span>
        </div>
        <div className="workspace-stat">
          <strong>{totalPlayers}</strong>
          <span>Игроков записалось</span>
        </div>
        <div className="workspace-stat">
          <strong className={toReview ? "workspace-count" : ""}>
            {toReview}
          </strong>
          <span>Платежей на проверке</span>
        </div>
        <div className="workspace-stat">
          <strong>{history.length}</strong>
          <span>В истории</span>
        </div>
      </div>

      <div
        className="mb-6 flex flex-wrap gap-2"
        role="group"
        aria-label="Разделы кабинета"
      >
        <button
          type="button"
          aria-pressed={tab === "list"}
          onClick={() => setTab("list")}
          className={
            tab === "list"
              ? "workspace-primary-link"
              : "workspace-panel-raised px-4 py-2.5 text-xs font-bold"
          }
        >
          <ClipboardList size={16} /> Мои события
        </button>
        {isManager && (
          <button
            type="button"
            aria-pressed={tab === "create-game"}
            onClick={() => setTab("create-game")}
            className={
              tab === "create-game"
                ? "workspace-primary-link"
                : "workspace-panel-raised inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold"
            }
          >
            <Plus size={16} /> Новая игра
          </button>
        )}
        {isOrganizer && (
          <button
            type="button"
            aria-pressed={tab === "create-competition"}
            onClick={() => setTab("create-competition")}
            className={
              tab === "create-competition"
                ? "workspace-primary-link"
                : "workspace-panel-raised inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold"
            }
          >
            <Plus size={16} /> Турнир или лига
          </button>
        )}
      </div>

      {tab === "create-game" && (
        <div className="max-w-3xl">
          <div className="mb-4">
            <p className="workspace-overline">Новое событие</p>
            <h2 className="workspace-section-title mt-2">
              Создать игровой слот
            </h2>
            <p className="workspace-muted mt-1 text-xs">
              Черновик сохраняется автоматически.
            </p>
          </div>
          <GameForm onDone={() => setTab("list")} onCreated={setNewCode} />
        </div>
      )}
      {tab === "create-competition" && (
        <div className="max-w-3xl">
          <div className="mb-4">
            <p className="workspace-overline">Новое событие</p>
            <h2 className="workspace-section-title mt-2">
              Создать соревнование
            </h2>
            <p className="workspace-muted mt-1 text-xs">
              Черновик сохраняется автоматически.
            </p>
          </div>
          <CompetitionForm onDone={() => setTab("list")} />
        </div>
      )}

      {tab === "list" && (
        <section aria-label="Мои события">
          {newCode && (
            <div className="workspace-panel mb-5 border-[#ff91644a] bg-[#ff91640d] p-5">
              <p className="workspace-overline">Закрытая игра создана</p>
              <p className="mt-2 text-sm">Код входа для игроков</p>
              <p className="mt-2 font-display text-3xl tracking-widest text-[#ff9164]">
                {newCode}
              </p>
              <p className="workspace-muted mt-2 text-xs">
                Игроки вводят его на главной странице в разделе «Войти по коду».
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(newCode);
                    toast.success("Код скопирован");
                  }}
                >
                  Скопировать
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setNewCode(null)}
                >
                  Закрыть
                </Button>
              </div>
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="workspace-section-title">Мои события</h2>
              <p className="workspace-muted mt-1 text-xs">
                Записи, оплата и результаты
              </p>
            </div>
            <div
              className="workspace-segment"
              role="group"
              aria-label="Статус событий"
            >
              <button
                aria-pressed={listFilter === "active"}
                onClick={() => setListFilter("active")}
              >
                Активные {active.length}
              </button>
              <button
                aria-pressed={listFilter === "history"}
                onClick={() => setListFilter("history")}
              >
                История {history.length}
              </button>
            </div>
          </div>
          {activitiesLoading ? (
            <div
              className="grid gap-4 md:grid-cols-2"
              aria-label="Загружаем события"
            >
              <div className="workspace-panel h-64 animate-pulse" />
              <div className="workspace-panel h-64 animate-pulse" />
            </div>
          ) : activitiesError ? (
            <div className="workspace-panel workspace-empty" role="alert">
              <h2>Не удалось загрузить события</h2>
              <p>Проверьте соединение и повторите попытку.</p>
              <Button onClick={() => void refetchActivities()}>
                Повторить
              </Button>
            </div>
          ) : shown.length === 0 ? (
            <div className="workspace-panel workspace-empty">
              <div className="workspace-empty-icon">
                <CalendarDays size={24} />
              </div>
              <h2>
                {listFilter === "active"
                  ? "Активных событий пока нет"
                  : "История пока пуста"}
              </h2>
              <p>
                {listFilter === "active"
                  ? "Создайте игру или турнир — участники смогут записаться из ленты."
                  : "Завершённые и отменённые события появятся здесь."}
              </p>
              {listFilter === "active" && (isManager || isOrganizer) && (
                <button
                  className="workspace-primary-link mt-2"
                  onClick={() =>
                    setTab(isManager ? "create-game" : "create-competition")
                  }
                >
                  <Plus size={16} /> Создать событие
                </button>
              )}
            </div>
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-2">
              {shown.map((a) => {
                const s = mine?.stats[a.id];
                const busy = busyId === a.id;
                return (
                  <article
                    key={a.id}
                    className="workspace-panel overflow-hidden"
                  >
                    <div className="border-b border-[#30393c] p-5 sm:p-6">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <span className="workspace-tag is-accent">
                          {ACTIVITY_TYPE_LABEL[a.type as "daily_game"]}
                        </span>
                        <StatusBadge status={a.status as ActivityStatus} />
                      </div>
                      <Link
                        to="/activity/$id"
                        params={{ id: a.id }}
                        className="group inline-flex items-start gap-2"
                      >
                        <h3 className="workspace-section-title leading-snug group-hover:text-[#ff9164]">
                          {a.title}
                        </h3>
                        <ArrowRight
                          size={16}
                          className="mt-1 shrink-0 text-[#ff9164]"
                        />
                      </Link>
                      <p className="workspace-muted mt-2 text-xs">
                        {timeLabel(a) || "Время уточняется"}
                      </p>
                      <div className="mt-5">
                        <CapacityMeter
                          registered={a.registered_count}
                          max={a.max_participants}
                        />
                      </div>
                    </div>
                    <div className="space-y-4 p-5 sm:p-6">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="workspace-panel-raised p-2">
                          <Wallet
                            size={15}
                            className="mx-auto mb-1 text-[#91d7b7]"
                          />
                          <strong className="block text-sm">
                            {s?.paid ?? 0}
                          </strong>
                          <span className="workspace-muted text-[10px]">
                            оплачено
                          </span>
                        </div>
                        <div className="workspace-panel-raised p-2">
                          <ClipboardList
                            size={15}
                            className="mx-auto mb-1 text-[#e9c67f]"
                          />
                          <strong className="block text-sm">
                            {s?.review ?? 0}
                          </strong>
                          <span className="workspace-muted text-[10px]">
                            проверить
                          </span>
                        </div>
                        <div className="workspace-panel-raised p-2">
                          <UsersRound
                            size={15}
                            className="mx-auto mb-1 text-[#a3afb3]"
                          />
                          <strong className="block text-sm">
                            {s?.pending ?? 0}
                          </strong>
                          <span className="workspace-muted text-[10px]">
                            ожидают
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold">
                          {priceLabel(a)}
                        </span>
                        {a.is_private && a.invite_code && (
                          <span className="workspace-tag">
                            Код: {a.invite_code}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-expanded={openParticipants === a.id}
                          onClick={() =>
                            setOpenParticipants(
                              openParticipants === a.id ? null : a.id,
                            )
                          }
                        >
                          Участники и оплата
                        </Button>
                        {a.status !== "cancelled" &&
                        a.status !== "completed" ? (
                          <>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={busy}
                                >
                                  Завершить
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-2xl border-[#30393c] bg-[#1b2123] text-[#f5f7f6]">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Завершить событие?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Игра перейдёт в историю. Если нужно, запись
                                    можно открыть снова.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Назад</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      void changeStatus(
                                        a.id,
                                        "completed",
                                        "Событие завершено",
                                      )
                                    }
                                  >
                                    Завершить
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={busy}
                                  className="text-destructive"
                                >
                                  Отменить
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-2xl border-[#30393c] bg-[#1b2123] text-[#f5f7f6]">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Отменить событие?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Участники больше не смогут записаться. Это
                                    затронет всех, кто уже записан.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    Оставить
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      void changeStatus(
                                        a.id,
                                        "cancelled",
                                        "Событие отменено",
                                      )
                                    }
                                  >
                                    Отменить событие
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void changeStatus(
                                a.id,
                                "open",
                                "Запись открыта снова",
                              )
                            }
                          >
                            Открыть снова
                          </Button>
                        )}
                      </div>
                      {openParticipants === a.id && (
                        <Participants
                          activityId={a.id}
                          competition={a.type !== "daily_game"}
                        />
                      )}
                      {a.type !== "daily_game" && (
                        <ResultsForm activityId={a.id} />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}

function Participants({
  activityId,
  competition,
}: {
  activityId: string;
  competition: boolean;
}) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["host", "participants", activityId],
    queryFn: async () =>
      (
        (await listActivityParticipants({
          data: { activityId },
        })) as ParticipantRegistration[]
      ).filter((r) => r.status !== "cancelled" && r.status !== "rejected"),
  });

  async function mark(registrationId: string, status: PaymentStatus) {
    setBusyId(registrationId);
    try {
      await setPaymentStatus({ data: { registrationId, status } });
      toast.success("Статус обновлён");
      await queryClient.invalidateQueries({
        queryKey: ["host", "participants", activityId],
      });
      await queryClient.invalidateQueries({ queryKey: ["host", "activities"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading)
    return (
      <p className="text-xs text-muted-foreground">Загружаем участников…</p>
    );
  if (isError)
    return (
      <div className="workspace-panel-raised p-4 text-xs" role="alert">
        <p>Не удалось загрузить участников.</p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => void refetch()}
        >
          Повторить
        </Button>
      </div>
    );

  return (
    <div className="workspace-panel-raised space-y-3 p-4">
      <p className="text-xs text-muted-foreground">
        {competition ? COMPETITION_DISCLAIMER : KASPI_DISCLAIMER}
      </p>
      {(data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Пока никто не записался.
        </p>
      ) : (
        (data ?? []).map((r) => (
          <div
            key={r.id}
            className="border-t border-[#455054] pt-3 first:border-0 first:pt-0"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  {r.profile?.name ?? "Участник"}
                </p>
                <span
                  className={`workspace-tag mt-1 ${r.payment_status === "paid" ? "is-success" : r.payment_status === "needs_review" ? "is-warning" : r.payment_status === "rejected" ? "is-danger" : ""}`}
                >
                  {PAYMENT_STATUS_LABEL[r.payment_status]}
                </span>
                {r.payment_reference && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Код платежа: {r.payment_reference}
                  </p>
                )}
                {r.participant_note ? (
                  <p className="text-[11px] text-muted-foreground">
                    «{r.participant_note}»
                  </p>
                ) : null}
                {r.receipt_url ? <ReceiptLink path={r.receipt_url} /> : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="press"
                disabled={busyId === r.id || r.payment_status === "paid"}
                onClick={() => void mark(r.id, "paid")}
              >
                Оплачено
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="press"
                disabled={
                  busyId === r.id || r.payment_status === "needs_review"
                }
                onClick={() => void mark(r.id, "needs_review")}
              >
                На проверку
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="press"
                disabled={busyId === r.id || r.payment_status === "rejected"}
                onClick={() => void mark(r.id, "rejected")}
              >
                Отклонить
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ResultsForm({ activityId }: { activityId: string }) {
  const [rows, setRows] = useState([
    { placement: 1, participant_name: "", prize_amount: 0 },
  ]);
  const [open, setOpen] = useState(false);

  return (
    <div className="workspace-panel-raised p-4">
      <button
        type="button"
        className="text-xs font-semibold text-brand"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Скрыть результаты" : "Внести результаты"}
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {rows.map((row, i) => (
            <div key={row.placement} className="flex gap-2">
              <span className="w-6 pt-2 text-sm">{row.placement}.</span>
              <Input
                value={row.participant_name}
                placeholder="Победитель (1 место)"
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, idx) =>
                      idx === i
                        ? { ...r, participant_name: e.target.value }
                        : r,
                    ),
                  )
                }
              />
              <Input
                type="number"
                value={row.prize_amount}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, idx) =>
                      idx === i
                        ? { ...r, prize_amount: Number(e.target.value) }
                        : r,
                    ),
                  )
                }
                className="w-28"
              />
            </div>
          ))}
          <Button
            size="sm"
            className="press"
            onClick={async () => {
              try {
                await submitCompetitionResults({
                  data: {
                    activityId,
                    rows: rows.filter((r) => r.participant_name.trim()),
                  },
                });
                toast.success("Результаты сохранены. Окно споров — 48 часов.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Ошибка");
              }
            }}
          >
            Сохранить результаты
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function useDraft<T extends object>(key: string, initial: T) {
  const [form, setForm] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setForm({ ...initial, ...JSON.parse(raw) });
    } catch {
      // Ignore an invalid or unavailable saved draft.
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (loaded) localStorage.setItem(key, JSON.stringify(form));
  }, [key, form, loaded]);
  const clear = () => {
    localStorage.removeItem(key);
    setForm(initial);
  };
  return [form, setForm, clear] as const;
}

function ChipRow({
  values,
  value,
  onChange,
}: {
  values: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`press rounded-lg px-3 py-2 text-xs font-semibold ${
            value === v
              ? "bg-[#ff9164] text-[#171b1c]"
              : "workspace-panel-raised"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function GameForm({
  onDone,
  onCreated,
}: {
  onDone: () => void;
  onCreated: (code: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm, clearDraft] = useDraft("sportura:draft:game", {
    title: "",
    sport: SPORTS[0] as string,
    city: CITIES[0] as string,
    location_text: "",
    two_gis_url: "",
    time_text: "",
    date_time: "",
    price_text: "Бесплатно",
    entry_fee: "",
    max_participants: "12",
    kaspi_payment_link: "",
    description: "",
    skill_level: SKILL_LEVELS[0] as string,
    recurrence: "",
    cancellation_policy: "",
    is_private: false,
  });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await createDailyGame({
        data: {
          title: form.title,
          sport: form.sport,
          city: form.city,
          location_text: form.location_text,
          two_gis_url: form.two_gis_url || null,
          time_text: form.time_text,
          date_time: form.date_time
            ? new Date(form.date_time).toISOString()
            : null,
          price_text: form.price_text,
          entry_fee: form.entry_fee ? Number(form.entry_fee) : null,
          max_participants: Number(form.max_participants),
          kaspi_payment_link: form.kaspi_payment_link || null,
          description: form.description || null,
          skill_level: form.skill_level,
          recurrence: form.recurrence || null,
          cancellation_policy: form.cancellation_policy || null,
          is_private: form.is_private,
        },
      });
      clearDraft();
      if (created.invite_code) {
        onCreated(created.invite_code);
      }
      toast.success("Игровой слот создан");
      await queryClient.invalidateQueries({ queryKey: ["host", "activities"] });
      await queryClient.invalidateQueries({ queryKey: ["activities", "feed"] });
      onDone();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось создать слот",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="workspace-panel space-y-5 p-5 sm:p-7">
      <div className="space-y-2">
        <Label>Название</Label>
        <Input
          required
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Вечерний футбол 6x6"
        />
      </div>
      <div className="space-y-2">
        <Label>Вид спорта</Label>
        <ChipRow
          values={SPORTS}
          value={form.sport}
          onChange={(v) => set("sport", v)}
        />
      </div>
      <div className="space-y-2">
        <Label>Город</Label>
        <ChipRow
          values={CITIES}
          value={form.city}
          onChange={(v) => set("city", v)}
        />
      </div>
      <div className="space-y-2">
        <Label>Место (текстом)</Label>
        <Input
          required
          value={form.location_text}
          onChange={(e) => set("location_text", e.target.value)}
          placeholder="Спортзал «Алау», ул. Кабанбай батыра 15"
        />
      </div>
      <div className="space-y-2">
        <Label>Ссылка 2GIS</Label>
        <Input
          value={form.two_gis_url}
          onChange={(e) => set("two_gis_url", e.target.value)}
          placeholder="https://2gis.kz/astana/..."
        />
        {form.two_gis_url.trim() && !parseTwoGisLink(form.two_gis_url) ? (
          <p className="text-xs text-destructive">{TWO_GIS_MESSAGE}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>Время (текстом)</Label>
        <Input
          required
          value={form.time_text}
          onChange={(e) => set("time_text", e.target.value)}
          placeholder="Каждый вторник, 20:00–21:30"
        />
      </div>
      <div className="space-y-2">
        <Label>Дата и время (для сортировки)</Label>
        <Input
          type="datetime-local"
          value={form.date_time}
          onChange={(e) => set("date_time", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Цена (текстом)</Label>
        <Input
          required
          value={form.price_text}
          onChange={(e) => set("price_text", e.target.value)}
          placeholder="2000 ₸ с человека"
        />
      </div>
      <div className="space-y-2">
        <Label>Взнос, ₸ (пусто = бесплатно)</Label>
        <Input
          type="number"
          value={form.entry_fee}
          onChange={(e) => set("entry_fee", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Максимум участников</Label>
        <Input
          type="number"
          required
          min={2}
          value={form.max_participants}
          onChange={(e) => set("max_participants", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Личная ссылка Kaspi (для платной игры)</Label>
        <Input
          value={form.kaspi_payment_link}
          onChange={(e) => set("kaspi_payment_link", e.target.value)}
          placeholder="https://pay.kaspi.kz/pay/..."
        />
        {form.kaspi_payment_link.trim() &&
        !parseKaspiLink(form.kaspi_payment_link) ? (
          <p className="text-xs text-destructive">{KASPI_LINK_MESSAGE}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">{KASPI_DISCLAIMER}</p>
      </div>
      <div className="space-y-2">
        <Label>Уровень</Label>
        <ChipRow
          values={SKILL_LEVELS}
          value={form.skill_level}
          onChange={(v) => set("skill_level", v)}
        />
      </div>
      <div className="space-y-2">
        <Label>Регулярность</Label>
        <Input
          value={form.recurrence}
          onChange={(e) => set("recurrence", e.target.value)}
          placeholder="Каждую неделю"
        />
      </div>
      <div className="space-y-2">
        <Label>Условия отмены</Label>
        <Textarea
          value={form.cancellation_policy}
          onChange={(e) => set("cancellation_policy", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Описание</Label>
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_private}
          onChange={(e) => set("is_private", e.target.checked)}
        />
        Приватная игра (только по коду)
      </label>
      <Button type="submit" className="press w-full" disabled={busy}>
        Создать игровой слот
      </Button>
    </form>
  );
}

function CompetitionForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm, clearDraft] = useDraft("sportura:draft:competition", {
    title: "",
    type: "tournament" as "tournament" | "league",
    sport: SPORTS[0] as string,
    city: CITIES[0] as string,
    location_text: "",
    two_gis_url: "",
    time_text: "",
    date_time: "",
    price_text: "",
    entry_fee: "",
    max_participants: "16",
    format: "Групповой этап + плей-офф",
    age_division: "",
    skill_division: "",
    description: "",
    registration_deadline: "",
  });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createCompetition({
        data: {
          title: form.title,
          type: form.type,
          sport: form.sport,
          city: form.city,
          location_text: form.location_text,
          two_gis_url: form.two_gis_url || null,
          time_text: form.time_text,
          date_time: form.date_time
            ? new Date(form.date_time).toISOString()
            : null,
          price_text: form.price_text || "По взносу",
          entry_fee: form.entry_fee ? Number(form.entry_fee) : null,
          max_participants: Number(form.max_participants),
          format: form.format,
          age_division: form.age_division || null,
          skill_division: form.skill_division || null,
          description: form.description || null,
          registration_deadline: form.registration_deadline
            ? new Date(form.registration_deadline).toISOString()
            : null,
          prize_pool: PRIZE_TEMPLATE,
          is_private: false,
        },
      });
      clearDraft();
      toast.success("Соревнование создано");
      await queryClient.invalidateQueries({ queryKey: ["host", "activities"] });
      await queryClient.invalidateQueries({ queryKey: ["activities", "feed"] });
      onDone();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось создать соревнование",
      );
    } finally {
      setBusy(false);
    }
  }

  const feeNum = Number(form.entry_fee || 0);
  const fund = feeNum * Number(form.max_participants || 0) * 0.9;
  return (
    <form onSubmit={submit} className="workspace-panel space-y-5 p-5 sm:p-7">
      <div className="workspace-panel-raised space-y-2 p-4 text-xs">
        <p className="text-sm font-semibold">Как провести турнир — по шагам</p>
        <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>
            Забронируйте площадку на нужные даты и укажите её адрес и ссылку
            2ГИС.
          </li>
          <li>Выберите тип: турнир (1–3 дня) или лига (несколько недель).</li>
          <li>
            Укажите, сколько команд или игроков примете, и взнос с каждого в
            тенге.
          </li>
          <li>Поставьте дедлайн регистрации — минимум за сутки до старта.</li>
          <li>
            Опишите формат и правила: состав команды, длительность матча, что
            делать при ничьей.
          </li>
          <li>
            После финала внесите победителя в «Мои активности» → «Внести
            результаты».
          </li>
          <li>Через 48 часов без споров приз выплачивается победителю.</li>
        </ol>
        <p className="text-muted-foreground">
          Черновик сохраняется автоматически — можно выйти и вернуться.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Название</Label>
        <Input
          required
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Кубок Астаны по мини-футболу"
        />
      </div>
      <div className="space-y-2">
        <Label>Тип</Label>
        <div className="flex gap-2">
          {(["tournament", "league"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={form.type === t}
              onClick={() => set("type", t)}
              className={`press rounded-lg px-3 py-2 text-xs font-semibold ${
                form.type === t
                  ? "bg-[#ff9164] text-[#171b1c]"
                  : "workspace-panel-raised"
              }`}
            >
              {ACTIVITY_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Вид спорта</Label>
        <ChipRow
          values={SPORTS}
          value={form.sport}
          onChange={(v) => set("sport", v)}
        />
      </div>
      <div className="space-y-2">
        <Label>Город</Label>
        <ChipRow
          values={CITIES}
          value={form.city}
          onChange={(v) => set("city", v)}
        />
      </div>
      <div className="space-y-2">
        <Label>Место</Label>
        <Input
          required
          value={form.location_text}
          onChange={(e) => set("location_text", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Ссылка на карту</Label>
        <Input
          value={form.two_gis_url}
          onChange={(e) => set("two_gis_url", e.target.value)}
          placeholder="https://2gis.kz/astana/..."
        />
        {form.two_gis_url.trim() && !parseTwoGisLink(form.two_gis_url) ? (
          <p className="text-xs text-destructive">{TWO_GIS_MESSAGE}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>Сроки (текстом)</Label>
        <Input
          required
          value={form.time_text}
          onChange={(e) => set("time_text", e.target.value)}
          placeholder="12–14 июля, с 10:00"
        />
      </div>
      <div className="space-y-2">
        <Label>Старт</Label>
        <Input
          type="datetime-local"
          value={form.date_time}
          onChange={(e) => set("date_time", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Дедлайн регистрации</Label>
        <Input
          type="datetime-local"
          value={form.registration_deadline}
          onChange={(e) => set("registration_deadline", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Взнос, ₸</Label>
        <Input
          type="number"
          value={form.entry_fee}
          onChange={(e) => set("entry_fee", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Цена (текстом, как увидят игроки)</Label>
        <Input
          value={form.price_text}
          onChange={(e) => set("price_text", e.target.value)}
          placeholder="10 000 ₸ с команды"
        />
        <p className="text-xs text-muted-foreground">
          Призовой фонд при полном составе:{" "}
          {Math.round(fund).toLocaleString("ru-RU")} ₸ — всё победителю.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Команд / участников</Label>
        <Input
          type="number"
          required
          min={2}
          value={form.max_participants}
          onChange={(e) => set("max_participants", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Формат</Label>
        <Input
          value={form.format}
          onChange={(e) => set("format", e.target.value)}
          placeholder="Групповой этап + плей-офф, матчи 2×20 мин"
        />
      </div>
      <div className="space-y-2">
        <Label>Возрастной дивизион</Label>
        <Input
          value={form.age_division}
          onChange={(e) => set("age_division", e.target.value)}
          placeholder="18+"
        />
      </div>
      <div className="space-y-2">
        <Label>Дивизион по уровню</Label>
        <Input
          value={form.skill_division}
          onChange={(e) => set("skill_division", e.target.value)}
          placeholder="Любители"
        />
      </div>
      <div className="space-y-2">
        <Label>Описание</Label>
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Состав команды, форма, судейство, что взять с собой"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Весь призовой фонд (взносы минус 10% комиссии платформы) получает 1
        место. Выплата — после 48-часового окна споров.
      </p>
      <Button type="submit" className="press w-full" disabled={busy}>
        Создать соревнование
      </Button>
    </form>
  );
}
