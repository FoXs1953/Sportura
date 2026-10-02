import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Tables } from "./database.types";
import { publicOrganizerActivitySummary } from "./organizer-public-profile";

export const getOrganizerProfile = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { asService } = await import("./db.server");
    const files = await import("./files.server");
    const loaded = await asService(async (tx) => {
      const [p] = await tx<
        {
          id: string;
          name: string;
          avatar_url: string | null;
          rating: number | null;
          rating_count: number;
          reliability_rating: number | null;
          verified: boolean;
          created_at: string;
          city: string;
        }[]
      >`SELECT id, name, avatar_url, rating, rating_count, reliability_rating, verified, created_at, city
        FROM public.profiles WHERE id = ${data.id}`;
      if (!p) return null;
      const [publicRow] = await tx<{ result: unknown }[]>`
        SELECT public.public_player_profile(${data.id}) AS result`;
      const [hostRole] = await tx`
        SELECT 1 FROM public.user_roles
        WHERE user_id = ${data.id} AND role IN ('sports_manager', 'tournament_organizer')`;
      const acts = await tx<
        {
          id: string;
          title: string;
          type: Tables<"activities">["type"];
          status: Tables<"activities">["status"];
          sport: string;
          time_text: string | null;
          date_time: string | null;
          registered_count: number;
          max_participants: number;
          is_private: boolean;
        }[]
      >`SELECT id, title, type, status, sport, time_text, date_time, registered_count, max_participants, is_private
        FROM public.activities
        WHERE (manager_id = ${data.id} OR organizer_id = ${data.id})
          AND is_private = false AND status <> 'draft'
        ORDER BY date_time DESC NULLS LAST
        LIMIT 100`;
      const reviews = await tx<
        {
          id: string;
          rating: number;
          comment: string | null;
          created_at: string;
          reviewer_name: string | null;
        }[]
      >`SELECT r.id, r.rating, r.comment, r.created_at, p.name AS reviewer_name
        FROM public.reviews r LEFT JOIN public.profiles p ON p.id = r.reviewer_id
        JOIN public.activities a ON a.id = r.activity_id
        WHERE r.reviewed_user_id = ${data.id} AND a.is_private = false AND a.status <> 'draft'
        ORDER BY r.created_at DESC
        LIMIT 30`;
      return {
        p,
        visible: (publicRow?.result ?? null) as {
          stats_visible: boolean;
          host_name: string;
          host_bio: string;
          host_contact: string;
        } | null,
        verified: Boolean(hostRole),
        list: [...acts],
        reviews: [...reviews],
      };
    });
    if (!loaded) return null;
    const { p, visible, list, reviews } = loaded;
    if (visible?.host_name) p.name = visible.host_name;
    if (visible?.stats_visible === false) {
      p.rating = null;
      p.rating_count = 0;
      p.reliability_rating = null;
    }
    p.verified = loaded.verified;
    if (p.avatar_url && !files.isExternal(p.avatar_url)) {
      p.avatar_url = files.isObjectName(p.avatar_url)
        ? files.signedUrl("avatars", p.avatar_url)
        : null;
    }
    return {
      profile: {
        ...p,
        bio: visible?.host_bio ?? "",
        contact: visible?.host_contact ?? "",
      },
      statsVisible: visible?.stats_visible !== false,
      ...publicOrganizerActivitySummary(list, visible?.stats_visible !== false),
      reviews: (visible?.stats_visible === false ? [] : reviews).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        reviewer: (r.reviewer_name ?? "Участник").split(" ")[0],
      })),
    };
  });
