import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import type { ProfileWorkspace, SupportTicket } from "./profile-model";
const actionSchema = z.enum([
  "basic",
  "sports",
  "privacy",
  "notifications",
  "read",
  "host",
  "ticket",
  "reply",
  "moderate",
]);
function fail(error: { message: string; code?: string } | null) {
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Новые разделы ещё подключаются к базе. Попробуйте позже."
        : error.message,
    );
}
export const getProfileWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("profile_workspace", {
      action: "get",
    });
    fail(error);
    return data as unknown as ProfileWorkspace;
  });
export const saveProfileSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ action: actionSchema, payload: z.record(z.unknown()) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const result = await context.supabase.rpc("profile_workspace", {
      action: data.action,
      payload: data.payload as Json,
    });
    fail(result.error);
    return result.data as { ok: boolean; id?: string };
  });
export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("profile_workspace", {
      action: "export",
    });
    fail(error);
    return data;
  });
export const getSupportAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("profile_workspace", {
      action: "admin_tickets",
    });
    fail(error);
    return data as unknown as SupportTicket[];
  });
export const getPublicPlayer = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getPublicSupabase } = await import("./supabase-public.server");
    const result = await getPublicSupabase().rpc("public_player_profile", {
      _id: data.id,
    });
    fail(result.error);
    const publicProfile = result.data as {
      progress?: import("./profile-model").PlayerProgress | null;
      id: string;
      name: string;
      city: string;
      created_at: string;
      bio: string;
      sports: string[];
      rating: number | null;
      rating_count: number | null;
      host_name: string;
      host_bio: string;
      avatar_url: string | null;
      stats_visible: boolean;
    } | null;
    if (publicProfile?.avatar_url) {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const signed = await supabaseAdmin.storage
        .from("avatars")
        .createSignedUrl(publicProfile.avatar_url, 3600);
      publicProfile.avatar_url = signed.data?.signedUrl ?? null;
    }
    return publicProfile;
  });
export const updateMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().max(500).nullable() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    if (
      data.path &&
      (!data.path.startsWith(`${context.userId}/`) || data.path.includes(".."))
    )
      throw new Error("Некорректное фото");
    const { error } = await context.supabase
      .from("profiles")
      .update({ avatar_url: data.path })
      .eq("id", context.userId);
    fail(error);
    return { ok: true };
  });
export const updateMyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        phone: z
          .string()
          .regex(/^\+7\d{10}$/)
          .or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ phone: data.phone || null })
      .eq("id", context.userId);
    fail(error);
    return { ok: true };
  });
export const getMySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("profile_sessions", {
      action: "list",
    });
    fail(error);
    return data as unknown as {
      id: string;
      user_agent: string | null;
      created_at: string;
      last_active: string;
      current: boolean;
    }[];
  });
export const revokeMySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const result = await context.supabase.rpc("profile_sessions", {
      action: "revoke",
      session_id: data.id,
    });
    fail(result.error);
    return { ok: true };
  });
export const checkAccountDeletion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc(
      "profile_deletion_check",
      {},
    );
    fail(error);
    return data as unknown as { allowed: boolean; blockers: string[] };
  });
export const getAuthCapabilities = createServerFn({ method: "GET" }).handler(
  async () => {
    const response = await fetch(
      `${process.env["SUPABASE_URL"]}/auth/v1/settings`,
      { headers: { apikey: process.env["SUPABASE_PUBLISHABLE_KEY"]! } },
    );
    if (!response.ok) return { google: false, phone: false };
    const data = (await response.json()) as {
      external?: Record<string, boolean>;
    };
    return {
      google: data.external?.["google"] === true,
      phone: data.external?.["phone"] === true,
    };
  },
);
export const getFeedPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await context.supabase.rpc(
      "profile_preferences_for_feed",
      {},
    );
    fail(result.error);
    return result.data as unknown as {
      city: string;
      sports: string[];
      days: number[];
      time_from: string;
      time_to: string;
      event_types: string[];
    };
  });
