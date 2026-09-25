import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  MessageSquareText,
  Star,
  TicketCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { getMyRegistrations } from "@/lib/me.functions";
import {
  cancelMyRegistration,
  leaveReview,
  openDispute,
} from "@/lib/registrations.functions";
import {
  PAYMENT_STATUS_LABEL,
  REGISTRATION_STATUS_LABEL,
  priceLabel,
  timeLabel,
} from "@/lib/sportura";
import type { PaymentStatus, RegistrationStatus } from "@/lib/sportura";

export const Route = createFileRoute("/_authenticated/my-games")({
  head: () => ({
    meta: [
      { title: "Мои игры — Sportura" },
      {
        name: "description",
        content: "Ваши записи, статусы оплаты, отзывы и споры.",
      },
      { property: "og:title", content: "Мои игры — Sportura" },
      {
        property: "og:description",
        content: "Список ваших записей на игры и соревнования.",
      },
    ],
  }),
  component: MyGames,
});

type Reg = Awaited<ReturnType<typeof getMyRegistrations>>[number];
type Activity = {
  id: string;
  title: string;
  sport: string;
  status: string;
  location_text: string;
  time_text: string | null;
  date_time: string | null;
  price_text: string | null;
  entry_fee: number | null;
  manager_id: string | null;
  organizer_id: string | null;
  dispute_window_ends_at: string | null;
};
type Filter = "upcoming" | "past";

function activityOf(reg: Reg): Activity | null {
  return reg.activity as Activity | null;
}
function isPast(reg: Reg) {
  const activity = activityOf(reg);
  return (
    reg.status === "attended" ||
    reg.status === "no_show" ||
    activity?.status === "completed" ||
    Boolean(
      activity?.date_time &&
      new Date(activity.date_time).getTime() < Date.now(),
    )
  );
}
function paymentTone(status: string) {
  if (status === "paid") return "is-success";
  if (status === "needs_review" || status === "pending") return "is-warning";
  if (status === "rejected") return "is-danger";
  return "";
}

