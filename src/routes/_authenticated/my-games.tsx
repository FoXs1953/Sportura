import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getMyRegistrations } from "@/lib/me.functions";
import { cancelMyRegistration, leaveReview, openDispute } from "@/lib/registrations.functions";
import { PAYMENT_STATUS_LABEL, REGISTRATION_STATUS_LABEL, priceLabel, timeLabel } from "@/lib/sportura";
import type { PaymentStatus, RegistrationStatus } from "@/lib/sportura";

export const Route = createFileRoute("/_authenticated/my-games")({
  head: () => ({
    meta: [
      { title: "Мои игры — Sportura" },
      { name: "description", content: "Ваши записи, статусы оплаты, отзывы и споры." },
      { property: "og:title", content: "Мои игры — Sportura" },
      { property: "og:description", content: "Список ваших записей на игры и соревнования." },
    ],
  }),
  component: MyGames,
});

type Reg = Awaited<ReturnType<typeof getMyRegistrations>>[number];

function MyGames() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-registrations"],
    queryFn: () => getMyRegistrations(),
  });
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [disputeText, setDisputeText] = useState("");

  const regs = ((data ?? []) as Reg[]).filter(
    (r) => r.status !== "cancelled" && (r.activity as { status?: string } | null)?.status !== "cancelled",
  );

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ["my-registrations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <AppShell title="Мои игры" subtitle="Записи, оплата и отзывы">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загружаем…</p>
      ) : regs.length === 0 ? (
        <div className="panel-frost rounded-3xl p-6 text-center">
          <p className="text-sm text-muted-foreground">Вы ещё никуда не записались.</p>
          <Link to="/" className="press mt-4 inline-block rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            Найти игру
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {regs.map((r) => {
            const a = r.activity as unknown as {
              id: string;
              title: string;
              location_text: string;
              time_text: string | null;
              date_time: string | null;
              price_text: string | null;
              entry_fee: number | null;
              manager_id: string | null;
              organizer_id: string | null;
              dispute_window_ends_at: string | null;
            } | null;
            if (!a) return null;
            const hostId = a.manager_id ?? a.organizer_id;
            return (
              <div key={r.id} className="panel-frost space-y-3 rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link to="/activity/$id" params={{ id: a.id }} className="font-semibold">
                      {a.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">{timeLabel(a)}</p>
                    <p className="text-xs text-muted-foreground">{a.location_text}</p>
                  </div>
                  <span className="text-sm font-semibold text-accent">{priceLabel(a)}</span>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="panel-frost-2 rounded-full px-2.5 py-1">
                    {REGISTRATION_STATUS_LABEL[r.status as RegistrationStatus]}
                  </span>
                  <span className="panel-frost-2 rounded-full px-2.5 py-1">
                    {PAYMENT_STATUS_LABEL[r.payment_status as PaymentStatus]}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {r.status === "registered" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="press"
                      onClick={() =>
                        run(
                          () => cancelMyRegistration({ data: { registrationId: r.id } }),
                          "Запись отменена",
                        )
                      }
                    >
                      Отменить запись
                    </Button>
                  ) : null}
                  {hostId ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="press"
                      onClick={() => setOpenPanel(openPanel === `review-${r.id}` ? null : `review-${r.id}`)}
                    >
                      Оставить отзыв
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="press"
                    onClick={() => setOpenPanel(openPanel === `dispute-${r.id}` ? null : `dispute-${r.id}`)}
                  >
                    Открыть спор
                  </Button>
                </div>

                {openPanel === `review-${r.id}` && hostId ? (
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          className={`press size-9 rounded-xl text-sm font-semibold ${
                            n <= rating ? "bg-accent text-accent-foreground" : "panel-frost-2"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Как прошла игра?"
                    />
                    <Button
                      size="sm"
                      className="press"
                      onClick={() =>
                        run(async () => {
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
                        }, "Спасибо за отзыв!")
                      }
                    >
                      Отправить отзыв
                    </Button>
                  </div>
                ) : null}

                {openPanel === `dispute-${r.id}` ? (
                  <div className="space-y-2">
                    <Textarea
                      value={disputeText}
                      onChange={(e) => setDisputeText(e.target.value)}
                      placeholder="Опишите проблему подробно (минимум 10 символов)"
                    />
                    <Button
                      size="sm"
                      className="press"
                      onClick={() =>
                        run(async () => {
                          await openDispute({ data: { activityId: a.id, reason: disputeText } });
                          setOpenPanel(null);
                          setDisputeText("");
                        }, "Спор отправлен администратору")
                      }
                    >
                      Отправить спор
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
