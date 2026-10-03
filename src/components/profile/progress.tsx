import { useI18n } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import type { PlayerProgress } from "@/lib/profile-model";
const rankLabels: Record<string, string> = {
  Rookie: "Новичок",
  Contender: "Претендент",
  Pro: "Профессионал",
  Elite: "Элита",
  Legend: "Легенда",
};
export function SportsProgress({
  data,
}: {
  data: PlayerProgress | null | undefined;
}) {
  const { tr } = useI18n();
  if (!data) return null;
  return (
    <section className="space-y-4 mb-6" aria-label={tr("Спортивный рейтинг")}>
      <div>
        <h3 className="font-bold text-lg">{tr("Спортивный рейтинг")}</h3>
        <p className="workspace-muted text-sm">
          {tr("Сезон ")}
          {tr(data.season)}
        </p>
      </div>
      <div className="event-grid">
        {data.ratings.map((r) => (
          <article className="event-muted-box" key={r.discipline}>
            <p>{tr(r.sport)}</p>
            <strong className="text-2xl">{r.rating}</strong>
            <span className="workspace-tag ml-3">
              {tr(rankLabels[r.rank] ?? r.rank)}
            </span>
            <p className="workspace-muted text-sm">
              {tr("Матчей: ")}
              {r.matches}
              {tr(" · Побед: ")}
              {r.wins}
            </p>
          </article>
        ))}
      </div>
      {!data.ratings.length && (
        <p className="workspace-muted text-sm">
          {tr(
            "Первые очки появятся после завершённого турнира и закрытия окна споров.",
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {data.badges.map((b) => (
          <span className="workspace-tag is-success" key={b.id}>
            {tr(b.name)}
          </span>
        ))}
      </div>
      <p className="text-sm">
        {tr("Надёжность:")}
        {tr(" ")}
        {tr(
          data.reliability == null
            ? "пока нет данных"
            : `${data.reliability}/5`,
        )}
        {tr(" ")}
        {tr("· Побед в турнирах: ")}
        {data.tournament_wins}
      </p>
      {!!data.matches?.length && (
        <details className="event-muted-box">
          <summary>{tr("Последние матчи")}</summary>
          {data.matches.map((m, i) => (
            <div key={`${m.activity_id}:${i}`} className="event-line py-3">
              <Link
                to="/activity/$id"
                params={{ id: m.activity_id }}
                className="profile-link"
              >
                {tr(m.title)}
                {tr(" · раунд ")}
                {m.round}
              </Link>
              <p className="text-sm">
                {tr(m.home_name)} — {tr(m.away_name)}: {m.home_score}:
                {m.away_score}
              </p>
            </div>
          ))}
        </details>
      )}
      <details className="workspace-muted text-xs">
        <summary>{tr("Как считается рейтинг")}</summary>
        <p className="mt-2 leading-relaxed">
          {tr(
            "Старт — 1000 очков, формула Elo с коэффициентом 32. Учитываются матчи публичных завершённых соревнований без открытых споров. В командных соревнованиях очки получает капитан. В начале квартала отклонение от 1000 уменьшается вдвое. Новичок: до 1100, Претендент: от 1100, Профессионал: от 1300, Элита: от 1600, Легенда: от 1900. Количество матчей и побед показано за всё время.",
          )}
        </p>
      </details>
    </section>
  );
}
