import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { z } from "zod";
import type { Tables } from "./database.types";
import type { Caller, Tx } from "./db.server";
import { asStaff } from "./staff";

/** Runs fn as the caller after checking the admin role; RLS still applies. */
async function asAdmin<T>(caller: Caller, fn: (tx: Tx) => Promise<T>) {
  const { asUser } = await import("./db.server");
  return asUser(caller, async (tx) => {
    const [row] = await tx<{ admin: boolean }[]>`
      SELECT public.has_role(${caller.userId}, 'admin') AS admin`;
    if (!row?.admin) throw new Error("Доступ только для администраторов.");
    return fn(tx);
  });
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asStaff(context.caller, async (tx) => {
      const [counts] = await tx<
        {
          users: number;
          flagged: number;
          applications_pending: number;
          disputes_open: number;
          escrow: number;
        }[]
      >`SELECT
          (public.staff_overview_counts()->>'total')::int AS users,
          (public.staff_overview_counts()->>'flagged')::int AS flagged,
          (SELECT count(*) FROM public.manager_applications WHERE status = 'pending')::int AS applications_pending,
          (SELECT count(*) FROM public.disputes WHERE status = 'open')::int AS disputes_open,
          (SELECT COALESCE(sum(amount), 0) FROM public.transactions WHERE status = 'pending')::float8 AS escrow`;
      const regs = await tx<{ payment_status: string }[]>`
        SELECT payment_status FROM public.registrations`;
      const acts = await tx<
        {
          type: string;
          status: string;
          entry_fee: number | null;
          commission_percent: number;
          registered_count: number;
        }[]
      >`SELECT type, status, entry_fee, commission_percent, registered_count FROM public.activities`;

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
        users: { total: counts!.users, flagged: counts!.flagged },
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
        disputesOpen: counts!.disputes_open,
        applicationsPending: counts!.applications_pending,
        escrowBalance: counts!.escrow,
        commissionRevenue: Math.round(commission),
      };
    }),
  );

type UserRow = Pick<
  Tables<"profiles">,
  | "id"
  | "name"
  | "phone"
  | "email"
  | "city"
  | "verified"
  | "rating"
  | "rating_count"
  | "no_show_count"
  | "dispute_count"
  | "cancellation_count"
  | "account_status"
  | "created_at"
>;

export const listUsersAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asAdmin(context.caller, async (tx) => {
      const rows = await tx<(UserRow & { roles: string[] })[]>`
        SELECT p.id, p.name, p.phone, p.email, p.city, p.verified, p.rating, p.rating_count,
               p.no_show_count, p.dispute_count, p.cancellation_count, p.account_status, p.created_at,
               COALESCE((SELECT array_agg(r.role::text) FROM public.user_roles r WHERE r.user_id = p.id), '{}') AS roles
        FROM public.profiles p
        ORDER BY p.created_at DESC
        LIMIT 200`;
      return [...rows];
    }),
  );

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
  profile: AppProfile | null;
};

export const listApplicationsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asStaff(context.caller, async (tx) => {
      const rows = await tx<AppRow[]>`
        SELECT a.id, a.user_id, a.requested_role, a.motivation, a.status, a.admin_notes,
               a.created_at, a.reviewed_at,
               CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
                 'id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone,
                 'verified', p.verified, 'rating', p.rating, 'account_status', p.account_status
               ) END AS profile
        FROM public.manager_applications a
        LEFT JOIN public.profiles p ON p.id = a.user_id
        ORDER BY a.created_at DESC`;
      return [...rows];
    }),
  );

export const reviewApplication = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    await asStaff(
      context.caller,
      (tx) =>
        tx`SELECT public.staff_review_application(${data.applicationId}, ${data.approve}, ${data.notes ?? null})`,
    );
    return { ok: true };
  });

