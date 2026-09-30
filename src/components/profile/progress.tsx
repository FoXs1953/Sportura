import { Link } from "@tanstack/react-router";
import type { PlayerProgress } from "@/lib/profile-model";
export function SportsProgress({
  data,
}: {
  data: PlayerProgress | null | undefined;
}) {
  if (!data) return null;
  return (
    <section className="space-y-4 mb-6" aria-label="Спортивный рейтинг">
      <div>
        <h3 className="font-bold text-lg">Спортивный рейтинг</h3>
        <p className="workspace-muted text-sm">Сезон {data.season}</p>
      </div>
      <div className="event-grid">
        {data.ratings.map((r) => (
          <article className="event-muted-box" key={r.discipline}>
            <p>{r.sport}</p>
            <strong className="text-2xl">{r.rating}</strong>
            <span className="workspace-tag ml-3">{r.rank}</span>
            <p className="workspace-muted text-sm">
              Матчей: {r.matches} · Побед: {r.wins}
            </p>
          </article>
        ))}
      </div>
      {!data.ratings.length && (
        <p className="workspace-muted text-sm">
          Первые очки появятся после завершённого турнира и закрытия окна
          споров.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {data.badges.map((b) => (
          <span className="workspace-tag is-success" key={b.id}>
            {b.name}
          </span>
        ))}
      </div>
      <p className="text-sm">
        Надёжность:{" "}
        {data.reliability == null ? "пока нет данных" : `${data.reliability}/5`}{" "}
        · Побед в турнирах: {data.tournament_wins}
      </p>
      {!!data.matches?.length && (
        <details className="event-muted-box">
          <summary>Последние матчи</summary>
          {data.matches.map((m, i) => (
            <div key={`${m.activity_id}:${i}`} className="event-line py-3">
              <Link
                to="/activity/$id"
                params={{ id: m.activity_id }}
                className="profile-link"
              >
                {m.title} · раунд {m.round}
              </Link>
              <p className="text-sm">
                {m.home_name} — {m.away_name}: {m.home_score}:{m.away_score}
              </p>
            </div>
          ))}
        </details>
      )}
      <details className="workspace-muted text-xs">
        <summary>Как считается рейтинг</summary>
        <p className="mt-2 leading-relaxed">
          Старт — 1000 очков, формула Elo с коэффициентом 32. Учитываются матчи
          публичных завершённых соревнований без открытых споров. В командных
          соревнованиях очки получает капитан. В начале квартала отклонение от
          1000 уменьшается вдвое. Rookie: до 1100, Contender: от 1100, Pro: от
          1300, Elite: от 1600, Legend: от 1900. Количество матчей и побед
          показано за всё время.
        </p>
      </details>
    </section>
  );
}
