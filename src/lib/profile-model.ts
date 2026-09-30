import { z } from "zod";
export const profileTabs = [
  "overview",
  "personal",
  "rating",
  "notifications",
  "security",
  "organizer",
  "help",
] as const;
export type ProfileTab = (typeof profileTabs)[number];
export const tabLabels: Record<ProfileTab, string> = {
  overview: "Обзор",
  personal: "Личные данные",
  rating: "Рейтинг и отзывы",
  notifications: "Уведомления",
  security: "Аккаунт и безопасность",
  organizer: "Роль организатора",
  help: "Помощь и документы",
};
export const levels = {
  beginner: "Начинающий",
  amateur: "Любитель",
  experienced: "Опытный",
  advanced: "Продвинутый",
};
export const positions: Record<string, string[]> = {
  Футбол: ["Любая", "Вратарь", "Защитник", "Полузащитник", "Нападающий"],
  "Мини-футбол": ["Любая", "Вратарь", "Защитник", "Универсал", "Нападающий"],
  Баскетбол: ["Любая", "Разыгрывающий", "Защитник", "Форвард", "Центровой"],
  Волейбол: [
    "Любая",
    "Связующий",
    "Доигровщик",
    "Диагональный",
    "Блокирующий",
    "Либеро",
  ],
};
export const preferenceSchema = z.object({
  user_id: z.string(),
  bio: z.string(),
  district: z.string(),
  skills: z.array(
    z.object({
      sport: z.string(),
      level: z.enum(["beginner", "amateur", "experienced", "advanced"]),
      position: z.string(),
    }),
  ),
  days: z.array(z.number()),
  time_from: z.string(),
  time_to: z.string(),
  event_types: z.array(z.string()),
  privacy: z.object({
    bio: z.boolean(),
    sports: z.boolean(),
    stats: z.boolean(),
  }),
  notifications: z.object({
    games: z.boolean(),
    payments: z.boolean(),
    applications: z.boolean(),
    support: z.boolean(),
    host: z.boolean(),
    recommendations: z.boolean(),
    reminder: z.number(),
  }),
  host_contact: z.string().optional(),
  host_name: z.string(),
  host_bio: z.string(),
});
export type Preferences = z.infer<typeof preferenceSchema>;
export type ProfileActivity = {
  id: string;
  title: string;
  sport: string;
  type: string;
  status: string;
  date_time: string | null;
  time_text: string;
  location_text: string;
  two_gis_url: string | null;
  is_free: boolean;
  manager_id: string | null;
  organizer_id: string | null;
};
export type ProfileRegistration = {
  id: string;
  status: string;
  payment_status: string;
  cancelled_at: string | null;
  created_at: string;
  activity: ProfileActivity | null;
};
export type ProfileReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: string;
  activity_id: string;
  activity_title: string;
  sport: string;
  as_host: boolean | null;
};
export type ProfileNotification = {
  id: string;
  category: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};
export type TicketMessage = {
  id: string;
  is_staff: boolean;
  body: string;
  attachments: string[];
  created_at: string;
};
export type SupportTicket = {
  id: string;
  number: number;
  subject: string;
  topic: string;
  status: string;
  registration_id: string | null;
  review_id: string | null;
  created_at: string;
  updated_at: string;
  messages: TicketMessage[];
  name?: string;
};
export type PlayerProgress = {
  matches?: {
    activity_id: string;
    title: string;
    round: number;
    home_name: string;
    away_name: string;
    home_score: number;
    away_score: number;
    starts_at: string | null;
  }[];
  season: string;
  reliability: number | null;
  tournament_wins: number;
  win_streak: number;
  ratings: {
    discipline: string;
    sport: string;
    rating: number;
    rank: string;
    matches: number;
    wins: number;
  }[];
  badges: { id: string; name: string }[];
};
export type ProfileWorkspace = {
  progress?: PlayerProgress | null;
  preferences: Preferences;
  created_at: string;
  email_confirmed: boolean;
  phone_confirmed: boolean;
  auth_phone: string | null;
  restriction: { reason: string | null; until: string | null };
  registrations: ProfileRegistration[];
  reviews: ProfileReview[];
  applications: {
    id: string;
    requested_role: "sports_manager" | "tournament_organizer";
    status: string;
    motivation: string | null;
    admin_notes: string | null;
    created_at: string;
  }[];
  notifications: ProfileNotification[];
  tickets: SupportTicket[];
  host_stats: {
    total: number;
    completed: number;
    cancelled: number;
    participants: number;
  };
};
export const ticketStatuses: Record<string, string> = {
  submitted: "Отправлено",
  in_progress: "В работе",
  needs_user: "Нужен ваш ответ",
  resolved: "Решено",
};
export const ticketTopics: Record<string, string> = {
  general: "Общий вопрос",
  attendance: "Ошибка посещаемости",
  review: "Жалоба на отзыв",
  restriction: "Обжалование ограничения",
  deletion: "Удаление аккаунта",
};
export function cancellationLabel(r: ProfileRegistration) {
  if (r.status !== "cancelled") return null;
  if (!r.cancelled_at || !r.activity?.date_time)
    return "Время отмены не зафиксировано";
  return new Date(r.activity.date_time).getTime() -
    new Date(r.cancelled_at).getTime() >=
    3 * 3600000
    ? "Отмена за 3+ часа"
    : "Поздняя отмена";
}
export function reviewAverage(reviews: ProfileReview[]) {
  return reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null;
}
export function safeInternalHref(href: string) {
  return /^\/(?:activity\/[\da-f-]+|my-games|host|profile(?:\?[^#]*)?)$/.test(
    href,
  )
    ? href
    : "/profile?tab=notifications";
}
