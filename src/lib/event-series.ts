export const EVENT_SERIES = {
  open: "Открытый турнир",
  friday_blitz: "Friday Blitz",
  weekend_marathon: "Weekend Marathon",
  monday_spark: "Monday Spark",
  astana_open: "Astana Open",
  rookie_cup: "Rookie Cup · для начинающих",
  last_chance: "Last Chance · отборочный",
  major: "Major · главный турнир",
  sponsor_cup: "Sponsor Cup · спонсорский кубок",
  club_clash: "Club Clash · клубный турнир",
} as const;
export type EventExtras = {
  series?: keyof typeof EVENT_SERIES;
  rating_limit?: number;
  qualifier_id?: string;
};
