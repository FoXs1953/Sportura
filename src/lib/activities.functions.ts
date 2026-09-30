import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicSupabase } from "./supabase-public.server";

const PUBLIC_COLUMNS =
  "id, title, description, type, status, tier, sport, city, location_text, two_gis_url, date_time, time_text, price_text, entry_fee, is_free, max_participants, registered_count, host_name, host_rating, manager_id, organizer_id, kaspi_payment_link, payment_mode, prize_pool, format, age_division, skill_division, skill_level, recurrence, cancellation_policy, notes, registration_deadline, results_submitted_at, dispute_window_ends_at, is_private, invite_code, created_at";

export type PublicActivity = {
  tier?: "spark" | "blitz" | "marathon" | null;
  id: string;
  title: string;
  description: string | null;
  type: "daily_game" | "tournament" | "league";
  status: "open" | "nearly_full" | "full" | "completed" | "cancelled";
  sport: string;
  city: string;
  location_text: string;
  two_gis_url: string | null;
  date_time: string | null;
  time_text: string | null;
  price_text: string | null;
  entry_fee: number | null;
  is_free: boolean;
  max_participants: number;
  registered_count: number;
  host_name: string;
  host_rating: number | null;
  manager_id: string | null;
  organizer_id: string | null;
  kaspi_payment_link: string | null;
  payment_mode: string;
  prize_pool: Record<string, number> | null;
  format: string | null;
  age_division: string | null;
  skill_division: string | null;
  skill_level: string | null;
  recurrence: string | null;
  cancellation_policy: string | null;
  notes: string | null;
  registration_deadline: string | null;
  results_submitted_at: string | null;
  dispute_window_ends_at: string | null;
  is_private: boolean;
  invite_code: string | null;
  created_at: string;
};

const filtersSchema = z.object({
  type: z.enum(["all", "daily_game", "tournament", "league"]).default("all"),
  sport: z.string().default("all"),
  city: z.string().default("all"),
  date: z.enum(["all", "today", "week", "weekend"]).default("all"),
  price: z.enum(["all", "free", "paid"]).default("all"),
  availability: z
    .enum(["all", "open", "nearly_full", "full", "completed", "cancelled"])
    .default("all"),
  skill: z.string().default("all"),
  search: z.string().default(""),
});

export type ActivityFilters = z.infer<typeof filtersSchema>;

export const listActivities = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => filtersSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<PublicActivity[]> => {
    const supabase = getPublicSupabase();
    let query = supabase
      .from("activities")
      .select(PUBLIC_COLUMNS)
      .eq("is_private", false)
      .order("date_time", { ascending: true, nullsFirst: false });

    if (data.type !== "all") query = query.eq("type", data.type);
    if (data.sport !== "all") query = query.eq("sport", data.sport);
    if (data.city !== "all") query = query.eq("city", data.city);
    if (data.skill !== "all") query = query.eq("skill_level", data.skill);
    if (data.price === "free") query = query.eq("is_free", true);
    if (data.price === "paid") query = query.eq("is_free", false);
    if (data.availability !== "all")
      query = query.eq("status", data.availability);
    if (data.search.trim()) {
      const term = `%${data.search.trim()}%`;
      query = query.or(
        `title.ilike.${term},location_text.ilike.${term},sport.ilike.${term}`,
      );
    }

    if (data.date !== "all") {
      const now = new Date();
      const start = new Date(now);
      const end = new Date(now);
      if (data.date === "today") {
        end.setHours(23, 59, 59, 999);
      } else if (data.date === "week") {
        end.setDate(end.getDate() + 7);
      } else {
        const day = now.getDay();
        const untilSaturday = (6 - day + 7) % 7;
        start.setDate(now.getDate() + untilSaturday);
        start.setHours(0, 0, 0, 0);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 1);
        end.setHours(23, 59, 59, 999);
      }
      query = query
        .gte("date_time", start.toISOString())
        .lte("date_time", end.toISOString());
    }

    const { data: rows, error } = await query.limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as PublicActivity[];
  });

export const getActivity = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<PublicActivity | null> => {
    const supabase = getPublicSupabase();
    const { data: row, error } = await supabase
      .from("activities")
      .select(PUBLIC_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as unknown as PublicActivity) ?? null;
  });

export const getActivityResults = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const { data: rows, error } = await supabase
      .from("results")
      .select("id, placement, participant_name, prize_amount, paid_out")
      .eq("activity_id", data.id)
      .order("placement", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getHostReviews = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("reviews")
      .select("id, rating, comment, created_at")
      .eq("reviewed_user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Private activities are reachable only with the exact invite code. */
export const findActivityByInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(4).max(64) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ id: string } | null> => {
    const supabase = getPublicSupabase();
    const { data: id, error } = await supabase.rpc("find_activity_by_invite", {
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    return id ? { id: id as unknown as string } : null;
  });
