import { createServerFn } from "@tanstack/react-start";
import { optionalAuth, requireAuth } from "./auth-middleware";
import { z } from "zod";
import { feedSchema } from "./discovery-filters";
export {
  feedSchema,
  discoveryDefaults,
  type DiscoveryFilters,
} from "./discovery-filters";
import type { Json } from "./database.types";
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
const db = () => import("./db.server");
type Payload = Record<string, unknown>;
async function eventWorkspace(
  caller: { userId: string; sessionId: string },
  action: string,
  payload: Payload = {},
) {
  const { asUser } = await db();
  const [row] = await asUser(
    caller,
    (tx) =>
      tx<{ result: unknown }[]>`SELECT public.event_workspace(${action}, ${tx.json(payload as never)}) AS result`,
  );
  return row?.result;
}
export const getPlayerEvents = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return (await eventWorkspace(context.caller, "player")) as PlayerWorkspace;
  });
export const getHostEvents = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return (await eventWorkspace(context.caller, "host")) as HostWorkspace;
  });
export const mutateEvent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ action: actions, payload: z.record(z.unknown()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (["proof", "payment", "refund"].includes(data.action))
      throw new Error("Платежи отключены");
    if (JSON.stringify(data.payload).length > 40000)
      throw new Error("Слишком много данных");
    return (await eventWorkspace(
      context.caller,
      data.action,
      data.payload,
    )) as HostDocument & {
      ok?: boolean;
      id: string;
      invite_code?: string;
      payment_status?: string;
    };
  });
export const mutateCompetition = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { asUser } = await db();
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<{ result: unknown }[]>`SELECT public.event_competition(${data.action}, ${tx.json(data.payload as never)}) AS result`,
    );
    return (row?.result ?? null) as Json;
  });
export const discoverEvents = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filters: feedSchema,
        page: z.number().int().min(0).max(100000).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { asVisitor } = await db();
    const [row] = await asVisitor(
      context.caller,
      (tx) =>
        tx<{ result: unknown }[]>`SELECT public.event_feed(${tx.json(data.filters as never)}, ${data.page}) AS result`,
    );
    return row?.result as {
      items: Event[];
      total: number;
      page: number;
      districts: string[];
    };
  });
export const readEvent = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), code: z.string().max(64).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { asVisitor } = await db();
    const [row] = await asVisitor(
      context.caller,
      (tx) =>
        tx<{ result: unknown }[]>`SELECT public.event_public(${data.id}, ${data.code ?? ""}) AS result`,
    );
    return (row?.result ?? null) as CompetitionData | null;
  });
