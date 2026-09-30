export const DISCIPLINES = [
  {
    id: "football",
    name: "Футбол",
    kind: "sport",
    min: 11,
    max: 18,
    rules:
      "11×11, 2 тайма по 45 минут. Замены и пенальти — по регламенту. Судья обязателен.",
  },
  {
    id: "futsal",
    name: "Мини-футбол",
    kind: "sport",
    min: 5,
    max: 12,
    rules:
      "5×5, 2 тайма по 20 минут, летучие замены. Укажите зал или открытую площадку.",
  },
  {
    id: "basketball",
    name: "Баскетбол",
    kind: "sport",
    min: 5,
    max: 12,
    rules: "5×5, 4 периода по 10 минут, овертайм 5 минут.",
  },
  {
    id: "basketball3",
    name: "Баскетбол 3×3",
    kind: "sport",
    min: 3,
    max: 4,
    rules: "3×3, 10 минут или до 21 очка, 1 запасной.",
  },
  {
    id: "volleyball",
    name: "Волейбол",
    kind: "sport",
    min: 6,
    max: 12,
    rules: "6×6, до 3 выигранных сетов. Сет до 25, решающий до 15.",
  },
  {
    id: "beach",
    name: "Пляжный волейбол",
    kind: "sport",
    min: 2,
    max: 2,
    rules: "2×2, до 2 выигранных сетов. Сет до 21, решающий до 15.",
  },
] as const;
export const MVP_TIERS = {
  spark: "Spark · бесплатный",
  blitz: "Blitz · платный, один день",
  marathon: "Marathon · платный, несколько дней",
} as const;
export type DisciplineField = {
  key: string;
  label: string;
  type: "number" | "select" | "text";
  default: string;
  options?: string[];
  min?: number;
  max?: number;
};
const series: DisciplineField = {
  key: "series",
  label: "Серия матчей",
  type: "select",
  options: ["BO1", "BO3", "BO5"],
  default: "BO3",
};
export const DISCIPLINE_FIELDS: Record<string, DisciplineField[]> = {
  football: [
    {
      key: "half_minutes",
      label: "Минут в тайме",
      type: "number",
      min: 10,
      max: 45,
      default: "45",
    },
    {
      key: "substitutions",
      label: "Обратные замены",
      type: "select",
      options: ["Да", "Нет"],
      default: "Да",
    },
  ],
  futsal: [
    {
      key: "half_minutes",
      label: "Минут в тайме",
      type: "number",
      min: 10,
      max: 20,
      default: "20",
    },
    {
      key: "court",
      label: "Площадка",
      type: "select",
      options: ["Зал", "Открытая"],
      default: "Зал",
    },
  ],
  basketball: [
    {
      key: "period_minutes",
      label: "Минут в периоде",
      type: "number",
      min: 5,
      max: 20,
      default: "10",
    },
    {
      key: "overtime",
      label: "Овертайм, минут",
      type: "number",
      min: 1,
      max: 10,
      default: "5",
    },
  ],
  basketball3: [
    {
      key: "minutes",
      label: "Длительность, минут",
      type: "number",
      min: 5,
      max: 15,
      default: "10",
    },
    {
      key: "target",
      label: "До скольких очков",
      type: "number",
      min: 11,
      max: 31,
      default: "21",
    },
  ],
  volleyball: [
    series,
    {
      key: "set_points",
      label: "Очков в сете",
      type: "number",
      min: 15,
      max: 25,
      default: "25",
    },
  ],
  beach: [
    { ...series, default: "BO3" },
    {
      key: "set_points",
      label: "Очков в сете",
      type: "number",
      min: 15,
      max: 25,
      default: "21",
    },
  ],
};
export function disciplineDefaults(name: string) {
  const d = DISCIPLINES.find((d) => d.name === name);
  return Object.fromEntries(
    (DISCIPLINE_FIELDS[d?.id ?? ""] ?? []).map((f) => [f.key, f.default]),
  );
}
