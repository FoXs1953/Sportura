import type { EventExtras } from "./event-series";
import type { CompetitionFormat } from "./competition-formats";
import type { PublicActivity } from "./activities.functions";
import type { PaymentStatus, RegistrationStatus } from "./sportura";
export type Event = PublicActivity & {
  event_extras?: EventExtras;
  match_settings?: Record<string, string>;
  tier?: "spark" | "blitz" | "marathon" | null;
  competition_format?: CompetitionFormat;
  min_participants?: number;
  team_min?: number;
  team_max?: number;
  discipline_id?: string | null;

  cover_url: string | null;
  commission_percent: number;
  duration_minutes: number | null;
  district: string;
  venue_type: string;
  participation_mode: "individual" | "team";
  rules: string;
  cancellation_reason: string | null;
  host_rating_count?: number;
  host_approved?: boolean;
  saved?: boolean;
  win_points: number;
  draw_points: number;
};
export type EventHistory = {
  actor_name?: string | null;
  id: string;
  activity_id: string;
  registration_id: string | null;
  action: string;
  detail: Record<string, string | number | boolean | null>;
  created_at: string;
};
export type Refund = {
  id: string;
  registration_id: string;
  user_id: string;
  amount: number | null;
  reason: string;
  status: string;
  response: string;
  reference: string;
  created_at: string;
};
export type EventReview = {
  id: string;
  activity_id: string;
  rating: number;
  comment: string | null;
  author?: string;
  reply: string | null;
  created_at: string;
};
export type Registration = {
  checked_in_at?: string | null;
  game_nickname?: string;
  id: string;
  activity_id: string;
  user_id: string;
  status: RegistrationStatus;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  receipt_url: string | null;
  participant_note: string | null;
  payment_note: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  amount_due: number | null;
  terms_snapshot: {
    price: number | null;
    cancellation_policy: string | null;
    date_time: string | null;
    location_text: string;
    kaspi_payment_link?: string;
    participation_mode?: string;
  } | null;
  team_name: string;
  team_members: string[];
  name?: string;
  phone?: string | null;
  avatar_url?: string | null;
  activity: Event;
  refund?: Refund | null;
  review?: EventReview | null;
  proofs?: {
    id: string;
    receipt_url: string | null;
    payment_reference: string;
    note: string;
    created_at: string;
  }[];
  history?: EventHistory[];
};
export type HostDocument = {
  id: string;
  kind: "draft" | "template" | "venue" | "defaults";
  name: string;
  data: EventDraft;
  activity_id: string | null;
  published_id: string | null;
  updated_at: string;
};
export type EventDraft = {
  event_extras?: EventExtras;
  prize_pool?: Record<string, number>;
  match_settings?: Record<string, string>;
  tier?: "spark" | "blitz" | "marathon" | null;
  competition_format?: CompetitionFormat;
  min_participants?: number;
  team_min?: number;
  team_max?: number;
  discipline_id?: string | null;

  cover_url: string;
  title: string;
  type: "daily_game" | "tournament" | "league";
  sport: string;
  city: string;
  district: string;
  location_text: string;
  two_gis_url: string;
  date_time: string;
  duration_minutes: number;
  registration_deadline: string;
  entry_fee: number;
  max_participants: number;
  skill_level: string;
  description: string;
  cancellation_policy: string;
  notes: string;
  rules: string;
  venue_type: string;
  kaspi_payment_link: string;
  participation_mode: "individual" | "team";
  is_private: boolean;
};
export type Match = {
  stage?: string;
  group_number?: number | null;
  id: string;
  activity_id: string;
  round: number;
  position: number;
  home_id: string;
  away_id: string;
  starts_at: string | null;
  duration_minutes: number;
  location: string;
  home_score: number | null;
  away_score: number | null;
  winner_id: string | null;
  home_name?: string;
  away_name?: string;
};
export type Standing = {
  group_number?: number | null;
  buchholz?: number;
  registration_id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  difference: number;
  points: number;
};
export type CompetitionData = {
  item_prizes?: {
    id: string;
    name: string;
    sponsor: string;
    registration_id: string | null;
    recipient: string | null;
    delivered_at: string | null;
  }[];
  byes?: {
    registration_id: string;
    round: number;
    name: string;
    points: number;
  }[];
  waitlist_count?: number;
  activity: Event;
  matches: Match[];
  standings: Standing[];
  results: {
    id: string;
    participant_name: string;
    placement: number;
    prize_amount: number | null;
    paid_out: boolean;
  }[];
};
export type EventNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
};
export type WaitlistEntry = {
  offered_at?: string | null;
  offer_expires_at?: string | null;
  id: string;
  activity_id: string;
  user_id: string;
  created_at: string;
  team_name: string;
  team_members: string[];
  position: number;
  name?: string;
  activity?: Event;
};
export type PlayerWorkspace = {
  waitlist?: WaitlistEntry[];
  registrations: Registration[];
  saved: { activity_id: string; reminder: boolean }[];
  notifications: EventNotification[];
};
export type HostWorkspace = {
  checkin_closures?: string[];
  replaced_registrations?: string[];
  waitlist?: WaitlistEntry[];
  activities: Event[];
  registrations: Registration[];
  documents: HostDocument[];
  refunds: Refund[];
  reviews: EventReview[];
  history: EventHistory[];
  matches: Match[];
  notifications: EventNotification[];
};
export const refundLabels: Record<string, string> = {
  requested: "Запрошен",
  in_progress: "Рассматривается",
  approved: "Одобрен",
  completed: "Выполнен",
  rejected: "Отказано",
};
export function eventEnd(a: Pick<Event, "date_time" | "duration_minutes">) {
  return a.date_time
    ? new Date(a.date_time).getTime() + (a.duration_minutes ?? 120) * 60000
    : null;
}
export function eventPhase(
  a: Pick<Event, "date_time" | "duration_minutes" | "status">,
  now = Date.now(),
) {
  if (a.status === "cancelled") return "cancelled";
  if (a.status === "completed") return "past";
  if (!a.date_time) return "upcoming";
  if (new Date(a.date_time).getTime() > now) return "upcoming";
  return (eventEnd(a) ?? 0) > now ? "live" : "past";
}
export function registrationOpen(
  a: Pick<
    Event,
    | "status"
    | "date_time"
    | "registration_deadline"
    | "registered_count"
    | "max_participants"
  >,
  now = Date.now(),
) {
  return (
    ["open", "nearly_full"].includes(a.status) &&
    a.registered_count < a.max_participants &&
    (!a.date_time || new Date(a.date_time).getTime() > now) &&
    (!a.registration_deadline ||
      new Date(a.registration_deadline).getTime() > now)
  );
}
export function overlaps(
  a: Pick<Event, "date_time" | "duration_minutes">,
  b: Pick<Event, "date_time" | "duration_minutes">,
) {
  if (!a.date_time || !b.date_time) return false;
  return (
    new Date(a.date_time).getTime() < (eventEnd(b) ?? 0) &&
    new Date(b.date_time).getTime() < (eventEnd(a) ?? 0)
  );
}
export function localDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 5 * 3600000).toISOString().slice(0, 16);
}
export function isoDateTime(local: string) {
  return local ? new Date(`${local}:00+05:00`).toISOString() : "";
}
export function eventDraft(a?: Partial<Event>): EventDraft {
  return {
    event_extras: a?.event_extras ?? {},
    match_settings: a?.match_settings ?? {},
    prize_pool: a?.prize_pool ?? { "1": 100 },
    tier: a?.tier ?? (Number(a?.entry_fee ?? 0) > 0 ? "blitz" : "spark"),
    competition_format:
      a?.competition_format ??
      (a?.type === "league" ? "round_robin" : "single_elimination"),
    min_participants: a?.min_participants ?? 2,
    team_min: a?.team_min ?? 1,
    team_max: a?.team_max ?? 50,
    cover_url: a?.cover_url ?? "",
    title: a?.title ?? "",
    type: a?.type ?? "daily_game",
    sport: a?.sport ?? "Футбол",
    city: a?.city ?? "Астана",
    district: a?.district ?? "",
    location_text: a?.location_text ?? "",
    two_gis_url: a?.two_gis_url ?? "",
    date_time: a?.date_time ?? "",
    duration_minutes: a?.duration_minutes ?? 120,
    registration_deadline: a?.registration_deadline ?? "",
    entry_fee: Number(a?.entry_fee ?? 0),
    max_participants: a?.max_participants ?? 14,
    skill_level: a?.skill_level ?? "Любой",
    description: a?.description ?? "",
    cancellation_policy:
      a?.cancellation_policy ??
      "Условия отмены и возврата согласно правилам Sportura.",
    notes: a?.notes ?? "",
    rules: a?.rules ?? "",
    venue_type: a?.venue_type ?? "unknown",
    kaspi_payment_link: a?.kaspi_payment_link ?? "",
    participation_mode: a?.participation_mode ?? "individual",
    is_private: a?.is_private ?? false,
  };
}
export function escapeCsv(value: unknown) {
  const raw = String(value ?? "");
  return `"${(/^[=+\-@\t\r]/.test(raw) ? "'" : "") + raw.replaceAll('"', '""')}"`;
}