function MyGames() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-registrations"],
    queryFn: () => getMyRegistrations(),
  });
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [disputeText, setDisputeText] = useState("");

  const regs = ((data ?? []) as Reg[]).filter(
    (r) => r.status !== "cancelled" && activityOf(r)?.status !== "cancelled",
  );
  const upcoming = regs.filter((r) => !isPast(r));
  const past = regs.filter(isPast);
  const shown = filter === "upcoming" ? upcoming : past;
  const pendingPayments = regs.filter(
    (r) =>
      r.payment_status === "needs_review" || r.payment_status === "pending",
  ).length;

  async function run(
    id: string,
    action: () => Promise<unknown>,
    success: string,
  ) {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ["my-registrations"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      workspace
      title="Мои игры"
      subtitle="Все ваши записи, оплата и итоги в одном месте"
    >
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="workspace-stat">
          <strong>{upcoming.length}</strong>
          <span>Впереди</span>
        </div>
        <div className="workspace-stat">
          <strong>{past.length}</strong>
          <span>Прошли</span>
        </div>
        <div className="workspace-stat col-span-2 sm:col-span-1">
          <strong className={pendingPayments ? "workspace-count" : ""}>
            {pendingPayments}
          </strong>
          <span>Ожидают оплаты или проверки</span>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="workspace-segment" role="group" aria-label="Период игр">
          <button
            aria-pressed={filter === "upcoming"}
            onClick={() => setFilter("upcoming")}
          >
            Предстоящие{" "}
            <span className="ml-1 opacity-60">{upcoming.length}</span>
          </button>
          <button
            aria-pressed={filter === "past"}
            onClick={() => setFilter("past")}
          >
            История <span className="ml-1 opacity-60">{past.length}</span>
          </button>
        </div>
        <Link
          to="/"
          className="workspace-text-link inline-flex items-center gap-1"
        >
          Найти игру <ArrowRight size={15} />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2" aria-label="Загружаем игры">
          {[1, 2].map((n) => (
            <div key={n} className="workspace-panel h-52 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="workspace-panel workspace-empty" role="alert">
          <div className="workspace-empty-icon">
            <CalendarDays size={24} />
          </div>
          <h2>Не удалось загрузить игры</h2>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <Button onClick={() => void refetch()}>Повторить</Button>
        </div>
      ) : shown.length === 0 ? (
        <div className="workspace-panel workspace-empty">
          <div className="workspace-empty-icon">
            {filter === "upcoming" ? (
              <CalendarDays size={24} />
            ) : (
              <TicketCheck size={24} />
            )}
          </div>
          <h2>
            {filter === "upcoming"
              ? "Впереди пока нет игр"
              : "История пока пуста"}
          </h2>
          <p>
            {filter === "upcoming"
              ? "Найдите ближайшую игру и запишитесь — она появится здесь."
              : "После первых игр здесь появятся ваши записи и отзывы."}
          </p>
          {filter === "upcoming" && (
            <Link to="/" className="workspace-primary-link mt-2">
              Смотреть ленту <ArrowRight size={16} />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {shown.map((r) => {
            const a = activityOf(r);
            if (!a) return null;
            const hostId = a.manager_id ?? a.organizer_id;
            const canDispute = Boolean(
              a.dispute_window_ends_at &&
              new Date(a.dispute_window_ends_at).getTime() > Date.now(),
            );
            const panel =
              openPanel === `review-${r.id}`
                ? "review"
                : openPanel === `dispute-${r.id}`
                  ? "dispute"
                  : null;
            const busy = busyId === r.id;
            return (
              <article key={r.id} className="workspace-panel overflow-hidden">
                <div className="border-b border-[#30393c] p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap gap-2">
                    <span className="workspace-tag is-accent">
                      {
                        REGISTRATION_STATUS_LABEL[
                          r.status as RegistrationStatus
                        ]
                      }
                    </span>
                    <span
                      className={`workspace-tag ${paymentTone(r.payment_status)}`}
                    >
                      {PAYMENT_STATUS_LABEL[r.payment_status as PaymentStatus]}
                    </span>
                  </div>
                  <Link
                    to="/activity/$id"
                    params={{ id: a.id }}
                    className="group inline-flex items-start gap-2 text-left"
                  >
                    <h2 className="workspace-section-title leading-snug group-hover:text-[#ff9164]">
                      {a.title}
                    </h2>
                    <ArrowRight
                      className="mt-1 size-4 shrink-0 text-[#ff9164] transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                  <div className="mt-4 grid gap-2 text-xs text-[#a3afb3]">
                    <p className="flex items-center gap-2">
                      <Clock3
                        size={15}
                        className="shrink-0 text-[#ff9164]"
                        aria-hidden="true"
                      />
                      {timeLabel(a) || "Время уточняется"}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin
                        size={15}
                        className="shrink-0 text-[#ff9164]"
                        aria-hidden="true"
                      />
                      {a.location_text || "Площадка уточняется"}
                    </p>
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <span className="workspace-overline">
                      Стоимость участия
                    </span>
                    <strong className="text-sm">{priceLabel(a)}</strong>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.payment_status === "pending" && !isPast(r) && (
                      <Link
                        to="/activity/$id"
                        params={{ id: a.id }}
                        className="workspace-primary-link py-2 text-xs"
                      >
                        Оплата и чек <ArrowRight size={14} />
                      </Link>
                    )}
                    {r.status === "registered" && !isPast(r) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="secondary" size="sm" disabled={busy}>
                            Отменить запись
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl border-[#30393c] bg-[#1b2123] text-[#f5f7f6]">
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Отменить запись?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Вы больше не будете в списке участников «{a.title}
                              ». Условия возврата зависят от правил события.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Остаться</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                void run(
                                  r.id,
                                  () =>
                                    cancelMyRegistration({
                                      data: { registrationId: r.id },
                                    }),
                                  "Запись отменена",
                                )
                              }
                            >
                              Отменить запись
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {hostId && isPast(r) && (
                      <Button
                        variant={panel === "review" ? "default" : "secondary"}
                        size="sm"
                        disabled={busy}
                        aria-expanded={panel === "review"}
                        onClick={() => {
                          setOpenPanel(
                            panel === "review" ? null : `review-${r.id}`,
                          );
                          setRating(5);
                          setComment("");
                        }}
                      >
                        <Star size={14} /> Отзыв
                      </Button>
                    )}
                    {canDispute && (
                      <Button
                        variant={panel === "dispute" ? "default" : "secondary"}
                        size="sm"
                        disabled={busy}
                        aria-expanded={panel === "dispute"}
                        onClick={() => {
                          setOpenPanel(
                            panel === "dispute" ? null : `dispute-${r.id}`,
                          );
                          setDisputeText("");
                        }}
                      >
                        <MessageSquareText size={14} /> Открыть спор
                      </Button>
                    )}
                  </div>
                  {panel === "review" && hostId && (
                    <div className="workspace-panel-raised mt-4 space-y-3 p-4">
                      <p className="text-xs font-bold">Как прошла игра?</p>
                      <div
                        className="flex gap-1"
                        role="group"
                        aria-label="Оценка организатору"
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-label={`${n} из 5`}
                            aria-pressed={rating === n}
                            onClick={() => setRating(n)}
                            className={`grid size-9 place-items-center rounded-lg ${n <= rating ? "bg-[#ff916425] text-[#ffb38f]" : "bg-[#30393c] text-[#a3afb3]"}`}
                          >
                            <Star
                              size={18}
                              fill={n <= rating ? "currentColor" : "none"}
                            />
                          </button>
                        ))}
                      </div>
                      <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Что понравилось?"
                        aria-label="Текст отзыва"
                        className="min-h-24 border-[#455054] bg-[#1b2123]"
                      />
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            r.id,
                            async () => {
                              await leaveReview({
                                data: {
                                  activityId: a.id,
                                  reviewedUserId: hostId,
                                  rating,
                                  comment,
                                },
                              });
                              setOpenPanel(null);
                              setComment("");
                            },
                            "Спасибо за отзыв",
                          )
                        }
                      >
                        Отправить отзыв
                      </Button>
                    </div>
                  )}
                  {panel === "dispute" && (
                    <div className="workspace-panel-raised mt-4 space-y-3 p-4">
                      <p className="text-xs font-bold">Опишите проблему</p>
                      <Textarea
                        value={disputeText}
                        onChange={(e) => setDisputeText(e.target.value)}
                        placeholder="Не менее 10 символов"
                        aria-label="Описание проблемы"
                        className="min-h-24 border-[#455054] bg-[#1b2123]"
                      />
                      <Button
                        size="sm"
                        disabled={busy || disputeText.trim().length < 10}
                        onClick={() =>
                          void run(
                            r.id,
                            async () => {
                              await openDispute({
                                data: {
                                  activityId: a.id,
                                  reason: disputeText.trim(),
                                },
                              });
                              setOpenPanel(null);
                              setDisputeText("");
                            },
                            "Сообщение отправлено администратору",
                          )
                        }
                      >
                        Отправить
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
