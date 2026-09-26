import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Доступ только для администраторов.");
}

export const getAdminAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [apps, regs, disputes] = await Promise.all([
      context.supabase
        .from("manager_applications")
        .select("id")
        .eq("status", "pending"),
      context.supabase
        .from("registrations")
        .select("id")
        .eq("payment_status", "needs_review"),
      context.supabase.from("disputes").select("id").eq("status", "open"),
    ]);
    return {
      applications: (apps.data ?? []).length,
      payments: (regs.data ?? []).length,
      disputes: (disputes.data ?? []).length,
    };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const [
      users,
      activities,
      registrations,
      disputes,
      applications,
      transactions,
    ] = await Promise.all([
      supabase.from("profiles").select("id, account_status"),
      supabase
        .from("activities")
        .select(
          "id, type, status, entry_fee, commission_percent, registered_count",
        ),
      supabase.from("registrations").select("id, payment_status"),
      supabase.from("disputes").select("id, status"),
      supabase.from("manager_applications").select("id, status"),
      supabase.from("transactions").select("id, type, amount, status"),
    ]);

    const regs = (registrations.data ?? []) as { payment_status: string }[];
    const acts = (activities.data ?? []) as {
      type: string;
      status: string;
      entry_fee: number | null;
      commission_percent: number;
      registered_count: number;
    }[];

    const commission = acts
      .filter((a) => a.type !== "daily_game" && a.entry_fee)
      .reduce(
        (sum, a) =>
          sum +
          (a.entry_fee ?? 0) *
            a.registered_count *
            (a.commission_percent / 100),
        0,
      );

    return {
      users: {
        total: (users.data ?? []).length,
        flagged: (users.data ?? []).filter(
          (u: { account_status: string }) => u.account_status !== "active",
        ).length,
      },
      activities: {
        total: acts.length,
        dailyGames: acts.filter((a) => a.type === "daily_game").length,
        competitions: acts.filter((a) => a.type !== "daily_game").length,
        cancelled: acts.filter((a) => a.status === "cancelled").length,
      },
      payments: {
        total: regs.length,
        paid: regs.filter((r) => r.payment_status === "paid").length,
        pending: regs.filter((r) => r.payment_status === "pending").length,
        needsReview: regs.filter((r) => r.payment_status === "needs_review")
          .length,
        rejected: regs.filter((r) => r.payment_status === "rejected").length,
      },
      disputesOpen: ((disputes.data ?? []) as { status: string }[]).filter(
        (d) => d.status === "open",
      ).length,
      applicationsPending: (
        (applications.data ?? []) as { status: string }[]
      ).filter((a) => a.status === "pending").length,
      escrowBalance: (
        (transactions.data ?? []) as {
          type: string;
          amount: number;
          status: string;
        }[]
      )
        .filter((t) => t.status === "pending")
        .reduce((s, t) => s + Number(t.amount), 0),
      commissionRevenue: Math.round(commission),
    };
  });

export const listUsersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("profiles")
      .select(
        "id, name, phone, email, city, verified, rating, rating_count, no_show_count, dispute_count, cancellation_count, account_status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const roles = await context.supabase
      .from("user_roles")
      .select("user_id, role");
    const byUser: Record<string, string[]> = {};
    for (const r of (roles.data ?? []) as { user_id: string; role: string }[]) {
      (byUser[r.user_id] ??= []).push(r.role);
    }
    return (data ?? []).map((u) => ({ ...u, roles: byUser[u.id] ?? [] }));
  });

