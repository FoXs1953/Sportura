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
  errorComponent: () => (
    <AppShell workspace title="Организатор">
      <div className="workspace-panel workspace-empty" role="alert">
        <h2>Не удалось открыть профиль</h2>
        <p>Попробуйте обновить страницу или вернитесь к списку игр.</p>
        <Link to="/" className="workspace-primary-link">
          Вернуться к играм
        </Link>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell workspace title="Организатор">
      <div className="workspace-panel workspace-empty">
        <h2>Профиль не найден</h2>
        <Link to="/" className="workspace-primary-link">
          Вернуться к играм
        </Link>
      </div>
    </AppShell>
  ),
  component: OrganizerPage,
});

function OrganizerPage() {
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
      <AppShell workspace title="Организатор">
        <div className="workspace-panel workspace-empty">
          <h2>Профиль не найден</h2>
          <Link to="/" className="workspace-primary-link">
            Вернуться к играм
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
      title="Организатор"
      subtitle="Игры, опыт и отзывы сообщества"
    >
      <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="workspace-panel overflow-hidden">
            <div className="h-28 w-full overflow-hidden">
              <img
                src={sportImage(upcoming[0]?.sport ?? "Футбол")}
                alt=""
                width={640}
                height={280}
                className="size-full object-cover"
              />
            </div>
            <div className="relative px-5 pb-6">
              <div className="-mt-10 grid size-20 place-items-center overflow-hidden rounded-[18px] border-4 border-[#1b2123] bg-[#30393c]">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={profile.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="font-display text-2xl">
                    {initials || "S"}
                  </span>
                )}
              </div>
              <h2 className="workspace-section-title mt-4 text-xl">
                {profile.name}
              </h2>
              <p className="workspace-muted mt-1 flex items-center gap-1 text-xs">
                <MapPin size={14} aria-hidden="true" />
                {profile.city || "Казахстан"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.verified && (
                  <span className="workspace-tag is-success">
                    <ShieldCheck size={14} /> Роль одобрена
                  </span>
                )}
                <span className="workspace-tag">
                  На Sportura с {new Date(profile.created_at).getFullYear()}{" "}
                  года
                </span>
              </div>
              {profile.contact &&
                /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}$/.test(
                  profile.contact,
                ) && (
                  <a
                    className="profile-link inline-block mt-3"
                    href={profile.contact}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Связаться с организатором ↗
                  </a>
                )}
              {profile.bio && (
                <p className="mt-4 whitespace-pre-wrap text-sm">
                  {profile.bio}
                </p>
              )}
              {data.statsVisible && (
                <div className="mt-5 flex items-center gap-2 border-t border-[#30393c] pt-4">
                  <Star
                    size={19}
                    className="text-[#ffb38f]"
                    fill={profile.rating ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                  <strong className="font-display text-xl">
                    {profile.rating ? Number(profile.rating).toFixed(1) : "—"}
                  </strong>
                  <span className="workspace-muted text-xs">
                    {profile.rating_count
                      ? `${profile.rating_count} отзывов`
                      : "Пока без оценок"}
                  </span>
                </div>
              )}
            </div>
          </section>
          {data.statsVisible && (
            <div className="workspace-stats">
              <div className="workspace-stat">
                <strong>{stats.games}</strong>
                <span>Игр создано</span>
              </div>
              <div className="workspace-stat">
                <strong>{stats.competitions}</strong>
                <span>Турниров и лиг</span>
              </div>
              <div className="workspace-stat">
                <strong>{stats.players}</strong>
                <span>Записей игроков</span>
              </div>
              <div className="workspace-stat">
                <strong>{stats.completed}</strong>
                <span>Проведено</span>
              </div>
              <div className="workspace-stat">
                <strong>{stats.cancelled}</strong>
                <span>Отменено</span>
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
                <p className="workspace-overline">Календарь</p>
                <h2
                  id="upcoming-title"
                  className="workspace-section-title mt-2"
                >
                  Ближайшие события
                </h2>
              </div>
              <span className="workspace-tag">{upcoming.length} открыто</span>
            </div>
            {upcoming.length === 0 ? (
              <div className="workspace-empty rounded-xl border border-dashed border-[#455054]">
                <div className="workspace-empty-icon">
                  <CalendarDays size={23} />
                </div>
                <h3>Открытых событий пока нет</h3>
                <p>Новые игры организатора появятся здесь.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#30393c]">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/activity/$id"
                      params={{ id: a.id }}
                      className="group flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <span className="workspace-tag is-accent">
                          {ACTIVITY_TYPE_LABEL[a.type]}
                        </span>
                        <h3 className="mt-2 text-sm font-bold group-hover:text-[#ff9164]">
                          {a.title}
                        </h3>
                        <p className="workspace-muted mt-1 text-xs">
                          {timeLabel(a) || "Время уточняется"} ·{" "}
                          {a.registered_count}/{a.max_participants} участников
                        </p>
                      </div>
                      <ArrowRight
                        size={18}
                        className="shrink-0 text-[#ff9164] transition-transform group-hover:translate-x-1"
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
                  <p className="workspace-overline">Сообщество</p>
                  <h2
                    id="reviews-title"
                    className="workspace-section-title mt-2"
                  >
                    Отзывы игроков
                  </h2>
                </div>
                <span className="workspace-tag">
                  <UsersRound size={13} /> {reviews.length}
                </span>
              </div>
              {reviews.length === 0 ? (
                <div className="workspace-empty rounded-xl border border-dashed border-[#455054]">
                  <div className="workspace-empty-icon">
                    <Star size={23} />
                  </div>
                  <h3>Отзывов пока нет</h3>
                  <p>
                    После проведённых игр участники смогут оставить свою оценку.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#30393c]">
                  {reviews.map((review) => (
                    <li key={review.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid size-8 place-items-center rounded-lg bg-[#30393c] text-xs font-bold">
                            {(review.reviewer || "У").slice(0, 1).toUpperCase()}
                          </span>
                          <strong className="text-xs">
                            {review.reviewer || "Участник"}
                          </strong>
                        </div>
                        <time
                          className="workspace-muted text-[11px]"
                          dateTime={review.created_at}
                        >
                          {new Date(review.created_at).toLocaleDateString(
                            "ru-RU",
                          )}
                        </time>
                      </div>
                      <div
                        className="mt-2 flex gap-0.5 text-[#ffb38f]"
                        aria-label={`Оценка ${review.rating} из 5`}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            size={13}
                            fill={n <= review.rating ? "currentColor" : "none"}
                          />
                        ))}
                      </div>
                      {review.comment && (
                        <p className="mt-2 text-sm leading-relaxed text-[#d6ddde]">
                          {review.comment}
                        </p>
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
