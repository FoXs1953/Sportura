import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getOrganizerProfile = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("id, name, avatar_url, rating, rating_count, reliability_rating, verified, created_at, city")
      .eq("id", data.id)
      .maybeSingle();
    if (!p) return null;
    const { data: acts } = await supabaseAdmin
      .from("activities")
      .select("id, title, type, status, sport, time_text, date_time, registered_count, max_participants, is_private")
      .or(`manager_id.eq.${data.id},organizer_id.eq.${data.id}`)
      .order("date_time", { ascending: false, nullsFirst: false })
      .limit(100);
    const list = acts ?? [];
    const { data: reviews } = await supabaseAdmin
      .from("reviews")
      .select("id, rating, comment, created_at, reviewer_id")
      .eq("reviewed_user_id", data.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const reviewerIds = [...new Set((reviews ?? []).map((r) => r.reviewer_id))];
    const { data: reviewers } = reviewerIds.length
      ? await supabaseAdmin.from("profiles").select("id, name").in("id", reviewerIds)
      : { data: [] as { id: string; name: string }[] };
    const names = Object.fromEntries((reviewers ?? []).map((r) => [r.id, r.name]));
    return {
      profile: p,
      stats: {
        games: list.filter((a) => a.type === "daily_game").length,
        competitions: list.filter((a) => a.type !== "daily_game").length,
        completed: list.filter((a) => a.status === "completed").length,
        cancelled: list.filter((a) => a.status === "cancelled").length,
        players: list.reduce((s, a) => s + (a.registered_count ?? 0), 0),
      },
      upcoming: list
        .filter((a) => !a.is_private && a.status !== "completed" && a.status !== "cancelled")
        .slice(0, 10),
      reviews: (reviews ?? []).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        reviewer: (names[r.reviewer_id] ?? "Участник").split(" ")[0],
      })),
    };
  });
