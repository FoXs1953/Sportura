import { useI18n } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Mail, Phone, ShieldCheck } from "lucide-react";
import type { MyProfile } from "@/lib/me.functions";
import type { ProfileWorkspace, ProfileTab } from "@/lib/profile-model";
import { reviewAverage } from "@/lib/profile-model";
import {
  ACCOUNT_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  ROLE_LABEL,
  sportImage,
  type PaymentStatus,
} from "@/lib/sportura";
import { Panel, Empty, dateLabel } from "./shared";
export function OverviewTab({
  me,
  data,
  go,
}: {
  me: MyProfile;
  data: ProfileWorkspace;
  go: (tab: ProfileTab) => void;
}) {
  const { tr, language } = useI18n();
  const upcoming = data.registrations
    .filter(
      (r) =>
        r.status === "registered" &&
        r.activity &&
        r.activity.status !== "cancelled" &&
        r.activity.status !== "completed" &&
        r.activity.date_time &&
        new Date(r.activity.date_time).getTime() > Date.now(),
    )
    .sort(
      (a, b) =>
        new Date(a.activity!.date_time!).getTime() -
        new Date(b.activity!.date_time!).getTime(),
    );
  const next = upcoming[0];
  const playerReviews = data.reviews.filter((review) => !review.as_host);
  const rating = reviewAverage(playerReviews);
  const checks = [
    {
      done: me.name.trim().length >= 2,
      label: "Имя и город",
      tab: "personal" as const,
    },
    { done: !!me.avatar_url, label: "Добавить фото", tab: "personal" as const },
    {
      done: data.email_confirmed,
      label: "Подтвердить email",
      tab: "personal" as const,
    },
    {
      done: !!me.phone,
      label: "Указать контактный телефон",
      tab: "personal" as const,
    },
    {
      done: me.sports.length > 0,
      label: "Выбрать виды спорта",
      tab: "personal" as const,
    },
  ];
  const completed = checks.filter((c) => c.done).length;
  const unpaid = upcoming.filter(
    (r) =>
      !r.activity?.is_free &&
      ["pending", "rejected"].includes(r.payment_status),
  );
  const support = data.tickets.filter((t) => t.status === "needs_user");
  const hasHost = me.roles.some(
    (r) => r === "sports_manager" || r === "tournament_organizer",
  );
  return (
    <>
      <Panel
        title={tr(`Привет, ${me.name.split(" ")[0]}`)}
        subtitle={tr(
          `${me.city} · На Sportura с ${dateLabel(data.created_at, false, language)}`,
        )}
        action={
          <button className="profile-link" onClick={() => go("personal")}>
            {tr("Редактировать")}
          </button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {me.roles.map((role) => (
            <span className="workspace-tag" key={role}>
              {tr(ROLE_LABEL[role])}
              {tr(role === "admin" ? " · видно только вам" : "")}
            </span>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Mail,
              title: "Email",
              yes: data.email_confirmed,
              detail: data.email_confirmed
                ? "Подтверждён по ссылке"
                : "Требуется подтверждение",
            },
            {
              icon: Phone,
              title: "Телефон",
              yes:
                data.phone_confirmed &&
                data.auth_phone?.replace("+", "") ===
                  me.phone?.replace("+", ""),
              detail:
                data.phone_confirmed &&
                data.auth_phone?.replace("+", "") === me.phone?.replace("+", "")
                  ? "Подтверждён SMS"
                  : "Не подтверждён SMS",
            },
            {
              icon: ShieldCheck,
              title: "Организатор",
              yes: hasHost,
              detail: hasHost ? "Роль одобрена" : "Роль не получена",
            },
          ].map((item) => (
            <div className="workspace-panel-raised p-3" key={item.title}>
              <item.icon
                size={18}
                className={item.yes ? "text-[#9ed9a2]" : "text-[#a3afb3]"}
              />
              <strong className="mt-2 block text-xs">{tr(item.title)}</strong>
              <p className="workspace-muted mt-1 text-xs">{tr(item.detail)}</p>
            </div>
          ))}
        </div>
        <p className="workspace-muted mt-4 text-xs">
          {tr("Статус аккаунта: ")}
          {tr(ACCOUNT_STATUS_LABEL[me.account_status])}
        </p>
        <Link
          to="/player/$id"
          params={{ id: me.id }}
          className="profile-link mt-4 inline-block"
        >
          {tr("Посмотреть публичный профиль ↗")}
        </Link>
      </Panel>
      <div className="profile-stats">
        <button className="workspace-stat" onClick={() => go("rating")}>
          <strong>
            {data.registrations.filter((r) => r.status === "attended").length}
          </strong>
          <span>{tr("Посещено игр")}</span>
        </button>
        <Link to="/my-games" className="workspace-stat">
          <strong>{upcoming.length}</strong>
          <span>{tr("Ближайшие игры")}</span>
        </Link>
        <button className="workspace-stat" onClick={() => go("rating")}>
          <strong>{tr(rating?.toFixed(1) ?? "—")}</strong>
          <span>
            {tr(
              playerReviews.length
                ? `${playerReviews.length} отзывов · рейтинг игрока`
                : "Пока нет оценок",
            )}
          </span>
        </button>
      </div>
      <Panel
        title={tr("Ваша ближайшая игра")}
        action={
          <Link to="/my-games" className="profile-link">
            {tr("Все мои игры")}
          </Link>
        }
      >
        {next?.activity ? (
          <div className="profile-next">
            <img src={sportImage(next.activity.sport)} alt={tr("")} />
            <div>
              <span className="workspace-tag is-accent">
                {tr(next.activity.sport)}
              </span>
              <h3 className="mt-3 text-lg font-bold">
                {tr(next.activity.title)}
              </h3>
              <p className="workspace-muted mt-2 text-sm">
                {tr(dateLabel(next.activity.date_time, true, language))} ·
                {tr(" ")}
                {tr(next.activity.location_text)}
              </p>

              <div className="mt-4 flex flex-wrap gap-4">
                <Link
                  className="profile-link"
                  to="/activity/$id"
                  params={{ id: next.activity.id }}
                >
                  {tr("Открыть игру →")}
                </Link>
                {tr(
                  next.activity.two_gis_url &&
                    /^https:\/\/(?:2gis\.kz|go\.2gis\.com)\//.test(
                      next.activity.two_gis_url,
                    ) && (
                      <a
                        className="profile-link"
                        href={next.activity.two_gis_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {tr("На карте ↗")}
                      </a>
                    ),
                )}
              </div>
            </div>
          </div>
        ) : (
          <Empty title={tr("Самое время выбрать игру")}>
            <p>{tr("После записи ближайшее событие появится здесь.")}</p>
            <Link to="/" className="workspace-primary-link mt-4">
              {tr("Открыть ленту ")}
              <ArrowRight size={16} />
            </Link>
          </Empty>
        )}
      </Panel>
      {(!data.email_confirmed ||
        unpaid.length > 0 ||
        support.length > 0 ||
        me.account_status !== "active") && (
        <Panel title={tr("Требует внимания")}>
          <div className="space-y-3">
            {!data.email_confirmed && (
              <button
                className="profile-link block"
                onClick={() => go("personal")}
              >
                {tr("Подтвердите email")}
              </button>
            )}

            {support.length > 0 && (
              <button className="profile-link block" onClick={() => go("help")}>
                {tr("Поддержка ждёт ответа: ")}
                {support.length}
              </button>
            )}
            {me.account_status !== "active" && (
              <button
                className="profile-link block"
                onClick={() => go("security")}
              >
                {tr("Посмотреть ограничение аккаунта")}
              </button>
            )}
          </div>
        </Panel>
      )}
      <Panel
        title={tr("Ваш профиль")}
        subtitle={tr(
          "Дополнительные сведения помогают найти команду. Фото и описание необязательны.",
        )}
        action={
          <span className="workspace-tag">
            {completed}
            {tr(" из ")}
            {checks.length}
          </span>
        }
      >
        <progress
          className="mb-5 h-2 w-full accent-brand"
          value={completed}
          max={checks.length}
          aria-label={tr("Заполнение профиля")}
        />
        <div className="profile-checklist">
          {checks.map((c) => (
            <button
              key={c.label}
              className="flex items-center justify-between rounded-xl border border-[#30393c] p-3 text-left text-sm"
              onClick={() => go(c.tab)}
            >
              <span>{tr(c.label)}</span>
              {c.done ? (
                <Check size={16} className="text-[#9ed9a2]" />
              ) : (
                <ArrowRight size={16} />
              )}
            </button>
          ))}
        </div>
      </Panel>
      <div className="flex flex-wrap gap-3">
        <Link to="/my-games" className="workspace-primary-link">
          {tr("Мои игры")}
        </Link>
        {(hasHost || me.roles.includes("admin")) && (
          <Link to="/host" className="workspace-text-link">
            {tr("Кабинет организатора →")}
          </Link>
        )}
        {(me.roles.includes("admin") || me.roles.includes("moderator")) && (
          <Link to="/admin" className="workspace-text-link">
            {tr("Администрирование →")}
          </Link>
        )}
      </div>
    </>
  );
}
