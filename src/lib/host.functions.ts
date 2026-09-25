import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { kaspiLinkSchema, twoGisLinkSchema } from "@/lib/kz-validation";

type Defined<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

function stripUndefined<T extends Record<string, unknown>>(obj: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Defined<T>;
}

async function loadHost(supabase: any, userId: string) {
  const [profile, roles] = await Promise.all([
    supabase.from("profiles").select("name, rating, verified, account_status").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roleList = ((roles.data ?? []) as { role: string }[]).map((r) => r.role);
  return {
    name: (profile.data?.name as string) ?? "Организатор",
    rating: (profile.data?.rating as number | null) ?? null,
    verified: Boolean(profile.data?.verified),
    accountStatus: (profile.data?.account_status as string) ?? "active",
    roles: roleList,
  };
}

const dailyGameSchema = z.object({
  title: z.string().min(3).max(120),
  sport: z.string().min(2).max(40),
  location_text: z.string().min(3).max(200),
  two_gis_url: twoGisLinkSchema,
  time_text: z.string().min(2).max(120),
  price_text: z.string().min(1).max(60),
  entry_fee: z.number().nonnegative().nullable().optional(),
  max_participants: z.number().int().min(2).max(200),
  kaspi_payment_link: kaspiLinkSchema,
  date_time: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  is_private: z.boolean().default(false),
  skill_level: z.string().max(40).optional().nullable(),
  age_division: z.string().max(40).optional().nullable(),
  recurrence: z.string().max(80).optional().nullable(),
  cancellation_policy: z.string().max(600).optional().nullable(),
  notes: z.string().max(600).optional().nullable(),
  city: z.string().max(60).default("Астана"),
});

async function assertCreationEnabled(supabase: any) {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "business").maybeSingle();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  if (value["activity_creation_enabled"] === false) {
    throw new Error("Создание новых событий временно приостановлено администратором.");
  }
}

export const createDailyGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dailyGameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCreationEnabled(supabase);
    const host = await loadHost(supabase, userId);
    const canHostGames =
      host.roles.includes("sports_manager") ||
      host.roles.includes("tournament_organizer") ||
      host.roles.includes("admin");
    if (!canHostGames) {
      throw new Error("Нужна роль организатора. Подайте заявку в профиле — администратор её рассмотрит.");
    }
    if (host.accountStatus !== "active") throw new Error("Аккаунт ограничен.");

    const isFree = !data.entry_fee || data.entry_fee === 0;
    if (!isFree && !host.verified) {
      throw new Error("Для платных игр нужно подтвердить e-mail или телефон.");
    }
    if (!isFree && !data.kaspi_payment_link) {
      throw new Error("Для платной игры укажите ссылку Kaspi.");
    }

    const { data: row, error } = await supabase
      .from("activities")
      .insert(stripUndefined({
        ...data,
        type: "daily_game" as const,
        manager_id: userId,
        host_name: host.name,
        host_rating: host.rating,
        is_free: isFree,
        payment_mode: "MANAGER_DIRECT",
        invite_code: data.is_private ? crypto.randomUUID().slice(0, 8) : null,
      }))
      .select("id, invite_code")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const competitionSchema = dailyGameSchema.extend({
  type: z.enum(["tournament", "league"]),
  format: z.string().max(60).optional().nullable(),
  skill_division: z.string().max(60).optional().nullable(),
  registration_deadline: z.string().optional().nullable(),
  prize_pool: z.record(z.string(), z.number()).optional().nullable(),
  commission_percent: z.number().optional(),
});

export const createCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => competitionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCreationEnabled(supabase);
    const host = await loadHost(supabase, userId);
    if (!host.roles.includes("tournament_organizer") && !host.roles.includes("admin")) {
      throw new Error("Нужна роль организатора турниров. Подайте заявку в профиле.");
    }
    if (!host.verified) throw new Error("Подтвердите e-mail или телефон перед созданием соревнования.");

    const isFree = !data.entry_fee || data.entry_fee === 0;
    const { kaspi_payment_link: _kaspi, ...rest } = data;
    const { data: row, error } = await supabase
      .from("activities")
      .insert(stripUndefined({
        ...rest,
        commission_percent: 10,
        prize_pool: { "1": 100 },
        organizer_id: userId,
        host_name: host.name,
        host_rating: host.rating,
        is_free: isFree,
        payment_mode: "PLATFORM_PROVIDER",
        invite_code: data.is_private ? crypto.randomUUID().slice(0, 8) : null,
      }))
      .select("id, invite_code")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getMyActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .or(`manager_id.eq.${userId},organizer_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((a: { id: string }) => a.id);
    const stats: Record<string, { paid: number; pending: number; review: number; rejected: number }> = {};
    if (ids.length) {
      const regs = await supabase
        .from("registrations")
        .select("activity_id, payment_status, status")
        .in("activity_id", ids);
      for (const r of (regs.data ?? []) as { activity_id: string; payment_status: string; status: string }[]) {
        const s = (stats[r.activity_id] ??= { paid: 0, pending: 0, review: 0, rejected: 0 });
        if (r.status === "cancelled" || r.status === "rejected") continue;
        if (r.payment_status === "paid") s.paid += 1;
        else if (r.payment_status === "pending") s.pending += 1;
        else if (r.payment_status === "needs_review") s.review += 1;
        else if (r.payment_status === "rejected") s.rejected += 1;
      }
    }
    return { activities: data ?? [], stats };
  });

export const setActivityStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        activityId: z.string().uuid(),
        status: z.enum(["open", "nearly_full", "full", "completed", "cancelled"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("activities")
      .update({ status: data.status })
      .eq("id", data.activityId)
      .select("id, manager_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Недостаточно прав.");
    if (data.status === "cancelled" && row.manager_id === userId) {
      const profile = await supabase
        .from("profiles")
        .select("cancellation_count")
        .eq("id", userId)
        .maybeSingle();
      await supabase
        .from("profiles")
        .update({ cancellation_count: ((profile.data?.cancellation_count as number) ?? 0) + 1 })
        .eq("id", userId);
    }
    return { ok: true };
  });

export const submitCompetitionResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        activityId: z.string().uuid(),
        rows: z
          .array(
            z.object({
              placement: z.number().int().min(1).max(64),
              participant_name: z.string().min(1).max(120),
              user_id: z.string().uuid().optional().nullable(),
              prize_amount: z.number().nonnegative().optional().nullable(),
            }),
          )
          .min(1)
          .max(64),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("results").delete().eq("activity_id", data.activityId);
    const { error } = await supabase
      .from("results")
      .insert(data.rows.map((r) => stripUndefined({ ...r, activity_id: data.activityId })));
    if (error) throw new Error(error.message);

    const now = new Date();
    const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const upd = await supabase
      .from("activities")
      .update({
        status: "completed",
        results_submitted_at: now.toISOString(),
        dispute_window_ends_at: windowEnd.toISOString(),
      })
      .eq("id", data.activityId)
      .select("id")
      .maybeSingle();
    if (!upd.data) throw new Error("Недостаточно прав.");
    return { ok: true, disputeWindowEndsAt: windowEnd.toISOString() };
  });

export const markPrizePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ resultId: z.string().uuid(), payoutReference: z.string().max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("results")
      .update({ paid_out: true, payout_reference: data.payoutReference })
      .eq("id", data.resultId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("disputes")
      .select("id, reason, status, admin_notes, created_at, activity:activities(id, title)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
