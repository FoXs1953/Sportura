import { z } from "zod";

const calendarDate = z
  .string()
  .refine(
    (v) =>
      v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
  )
  .catch("")
  .default("");
export const feedSchema = z.object({
  city: z.string().max(80).catch("all").default("all"),
  district: z.string().max(100).catch("").default(""),
  sport: z
    .preprocess(
      (value) =>
        typeof value === "string" ? (value === "all" ? [] : [value]) : value,
      z.array(z.string().min(1).max(50)).max(30).catch([]).default([]),
    )
    .transform((sports) => [
      ...new Set(sports.filter((sport) => sport !== "all")),
    ]),
  type: z
    .enum(["all", "daily_game", "tournament", "league"])
    .catch("all")
    .default("all"),
  date: z
    .enum(["all", "today", "tomorrow", "week", "weekend", "custom"])
    .catch("all")
    .default("all"),
  from: calendarDate,
  to: calendarDate,
  q: z.string().max(200).catch("").default(""),
  free: z.boolean().catch(false).default(false),
  open: z.boolean().catch(false).default(false),
  sort: z
    .enum(["available", "date", "price", "personal"])
    .catch("available")
    .default("available"),
  view: z.enum(["all", "saved", "archive"]).catch("all").default("all"),
  skill: z.string().max(40).catch("all").default("all"),
  venue: z.enum(["all", "indoor", "outdoor"]).catch("all").default("all"),
  min: z.coerce
    .number()
    .min(0)
    .max(10000000)
    .nullable()
    .catch(null)
    .default(null),
  max: z.coerce
    .number()
    .min(0)
    .max(10000000)
    .nullable()
    .catch(null)
    .default(null),
  time_from: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .or(z.literal(""))
    .catch("")
    .default(""),
  time_to: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .or(z.literal(""))
    .catch("")
    .default(""),
});
export type DiscoveryFilters = z.infer<typeof feedSchema>;
export const discoveryDefaults = feedSchema.parse({});
