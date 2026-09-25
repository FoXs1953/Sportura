import { KASPI_LINK_MESSAGE, TWO_GIS_MESSAGE, parseKaspiLink, parseTwoGisLink } from "@/lib/kz-validation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import { CapacityMeter, StatusBadge } from "@/components/sportura/activity-card";
import { ReceiptLink } from "@/components/sportura/receipt-link";
import { Button } from "@/components/ui/button";
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
import { listActivityParticipants, setPaymentStatus } from "@/lib/registrations.functions";
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
  type ActivityStatus,
  type PaymentStatus,
} from "@/lib/sportura";

export const Route = createFileRoute("/_authenticated/host")({
  head: () => ({
    meta: [
      { title: "Кабинет организатора — Sportura" },
      { name: "description", content: "Создание игр и турниров, участники, статусы оплаты." },
      { property: "og:title", content: "Кабинет организатора — Sportura" },
      { property: "og:description", content: "Управление играми, участниками и оплатой." },
    ],
  }),
  component: HostDashboard,
});

type Tab = "list" | "create-game" | "create-competition";

function HostDashboard() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const { data: mine } = useQuery({ queryKey: ["host", "activities"], queryFn: () => getMyActivities() });
  const [tab, setTab] = useState<Tab>("list");
  const [openParticipants, setOpenParticipants] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  const isManager = Boolean(me?.roles.includes("sports_manager") || me?.roles.includes("admin"));
  const isOrganizer = Boolean(me?.roles.includes("tournament_organizer") || me?.roles.includes("admin"));

  if (me && !isManager && !isOrganizer) {
    return (
      <AppShell title="Кабинет организатора">
        <div className="panel-frost rounded-3xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            У вас пока нет роли организатора. Подайте заявку в профиле — администратор рассмотрит её.
          </p>
          <Link
            to="/profile"
            className="press mt-4 inline-block rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Перейти в профиль
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Кабинет организатора" subtitle={me?.name}>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ["list", "Мои активности"],
            ...(isManager ? ([["create-game", "Новый игровой слот"]] as const) : []),
            ...(isOrganizer ? ([["create-competition", "Новое соревнование"]] as const) : []),
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`press shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${
              tab === key ? "bg-brand text-primary-foreground" : "panel-frost-2 text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "create-game" ? <GameForm onDone={() => setTab("list")} onCreated={setNewCode} /> : null}
      {tab === "create-competition" ? <CompetitionForm onDone={() => setTab("list")} /> : null}

      {tab === "list" ? (
        <div className="space-y-4">
          {newCode ? (
            <div className="rounded-3xl bg-brand/15 p-5 text-center">
              <p className="text-sm font-semibold">Закрытая игра создана. Код для входа:</p>
              <p className="mt-2 font-display text-3xl tracking-widest">{newCode}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Отправьте код игрокам — они вводят его на главной в «Войти по коду».
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" className="press" onClick={() => { void navigator.clipboard.writeText(newCode); toast.success("Код скопирован"); }}>
                  Скопировать
                </Button>
                <Button size="sm" variant="secondary" className="press" onClick={() => setNewCode(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
          ) : null}
          {(mine?.activities ?? []).length === 0 ? (
            <p className="panel-frost rounded-3xl p-6 text-center text-sm text-muted-foreground">
              Пока нет созданных активностей.
            </p>
          ) : (
            (mine?.activities ?? []).map((a: any) => {
              const s = mine?.stats[a.id];
              return (
                <div key={a.id} className="panel-frost space-y-3 rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link to="/activity/$id" params={{ id: a.id }} className="font-semibold">
                        {a.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {ACTIVITY_TYPE_LABEL[a.type as "daily_game"]} · {timeLabel(a)}
                      </p>
                    </div>
                    <StatusBadge status={a.status as ActivityStatus} />
                  </div>

                  <CapacityMeter registered={a.registered_count} max={a.max_participants} />
                  {a.is_private && a.invite_code ? (
                    <p className="text-xs">
                      Код входа: <span className="font-semibold tracking-wider text-brand">{a.invite_code}</span>
                    </p>
                  ) : null}

                  <p className="text-xs text-muted-foreground">
                    {priceLabel(a)} · оплачено {s?.paid ?? 0} · на проверке {s?.review ?? 0} · ждут{" "}
                    {s?.pending ?? 0}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="press"
                      onClick={() => setOpenParticipants(openParticipants === a.id ? null : a.id)}
                    >
                      Участники и оплата
                    </Button>
                    {a.status !== "cancelled" && a.status !== "completed" ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="press"
                          onClick={async () => {
                            await setActivityStatus({ data: { activityId: a.id, status: "completed" } });
                            toast.success("Активность завершена");
                            queryClient.invalidateQueries({ queryKey: ["host", "activities"] });
                          }}
                        >
                          Завершить
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="press text-destructive"
                          onClick={async () => {
                            await setActivityStatus({ data: { activityId: a.id, status: "cancelled" } });
                            toast.success("Активность отменена");
                            queryClient.invalidateQueries({ queryKey: ["host", "activities"] });
                          }}
                        >
                          Отменить
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="press"
                        onClick={async () => {
                          await setActivityStatus({ data: { activityId: a.id, status: "open" } });
                          toast.success("Запись открыта снова");
                          queryClient.invalidateQueries({ queryKey: ["host", "activities"] });
                        }}
                      >
                        Открыть снова
                      </Button>
                    )}
                  </div>

                  {openParticipants === a.id ? <Participants activityId={a.id} competition={a.type !== "daily_game"} /> : null}
                  {a.type !== "daily_game" ? <ResultsForm activityId={a.id} /> : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </AppShell>
  );
}

function Participants({ activityId, competition }: { activityId: string; competition: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["host", "participants", activityId],
    queryFn: async () =>
      (await listActivityParticipants({ data: { activityId } })).filter(
        (r: any) => r.status !== "cancelled" && r.status !== "rejected",
      ),
  });

  async function mark(registrationId: string, status: PaymentStatus) {
    try {
      await setPaymentStatus({ data: { registrationId, status } });
      toast.success("Статус обновлён");
      await queryClient.invalidateQueries({ queryKey: ["host", "participants", activityId] });
      await queryClient.invalidateQueries({ queryKey: ["host", "activities"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    }
  }

  if (isLoading) return <p className="text-xs text-muted-foreground">Загружаем участников…</p>;

  return (
    <div className="panel-frost-2 space-y-3 rounded-2xl p-4">
      <p className="text-xs text-muted-foreground">{competition ? COMPETITION_DISCLAIMER : KASPI_DISCLAIMER}</p>
      {(data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока никто не записался.</p>
      ) : (
        (data ?? []).map((r: any) => (
          <div key={r.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{r.profile?.name ?? "Участник"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {PAYMENT_STATUS_LABEL[r.payment_status as PaymentStatus]}
                  {r.payment_reference ? ` · ${r.payment_reference}` : ""}
                </p>
                {r.participant_note ? (
                  <p className="text-[11px] text-muted-foreground">«{r.participant_note}»</p>
                ) : null}
                {r.receipt_url ? <ReceiptLink path={r.receipt_url as string} /> : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" className="press" onClick={() => mark(r.id, "paid")}>
                Оплачено
              </Button>
              <Button size="sm" variant="secondary" className="press" onClick={() => mark(r.id, "needs_review")}>
                На проверку
              </Button>
              <Button size="sm" variant="secondary" className="press" onClick={() => mark(r.id, "rejected")}>
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
    <div className="panel-frost-2 rounded-2xl p-4">
      <button type="button" className="text-xs font-semibold text-brand" onClick={() => setOpen((v) => !v)}>
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
                    prev.map((r, idx) => (idx === i ? { ...r, participant_name: e.target.value } : r)),
                  )
                }
              />
              <Input
                type="number"
                value={row.prize_amount}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, idx) => (idx === i ? { ...r, prize_amount: Number(e.target.value) } : r)),
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
                  data: { activityId, rows: rows.filter((r) => r.participant_name.trim()) },
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
    } catch {}
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
          onClick={() => onChange(v)}
          className={`press rounded-full px-3 py-1.5 text-xs font-semibold ${
            value === v ? "bg-brand text-primary-foreground" : "panel-frost-2"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function GameForm({ onDone, onCreated }: { onDone: () => void; onCreated: (code: string) => void }) {
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
          date_time: form.date_time ? new Date(form.date_time).toISOString() : null,
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
      toast.error(err instanceof Error ? err.message : "Не удалось создать слот");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel-frost space-y-4 rounded-3xl p-5">
      <div className="space-y-2">
        <Label>Название</Label>
        <Input required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Вечерний футбол 6x6" />
      </div>
      <div className="space-y-2">
        <Label>Вид спорта</Label>
        <ChipRow values={SPORTS} value={form.sport} onChange={(v) => set("sport", v)} />
      </div>
      <div className="space-y-2">
        <Label>Город</Label>
        <ChipRow values={CITIES} value={form.city} onChange={(v) => set("city", v)} />
      </div>
      <div className="space-y-2">
        <Label>Место (текстом)</Label>
        <Input required value={form.location_text} onChange={(e) => set("location_text", e.target.value)} placeholder="Спортзал «Алау», ул. Кабанбай батыра 15" />
      </div>
      <div className="space-y-2">
        <Label>Ссылка 2GIS</Label>
        <Input value={form.two_gis_url} onChange={(e) => set("two_gis_url", e.target.value)} placeholder="https://2gis.kz/astana/..." />
        {form.two_gis_url.trim() && !parseTwoGisLink(form.two_gis_url) ? (
          <p className="text-xs text-destructive">{TWO_GIS_MESSAGE}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>Время (текстом)</Label>
        <Input required value={form.time_text} onChange={(e) => set("time_text", e.target.value)} placeholder="Каждый вторник, 20:00–21:30" />
      </div>
      <div className="space-y-2">
        <Label>Дата и время (для сортировки)</Label>
        <Input type="datetime-local" value={form.date_time} onChange={(e) => set("date_time", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Цена (текстом)</Label>
        <Input required value={form.price_text} onChange={(e) => set("price_text", e.target.value)} placeholder="2000 ₸ с человека" />
      </div>
      <div className="space-y-2">
        <Label>Взнос, ₸ (пусто = бесплатно)</Label>
        <Input type="number" value={form.entry_fee} onChange={(e) => set("entry_fee", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Максимум участников</Label>
        <Input type="number" required min={2} value={form.max_participants} onChange={(e) => set("max_participants", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Личная ссылка Kaspi (для платной игры)</Label>
        <Input value={form.kaspi_payment_link} onChange={(e) => set("kaspi_payment_link", e.target.value)} placeholder="https://pay.kaspi.kz/pay/..." />
        {form.kaspi_payment_link.trim() && !parseKaspiLink(form.kaspi_payment_link) ? (
          <p className="text-xs text-destructive">{KASPI_LINK_MESSAGE}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">{KASPI_DISCLAIMER}</p>
      </div>
      <div className="space-y-2">
        <Label>Уровень</Label>
        <ChipRow values={SKILL_LEVELS} value={form.skill_level} onChange={(v) => set("skill_level", v)} />
      </div>
      <div className="space-y-2">
        <Label>Регулярность</Label>
        <Input value={form.recurrence} onChange={(e) => set("recurrence", e.target.value)} placeholder="Каждую неделю" />
      </div>
      <div className="space-y-2">
        <Label>Условия отмены</Label>
        <Textarea value={form.cancellation_policy} onChange={(e) => set("cancellation_policy", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Описание</Label>
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_private} onChange={(e) => set("is_private", e.target.checked)} />
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
          date_time: form.date_time ? new Date(form.date_time).toISOString() : null,
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
      toast.error(err instanceof Error ? err.message : "Не удалось создать соревнование");
    } finally {
      setBusy(false);
    }
  }

  const feeNum = Number(form.entry_fee || 0);
  const fund = feeNum * Number(form.max_participants || 0) * 0.9;
  return (
    <form onSubmit={submit} className="panel-frost space-y-4 rounded-3xl p-5">
      <div className="panel-frost-2 space-y-2 rounded-2xl p-4 text-xs">
        <p className="text-sm font-semibold">Как провести турнир — по шагам</p>
        <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>Забронируйте площадку на нужные даты и укажите её адрес и ссылку 2ГИС.</li>
          <li>Выберите тип: турнир (1–3 дня) или лига (несколько недель).</li>
          <li>Укажите, сколько команд или игроков примете, и взнос с каждого в тенге.</li>
          <li>Поставьте дедлайн регистрации — минимум за сутки до старта.</li>
          <li>Опишите формат и правила: состав команды, длительность матча, что делать при ничьей.</li>
          <li>После финала внесите победителя в «Мои активности» → «Внести результаты».</li>
          <li>Через 48 часов без споров приз выплачивается победителю.</li>
        </ol>
        <p className="text-muted-foreground">Черновик сохраняется автоматически — можно выйти и вернуться.</p>
      </div>
      <div className="space-y-2">
        <Label>Название</Label>
        <Input required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Кубок Астаны по мини-футболу" />
      </div>
      <div className="space-y-2">
        <Label>Тип</Label>
        <div className="flex gap-2">
          {(["tournament", "league"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("type", t)}
              className={`press rounded-full px-3 py-1.5 text-xs font-semibold ${
                form.type === t ? "bg-brand text-primary-foreground" : "panel-frost-2"
              }`}
            >
              {ACTIVITY_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Вид спорта</Label>
        <ChipRow values={SPORTS} value={form.sport} onChange={(v) => set("sport", v)} />
      </div>
      <div className="space-y-2">
        <Label>Город</Label>
        <ChipRow values={CITIES} value={form.city} onChange={(v) => set("city", v)} />
      </div>
      <div className="space-y-2">
        <Label>Место</Label>
        <Input required value={form.location_text} onChange={(e) => set("location_text", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Ссылка на карту</Label>
        <Input value={form.two_gis_url} onChange={(e) => set("two_gis_url", e.target.value)} placeholder="https://2gis.kz/astana/..." />
        {form.two_gis_url.trim() && !parseTwoGisLink(form.two_gis_url) ? (
          <p className="text-xs text-destructive">{TWO_GIS_MESSAGE}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>Сроки (текстом)</Label>
        <Input required value={form.time_text} onChange={(e) => set("time_text", e.target.value)} placeholder="12–14 июля, с 10:00" />
      </div>
      <div className="space-y-2">
        <Label>Старт</Label>
        <Input type="datetime-local" value={form.date_time} onChange={(e) => set("date_time", e.target.value)} />
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
        <Input type="number" value={form.entry_fee} onChange={(e) => set("entry_fee", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Цена (текстом, как увидят игроки)</Label>
        <Input value={form.price_text} onChange={(e) => set("price_text", e.target.value)} placeholder="10 000 ₸ с команды" />
        <p className="text-xs text-muted-foreground">
          Призовой фонд при полном составе: {Math.round(fund).toLocaleString("ru-RU")} ₸ — всё победителю.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Команд / участников</Label>
        <Input type="number" required min={2} value={form.max_participants} onChange={(e) => set("max_participants", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Формат</Label>
        <Input value={form.format} onChange={(e) => set("format", e.target.value)} placeholder="Групповой этап + плей-офф, матчи 2×20 мин" />
      </div>
      <div className="space-y-2">
        <Label>Возрастной дивизион</Label>
        <Input value={form.age_division} onChange={(e) => set("age_division", e.target.value)} placeholder="18+" />
      </div>
      <div className="space-y-2">
        <Label>Дивизион по уровню</Label>
        <Input value={form.skill_division} onChange={(e) => set("skill_division", e.target.value)} placeholder="Любители" />
      </div>
      <div className="space-y-2">
        <Label>Описание</Label>
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Состав команды, форма, судейство, что взять с собой" />
      </div>
      <p className="text-xs text-muted-foreground">
        Весь призовой фонд (взносы минус 10% комиссии платформы) получает 1 место. Выплата — после 48-часового окна споров.
      </p>
      <Button type="submit" className="press w-full" disabled={busy}>
        Создать соревнование
      </Button>
    </form>
  );
}
