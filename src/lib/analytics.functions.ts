import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaff } from "@/lib/staff";
export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ from: z.string().datetime(), to: z.string().datetime() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const r = await (context.supabase as any).rpc("staff_analytics", {
      date_from: data.from,
      date_to: data.to,
    });
    if (r.error) throw Error(r.error.message);
    return r.data as Analytics;
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
