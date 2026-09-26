import type { PublicActivity } from "./activities.functions";
export function rankForPlayer(
  activities: PublicActivity[],
  preferences: {
    city: string;
    sports: string[];
    days: number[];
    time_from: string;
    time_to: string;
    event_types: string[];
  },
) {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Almaty",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const score = (a: PublicActivity) => {
    let result =
      (a.city === preferences.city ? 8 : 0) +
      (preferences.sports.includes(a.sport) ? 5 : 0) +
      (preferences.event_types.includes(a.type) ? 2 : 0);
    if (a.date_time) {
      const parts = format.formatToParts(new Date(a.date_time));
      const value = (key: string) =>
        parts.find((p) => p.type === key)?.value ?? "";
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        value("weekday"),
      );
      const time = `${value("hour")}:${value("minute")}`;
      if (preferences.days.includes(day)) result += 2;
      if (time >= preferences.time_from && time <= preferences.time_to)
        result += 1;
    }
    return result;
  };
  return [...activities].sort((a, b) => score(b) - score(a));
}
