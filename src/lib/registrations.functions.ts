import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertFlag(supabase: any, flag: string, message: string) {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "business").maybeSingle();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  if (value[flag] === false) throw new Error(message);
}

export const registerForActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ activityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFlag(supabase, "registrations_enabled", "Запись на события временно приостановлена администратором.");

    const profile = await supabase
      .from("profiles")
      .select("account_status")
      .eq("id", userId)
      .maybeSingle();
    if (profile.data && profile.data.account_status !== "active") {
      throw new Error("Аккаунт ограничен. Обратитесь в поддержку.");
    }

    const activity = await supabase
      .from("activities")
      .select("id, status, is_free, type")
      .eq("id", data.activityId)
      .maybeSingle();
    if (!activity.data) throw new Error("Активность не найдена.");
    if (activity.data.status === "cancelled") throw new Error("Активность отменена.");
    if (activity.data.status === "full") throw new Error("Мест больше нет.");

    const { data: row, error } = await supabase
      .from("registrations")
      .insert({
        activity_id: data.activityId,
        user_id: userId,
        payment_status: activity.data.is_free ? "paid" : "pending",
      })
      .select("id, payment_status")
      .single();
    if (error) {
      if (error.code === "23505" || error.code === "23514" || error.message.includes("duplicate")) {
        throw new Error("Вы уже записаны на эту активность.");
      }
      throw new Error(error.message);
    }
    return row;
  });

export const cancelMyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ registrationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("registrations")
      .update({ status: "cancelled" })
      .eq("id", data.registrationId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitPaymentProof = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => input as any).handler(async () => { throw new Error("Платежи отключены"); });

/** Host- or admin-only manual payment confirmation. Every change is logged by the database. */
export const setPaymentStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => input as any).handler(async () => { throw new Error("Платежи отключены"); });

export const setRegistrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        registrationId: z.string().uuid(),
        status: z.enum(["registered", "cancelled", "no_show", "attended", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("registrations")
      .update({ status: data.status })
      .eq("id", data.registrationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listActivityParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ activityId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("registrations")
      .select(
        "id, status, payment_status, payment_reference, receipt_url, participant_note, created_at, user_id",
      )
      .eq("activity_id", data.activityId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: isHost } = await context.supabase.rpc("is_activity_host", {
      _activity_id: data.activityId,
      _user_id: context.userId,
    });
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isHost && !isAdmin) throw new Error("Нет доступа к участникам");
    const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, name, phone, rating, no_show_count").in("id", ids)
      : { data: [] as any[] };
    const byId = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
    return (rows ?? []).map((r) => ({ ...r, profile: byId[r.user_id] ?? null }));
  });

export const listPaymentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ registrationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("payment_status_history")
      .select("id, previous_status, new_status, note, payment_reference, created_at, changed_by")
      .eq("registration_id", data.registrationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const leaveReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        activityId: z.string().uuid(),
        reviewedUserId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(600).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("reviews").insert({
      activity_id: data.activityId,
      reviewer_id: context.userId,
      reviewed_user_id: data.reviewedUserId,
      rating: data.rating,
      comment: data.comment ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const openDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ activityId: z.string().uuid(), reason: z.string().min(10).max(1500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const activity = await context.supabase
      .from("activities")
      .select("dispute_window_ends_at")
      .eq("id", data.activityId)
      .maybeSingle();
    const ends = activity.data?.dispute_window_ends_at;
    if (!ends || new Date(ends) < new Date()) {
      throw new Error("Окно споров закрыто (48 часов после публикации результатов).");
    }
    const { error } = await context.supabase.from("disputes").insert({
      activity_id: data.activityId,
      user_id: context.userId,
      reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
