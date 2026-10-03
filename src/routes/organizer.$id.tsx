import { formatDate, useI18n } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  ShieldCheck,
  Star,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import { getOrganizerProfile } from "@/lib/organizer.functions";
import { signedAvatarUrl } from "@/lib/storage";
import { ACTIVITY_TYPE_LABEL, sportImage, timeLabel } from "@/lib/sportura";
const orgQuery = (id: string) =>
  queryOptions({
    queryKey: ["organizer", id],
    queryFn: () => getOrganizerProfile({ data: { id } }),
  });
export const Route = createFileRoute("/organizer/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(orgQuery(params.id)),
  head: ({ loaderData }) => {
    const name = loaderData?.profile.name ?? "Организатор";
    return {
      meta: [
        { title: `${name} — организатор Sportura` },
        {
          name: "description",
          content: `Игры, турниры и отзывы об организаторе ${name}.`,
        },
        { property: "og:title", content: `${name} — организатор Sportura` },
        {
          property: "og:description",
          content: `Сколько игр провёл ${name} и что говорят игроки.`,
        },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: function LocalizedRouteState() {
    const { tr, language } = useI18n();
    return (
      <AppShell workspace title={tr("Организатор")}>
        <div className="workspace-panel workspace-empty" role="alert">
          <h2>{tr("Не удалось открыть профиль")}</h2>
          <p>
            {tr("Попробуйте обновить страницу или вернитесь к списку игр.")}
          </p>
          <Link to="/" className="workspace-primary-link">
            {tr("Вернуться к играм")}
          </Link>
        </div>
      </AppShell>
    );
  },
  notFoundComponent: function LocalizedRouteState() {
    const { tr, language } = useI18n();
    return (
      <AppShell workspace title={tr("Организатор")}>
        <div className="workspace-panel workspace-empty">
          <h2>{tr("Профиль не найден")}</h2>
          <Link to="/" className="workspace-primary-link">
            {tr("Вернуться к играм")}
          </Link>
        </div>
      </AppShell>
    );
  },
  component: OrganizerPage,
});
function OrganizerPage() {
  const { tr, language } = useI18n();
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(orgQuery(id));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data?.profile.avatar_url) {
      setAvatarUrl(null);
      return;
    }
    let active = true;
    void signedAvatarUrl(data.profile.avatar_url)
      .then((url) => {
        if (active) setAvatarUrl(url);
      })
      .catch(() => {
        if (active) setAvatarUrl(null);
      });
    return () => {
      active = false;
    };
  }, [data?.profile.avatar_url]);
  if (!data)
    return (
      <AppShell workspace title={tr("Организатор")}>
        <div className="workspace-panel workspace-empty">
          <h2>{tr("Профиль не найден")}</h2>
          <Link to="/" className="workspace-primary-link">
            {tr("Вернуться к играм")}
          </Link>
        </div>
      </AppShell>
    );
  const { profile, stats, upcoming, reviews } = data;
  const initials = profile.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <AppShell
      workspace
      title={tr("Организатор")}
      subtitle={tr("Игры, опыт и отзывы сообщества")}
    >
      <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="workspace-panel overflow-hidden">
            <div className="h-28 w-full overflow-hidden">
              <img
                src={sportImage(upcoming[0]?.sport ?? "Футбол")}
                alt={tr("")}
                width={640}
                height={280}
                className="size-full object-cover"
              />
            </div>
            <div className="relative px-5 pb-6">
              <div className="-mt-10 grid size-20 place-items-center overflow-hidden rounded-[18px] border-4 border-card bg-muted">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={tr(profile.name)}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="font-display text-2xl">
                    {tr(initials || "S")}
                  </span>
                )}
              </div>
              <h2 className="workspace-section-title mt-4 text-xl">
                {tr(profile.name)}
              </h2>
              <p className="workspace-muted mt-1 flex items-center gap-1 text-xs">
                <MapPin size={14} aria-hidden="true" />
                {tr(profile.city || "Казахстан")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.verified && (
                  <span className="workspace-tag is-success">
                    <ShieldCheck size={14} />
                    {tr(" Роль одобрена")}
                  </span>
                )}
                <span className="workspace-tag">
                  {tr("На Sportura с {year} года", {
                    year: new Date(profile.created_at).getFullYear(),
                  })}
                </span>
              </div>
              {tr(
                profile.contact &&
                  /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}$/.test(
                    profile.contact,
                  ) && (
                    <a
                      className="profile-link inline-block mt-3"
                      href={profile.contact}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {tr("Связаться с организатором ↗")}
                    </a>
                  ),
              )}
              {tr(
                profile.bio && (
                  <p className="mt-4 whitespace-pre-wrap text-sm">
                    {tr(profile.bio)}
                  </p>
                ),
              )}
              {data.statsVisible && (
                <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                  <Star
                    size={19}
                    className="text-brand"
                    fill={profile.rating ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                  <strong className="font-display text-xl">
                    {tr(
                      profile.rating ? Number(profile.rating).toFixed(1) : "—",
                    )}
                  </strong>
                  <span className="workspace-muted text-xs">
                    {tr(
                      profile.rating_count
                        ? `${profile.rating_count} отзывов`
                        : "Пока без оценок",
                    )}
                  </span>
                </div>
              )}
            </div>
          </section>
          {data.statsVisible && (
            <div className="workspace-stats">
              <div className="workspace-stat">
                <strong>{stats.games}</strong>
                <span>{tr("Игр создано")}</span>
              </div>
              <div className="workspace-stat">
                <strong>{stats.competitions}</strong>
                <span>{tr("Турниров и лиг")}</span>
              </div>
              <div className="workspace-stat">
                <strong>{stats.players}</strong>
                <span>{tr("Записей игроков")}</span>
              </div>
              <div className="workspace-stat">
                <strong>{stats.completed}</strong>
                <span>{tr("Проведено")}</span>
              </div>
              <div className="workspace-stat">
                <strong>{stats.cancelled}</strong>
                <span>{tr("Отменено")}</span>
              </div>
            </div>
          )}
        </aside>
        <div className="space-y-5">
          <section
            className="workspace-panel p-5 sm:p-7"
            aria-labelledby="upcoming-title"
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="workspace-overline">{tr("Календарь")}</p>
                <h2
                  id="upcoming-title"
                  className="workspace-section-title mt-2"
                >
                  {tr("Ближайшие события")}
                </h2>
              </div>
              <span className="workspace-tag">
                {upcoming.length}
                {tr(" открыто")}
              </span>
            </div>
            {upcoming.length === 0 ? (
              <div className="workspace-empty rounded-xl border border-dashed border-border">
                <div className="workspace-empty-icon">
                  <CalendarDays size={23} />
                </div>
                <h3>{tr("Открытых событий пока нет")}</h3>
                <p>{tr("Новые игры организатора появятся здесь.")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/activity/$id"
                      params={{ id: a.id }}
                      className="group flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <span className="workspace-tag is-accent">
                          {tr(ACTIVITY_TYPE_LABEL[a.type])}
                        </span>
                        <h3 className="mt-2 text-sm font-bold group-hover:text-brand">
                          {tr(a.title)}
                        </h3>
                        <p className="workspace-muted mt-1 text-xs">
                          {tr(timeLabel(a, language) || "Время уточняется")} ·
                          {tr(" ")}
                          {a.registered_count}/{a.max_participants}
                          {tr(" участников")}
                        </p>
                      </div>
                      <ArrowRight
                        size={18}
                        className="shrink-0 text-brand transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {data.statsVisible && (
            <section
              className="workspace-panel p-5 sm:p-7"
              aria-labelledby="reviews-title"
            >
              <div className="mb-5 flex items-end justify-between gap-3">
                <div>
                  <p className="workspace-overline">{tr("Сообщество")}</p>
                  <h2
                    id="reviews-title"
                    className="workspace-section-title mt-2"
                  >
                    {tr("Отзывы игроков")}
                  </h2>
                </div>
                <span className="workspace-tag">
                  <UsersRound size={13} /> {reviews.length}
                </span>
              </div>
              {reviews.length === 0 ? (
                <div className="workspace-empty rounded-xl border border-dashed border-border">
                  <div className="workspace-empty-icon">
                    <Star size={23} />
                  </div>
                  <h3>{tr("Отзывов пока нет")}</h3>
                  <p>
                    {tr(
                      "После проведённых игр участники смогут оставить свою оценку.",
                    )}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {reviews.map((review) => (
                    <li key={review.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid size-8 place-items-center rounded-lg bg-muted text-xs font-bold">
                            {tr(
                              (review.reviewer || "У")
                                .slice(0, 1)
                                .toUpperCase(),
                            )}
                          </span>
                          <strong className="text-xs">
                            {tr(review.reviewer || "Участник")}
                          </strong>
                        </div>
                        <time
                          className="workspace-muted text-[11px]"
                          dateTime={review.created_at}
                        >
                          {formatDate(
                            review.created_at,
                            { day: "numeric", month: "long", year: "numeric" },
                            language,
                          )}
                        </time>
                      </div>
                      <div
                        className="mt-2 flex gap-0.5 text-brand"
                        aria-label={tr(`Оценка ${review.rating} из 5`)}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            size={13}
                            fill={n <= review.rating ? "currentColor" : "none"}
                          />
                        ))}
                      </div>
                      {tr(
                        review.comment && (
                          <p className="mt-2 text-sm leading-relaxed text-foreground">
                            {tr(review.comment)}
                          </p>
                        ),
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
