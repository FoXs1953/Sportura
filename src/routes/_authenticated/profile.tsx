import { KASPI_LINK_MESSAGE, KZ_PHONE_MESSAGE, normalizeKzPhone, parseKaspiLink } from "@/lib/kz-validation";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/sportura/shell";
import { PageBlocks } from "@/components/sportura/page-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  applyForHostRole,
  confirmVerification,
  getMe,
  updateMyProfile,
} from "@/lib/me.functions";
import { ACCOUNT_STATUS_LABEL, CITIES, ROLE_LABEL, SPORTS } from "@/lib/sportura";
import { getAdminAlerts } from "@/lib/admin.functions";
import { FileUploadButton } from "@/components/sportura/file-upload";
import { signedAvatarUrl, uploadAvatar } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Профиль — Sportura" },
      { name: "description", content: "Ваш профиль, рейтинг, роли и заявка организатора." },
      { property: "og:title", content: "Профиль — Sportura" },
      { property: "og:description", content: "Настройки профиля участника Sportura." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const isAdmin = Boolean(me?.roles.includes("admin"));
  const { data: alerts } = useQuery({
    queryKey: ["admin", "alerts"],
    queryFn: () => getAdminAlerts(),
    enabled: isAdmin,
  });
  const alertsTotal = (alerts?.applications ?? 0) + (alerts?.payments ?? 0) + (alerts?.disputes ?? 0);


  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Астана");
  const [sports, setSports] = useState<string[]>([]);
  const [kaspi, setKaspi] = useState("");
  const [motivation, setMotivation] = useState("");
  const [role, setRole] = useState<"sports_manager" | "tournament_organizer">("sports_manager");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setName(me.name);
    setPhone(me.phone ?? "");
    setCity(me.city);
    setSports(me.sports);
    setKaspi(me.kaspi_payment_link ?? "");
    if (me.avatar_url) {
      void signedAvatarUrl(me.avatar_url)
        .then(setAvatarUrl)
        .catch(() => setAvatarUrl(null));
    }
    if (!me.verified) void confirmVerification().then(() => queryClient.invalidateQueries({ queryKey: ["me"] }));
  }, [me, queryClient]);

  async function save() {
    try {
      await updateMyProfile({
        data: { name, phone, city, sports, kaspi_payment_link: kaspi },
      });
      toast.success("Профиль сохранён");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    }
  }

  async function apply() {
    try {
      await applyForHostRole({ data: { requested_role: role, motivation } });
      toast.success("Заявка отправлена администратору");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось отправить заявку");
    }
  }

  const HOST_ROLES = ["sports_manager", "tournament_organizer"] as const;
  const hostRoles = HOST_ROLES.filter((r) => me?.roles.includes(r));
  const availableRoles = HOST_ROLES.filter((r) => !me?.roles.includes(r) && !me?.roles.includes("admin"));
  const applyBlocker = !me
    ? "Загружаем профиль…"
    : !me.verified
      ? "Сначала подтвердите e-mail по ссылке из письма."
      : me.account_status !== "active"
        ? "Аккаунт ограничен — заявку подать нельзя."
        : me.name.trim().length < 2
          ? "Укажите имя в профиле и сохраните."
          : !me.phone
            ? "Укажите телефон в профиле и сохраните — администратор свяжется с вами."
            : null;

  useEffect(() => {
    if (availableRoles.length > 0 && !availableRoles.includes(role)) setRole(availableRoles[0]!);
  }, [availableRoles, role]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell title="Профиль" subtitle={me ? ACCOUNT_STATUS_LABEL[me.account_status] : ""}>
      <PageBlocks page="profile" />
      {!me ? (
        <p className="text-sm text-muted-foreground">Загружаем…</p>
      ) : (
        <div className="space-y-4">
          <section className="panel-frost rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="panel-frost-2 grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={me.name} className="size-full object-cover" />
                  ) : (
                    <span className="font-display text-lg">{me.name.slice(0, 1)}</span>
                  )}
                </div>
                <div>
                  <p className="font-display text-lg">{me.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {me.email ?? me.phone ?? "—"} · {me.verified ? "подтверждён" : "не подтверждён"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl text-accent">
                  {me.rating ? me.rating.toFixed(1) : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">{me.rating_count} отзывов</p>
              </div>
            </div>
            <div className="mt-3">
              <FileUploadButton
                label={avatarUrl ? "Заменить фото" : "Загрузить фото"}
                onUpload={async (file) => {
                  const path = await uploadAvatar(file);
                  await updateMyProfile({
                    data: {
                      name: me.name,
                      phone: me.phone,
                      city: me.city,
                      sports: me.sports,
                      kaspi_payment_link: me.kaspi_payment_link,
                      avatar_url: path,
                    },
                  });
                  setAvatarUrl(await signedAvatarUrl(path));
                  toast.success("Фото обновлено");
                  await queryClient.invalidateQueries({ queryKey: ["me"] });
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {me.roles.map((r) => (
                <span key={r} className="panel-frost-2 rounded-full px-2.5 py-1">
                  {ROLE_LABEL[r]}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Пропуски: {me.no_show_count} · Отмены: {me.cancellation_count} · Споры: {me.dispute_count}
            </p>
          </section>

          <section className="panel-frost space-y-3 rounded-3xl p-5">
            <h2 className="text-sm font-semibold">Данные</h2>
            <div className="space-y-2">
              <Label htmlFor="pname">Имя</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pphone">Телефон</Label>
              <Input id="pphone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 7__ ___ __ __" />
              {phone.trim() && !normalizeKzPhone(phone) ? (
                <p className="text-xs text-destructive">{KZ_PHONE_MESSAGE}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Город</Label>
              <div className="flex flex-wrap gap-2">
                {CITIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCity(c)}
                    className={`press rounded-full px-3 py-1.5 text-xs font-semibold ${
                      city === c ? "bg-brand text-primary-foreground" : "panel-frost-2"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Виды спорта</Label>
              <div className="flex flex-wrap gap-2">
                {SPORTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setSports((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
                    }
                    className={`press rounded-full px-3 py-1.5 text-xs font-semibold ${
                      sports.includes(s) ? "bg-brand text-primary-foreground" : "panel-frost-2"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {me.roles.includes("sports_manager") ? (
              <div className="space-y-2">
                <Label htmlFor="kaspi">Личная ссылка Kaspi</Label>
                <Input
                  id="kaspi"
                  value={kaspi}
                  onChange={(e) => setKaspi(e.target.value)}
                  placeholder="https://pay.kaspi.kz/pay/..."
                />
                {kaspi.trim() && !parseKaspiLink(kaspi) ? (
                  <p className="text-xs text-destructive">{KASPI_LINK_MESSAGE}</p>
                ) : null}
              </div>
            ) : null}
            <Button className="press w-full" onClick={save}>
              Сохранить
            </Button>
          </section>

          <section className="panel-frost space-y-3 rounded-3xl p-5">
            <h2 className="text-sm font-semibold">Проведение игр и турниров</h2>

            {hostRoles.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Ваши роли: {hostRoles.map((r) => ROLE_LABEL[r]).join(", ")}. Можно создавать события.
                </p>
                <Link
                  to="/host"
                  className="press block rounded-2xl bg-brand py-3 text-center text-sm font-semibold text-primary-foreground"
                >
                  Кабинет организатора
                </Link>
              </div>
            ) : null}

            {me.application?.status === "pending" ? (
              <div className="panel-frost-2 space-y-1 rounded-2xl p-4">
                <p className="text-sm font-semibold">Заявка на рассмотрении</p>
                <p className="text-xs text-muted-foreground">
                  Роль «{ROLE_LABEL[me.application.requested_role]}» · отправлена{" "}
                  {new Date(me.application.created_at).toLocaleDateString("ru-RU")}. Администратор проверит
                  её и пришлёт решение — роль появится здесь автоматически.
                </p>
              </div>
            ) : null}

            {me.application?.status === "rejected" && !me.roles.includes(me.application.requested_role) ? (
              <div className="panel-frost-2 space-y-1 rounded-2xl p-4">
                <p className="text-sm font-semibold text-destructive">Заявка отклонена</p>
                <p className="text-xs text-muted-foreground">
                  {me.application.admin_notes
                    ? `Причина: ${me.application.admin_notes}`
                    : "Администратор не указал причину. Можно исправить профиль и подать заявку снова."}
                </p>
              </div>
            ) : null}

            {me.application?.status === "pending" || availableRoles.length === 0 ? null : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {hostRoles.length > 0
                    ? "Нужна вторая роль? Подайте отдельную заявку."
                    : "Выберите роль и расскажите о себе — заявка уйдёт администратору на проверку."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`press rounded-full px-3 py-1.5 text-xs font-semibold ${
                        role === r ? "bg-brand text-primary-foreground" : "panel-frost-2"
                      }`}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {role === "sports_manager"
                    ? "Спорт-менеджер создаёт ежедневные игровые слоты и сам принимает оплату по своей ссылке Kaspi."
                    : "Организатор турниров создаёт турниры и лиги с призовым фондом, а также может создавать игровые слоты."}
                </p>
                <Textarea
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  placeholder="Расскажите, какие игры или турниры планируете проводить, где и как часто"
                />
                {applyBlocker ? <p className="text-xs text-warning">{applyBlocker}</p> : null}
                <Button className="press w-full" disabled={Boolean(applyBlocker)} onClick={apply}>
                  Отправить заявку администратору
                </Button>
              </div>
            )}
          </section>

          <div className="flex flex-col gap-2">
            {me.roles.includes("admin") ? (
              <Link to="/admin" className="panel-frost press rounded-2xl py-3 text-center text-sm">
                Панель администратора
                {alertsTotal > 0 ? (
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {alertsTotal}
                  </span>
                ) : null}
              </Link>
            ) : null}
            <Link to="/legal" className="panel-frost press rounded-2xl py-3 text-center text-sm">
              Правила и политики
            </Link>
            <Button variant="secondary" className="press" onClick={signOut}>
              Выйти
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
