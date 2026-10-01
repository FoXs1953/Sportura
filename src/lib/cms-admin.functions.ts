import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { z } from "zod";
import { kaspiLinkSchema, twoGisLinkSchema } from "@/lib/kz-validation";
import type { Tables } from "./database.types";
import type { Caller, Tx } from "./db.server";
import { asStaff } from "./staff";

async function assertAdmin(tx: Tx, caller: Caller) {
  const [row] = await tx<{ admin: boolean }[]>`
    SELECT public.has_role(${caller.userId}, 'admin') AS admin`;
  if (!row?.admin) throw new Error("Доступ только для администраторов.");
}

/** Runs fn as the caller after checking the admin role; RLS still applies. */
async function asAdmin<T>(caller: Caller, fn: (tx: Tx) => Promise<T>) {
  const { asUser } = await import("./db.server");
  return asUser(caller, async (tx) => {
    await assertAdmin(tx, caller);
    return fn(tx);
  });
}

async function logAction(
  tx: Tx,
  caller: Caller,
  action: string,
  entity: string,
  entityId: string | null,
  payload: Record<string, unknown> = {},
) {
  await tx`INSERT INTO public.admin_audit_log (actor_id, action, entity, entity_id, payload)
           VALUES (${caller.userId}, ${action}, ${entity}, ${entityId}, ${tx.json(payload as never)})`;
}

/* ---------------- Content blocks ---------------- */

const blockSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  page: z.string().min(1).max(40).default("home"),
  kind: z.enum(["hero", "banner", "text", "cards", "faq", "cta"]).default("text"),
  title: z.string().max(160).optional().nullable(),
  subtitle: z.string().max(240).optional().nullable(),
  body: z.string().max(4000).optional().nullable(),
  image_url: z.string().url().max(600).optional().nullable().or(z.literal("")),
  cta_label: z.string().max(60).optional().nullable(),
  cta_url: z.string().max(600).optional().nullable(),
  items: z
    .array(z.object({ title: z.string().max(160).default(""), text: z.string().max(600).default("") }))
    .max(12)
    .default([]),
  position: z.number().int().min(0).max(999).default(0),
  published: z.boolean().default(true),
});

export const listBlocksAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asStaff(context.caller, async (tx) => [
      ...(await tx<Tables<"content_blocks">[]>`
        SELECT * FROM public.content_blocks ORDER BY page, position`),
    ]),
  );