export const listApplicationsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("manager_applications")
      .select(
        "id, user_id, requested_role, motivation, status, admin_notes, created_at, reviewed_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    type AppProfile = {
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      verified: boolean;
      rating: number | null;
      account_status: string;
    };
    type AppRow = {
      id: string;
      user_id: string;
      requested_role: string;
      motivation: string | null;
      status: string;
      admin_notes: string | null;
      created_at: string;
      reviewed_at: string | null;
    };
    const rows = (data ?? []) as AppRow[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const profiles = ids.length
      ? await context.supabase
          .from("profiles")
          .select("id, name, email, phone, verified, rating, account_status")
          .in("id", ids)
      : { data: [] as AppProfile[] };
    const byId: Record<string, AppProfile> = {};
    for (const p of (profiles.data ?? []) as AppProfile[]) byId[p.id] = p;
    return rows.map((r) => ({ ...r, profile: byId[r.user_id] ?? null }));
  });

export const reviewApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        approve: z.boolean(),
        notes: z.string().max(600).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase, userId } = context;
    const app = await supabase
      .from("manager_applications")
      .select("id, user_id, requested_role")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app.data) throw new Error("Заявка не найдена.");

    const { error } = await supabase
      .from("manager_applications")
      .update({
        status: data.approve ? "approved" : "rejected",
        admin_notes: data.notes ?? null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.applicationId);
    if (error) throw new Error(error.message);

    if (data.approve) {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const grant = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: app.data.user_id, role: app.data.requested_role });
      if (grant.error && !grant.error.message.includes("duplicate")) {
        throw new Error(grant.error.message);
      }
    }
    return { ok: true };
  });

