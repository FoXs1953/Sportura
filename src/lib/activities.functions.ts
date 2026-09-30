import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

/** Private activities are reachable only with the exact invite code. */
export const findActivityByInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(4).max(64) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ id: string } | null> => {
    const { asAnon } = await import("./db.server");
    const [row] = await asAnon(
      (tx) => tx<{ id: string | null }[]>`SELECT public.find_activity_by_invite(${data.code}) AS id`,
    );
    return row?.id ? { id: row.id } : null;
  });
