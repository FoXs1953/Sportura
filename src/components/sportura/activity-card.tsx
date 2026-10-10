import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MapPin, Clock, Star, UsersRound } from "lucide-react";
import { isRegistrationOpen } from "@/lib/feed-filters";
import type { PublicActivity } from "@/lib/activities.functions";
import {
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_TYPE_LABEL,
  capacityPercent,
  priceLabel,
  sportImage,
  spotsLeft,
  timeLabel,
  type ActivityStatus,
} from "@/lib/sportura";
export function StatusBadge({ status }: { status: ActivityStatus }) {
  const { tr, language } = useI18n();
  return (
    <span className={`feed-status feed-status-${status}`}>
      <i aria-hidden="true" />
      {tr(ACTIVITY_STATUS_LABEL[status])}
    </span>
  );
}
export function CapacityMeter({
  registered,
  max,
  size = "md",
}: {
  registered: number;
  max: number;
  size?: "md" | "lg";
}) {
  const { tr, language } = useI18n();
  const percent = capacityPercent(registered, max);
  const left = spotsLeft(registered, max);
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <div
          className={`font-display leading-none ${size === "lg" ? "text-4xl" : "text-2xl"}`}
        >
          {registered} <span className="text-muted-foreground">/ {max}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {tr(left > 0 ? `осталось ${left}` : "мест нет")}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-2">
        <div
          className="fillbar h-full rounded-full bg-brand"
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>
    </div>
  );
}
export function ActivityCard({
  activity,
  priority = false,
  children,
}: {
  activity: PublicActivity & {
    cover_url?: string | null;
    duration_minutes?: number | null;
    participation_mode?: string;
    host_rating_count?: number;
    host_approved?: boolean;
  };
  priority?: boolean;
  children?: ReactNode;
}) {
  const { tr, language } = useI18n();
  const open = isRegistrationOpen(activity);
  const closed =
    activity.status === "cancelled" || activity.status === "completed";
  const left = spotsLeft(activity.registered_count, activity.max_participants);
  const percent = capacityPercent(
    activity.registered_count,
    activity.max_participants,
  );
  const initials = activity.host_name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const status =
    (activity.status === "open" || activity.status === "nearly_full") && !open
      ? "full"
      : activity.status;
  const placeWord = new Intl.PluralRules("ru").select(left);
  return (
    <article className={`feed-card ${closed ? "feed-card-closed" : ""}`}>
      <Link
        to="/activity/$id"
        params={{ id: activity.id }}
        className="feed-card-link"
        aria-label={tr(`Открыть событие: ${activity.title}`)}
      >
        <div className="feed-card-image">
          <img
            src={activity.cover_url || sportImage(activity.sport)}
            onError={(e) => {
              e.currentTarget.src = sportImage(activity.sport);
            }}
            alt={tr("")}
            width={640}
            height={360}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
          />
          <div className="feed-card-badges">
            <span className="feed-format">
              {tr(
                activity.tier === "spark"
                  ? "Spark"
                  : activity.tier === "blitz"
                    ? "Blitz Cup"
                    : ACTIVITY_TYPE_LABEL[activity.type],
              )}
            </span>
            <span className={`feed-status feed-status-${status}`}>
              <i aria-hidden="true" />
              {tr(
                open
                  ? "Идёт набор"
                  : activity.status === "cancelled"
                    ? "Отменено"
                    : activity.status === "completed"
                      ? "Завершено"
                      : activity.date_time &&
                          Date.parse(activity.date_time) <= Date.now()
                        ? Date.parse(activity.date_time) +
                            (activity.duration_minutes ?? 120) * 60000 >
                          Date.now()
                          ? "Идёт сейчас"
                          : "Завершилось"
                        : left === 0
                          ? "Мест нет"
                          : "Регистрация закрыта",
              )}
            </span>
          </div>
          <span className="feed-card-sport">{tr(activity.sport)}</span>
          <span className="feed-card-arrow">
            <ArrowUpRight size={18} aria-hidden="true" />
          </span>
        </div>
        <div className="feed-card-body">
          <h3>{tr(activity.title)}</h3>
          <div className="feed-card-details">
            <p className="feed-card-time">
              <Clock size={15} aria-hidden="true" />
              <span>
                {tr(timeLabel(activity, language) || "Время уточняется")}
              </span>
            </p>
            <p>
              <MapPin size={15} aria-hidden="true" />
              <span>
                {tr(activity.city)} ·{tr(" ")}
                {tr(activity.location_text || "Площадка уточняется")}
              </span>
            </p>
          </div>
          <p className="workspace-muted text-xs">
            {tr(activity.skill_level || "Любой уровень")}
            {tr(
              activity.host_approved ? " · Организатор с одобренной ролью" : "",
            )}
          </p>
          <div className="feed-card-capacity">
            <div className="feed-capacity-label">
              <span>
                <UsersRound size={14} aria-hidden="true" />
                <strong>{activity.registered_count}</strong>
                <span>
                  / {activity.max_participants}
                  {tr(" ")}
                  {tr(
                    activity.participation_mode === "team"
                      ? "команд"
                      : "участников",
                  )}
                </span>
              </span>
              <span className={open && left <= 3 ? "feed-last-spots" : ""}>
                {tr(
                  !open
                    ? "Запись закрыта"
                    : left > 0
                      ? `${left} ${placeWord === "one" ? "место" : placeWord === "few" ? "места" : "мест"}`
                      : "Мест нет",
                )}
              </span>
            </div>
            <div
              className="feed-capacity-track"
              role="meter"
              aria-label={tr("Заполненность события")}
              aria-valuemin={0}
              aria-valuemax={activity.max_participants || 1}
              aria-valuenow={Math.min(
                activity.registered_count,
                activity.max_participants || 1,
              )}
            >
              <span style={{ transform: `scaleX(${percent / 100})` }} />
            </div>
          </div>
          <div className="feed-card-footer">
            <div className="feed-host">
              <span className="feed-avatar" aria-hidden="true">
                {tr(initials || "S")}
              </span>
              <span className="feed-host-text">
                <span className="feed-host-name">
                  {tr(activity.host_name || "Организатор")}
                </span>
                <span className="feed-host-rating">
                  {tr(
                    activity.host_rating ? (
                      <>
                        <Star size={11} aria-hidden="true" />
                        {tr(activity.host_rating.toFixed(1))}
                        <span>
                          {tr(
                            activity.host_rating_count
                              ? `${activity.host_rating_count} оценок`
                              : "организатор",
                          )}
                        </span>
                      </>
                    ) : (
                      "Организатор"
                    ),
                  )}
                </span>
              </span>
            </div>
            <div
              className={`feed-card-price ${activity.is_free ? "is-free" : ""}`}
            >
              <strong>
                {tr(activity.is_free ? "Бесплатно" : priceLabel(activity))}
              </strong>
              <span>
                {tr(
                  activity.participation_mode === "team"
                    ? "за команду"
                    : activity.is_free
                      ? "за участие"
                      : "с участника",
                )}
              </span>
            </div>
          </div>
        </div>
      </Link>
      {children}
    </article>
  );
}