export const saveBlock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => blockSchema.parse(input))
  .handler(async ({ data, context }) =>
    asStaff(context.caller, async (tx) => {
      const { id, ...rest } = data;
      const row = {
        page: rest.page,
        kind: rest.kind,
        title: rest.title ?? null,
        subtitle: rest.subtitle ?? null,
        body: rest.body ?? null,
        image_url: rest.image_url ? rest.image_url : null,
        cta_label: rest.cta_label ?? null,
        cta_url: rest.cta_url ?? null,
        items: tx.json(rest.items),
        position: rest.position,
        published: rest.published,
        updated_by: context.caller.userId,
      };
      if (id) {
        await tx`UPDATE public.content_blocks SET ${tx(row)} WHERE id = ${id}`;
        await logAction(tx, context.caller, "block.update", "content_blocks", id, { page: row.page });
        return { id };
      }
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO public.content_blocks ${tx(row)} RETURNING id`;
      await logAction(tx, context.caller, "block.create", "content_blocks", created!.id, {
        page: row.page,
      });
      return { id: created!.id };
    }),
  );

export const deleteBlock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) =>
    asStaff(context.caller, async (tx) => {
      await tx`DELETE FROM public.content_blocks WHERE id = ${data.id}`;
      await logAction(tx, context.caller, "block.delete", "content_blocks", data.id);
      return { ok: true };
    }),
  );

export const moveBlock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }).parse(input),
  )
  .handler(async ({ data, context }) =>
    asStaff(context.caller, async (tx) => {
      const [current] = await tx<{ position: number }[]>`
        SELECT position FROM public.content_blocks WHERE id = ${data.id}`;
      if (!current) throw new Error("Блок не найден.");
      const delta = data.direction === "up" ? -1 : 1;
      const next = Math.max(0, current.position + delta);
      await tx`UPDATE public.content_blocks
               SET position = ${next}, updated_by = ${context.caller.userId}
               WHERE id = ${data.id}`;
      return { position: next };
    }),
  );

export const toggleBlock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), published: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) =>
    asStaff(context.caller, async (tx) => {
      await tx`UPDATE public.content_blocks
               SET published = ${data.published}, updated_by = ${context.caller.userId}
               WHERE id = ${data.id}`;
      await logAction(
        tx,
        context.caller,
        data.published ? "block.publish" : "block.hide",
        "content_blocks",
        data.id,
      );
      return { ok: true };
    }),
  );

/* ---------------- Site settings ---------------- */

export const listSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asAdmin(context.caller, async (tx) => [
      ...(await tx<Pick<Tables<"site_settings">, "key" | "value" | "updated_at">[]>`
        SELECT key, value, updated_at FROM public.site_settings`),
    ]),
  );

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.enum(["general", "catalog", "business"]),
        value: z.record(z.string(), z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    asAdmin(context.caller, async (tx) => {
      await tx`INSERT INTO public.site_settings (key, value, updated_by)
               VALUES (${data.key}, ${tx.json(data.value as never)}, ${context.caller.userId})
               ON CONFLICT (key) DO UPDATE
               SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`;
      await logAction(tx, context.caller, "settings.update", "site_settings", data.key, data.value);
      return { ok: true };
    }),
  );

/* ---------------- Roles ---------------- */

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum([
          "participant",
          "sports_manager",
          "tournament_organizer",
          "moderator",
          "admin",
        ]),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    asAdmin(context.caller, async (tx) => {
      if (!data.grant && data.role === "admin") {
        if (data.userId === context.caller.userId) {
          throw new Error("Нельзя снять роль администратора с себя.");
        }
        const [admins] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM public.user_roles WHERE role = 'admin'`;
        if ((admins?.n ?? 0) <= 1) throw new Error("Должен остаться хотя бы один администратор.");
      }
      if (data.grant) {
        await tx`INSERT INTO public.user_roles (user_id, role)
                 VALUES (${data.userId}, ${data.role})
                 ON CONFLICT (user_id, role) DO NOTHING`;
      } else {
        await tx`DELETE FROM public.user_roles WHERE user_id = ${data.userId} AND role = ${data.role}`;
      }
      await logAction(
        tx,
        context.caller,
        data.grant ? "role.grant" : "role.revoke",
        "user_roles",
        data.userId,
        { role: data.role },
      );
      return { ok: true };
    }),
  );

/* ---------------- Activity moderation ---------------- */

export const moderateActivity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        activityId: z.string().uuid(),
        action: z.enum(["cancel", "reopen", "complete", "hide", "publish", "delete"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    asStaff(context.caller, async (tx) => {
      if (data.action === "delete") {
        await assertAdmin(tx, context.caller);
        await tx`DELETE FROM public.activities WHERE id = ${data.activityId}`;
        await logAction(tx, context.caller, "activity.delete", "activities", data.activityId);
        return { ok: true };
      }
      const patch: Record<string, string | boolean> =
        data.action === "cancel"
          ? { status: "cancelled" }
          : data.action === "reopen"
            ? { status: "open" }
            : data.action === "complete"
              ? { status: "completed" }
              : data.action === "hide"
                ? { is_private: true }
                : { is_private: false };
      await tx`UPDATE public.activities SET ${tx(patch)} WHERE id = ${data.activityId}`;
      await logAction(tx, context.caller, `activity.${data.action}`, "activities", data.activityId, patch);
      return { ok: true };
    }),
  );

/* ---------------- Activity card editing (admins) ---------------- */

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));

