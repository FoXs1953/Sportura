import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalAuth, requireAuth } from "./auth-middleware";
import { asStaff } from "./staff";
export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ from: z.string().datetime(), to: z.string().datetime() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [row] = await asStaff(
      context.caller,
      (tx) =>
        tx<
          { result: unknown }[]
        >`SELECT public.staff_analytics(${data.from}, ${data.to}) AS result`,
    );
    return row?.result as Analytics;
  });
/** Records one anonymous analytics event; the database validates and rate-limits it. */
export const recordAnalyticsEvent = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        event: z.enum(["page_view", "activity_view", "register_click"]),
        visitor_id: z.string().uuid(),
        session_id: z.string().uuid(),
        path: z.string().max(160),
        source: z.string().max(20),
        device: z.enum(["mobile", "desktop"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { asVisitor } = await import("./db.server");
    await asVisitor(
      context.caller,
      (tx) => tx`SELECT public.track_event(${tx.json(data)})`,
    );
    return { ok: true };
  });
export type Analytics = {
  traffic: { visits: number; visitors: number; mobile: number };
  sources: { source: string; visits: number }[];
  pages: { path: string; views: number }[];
  accounts: { total: number; verified: number };
  daily: { day: string; accounts: number; visits: number }[];
  activity: {
    registrations: number;
    paid: number;
    chargeable: number;
    cancelled: number;
    no_show: number;
  };
  active: { dau: number; wau: number; mau: number };
  funnel: Record<string, number>;
  organizers: {
    applications: number;
    approved: number;
    events: number;
    capacity: number;
    occupied: number;
  };
  since: string | null;
};
