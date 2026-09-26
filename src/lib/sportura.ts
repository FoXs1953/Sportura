import football from "@/assets/sport-football.jpg";
import minifootball from "@/assets/sport-minifootball.jpg";
import basketball from "@/assets/sport-basketball.jpg";
import volleyball from "@/assets/sport-volleyball.jpg";

export const SPORTS = [
  "Футбол",
  "Мини-футбол",
  "Баскетбол",
  "Волейбол",
] as const;
export type Sport = (typeof SPORTS)[number];

export const CITIES = ["Астана", "Алматы", "Шымкент", "Караганда"] as const;

export const SKILL_LEVELS = [
  "Любой",
  "Начальный",
  "Любитель",
  "Профессиональный",
] as const;

export type ActivityType = "daily_game" | "tournament" | "league";
export type ActivityStatus =
  "open" | "nearly_full" | "full" | "completed" | "cancelled";
export type PaymentStatus =
  "pending" | "paid" | "needs_review" | "rejected" | "refunded";
export type RegistrationStatus =
  "registered" | "cancelled" | "no_show" | "attended" | "rejected";
export type AppRole =
  "participant" | "sports_manager" | "tournament_organizer" | "admin";
export type AccountStatus = "active" | "flagged" | "suspended" | "banned";

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  daily_game: "Игра",
  tournament: "Турнир",
  league: "Лига",
};

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  open: "Открыт",
  nearly_full: "Почти заполнен",
  full: "Заполнен",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачено",
  needs_review: "Требует проверки",
  rejected: "Отклонено",
  refunded: "Возврат",
};

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  registered: "Записан",
  cancelled: "Отменена",
  no_show: "Не пришёл",
  attended: "Был на игре",
  rejected: "Отклонена",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  participant: "Участник",
  sports_manager: "Спорт-менеджер",
  tournament_organizer: "Организатор турниров",
  admin: "Администратор",
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Активен",
  flagged: "На заметке",
  suspended: "Приостановлен",
  banned: "Заблокирован",
};

export function sportImage(sport: string): string {
  const key = sport.toLowerCase();
  if (key.includes("мини")) return minifootball;
  if (key.includes("баскет")) return basketball;
  if (key.includes("волей")) return volleyball;
  return football;
}

export function formatKzt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Бесплатно";
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₸`;
}

export function priceLabel(a: {
  price_text: string | null;
  entry_fee: number | null;
}): string {
  if (a.price_text && a.price_text.trim()) return a.price_text;
  return formatKzt(a.entry_fee);
}

export function capacityPercent(registered: number, max: number): number {
  if (!max) return 0;
  return Math.min(100, Math.round((registered / max) * 100));
}

export function spotsLeft(registered: number, max: number): number {
  return Math.max(0, max - registered);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeLabel(a: {
  time_text: string | null;
  date_time: string | null;
}): string {
  if (a.time_text && a.time_text.trim()) return a.time_text;
  return formatDateTime(a.date_time);
}

export const PRIZE_TEMPLATE = { "1": 100 };

export const KASPI_DISCLAIMER =
  "Оплата производится напрямую спорт-менеджеру через Kaspi. Платформа не удерживает деньги за ежедневные игры и не является посредником платежа.";

export const COMPETITION_DISCLAIMER =
  "Оплата участия в соревнованиях проходит через поддерживаемого платёжного провайдера. Выплаты призов выполняются после окончания 48-часового окна споров.";