const FIELD_LABEL: Record<string, string> = {
  title: "Название",
  sport: "Вид спорта",
  city: "Город",
  host_name: "Организатор",
  location_text: "Место",
  two_gis_url: "Ссылка 2ГИС",
  kaspi_payment_link: "Ссылка Kaspi",
  max_participants: "Максимум участников",
  entry_fee: "Взнос",
  commission_percent: "Комиссия",
};

const activityEditSchema = z.object({
  activityId: z.string().uuid(),
  title: z.string().min(3, "Название — минимум 3 символа").max(120),
  sport: z.string().min(2, "Укажите вид спорта").max(40),
  city: z.string().min(2, "Укажите город").max(60),
  host_name: z.string().min(2, "Укажите организатора").max(120),
  location_text: z.string().min(3, "Укажите место проведения").max(200),
  two_gis_url: twoGisLinkSchema,
  kaspi_payment_link: kaspiLinkSchema,
  time_text: optionalText(120),
  date_time: optionalText(40),
  registration_deadline: optionalText(40),
  price_text: optionalText(60),
  entry_fee: z.number().nonnegative().max(10_000_000).nullable().optional(),
  max_participants: z.number().int().min(2).max(500),
  status: z.enum(["open", "nearly_full", "full", "completed", "cancelled"]),
  is_private: z.boolean(),
  description: optionalText(2000),
  skill_level: optionalText(40),
  age_division: optionalText(40),
  format: optionalText(60),
  recurrence: optionalText(80),
  cancellation_policy: optionalText(600),
  notes: optionalText(600),
  commission_percent: z.number().min(0).max(50),
});

export const updateActivityAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => {
    const parsed = activityEditSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = String(issue.path[0] ?? "");
      const label = FIELD_LABEL[field];
      throw new Error(label ? `${label}: ${issue.message}` : issue.message);
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) =>
    asStaff(context.caller, async (tx) => {
      const { activityId, entry_fee, ...rest } = data;
      const fee = entry_fee ?? null;
      // Omitted optional fields stay unchanged, as with the previous API client.
      const provided = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined),
      ) as Record<string, string | number | boolean | null>;
      const patch: Record<string, string | number | boolean | null> = {
        ...provided,
        entry_fee: fee,
        is_free: !fee || fee === 0,
        date_time: rest.date_time ? new Date(rest.date_time).toISOString() : null,
        registration_deadline: rest.registration_deadline
          ? new Date(rest.registration_deadline).toISOString()
          : null,
      };
      const [current] = await tx<{ invite_code: string | null; registered_count: number | null }[]>`
        SELECT invite_code, registered_count FROM public.activities WHERE id = ${activityId}`;
      if (!current) throw new Error("Активность не найдена.");
      if (data.max_participants < (current.registered_count ?? 0)) {
        throw new Error("Мест не может быть меньше, чем уже записалось участников.");
      }
      if (data.is_private && !current.invite_code) {
        patch["invite_code"] = crypto.randomUUID().slice(0, 8);
      }
      await tx`UPDATE public.activities SET ${tx(patch)} WHERE id = ${activityId}`;
      await logAction(tx, context.caller, "activity.edit", "activities", activityId, {
        title: data.title,
      });
      return { ok: true };
    }),
  );

/* ---------------- Admin audit log ---------------- */

export const listAdminLog = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) =>
    asAdmin(context.caller, async (tx) => [
      ...(await tx<
        (Pick<
          Tables<"admin_audit_log">,
          "id" | "actor_id" | "action" | "entity" | "entity_id" | "payload" | "created_at"
        > & { actor: { name: string; email: string | null } | null })[]
      >`SELECT l.id, l.actor_id, l.action, l.entity, l.entity_id, l.payload, l.created_at,
               CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name', p.name, 'email', p.email) END AS actor
        FROM public.admin_audit_log l
        LEFT JOIN public.profiles p ON p.id = l.actor_id
        ORDER BY l.created_at DESC
        LIMIT 200`),
    ]),
  );
