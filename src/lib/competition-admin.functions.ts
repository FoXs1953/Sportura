import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
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
export const disputeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        action: z.enum(["list", "open", "reply", "resolve"]),
        payload: z.record(z.unknown()),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("event_disputes", {
      action: data.action,
      payload: data.payload as Json,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data as unknown as Dispute[];
  });
export type HostTrust = {
  level: "novice" | "verified" | "partner";
  limit: number;
  completed: number;
  rating: number;
};
export const getHostTrust = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid().optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("organizer_trust", {
      uid: data.id ?? context.userId,
    });
    if (r.error) throw new Error(r.error.message);
    return r.data as unknown as HostTrust;
  });
export const setHostPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const r = await context.supabase.rpc("set_organizer_partner", {
      uid: data.id,
      enabled: data.enabled,
      note: data.note,
    });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
