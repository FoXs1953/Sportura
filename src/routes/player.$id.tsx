import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/sportura/shell";
import { getPublicPlayer } from "@/lib/profile.functions";
import { Panel, Empty, dateLabel } from "@/components/profile/shared";
const query = (id: string) =>
  queryOptions({
    queryKey: ["public-player", id],
    queryFn: () => getPublicPlayer({ data: { id } }),
  });
export const Route = createFileRoute("/player/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(query(params.id)),
  head: () => ({
    meta: [
      { title: "Профиль игрока — Sportura" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Player,
  errorComponent: () => (
    <AppShell title="Профиль игрока">
      <Empty title="Профиль недоступен">
        <Link to="/">Вернуться в ленту</Link>
      </Empty>
    </AppShell>
  ),
});
function Player() {
  const { id } = Route.useParams();
  const { data: p } = useSuspenseQuery(query(id));
  return (
    <AppShell title="Профиль игрока" subtitle="Публичная информация Sportura">
      {p ? (
        <Panel
          title={p.name}
          subtitle={`${p.city} · На Sportura с ${dateLabel(p.created_at)}`}
        >
          {p.avatar_url && (
            <img
              src={p.avatar_url}
              alt={p.name}
              className="mb-5 size-20 rounded-2xl object-cover"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {p.sports.map((s) => (
              <span className="workspace-tag" key={s}>
                {s}
              </span>
            ))}
          </div>
          {p.bio && (
            <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">
              {p.bio}
            </p>
          )}
          {p.rating_count !== null && (
            <p className="mt-5 text-sm">
              ★ {p.rating?.toFixed(1) ?? "Пока без оценок"} · {p.rating_count}{" "}
              отзывов
            </p>
          )}
          <p className="workspace-muted mt-6 text-xs">
            Контактные данные и история оплат не публикуются.
          </p>
        </Panel>
      ) : (
        <Empty title="Профиль не найден" />
      )}
    </AppShell>
  );
}