export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["active", "flagged", "suspended", "banned"]),
        notes: z.string().max(600).optional().nullable(),
        restrictionUntil: z.string().datetime().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("profiles")
      .update({
        account_status: data.status,
        restriction_reason:
          data.status === "active" ? null : (data.notes ?? null),
        restriction_until:
          data.status === "active" ? null : (data.restrictionUntil ?? null),
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listActivitiesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPaymentAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("payment_status_history")
      .select(
        "id, previous_status, new_status, note, payment_reference, created_at, changed_by, activity:activities(title)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listDisputesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("disputes")
      .select(
        "id, reason, status, admin_notes, created_at, user_id, activity:activities(id, title)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        disputeId: z.string().uuid(),
        status: z.enum(["open", "approved", "rejected"]),
        notes: z.string().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("disputes")
      .update({
        status: data.status,
        admin_notes: data.notes ?? null,
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.disputeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPaymentEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("payment_events")
      .select(
        "id, provider, event_type, external_event_id, external_payment_id, signature_valid, processed, processing_error, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CSV_KINDS = ["users", "activities", "registrations", "payments"] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return /[",;\n]/.test(s) ? `"${s}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.join(";"),
    ...rows.map((r) => r.map(csvEscape).join(";")),
  ];
  // BOM so Excel on Windows reads Cyrillic correctly
  return `\uFEFF${lines.join("\r\n")}`;
}

/** Admin-only CSV export for reporting and reconciliation. */
export const exportAdminCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: z.enum(CSV_KINDS) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    if (data.kind === "users") {
      const { data: rows, error } = await supabase
        .from("profiles")
        .select(
          "id, name, email, phone, city, verified, account_status, rating, rating_count, reliability_rating, no_show_count, cancellation_count, dispute_count, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw new Error(error.message);
      return {
        filename: "sportura-users.csv",
        csv: toCsv(
          [
            "ID",
            "Имя",
            "Email",
            "Телефон",
            "Город",
            "Подтверждён",
            "Статус аккаунта",
            "Рейтинг",
            "Отзывов",
            "Надёжность",
            "Пропуски",
            "Отмены",
            "Споры",
            "Регистрация",
          ],
          (rows ?? []).map((u: any) => [
            u.id,
            u.name,
            u.email,
            u.phone,
            u.city,
            u.verified ? "да" : "нет",
            u.account_status,
            u.rating,
            u.rating_count,
            u.reliability_rating,
            u.no_show_count,
            u.cancellation_count,
            u.dispute_count,
            new Date(u.created_at).toLocaleString("ru-RU"),
          ]),
        ),
      };
    }

    if (data.kind === "activities") {
      const { data: rows, error } = await supabase
        .from("activities")
        .select(
          "id, title, type, status, sport, city, location_text, host_name, date_time, time_text, entry_fee, is_free, commission_percent, registered_count, max_participants, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw new Error(error.message);
      return {
        filename: "sportura-activities.csv",
        csv: toCsv(
          [
            "ID",
            "Название",
            "Тип",
            "Статус",
            "Спорт",
            "Город",
            "Локация",
            "Организатор",
            "Дата",
            "Время",
            "Взнос",
            "Бесплатно",
            "Комиссия %",
            "Записано",
            "Мест",
            "Создано",
          ],
          (rows ?? []).map((a: any) => [
            a.id,
            a.title,
            a.type,
            a.status,
            a.sport,
            a.city,
            a.location_text,
            a.host_name,
            a.date_time ? new Date(a.date_time).toLocaleString("ru-RU") : "",
            a.time_text,
            a.entry_fee,
            a.is_free ? "да" : "нет",
            a.commission_percent,
            a.registered_count,
            a.max_participants,
            new Date(a.created_at).toLocaleString("ru-RU"),
          ]),
        ),
      };
    }

    if (data.kind === "registrations") {
      const { data: rows, error } = await supabase
        .from("registrations")
        .select(
          "id, status, payment_status, payment_reference, created_at, paid_at, activity:activities(title, sport, entry_fee), profile:profiles(name, phone, email)",
        )
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw new Error(error.message);
      return {
        filename: "sportura-registrations.csv",
        csv: toCsv(
          [
            "ID",
            "Активность",
            "Спорт",
            "Участник",
            "Телефон",
            "Email",
            "Статус записи",
            "Оплата",
            "Номер платежа",
            "Взнос",
            "Записан",
            "Оплачено",
          ],
          (rows ?? []).map((r: any) => [
            r.id,
            r.activity?.title,
            r.activity?.sport,
            r.profile?.name,
            r.profile?.phone,
            r.profile?.email,
            r.status,
            r.payment_status,
            r.payment_reference,
            r.activity?.entry_fee,
            new Date(r.created_at).toLocaleString("ru-RU"),
            r.paid_at ? new Date(r.paid_at).toLocaleString("ru-RU") : "",
          ]),
        ),
      };
    }

    const { data: rows, error } = await supabase
      .from("payment_status_history")
      .select(
        "id, previous_status, new_status, payment_reference, note, created_at, changed_by, activity:activities(title)",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return {
      filename: "sportura-payment-audit.csv",
      csv: toCsv(
        [
          "ID",
          "Активность",
          "Было",
          "Стало",
          "Номер платежа",
          "Заметка",
          "Кто изменил",
          "Когда",
        ],
        (rows ?? []).map((h: any) => [
          h.id,
          h.activity?.title,
          h.previous_status,
          h.new_status,
          h.payment_reference,
          h.note,
          h.changed_by,
          new Date(h.created_at).toLocaleString("ru-RU"),
        ]),
      ),
    };
  });

/** Commission report: the first 10 paid competitions are commission-free. */
export const getCommissionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("activities")
      .select(
        "id, title, type, entry_fee, commission_percent, registered_count, created_at",
      )
      .neq("type", "daily_game")
      .eq("is_free", false)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const list = (rows ?? []).map((a: any, index: number) => {
      const gross = Number(a.entry_fee ?? 0) * Number(a.registered_count ?? 0);
      const free = index < 10;
      const commission = free
        ? 0
        : Math.round((gross * Number(a.commission_percent ?? 10)) / 100);
      return {
        id: a.id as string,
        title: a.title as string,
        created_at: a.created_at as string,
        gross,
        commission,
        commission_free: free,
        prize_pool: gross - commission,
      };
    });

    return {
      freeRemaining: Math.max(0, 10 - list.length),
      grossTotal: list.reduce((s, a) => s + a.gross, 0),
      commissionTotal: list.reduce((s, a) => s + a.commission, 0),
      items: list.slice().reverse(),
    };
  });
