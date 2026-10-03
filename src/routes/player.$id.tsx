import { useI18n } from "@/lib/i18n";
import { SportsProgress } from "@/components/profile/progress";
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
  errorComponent: function LocalizedRouteState() {
    const { tr, language } = useI18n();
    return (
      <AppShell title={tr("Профиль игрока")}>
        <Empty title={tr("Профиль недоступен")}>
          <Link to="/">{tr("Вернуться в ленту")}</Link>
        </Empty>
      </AppShell>
    );
  },
});
function Player() {
  const { tr, language } = useI18n();
  const { id } = Route.useParams();
  const { data: p } = useSuspenseQuery(query(id));
  return (
    <AppShell
      title={tr("Профиль игрока")}
      subtitle={tr("Публичная информация Sportura")}
    >
      {p ? (
        <Panel
          title={tr(p.name)}
          subtitle={tr(
            `${p.city} · На Sportura с ${dateLabel(p.created_at, false, language)}`,
          )}
        >
          {tr(
            p.avatar_url && (
              <img
                src={p.avatar_url}
                alt={tr(p.name)}
                className="mb-5 size-20 rounded-2xl object-cover"
              />
            ),
          )}
          <div className="flex flex-wrap gap-2">
            {p.sports.map((s) => (
              <span className="workspace-tag" key={s}>
                {tr(s)}
              </span>
            ))}
          </div>
          {tr(
            p.bio && (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">
                {tr(p.bio)}
              </p>
            ),
          )}
          {p.rating_count !== null && (
            <p className="mt-5 text-sm">
              ★ {tr(p.rating?.toFixed(1) ?? "Пока без оценок")} ·{" "}
              {p.rating_count}
              {tr(" ")}
              {tr("отзывов")}
            </p>
          )}
          <SportsProgress data={p.progress} />
          <p className="workspace-muted mt-6 text-xs">
            {tr("Контактные данные не публикуются.")}
          </p>
        </Panel>
      ) : (
        <Empty title={tr("Профиль не найден")} />
      )}
    </AppShell>
  );
}
