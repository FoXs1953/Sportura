import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin, Clock, Star, ExternalLink, Trophy } from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import {
  CapacityMeter,
  StatusBadge,
} from "@/components/sportura/activity-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getActivity, getActivityResults } from "@/lib/activities.functions";
import {
  registerForActivity,
  submitPaymentProof,
} from "@/lib/registrations.functions";
import { FileUploadButton } from "@/components/sportura/file-upload";
import { uploadReceipt } from "@/lib/storage";
import {
  ACTIVITY_TYPE_LABEL,
  COMPETITION_DISCLAIMER,
  KASPI_DISCLAIMER,
  formatKzt,
  priceLabel,
  sportImage,
  timeLabel,
} from "@/lib/sportura";

const activityQuery = (id: string) =>
  queryOptions({
    queryKey: ["activity", id],
    queryFn: () => getActivity({ data: { id } }),
  });

const resultsQuery = (id: string) =>
  queryOptions({
    queryKey: ["activity", id, "results"],
    queryFn: () => getActivityResults({ data: { id } }),
  });

export const Route = createFileRoute("/activity/$id")({
  loader: async ({ context, params }) => {
    const activity = await context.queryClient.ensureQueryData(
      activityQuery(params.id),
    );
    return { activity };
  },
  head: ({ loaderData }) => {
    const a = loaderData?.activity;
    if (!a) {
      return {
        meta: [
          { title: "Активность не найдена — Sportura" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const description = `${a.sport} · ${a.location_text} · ${timeLabel(a)} · ${a.registered_count} из ${a.max_participants} мест`;
    return {
      meta: [
        { title: `${a.title} — Sportura` },
        { name: "description", content: description },
        { property: "og:title", content: `${a.title} — Sportura` },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: ({ error }) => (
    <AppShell title="Ошибка">
      <p className="panel-frost rounded-2xl p-5 text-sm text-destructive">
        {error.message}
      </p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Не найдено">
      <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
        Такой активности больше нет.
      </p>
    </AppShell>
  ),
  component: ActivityDetail,
});

function ActivityDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: activity } = useSuspenseQuery(activityQuery(id));
  // Results are supplementary: a failed results request must not hide the game.
  const { data: results = [], isError: resultsUnavailable } = useQuery({
    ...resultsQuery(id),
    enabled: Boolean(activity && activity.type !== "daily_game"),
    retry: false,
  });

  const [signedIn, setSignedIn] = useState(false);
  const [registration, setRegistration] = useState<{
    id: string;
    payment_status: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(Boolean(data.user));
      if (!data.user) return;
      const reg = await supabase
        .from("registrations")
        .select("id, payment_status")
        .eq("activity_id", id)
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (!cancelled && reg.data) setRegistration(reg.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!activity) {
    return (
      <AppShell title="Не найдено">
        <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
          Активность не найдена.
        </p>
      </AppShell>
    );
  }

  const isCompetition = activity.type !== "daily_game";
  const hostId = activity.manager_id ?? activity.organizer_id;
  const fee = Number(activity.entry_fee ?? 0);
  const fullFund = fee * activity.max_participants * 0.9;
  const currentFund = fee * activity.registered_count * 0.9;
  const closed =
    activity.status === "full" ||
    activity.status === "cancelled" ||
    activity.status === "completed";

  async function register() {
    if (!signedIn) {
      navigate({ to: "/auth" });
      return;
    }
    setBusy(true);
    try {
      const res = await registerForActivity({ data: { activityId: id } });
      setRegistration({ id: res.id, payment_status: res.payment_status });
      await queryClient.invalidateQueries({ queryKey: ["activity", id] });
      toast.success(
        activity!.is_free
          ? "Вы записаны на игру!"
          : "Вы записаны. Осталось оплатить участие.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось записаться");
    } finally {
      setBusy(false);
    }
  }

  async function sendProof() {
    if (!registration) return;
    setBusy(true);
    try {
      await submitPaymentProof({
        data: {
          registrationId: registration.id,
          payment_reference: reference,
          receipt_url: receiptPath,
          note,
        },
      });
      setRegistration({ ...registration, payment_status: "needs_review" });
      toast.success("Подтверждение отправлено организатору на проверку.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Не удалось отправить подтверждение",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell layout="standard">
      <div className="activity-detail">
        <Link
          to="/"
          className="workspace-text-link mb-4 inline-flex items-center gap-2"
        >
          ← Все игры
        </Link>
        <div className="activity-hero">
          <div className="activity-hero-image">
            <img
              src={sportImage(activity.sport)}
              alt={activity.sport}
              className="h-full w-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel to-transparent" />
            <div className="absolute top-3 left-3 flex gap-2">
              <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold">
                {ACTIVITY_TYPE_LABEL[activity.type]}
              </span>
              <StatusBadge status={activity.status} />
            </div>
          </div>

          <div className="activity-hero-body space-y-5">
            <h1 className="font-display text-xl leading-tight">
              {activity.title}
            </h1>

            <CapacityMeter
              registered={activity.registered_count}
              max={activity.max_participants}
              size="lg"
            />

            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Clock className="size-4" /> {timeLabel(activity)}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="size-4" /> {activity.location_text}
              </p>
              {activity.two_gis_url ? (
                <a
                  href={activity.two_gis_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-brand underline"
                >
                  Открыть в 2GIS <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>

            {activity.description ? (
              <p className="text-sm">{activity.description}</p>
            ) : null}

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {activity.sport ? (
                <span className="panel-frost-2 rounded-full px-3 py-1">
                  {activity.sport}
                </span>
              ) : null}
              {activity.skill_level ? (
                <span className="panel-frost-2 rounded-full px-3 py-1">
                  {activity.skill_level}
                </span>
              ) : null}
              {activity.format ? (
                <span className="panel-frost-2 rounded-full px-3 py-1">
                  {activity.format}
                </span>
              ) : null}
              {activity.age_division ? (
                <span className="panel-frost-2 rounded-full px-3 py-1">
                  {activity.age_division}
                </span>
              ) : null}
              {activity.recurrence ? (
                <span className="panel-frost-2 rounded-full px-3 py-1">
                  {activity.recurrence}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <section className="panel-frost mt-4 rounded-3xl p-5">
          <h2 className="text-sm font-semibold">Организатор</h2>
          <Link
            to="/organizer/$id"
            params={{ id: hostId ?? "00000000-0000-0000-0000-000000000000" }}
            className="press panel-frost-2 mt-2 flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-sm"
          >
            <span className="flex items-center gap-2">
              {activity.host_name}
              {activity.host_rating ? (
                <span className="flex items-center gap-1 text-accent">
                  <Star className="size-3.5 fill-accent" />
                  {activity.host_rating.toFixed(1)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  пока без оценок
                </span>
              )}
            </span>
            <span className="text-xs text-brand">Игры и отзывы →</span>
          </Link>
          {activity.cancellation_policy ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {activity.cancellation_policy}
            </p>
          ) : null}
        </section>

        {isCompetition ? (
          <section className="panel-frost mt-4 rounded-3xl p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="size-4 text-accent" /> Призовой фонд
            </h2>
            {fee > 0 ? (
              <>
                <p className="mt-2 font-display text-2xl text-accent">
                  {formatKzt(fullFund)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Весь фонд получает победитель (1 место) при полном составе{" "}
                  {activity.max_participants} участников. Сейчас собрано:{" "}
                  {formatKzt(currentFund)}.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Бесплатное соревнование — денежного приза нет.
              </p>
            )}
          </section>
        ) : null}

        {resultsUnavailable && (
          <p
            className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground"
            role="status"
          >
            Итоги соревнования временно недоступны. Попробуй обновить страницу
            позже.
          </p>
        )}
        {results.length ? (
          <section className="panel-frost mt-4 rounded-3xl p-5">
            <h2 className="text-sm font-semibold">Результаты</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {results.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>
                    {r.placement}. {r.participant_name}
                  </span>
                  <span className="text-muted-foreground">
                    {r.prize_amount ? formatKzt(r.prize_amount) : "—"}
                    {r.paid_out ? " · выплачено" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="panel-frost mt-4 rounded-3xl p-5">
          <h2 className="text-sm font-semibold">Оплата</h2>
          <p className="mt-1 text-lg font-semibold text-accent">
            {priceLabel(activity)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isCompetition ? COMPETITION_DISCLAIMER : KASPI_DISCLAIMER}
          </p>

          {!activity.is_free && registration ? (
            <div className="mt-4 space-y-3">
              {activity.kaspi_payment_link ? (
                <a
                  href={activity.kaspi_payment_link}
                  target="_blank"
                  rel="noreferrer"
                  className="press block rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-accent-foreground"
                >
                  Оплатить через Kaspi
                </a>
              ) : null}
              {registration.payment_status === "pending" ? (
                <>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Номер или код перевода Kaspi"
                  />
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Комментарий организатору (необязательно)"
                  />
                  <FileUploadButton
                    label={
                      receiptPath
                        ? "Чек прикреплён — заменить"
                        : "Прикрепить скриншот чека"
                    }
                    onUpload={async (file) => {
                      const path = await uploadReceipt(file, registration.id);
                      setReceiptPath(path);
                      toast.success("Чек прикреплён");
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Чек видят только вы, организатор игры и администратор.
                  </p>
                  <Button
                    className="press w-full"
                    disabled={busy || !reference.trim()}
                    onClick={sendProof}
                  >
                    Я оплатил — отправить на проверку
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Статус платежа:{" "}
                  <span className="font-semibold text-foreground">
                    {registration.payment_status === "paid"
                      ? "оплачено"
                      : registration.payment_status === "needs_review"
                        ? "на проверке у организатора"
                        : registration.payment_status === "rejected"
                          ? "отклонено"
                          : "возврат"}
                  </span>
                </p>
              )}
            </div>
          ) : null}

          <Link
            to="/legal"
            className="mt-3 inline-block text-xs text-brand underline"
          >
            Правила и возвраты
          </Link>
        </section>

        <div className="activity-action">
          {registration ? (
            <Link
              to="/my-games"
              className="press panel-frost-2 block rounded-2xl py-3.5 text-center text-sm font-semibold"
            >
              Вы записаны · перейти в «Мои игры»
            </Link>
          ) : (
            <Button
              className="press h-12 w-full text-base"
              disabled={busy || closed}
              onClick={register}
            >
              {closed
                ? "Запись закрыта"
                : activity.is_free
                  ? "Записаться"
                  : "Записаться и оплатить"}
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