export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const active = data.status === "active";
    await asAdmin(
      context.caller,
      (tx) => tx`UPDATE public.profiles
                 SET account_status = ${data.status},
                     restriction_reason = ${active ? null : (data.notes ?? null)},
                     restriction_until = ${active ? null : (data.restrictionUntil ?? null)}
                 WHERE id = ${data.userId}`,
    );
    return { ok: true };
  });

export const listActivitiesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asStaff(context.caller, async (tx) => [
      ...(await tx<Tables<"activities">[]>`
        SELECT * FROM public.activities ORDER BY created_at DESC LIMIT 200`),
    ]),
  );

type AuditRow = {
  id: string;
  previous_status: string | null;
  new_status: string;
  note: string | null;
  payment_reference: string | null;
  created_at: string;
  changed_by: string | null;
  activity: { title: string } | null;
};

export const listPaymentAudit = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asStaff(context.caller, async (tx) => [
      ...(await tx<AuditRow[]>`
        SELECT h.id, h.previous_status, h.new_status, h.note, h.payment_reference, h.created_at, h.changed_by,
               CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('title', a.title) END AS activity
        FROM public.payment_status_history h
        LEFT JOIN public.activities a ON a.id = h.activity_id
        ORDER BY h.created_at DESC
        LIMIT 200`),
    ]),
  );

export const listDisputesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asStaff(context.caller, async (tx) => [
      ...(await tx<
        {
          id: string;
          reason: string;
          status: string;
          admin_notes: string | null;
          created_at: string;
          user_id: string;
          activity: { id: string; title: string } | null;
        }[]
      >`SELECT d.id, d.reason, d.status, d.admin_notes, d.created_at, d.user_id,
               CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id', a.id, 'title', a.title) END AS activity
        FROM public.disputes d
        LEFT JOIN public.activities a ON a.id = d.activity_id
        ORDER BY d.created_at DESC`),
    ]),
  );

export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    await asStaff(
      context.caller,
      (tx) => tx`UPDATE public.disputes
                 SET status = ${data.status}, admin_notes = ${data.notes ?? null},
                     resolved_by = ${context.caller.userId}, resolved_at = now()
                 WHERE id = ${data.disputeId}`,
    );
    return { ok: true };
  });

export const listPaymentEvents = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asAdmin(context.caller, async (tx) => [
      ...(await tx<
        Pick<
          Tables<"payment_events">,
          | "id"
          | "provider"
          | "event_type"
          | "external_event_id"
          | "external_payment_id"
          | "signature_valid"
          | "processed"
          | "processing_error"
          | "created_at"
        >[]
      >`SELECT id, provider, event_type, external_event_id, external_payment_id,
               signature_valid, processed, processing_error, created_at
        FROM public.payment_events
        ORDER BY created_at DESC
        LIMIT 100`),
    ]),
  );

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
  return `﻿${lines.join("\r\n")}`;
}

const ruDate = (value: string | null) =>
  value ? new Date(value).toLocaleString("ru-RU") : "";

