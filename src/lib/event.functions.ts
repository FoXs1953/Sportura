import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import type {
  PlayerWorkspace,
  HostWorkspace,
  CompetitionData,
  Event,
  HostDocument,
} from "./event-model";
const actions = z.enum([
  "favorite",
  "document",
  "delete_document",
  "publish",
  "join",
  "cancel",
  "proof",
  "participant",
  "payment",
  "refund",
  "event_status",
  "review",
  "review_reply",
]);
export type EventAction = z.infer<typeof actions>;
const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};
export const getPlayerEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await context.supabase.rpc("event_workspace", {
      action: "player",
    });
    fail(r.error);
    return r.data as unknown as PlayerWorkspace;
  });
export const getHostEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await context.supabase.rpc("event_workspace", { action: "host" });
    fail(r.error);
    return r.data as unknown as HostWorkspace;
  });
export const mutateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ action: actions, payload: z.record(z.unknown()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (JSON.stringify(data.payload).length > 40000)
      throw new Error("Слишком много данных");
    const r = await context.supabase.rpc("event_workspace", {
      action: data.action,
      payload: data.payload as Json,
    });
    fail(r.error);
    return r.data as unknown as HostDocument & {
      ok?: boolean;
      id: string;
      invite_code?: string;
      payment_status?: string;
    };
  });
export const mutateCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.enum([
          "generate",
          "advance",
          "match",
          "publish_results",
          "payout",
        ]),
        payload: z.record(z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc("event_competition", {
      action: data.action,
      payload: data.payload as Json,
    });
    fail(r.error);
    return r.data;
  });
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
  sport: z.string().max(50).catch("all").default("all"),
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
export const discoverEvents = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        filters: feedSchema,
        page: z.number().int().min(0).max(100000).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const client = getPublicSupabase(getRequest().headers.get("authorization"));
    const r = await client.rpc("event_feed", {
      filters: data.filters as Json,
      page: data.page,
    });
    fail(r.error);
    return r.data as unknown as { items: Event[]; total: number; page: number };
  });
export const readEvent = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), code: z.string().max(64).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const client = getPublicSupabase(getRequest().headers.get("authorization"));
    const r = await client.rpc("event_public", {
      aid: data.id,
      code: data.code ?? "",
    });
    fail(r.error);
    return r.data as unknown as CompetitionData | null;
  });
