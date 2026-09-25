import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Star, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import { getOrganizerProfile } from "@/lib/organizer.functions";
import { ACTIVITY_TYPE_LABEL, timeLabel } from "@/lib/sportura";

const orgQuery = (id: string) =>
  queryOptions({ queryKey: ["organizer", id], queryFn: () => getOrganizerProfile({ data: { id } }) });

export const Route = createFileRoute("/organizer/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(orgQuery(params.id)),
  head: ({ loaderData }) => {
    const name = loaderData?.profile.name ?? "Организатор";
    return {
      meta: [
        { title: `${name} — организатор Sportura` },
        { name: "description", content: `Игры, турниры и отзывы об организаторе ${name}.` },
        { property: "og:title", content: `${name} — организатор Sportura` },
        { property: "og:description", content: `Сколько игр провёл ${name} и что говорят игроки.` },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: ({ error }) => (
    <AppShell title="Ошибка">
      <p className="panel-frost rounded-2xl p-5 text-sm text-destructive">{error.message}</p>
    </AppShell>
  ),
  notFoundComponent: () => <AppShell title="Не найдено">{null}</AppShell>,
  component: OrganizerPage,
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel-frost-2 rounded-2xl p-3 text-center">
      <div className="font-display text-2xl">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function OrganizerPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(orgQuery(id));
  if (!data) {
    return (
      <AppShell title="Организатор не найден">
        <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">Такого профиля нет.</p>
      </AppShell>
    );
  }
  const { profile, stats, upcoming, reviews } = data;
  return (
    <AppShell title={profile.name} subtitle="Организатор">
      <section className="panel-frost space-y-4 rounded-3xl p-5">
        <div className="flex items-center gap-2 text-sm">
          {profile.rating ? (
            <span className="flex items-center gap-1 text-accent">
              <Star className="size-4 fill-accent" /> {Number(profile.rating).toFixed(1)}
              <span className="text-xs text-muted-foreground">({profile.rating_count} отзывов)</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">пока без оценок</span>
          )}
          {profile.verified ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <ShieldCheck className="size-3.5" /> подтверждён
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Игр" value={stats.games} />
          <Stat label="Турниров и лиг" value={stats.competitions} />
          <Stat label="Проведено" value={stats.completed} />
          <Stat label="Отменено" value={stats.cancelled} />
          <Stat label="Игроков записалось" value={stats.players} />
          <Stat label="На платформе с" value={new Date(profile.created_at).getFullYear()} />
        </div>
      </section>

      <section className="panel-frost mt-4 rounded-3xl p-5">
        <h2 className="text-sm font-semibold">Ближайшие события</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Сейчас нет открытых событий.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link to="/activity/$id" params={{ id: a.id }} className="press panel-frost-2 block rounded-2xl p-3">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ACTIVITY_TYPE_LABEL[a.type]} · {timeLabel(a)} · {a.registered_count}/{a.max_participants}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-frost mt-4 rounded-3xl p-5">
        <h2 className="text-sm font-semibold">Отзывы</h2>
        {reviews.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Отзывов пока нет.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="border-b border-border/40 pb-2 last:border-0">
                <p className="flex items-center gap-1 text-xs">
                  <Star className="size-3 fill-accent text-accent" /> {r.rating} · {r.reviewer} ·{" "}
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ru-RU")}</span>
                </p>
                {r.comment ? <p className="mt-1 text-sm">{r.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