/** Admin-only CSV export for reporting and reconciliation. */
export const exportAdminCsv = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: z.enum(CSV_KINDS) }).parse(input),
  )
  .handler(async ({ data, context }) =>
    asAdmin(context.caller, async (tx) => {
      if (data.kind === "users") {
        const rows = await tx<Tables<"profiles">[]>`
          SELECT id, name, email, phone, city, verified, account_status, rating, rating_count,
                 reliability_rating, no_show_count, cancellation_count, dispute_count, created_at
          FROM public.profiles ORDER BY created_at DESC LIMIT 5000`;
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
            rows.map((u) => [
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
              ruDate(u.created_at),
            ]),
          ),
        };
      }

      if (data.kind === "activities") {
        const rows = await tx<Tables<"activities">[]>`
          SELECT id, title, type, status, sport, city, location_text, host_name, date_time, time_text,
                 entry_fee, is_free, commission_percent, registered_count, max_participants, created_at
          FROM public.activities ORDER BY created_at DESC LIMIT 5000`;
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
            rows.map((a) => [
              a.id,
              a.title,
              a.type,
              a.status,
              a.sport,
              a.city,
              a.location_text,
              a.host_name,
              ruDate(a.date_time),
              a.time_text,
              a.entry_fee,
              a.is_free ? "да" : "нет",
              a.commission_percent,
              a.registered_count,
              a.max_participants,
              ruDate(a.created_at),
            ]),
          ),
        };
      }

      if (data.kind === "registrations") {
        const rows = await tx<
          {
            id: string;
            status: string;
            payment_status: string;
            payment_reference: string | null;
            created_at: string;
            paid_at: string | null;
            title: string | null;
            sport: string | null;
            entry_fee: number | null;
            name: string | null;
            phone: string | null;
            email: string | null;
          }[]
        >`SELECT r.id, r.status, r.payment_status, r.payment_reference, r.created_at, r.paid_at,
                 a.title, a.sport, a.entry_fee, p.name, p.phone, p.email
          FROM public.registrations r
          LEFT JOIN public.activities a ON a.id = r.activity_id
          LEFT JOIN public.profiles p ON p.id = r.user_id
          ORDER BY r.created_at DESC LIMIT 5000`;
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
            rows.map((r) => [
              r.id,
              r.title,
              r.sport,
              r.name,
              r.phone,
              r.email,
              r.status,
              r.payment_status,
              r.payment_reference,
              r.entry_fee,
              ruDate(r.created_at),
              ruDate(r.paid_at),
            ]),
          ),
        };
      }

      const rows = await tx<
        {
          id: string;
          previous_status: string | null;
          new_status: string;
          payment_reference: string | null;
          note: string | null;
          created_at: string;
          changed_by: string | null;
          title: string | null;
        }[]
      >`SELECT h.id, h.previous_status, h.new_status, h.payment_reference, h.note, h.created_at,
               h.changed_by, a.title
        FROM public.payment_status_history h
        LEFT JOIN public.activities a ON a.id = h.activity_id
        ORDER BY h.created_at DESC LIMIT 5000`;
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
          rows.map((h) => [
            h.id,
            h.title,
            h.previous_status,
            h.new_status,
            h.payment_reference,
            h.note,
            h.changed_by,
            ruDate(h.created_at),
          ]),
        ),
      };
    }),
  );

/** Commission report: the first 10 paid competitions are commission-free. */
export const getCommissionReport = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await asStaff(
      context.caller,
      (tx) => tx<
        {
          id: string;
          title: string;
          entry_fee: number | null;
          commission_percent: number | null;
          registered_count: number | null;
          created_at: string;
        }[]
      >`SELECT id, title, entry_fee, commission_percent, registered_count, created_at
        FROM public.activities
        WHERE type <> 'daily_game' AND is_free = false
        ORDER BY created_at ASC
        LIMIT 500`,
    );

    const list = rows.map((a, index) => {
      const gross = Number(a.entry_fee ?? 0) * Number(a.registered_count ?? 0);
      const free = index < 10;
      const commission = free
        ? 0
        : Math.round((gross * Number(a.commission_percent ?? 10)) / 100);
      return {
        id: a.id,
        title: a.title,
        created_at: a.created_at,
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

export const listPendingPayments = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asStaff(context.caller, async (tx) => [
      ...(await tx<
        {
          id: string;
          payment_reference: string | null;
          receipt_url: string | null;
          created_at: string;
          activity: { title: string } | null;
        }[]
      >`SELECT r.id, r.payment_reference, r.receipt_url, r.created_at,
               CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('title', a.title) END AS activity
        FROM public.registrations r
        LEFT JOIN public.activities a ON a.id = r.activity_id
        WHERE r.payment_status = 'needs_review'
        ORDER BY r.created_at
        LIMIT 200`),
    ]),
  );

export const reviewStaffPayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => input)
  .handler(async () => {
    throw new Error("Платежи отключены");
  });
