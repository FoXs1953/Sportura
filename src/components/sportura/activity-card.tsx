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
  const tone: Record<ActivityStatus, string> = {
    open: "bg-success/15 text-success",
    nearly_full: "bg-accent/20 text-accent",
    full: "bg-brand/20 text-brand",
    completed: "bg-panel-2 text-muted-foreground",
    cancelled: "bg-destructive/20 text-destructive",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone[status]}`}
    >
      {ACTIVITY_STATUS_LABEL[status]}
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
          {left > 0 ? `осталось ${left}` : "мест нет"}
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
}: {
  activity: PublicActivity;
  priority?: boolean;
}) {
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
        aria-label={`Открыть событие: ${activity.title}`}
      >
        <div className="feed-card-image">
          <img
            src={sportImage(activity.sport)}
            alt=""
            width={640}
            height={360}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
          />
          <div className="feed-card-badges">
            <span className="feed-format">
              {ACTIVITY_TYPE_LABEL[activity.type]}
            </span>
            <span className={`feed-status feed-status-${status}`}>
              <i aria-hidden="true" />
              {open ? "Идёт набор" : ACTIVITY_STATUS_LABEL[status]}
            </span>
          </div>
          <span className="feed-card-sport">{activity.sport}</span>
          <span className="feed-card-arrow">
            <ArrowUpRight size={18} aria-hidden="true" />
          </span>
        </div>
        <div className="feed-card-body">
          <h3>{activity.title}</h3>
          <div className="feed-card-details">
            <p className="feed-card-time">
              <Clock size={15} aria-hidden="true" />
              <span>{timeLabel(activity) || "Время уточняется"}</span>
            </p>
            <p>
              <MapPin size={15} aria-hidden="true" />
              <span>{activity.location_text || "Площадка уточняется"}</span>
            </p>
          </div>
          <div className="feed-card-capacity">
            <div className="feed-capacity-label">
              <span>
                <UsersRound size={14} aria-hidden="true" />
                <strong>{activity.registered_count}</strong>
                <span>/ {activity.max_participants} участников</span>
              </span>
              <span className={open && left <= 3 ? "feed-last-spots" : ""}>
                {closed
                  ? "Запись закрыта"
                  : left > 0
                    ? `${left} ${placeWord === "one" ? "место" : placeWord === "few" ? "места" : "мест"}`
                    : "Мест нет"}
              </span>
            </div>
            <div
              className="feed-capacity-track"
              role="meter"
              aria-label="Заполненность события"
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
                {initials || "S"}
              </span>
              <span className="feed-host-text">
                <span className="feed-host-name">
                  {activity.host_name || "Организатор"}
                </span>
                <span className="feed-host-rating">
                  {activity.host_rating ? (
                    <>
                      <Star size={11} aria-hidden="true" />
                      {activity.host_rating.toFixed(1)}
                      <span>организатор</span>
                    </>
                  ) : (
                    "Организатор"
                  )}
                </span>
              </span>
            </div>
            <div
              className={`feed-card-price ${activity.is_free ? "is-free" : ""}`}
            >
              <strong>
                {activity.is_free ? "Бесплатно" : priceLabel(activity)}
              </strong>
              <span>{activity.is_free ? "за участие" : "с участника"}</span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
