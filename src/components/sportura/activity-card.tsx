import { Link } from "@tanstack/react-router";
import { MapPin, Clock, Star } from "lucide-react";
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
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone[status]}`}>
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
        <div className={`font-display leading-none ${size === "lg" ? "text-4xl" : "text-2xl"}`}>
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

export function ActivityCard({ activity }: { activity: PublicActivity }) {
  return (
    <Link
      to="/activity/$id"
      params={{ id: activity.id }}
      className="press panel-frost block overflow-hidden rounded-3xl"
    >
      <div className="relative h-32">
        <img
          src={sportImage(activity.sport)}
          alt={activity.sport}
          className="h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-panel to-transparent" />
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold">
            {ACTIVITY_TYPE_LABEL[activity.type]}
          </span>
          <StatusBadge status={activity.status} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-base leading-snug font-semibold">{activity.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" /> {activity.location_text}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> {timeLabel(activity)}
          </p>
        </div>

        <CapacityMeter registered={activity.registered_count} max={activity.max_participants} />

        <div className="flex items-center justify-between pt-1 text-sm">
          <span className="font-semibold text-accent">{priceLabel(activity)}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {activity.host_name}
            {activity.host_rating ? (
              <>
                <Star className="size-3 fill-accent text-accent" />
                {activity.host_rating.toFixed(1)}
              </>
            ) : null}
          </span>
        </div>
      </div>
    </Link>
  );
}
