import {
  KASPI_LINK_MESSAGE,
  KZ_PHONE_MESSAGE,
  normalizeKzPhone,
  parseKaspiLink,
} from "@/lib/kz-validation";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  LogOut,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";
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
import {
  ACCOUNT_STATUS_LABEL,
  CITIES,
  ROLE_LABEL,
  SPORTS,
} from "@/lib/sportura";
import { getAdminAlerts } from "@/lib/admin.functions";
import { FileUploadButton } from "@/components/sportura/file-upload";
import { signedAvatarUrl, uploadAvatar } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Профиль — Sportura" },
      {
        name: "description",
        content: "Ваш профиль, рейтинг, роли и заявка организатора.",
      },
      { property: "og:title", content: "Профиль — Sportura" },
      {
        property: "og:description",
        content: "Настройки профиля участника Sportura.",
      },
    ],
  }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: me,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const isAdmin = Boolean(me?.roles.includes("admin"));
  const { data: alerts } = useQuery({
    queryKey: ["admin", "alerts"],
    queryFn: () => getAdminAlerts(),
    enabled: isAdmin,
  });
  const alertsTotal =
    (alerts?.applications ?? 0) +
    (alerts?.payments ?? 0) +
    (alerts?.disputes ?? 0);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Астана");
  const [sports, setSports] = useState<string[]>([]);
  const [kaspi, setKaspi] = useState("");
  const [motivation, setMotivation] = useState("");
  const [role, setRole] = useState<"sports_manager" | "tournament_organizer">(
    "sports_manager",
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

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
    if (!me.verified)
      void confirmVerification().then(() =>
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      );
  }, [me, queryClient]);

  async function save() {
    setSaving(true);
    try {
      await updateMyProfile({
        data: { name, phone, city, sports, kaspi_payment_link: kaspi },
      });
      toast.success("Профиль сохранён");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function apply() {
    setApplying(true);
    try {
      await applyForHostRole({ data: { requested_role: role, motivation } });
      toast.success("Заявка отправлена администратору");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не удалось отправить заявку",
      );
    } finally {
      setApplying(false);
    }
  }

  const HOST_ROLES = ["sports_manager", "tournament_organizer"] as const;
  const hostRoles = HOST_ROLES.filter((r) => me?.roles.includes(r));
  const availableRoles = HOST_ROLES.filter(
    (r) => !me?.roles.includes(r) && !me?.roles.includes("admin"),
  );
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
    if (availableRoles.length > 0 && !availableRoles.includes(role))
      setRole(availableRoles[0]!);
  }, [availableRoles, role]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell
      workspace
      title="Профиль"
      subtitle="Ваши данные, рейтинг и роль на Sportura"
    >
      <PageBlocks page="profile" />
      {isLoading ? (
        <div
          className="grid gap-4 lg:grid-cols-[350px_minmax(0,1fr)]"
          aria-label="Загружаем профиль"
        >
          <div className="workspace-panel h-64 animate-pulse" />
          <div className="workspace-panel h-96 animate-pulse" />
        </div>
      ) : isError || !me ? (
        <div className="workspace-panel workspace-empty" role="alert">
          <div className="workspace-empty-icon">
            <UserRound size={24} />
          </div>
          <h2>Не удалось загрузить профиль</h2>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <Button onClick={() => void refetch()}>Повторить</Button>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[350px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section
              className="workspace-panel overflow-hidden"
              aria-label="Карточка профиля"
            >
              <div className="h-24 bg-[linear-gradient(120deg,#243034,#344044_58%,#ff91643a)]" />
              <div className="relative px-5 pb-5">
                <div className="-mt-9 flex items-end justify-between gap-3">
                  <div className="grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-[18px] border-4 border-[#1b2123] bg-[#30393c]">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={me.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="font-display text-2xl">
                        {me.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span
                    className={`workspace-tag ${me.verified ? "is-success" : "is-warning"}`}
                  >
                    {me.verified ? <BadgeCheck size={13} /> : null}
                    {me.verified ? "Подтверждён" : "Не подтверждён"}
                  </span>
                </div>
                <h2 className="workspace-section-title mt-4 break-words text-xl">
                  {me.name}
                </h2>
                <p className="workspace-muted mt-1 break-all text-xs">
                  {me.email ?? me.phone ?? "Контакт не указан"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {me.roles.map((r) => (
                    <span key={r} className="workspace-tag">
                      {ROLE_LABEL[r]}
                    </span>
                  ))}
                </div>
                <div className="mt-5 border-t border-[#30393c] pt-4">
                  <FileUploadButton
                    label={avatarUrl ? "Заменить фото" : "Загрузить фото"}
                    onUpload={async (file) => {
                      try {
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
                        await queryClient.invalidateQueries({
                          queryKey: ["me"],
                        });
                      } catch (err) {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Не удалось загрузить фото",
                        );
                      }
                    }}
                  />
                </div>
              </div>
            </section>
            <div className="grid grid-cols-2 gap-3">
              <div className="workspace-stat">
                <strong className="inline-flex items-center gap-1 text-[#ffb38f]">
                  <Star size={18} fill="currentColor" />
                  {me.rating ? me.rating.toFixed(1) : "—"}
                </strong>
                <span>{me.rating_count} отзывов</span>
              </div>
              <div className="workspace-stat">
                <strong>{me.no_show_count}</strong>
                <span>Пропусков игр</span>
              </div>
            </div>
            <section className="workspace-panel p-5">
              <h2 className="workspace-section-title">Аккаунт</h2>
              <p className="workspace-muted mt-1 text-xs">
                Статус: {ACCOUNT_STATUS_LABEL[me.account_status]}
              </p>
              <div className="mt-4 grid gap-1 border-t border-[#30393c] pt-3">
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="flex items-center justify-between rounded-lg px-2 py-2.5 text-xs font-bold hover:bg-[#252d2f]"
                  >
                    Панель администратора{" "}
                    {alertsTotal > 0 && (
                      <span className="workspace-tag is-accent">
                        {alertsTotal}
                      </span>
                    )}
                  </Link>
                )}
                <Link
                  to="/forgot-password"
                  className="flex items-center justify-between rounded-lg px-2 py-2.5 text-xs font-bold hover:bg-[#252d2f]"
                >
                  Сменить пароль <ArrowRight size={15} />
                </Link>
                <Link
                  to="/legal"
                  className="flex items-center justify-between rounded-lg px-2 py-2.5 text-xs font-bold hover:bg-[#252d2f]"
                >
                  Правила и политики <ArrowRight size={15} />
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs font-bold text-[#ec9b96] hover:bg-[#252d2f]"
                >
                  <LogOut size={15} /> Выйти
                </button>
              </div>
            </section>
          </aside>
          <div className="space-y-5">
            <section
              className="workspace-panel p-5 sm:p-7"
              aria-labelledby="profile-data-title"
            >
              <div className="mb-6">
                <p className="workspace-overline">Настройки</p>
                <h2
                  id="profile-data-title"
                  className="workspace-section-title mt-2"
                >
                  Личные данные
                </h2>
                <p className="workspace-muted mt-1 text-xs">
                  Эти данные помогают организаторам узнать вас и связаться перед
                  игрой.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="workspace-field">
                  <Label htmlFor="pname">Имя и фамилия</Label>
                  <Input
                    id="pname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="workspace-field">
                  <Label htmlFor="pphone">Телефон</Label>
                  <Input
                    id="pphone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 7__ ___ __ __"
                    autoComplete="tel"
                  />
                  {phone.trim() && !normalizeKzPhone(phone) && (
                    <p className="text-xs text-destructive">
                      {KZ_PHONE_MESSAGE}
                    </p>
                  )}
                </div>
              </div>
              <div className="workspace-form-section mt-6">
                <h2>Город</h2>
                <div
                  role="group"
                  aria-label="Город"
                  className="flex flex-wrap gap-2"
                >
                  {CITIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={city === c}
                      onClick={() => setCity(c)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${city === c ? "bg-[#ff9164] text-[#171b1c]" : "workspace-panel-raised text-[#a3afb3] hover:text-white"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="workspace-form-section mt-6">
                <h2>Виды спорта</h2>
                <div
                  role="group"
                  aria-label="Виды спорта"
                  className="flex flex-wrap gap-2"
                >
                  {SPORTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={sports.includes(s)}
                      onClick={() =>
                        setSports((prev) =>
                          prev.includes(s)
                            ? prev.filter((x) => x !== s)
                            : [...prev, s],
                        )
                      }
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${sports.includes(s) ? "bg-[#ff9164] text-[#171b1c]" : "workspace-panel-raised text-[#a3afb3] hover:text-white"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {me.roles.includes("sports_manager") && (
                <div className="workspace-form-section mt-6">
                  <h2>Приём оплаты</h2>
                  <div className="workspace-field">
                    <Label htmlFor="kaspi">Личная ссылка Kaspi</Label>
                    <Input
                      id="kaspi"
                      value={kaspi}
                      onChange={(e) => setKaspi(e.target.value)}
                      placeholder="https://pay.kaspi.kz/pay/..."
                    />
                    {kaspi.trim() && !parseKaspiLink(kaspi) && (
                      <p className="text-xs text-destructive">
                        {KASPI_LINK_MESSAGE}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#30393c] pt-5">
                <p className="workspace-muted text-xs">
                  Отмены: {me.cancellation_count} · Споры: {me.dispute_count}
                </p>
                <Button
                  disabled={
                    saving ||
                    name.trim().length < 2 ||
                    Boolean(phone.trim() && !normalizeKzPhone(phone)) ||
                    Boolean(kaspi.trim() && !parseKaspiLink(kaspi))
                  }
                  onClick={() => void save()}
                >
                  {saving ? "Сохраняем…" : "Сохранить изменения"}
                </Button>
              </div>
            </section>
            <section
              className="workspace-panel p-5 sm:p-7"
              aria-labelledby="host-role-title"
            >
              <div className="mb-5 flex items-start gap-3">
                <div className="workspace-empty-icon size-10 shrink-0">
                  <ShieldCheck size={19} />
                </div>
                <div>
                  <p className="workspace-overline">Возможности</p>
                  <h2
                    id="host-role-title"
                    className="workspace-section-title mt-1"
                  >
                    Проводить игры и турниры
                  </h2>
                </div>
              </div>
              {hostRoles.length > 0 && (
                <div className="workspace-panel-raised mb-4 p-4">
                  <p className="text-sm font-bold">Ваша роль активна</p>
                  <p className="workspace-muted mt-1 text-xs">
                    {hostRoles.map((r) => ROLE_LABEL[r]).join(", ")}. Вы можете
                    создавать события и управлять участниками.
                  </p>
                  <Link to="/host" className="workspace-primary-link mt-3">
                    Открыть кабинет <ArrowRight size={16} />
                  </Link>
                </div>
              )}
              {me.application?.status === "pending" && (
                <div className="workspace-panel-raised mb-4 p-4">
                  <span className="workspace-tag is-warning">
                    На рассмотрении
                  </span>
                  <p className="mt-2 text-sm font-bold">
                    Заявка: {ROLE_LABEL[me.application.requested_role]}
                  </p>
                  <p className="workspace-muted mt-1 text-xs">
                    Отправлена{" "}
                    {new Date(me.application.created_at).toLocaleDateString(
                      "ru-RU",
                    )}
                    . Решение появится здесь автоматически.
                  </p>
                </div>
              )}
              {me.application?.status === "rejected" &&
                !me.roles.includes(me.application.requested_role) && (
                  <div className="workspace-panel-raised mb-4 p-4">
                    <span className="workspace-tag is-danger">
                      Заявка отклонена
                    </span>
                    <p className="workspace-muted mt-2 text-xs">
                      {me.application.admin_notes
                        ? `Причина: ${me.application.admin_notes}`
                        : "Можно исправить профиль и подать заявку снова."}
                    </p>
                  </div>
                )}
              {me.application?.status !== "pending" &&
                availableRoles.length > 0 && (
                  <div className="space-y-4">
                    <p className="workspace-muted text-xs">
                      Выберите роль и расскажите, какие события планируете
                      проводить. Администратор проверит заявку.
                    </p>
                    <div
                      role="group"
                      aria-label="Роль организатора"
                      className="flex flex-wrap gap-2"
                    >
                      {availableRoles.map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={role === r}
                          onClick={() => setRole(r)}
                          className={`rounded-lg px-3 py-2 text-xs font-bold ${role === r ? "bg-[#ff9164] text-[#171b1c]" : "workspace-panel-raised text-[#a3afb3]"}`}
                        >
                          {ROLE_LABEL[r]}
                        </button>
                      ))}
                    </div>
                    <p className="workspace-muted text-xs">
                      {role === "sports_manager"
                        ? "Спорт-менеджер создаёт игровые слоты и принимает оплату через свою ссылку Kaspi."
                        : "Организатор турниров проводит турниры и лиги, а также может создавать игры."}
                    </p>
                    <Textarea
                      value={motivation}
                      onChange={(e) => setMotivation(e.target.value)}
                      placeholder="Где и как часто планируете проводить игры?"
                      aria-label="О вашей заявке"
                      className="min-h-28 border-[#455054] bg-[#252d2f]"
                    />
                    {applyBlocker && (
                      <p className="text-xs text-[#e9c67f]">{applyBlocker}</p>
                    )}
                    <Button
                      disabled={Boolean(applyBlocker) || applying}
                      onClick={() => void apply()}
                    >
                      {applying ? "Отправляем…" : "Отправить заявку"}
                    </Button>
                  </div>
                )}
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
