import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { z } from "zod";
export type Dispute = {
  id: string;
  activity_id: string;
  title: string;
  reason: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  messages: {
    id: string;
    body: string;
    created_at: string;
    from_host: boolean;
  }[];
};
const db = () => import("./db.server");
export const disputeAction = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        action: z.enum(["list", "open", "reply", "resolve"]),
        payload: z.record(z.unknown()),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { asUser } = await db();
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<
          { result: unknown }[]
        >`SELECT public.event_disputes(${data.action}, ${tx.json(data.payload as never)}) AS result`,
    );
    return row?.result as Dispute[];
  });
export type HostTrust = {
  level: "novice" | "verified" | "partner";
  limit: number;
  completed: number;
  rating: number;
};
export const getHostTrust = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid().optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { asUser } = await db();
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<
          { result: unknown }[]
        >`SELECT public.organizer_trust(${data.id ?? context.caller.userId}) AS result`,
    );
    return row?.result as HostTrust;
  });
export const setHostPartner = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean(),
        note: z.string().min(3).max(500),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { asUser } = await db();
    await asUser(
      context.caller,
      (tx) =>
        tx`SELECT public.set_organizer_partner(${data.id}, ${data.enabled}, ${data.note})`,
    );
    return { ok: true };
  });
