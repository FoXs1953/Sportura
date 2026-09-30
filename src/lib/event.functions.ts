import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";
import { z } from "zod";
import { feedSchema } from "./discovery-filters";
export {
  feedSchema,
  discoveryDefaults,
  type DiscoveryFilters,
} from "./discovery-filters";
import type { Json } from "@/integrations/supabase/types";
import type {
  PlayerWorkspace,
  HostWorkspace,
  CompetitionData,
  Event,
  HostDocument,
} from "./event-model";
const actions = z.enum([
  "checkin",
  "close_checkin",
  "replace_no_show",
  "skip_waiter",
  "waitlist_join",
  "waitlist_leave",
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
    if (["proof", "payment", "refund"].includes(data.action))
      throw new Error("Платежи отключены");
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
          "schedule",
          "prize_add",
          "prize_award",
          "prize_deliver",
          "weather",
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
    if (data.action === "payout") throw new Error("Выплаты отключены");
    const r = await context.supabase.rpc("event_competition", {
      action: data.action,
      payload: data.payload as Json,
    });
    fail(r.error);
    return r.data;
  });
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
    return r.data as unknown as {
      items: Event[];
      total: number;
      page: number;
      districts: string[];
    };
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
