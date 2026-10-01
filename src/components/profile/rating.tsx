import { SportsProgress } from "./progress";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import {
  type ProfileWorkspace,
  cancellationLabel,
  reviewAverage,
} from "@/lib/profile-model";
import { Panel, Empty, dateLabel } from "./shared";
import type { TicketDraft } from "./support";
export function RatingTab({
  data,
  report,
}: {
  data: ProfileWorkspace;
  report: (draft: TicketDraft) => void;
}) {
  const [asHost, setAsHost] = useState(false);
  const [sport, setSport] = useState("all");
  const [sort, setSort] = useState("new");
  const [history, setHistory] = useState("all");
  const roleReviews = data.reviews.filter((r) => Boolean(r.as_host) === asHost);
  const average = reviewAverage(roleReviews);
  const reviews = roleReviews
    .filter((r) => sport === "all" || r.sport === sport)
    .sort((a, b) =>
      sort === "high"
        ? b.rating - a.rating
        : sort === "low"
          ? a.rating - b.rating
          : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const statuses: Record<string, string> = {
    registered: "Записан",
    attended: "Посетил",
    no_show: "Неявка",
    cancelled: "Отменил",
    rejected: "Запись отклонена",
  };
  return (
    <>
      <SportsProgress data={data.progress} />
      <Panel
        title="Рейтинг и отзывы"
        subtitle="Оценки участников реальных событий. Рейтинг — среднее арифметическое опубликованных оценок от 1 до 5."
      >
        <div className="profile-tabs-row">
          <button
            className={`feed-chip ${!asHost ? "is-active" : ""}`}
            onClick={() => setAsHost(false)}
          >
            Как игрок
          </button>
          {data.host_stats.total > 0 && (
            <button
              className={`feed-chip ${asHost ? "is-active" : ""}`}
              onClick={() => setAsHost(true)}
            >
              Как организатор
            </button>
          )}
        </div>
        <div className="mb-6 flex items-center gap-3">
          <Star size={28} className="text-brand" />
          <strong className="font-display text-3xl">
            {average?.toFixed(1) ?? "—"}
          </strong>
          <span className="workspace-muted text-sm">
            {roleReviews.length} отзывов
          </span>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <label>
            Спорт
            <select value={sport} onChange={(e) => setSport(e.target.value)}>
              <option value="all">Все виды спорта</option>
              {[...new Set(data.reviews.map((r) => r.sport))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Сортировка
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="new">Сначала новые</option>
              <option value="high">С высокой оценкой</option>
              <option value="low">С низкой оценкой</option>
            </select>
          </label>
        </div>
        {reviews.length ? (
          reviews.map((r) => (
            <article className="profile-item" key={r.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="text-sm">{r.reviewer}</strong>
                <span className="text-sm text-brand">★ {r.rating}/5</span>
              </div>
              <Link
                to="/activity/$id"
                params={{ id: r.activity_id }}
                className="profile-link mt-2 inline-block"
              >
                {r.activity_title}
              </Link>
              <p className="workspace-muted mt-1 text-xs">
                {dateLabel(r.created_at)} · {r.sport}
              </p>
              {r.comment && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                  {r.comment}
                </p>
              )}
              <button
                className="workspace-muted mt-3 text-xs underline"
                onClick={() =>
                  report({
                    topic: "review",
                    subject: `Жалоба на отзыв: ${r.activity_title}`.slice(
                      0,
                      120,
                    ),
                    review_id: r.id,
                  })
                }
              >
                Пожаловаться на отзыв
              </button>
            </article>
          ))
        ) : (
          <Empty
            title={
              roleReviews.length
                ? "Нет отзывов по этому фильтру"
                : "Отзывов пока нет"
            }
          >
            Оценка появится после участия в событиях.
          </Empty>
        )}
      </Panel>
      {asHost && (
        <Panel title="Опыт организатора">
          <div className="profile-stats">
            {[
              ["Проведено", data.host_stats.completed],
              ["Отменено", data.host_stats.cancelled],
              ["Записей участников", data.host_stats.participants],
            ].map(([label, value]) => (
              <div className="workspace-stat" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel
        title="История участия"
        subtitle="Посещаемость отмечает организатор. Своевременная отмена — за 3 часа и более до начала. Для старых записей дата отмены могла не сохраняться."
      >
        <select
          aria-label="Статус участия"
          value={history}
          onChange={(e) => setHistory(e.target.value)}
        >
          <option value="all">Все записи</option>
          {Object.entries(statuses).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        {data.registrations
          .filter((r) => history === "all" || r.status === history)
          .map((r) => (
            <div className="profile-item" key={r.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="text-sm">
                  {r.activity?.title ?? "Событие удалено"}
                </strong>
                <span className="workspace-tag">
                  {statuses[r.status] ?? r.status}
                </span>
              </div>
              <p className="workspace-muted mt-2 text-xs">
                {dateLabel(r.activity?.date_time ?? null, true)}
                {r.status === "cancelled" ? ` · ${cancellationLabel(r)}` : ""}
              </p>
              {["no_show", "attended", "cancelled"].includes(r.status) && (
                <button
                  className="profile-link mt-3"
                  onClick={() =>
                    report({
                      topic: "attendance",
                      subject:
                        `Посещаемость: ${r.activity?.title ?? "событие"}`.slice(
                          0,
                          120,
                        ),
                      registration_id: r.id,
                    })
                  }
                >
                  Оспорить отметку
                </button>
              )}
            </div>
          ))}
        {!data.registrations.filter(
          (r) => history === "all" || r.status === history,
        ).length && <Empty title="Нет записей по этому фильтру" />}
        <p className="workspace-muted mt-5 text-xs">
          Отзывы и посещаемость — разные показатели. Текущая формула надёжности:
          максимум из 0 и (5 − 1,5 × неявки − 0,4 × отмены). Спор не считается
          доказанным нарушением; его решение можно увидеть в «Помощь → Мои
          обращения».
        </p>
      </Panel>
    </>
  );
}
