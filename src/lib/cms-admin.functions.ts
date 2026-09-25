import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { kaspiLinkSchema, twoGisLinkSchema } from "@/lib/kz-validation";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Доступ только для администраторов.");
}

async function logAction(
  context: { supabase: any; userId: string },
  action: string,
  entity: string,
  entityId: string | null,
  payload: Record<string, unknown> = {},
) {
  const { error } = await context.supabase.from("admin_audit_log").insert({
    actor_id: context.userId,
    action,
    entity,
    entity_id: entityId,
    payload: payload as any,
  });
  if (error) console.error("admin_audit_log insert failed", error.message);
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("content_blocks")
      .select("*")
      .order("page", { ascending: true })
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => blockSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...rest } = data;
    const row: any = {
      ...rest,
      image_url: rest.image_url ? rest.image_url : null,
      updated_by: context.userId,
    };
    if (id) {
      const { error } = await context.supabase.from("content_blocks").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      await logAction(context, "block.update", "content_blocks", id, { page: row.page });
      return { id };
    }
    const { data: created, error } = await context.supabase
      .from("content_blocks")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAction(context, "block.create", "content_blocks", created.id, { page: row.page });
    return created;
  });

export const deleteBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("content_blocks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context, "block.delete", "content_blocks", data.id);
    return { ok: true };
  });

export const moveBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const current = await context.supabase
      .from("content_blocks")
      .select("id, page, position")
      .eq("id", data.id)
      .maybeSingle();
    if (!current.data) throw new Error("Блок не найден.");
    const delta = data.direction === "up" ? -1 : 1;
    const next = Math.max(0, current.data.position + delta);
    const { error } = await context.supabase
      .from("content_blocks")
      .update({ position: next, updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { position: next };
  });

export const toggleBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), published: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("content_blocks")
      .update({ published: data.published, updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAction(context, data.published ? "block.publish" : "block.hide", "content_blocks", data.id);
    return { ok: true };
  });

/* ---------------- Site settings ---------------- */

export const listSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.from("site_settings").select("key, value, updated_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.enum(["general", "catalog", "business"]),
        value: z.record(z.string(), z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("site_settings")
      .upsert({ key: data.key, value: data.value as any, updated_by: context.userId } as any, {
        onConflict: "key",
      });
    if (error) throw new Error(error.message);
    await logAction(context, "settings.update", "site_settings", data.key, data.value);
    return { ok: true };
  });

/* ---------------- Roles ---------------- */

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["participant", "sports_manager", "tournament_organizer", "admin"]),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.grant && data.role === "admin") {
      if (data.userId === context.userId) {
        throw new Error("Нельзя снять роль администратора с себя.");
      }
      const admins = await context.supabase.from("user_roles").select("user_id").eq("role", "admin");
      if ((admins.data ?? []).length <= 1) throw new Error("Должен остаться хотя бы один администратор.");
    }
    if (data.grant) {
      const { error } = await context.supabase
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await logAction(context, data.grant ? "role.grant" : "role.revoke", "user_roles", data.userId, {
      role: data.role,
    });
    return { ok: true };
  });

/* ---------------- Activity moderation ---------------- */

export const moderateActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        activityId: z.string().uuid(),
        action: z.enum(["cancel", "reopen", "complete", "hide", "publish", "delete"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    if (data.action === "delete") {
      const { error } = await supabase.from("activities").delete().eq("id", data.activityId);
      if (error) throw new Error(error.message);
      await logAction(context, "activity.delete", "activities", data.activityId);
      return { ok: true };
    }
    const patch: any =
      data.action === "cancel"
        ? { status: "cancelled" }
        : data.action === "reopen"
          ? { status: "open" }
          : data.action === "complete"
            ? { status: "completed" }
            : data.action === "hide"
              ? { is_private: true }
              : { is_private: false };
    const { error } = await supabase.from("activities").update(patch).eq("id", data.activityId);
    if (error) throw new Error(error.message);
    await logAction(context, `activity.${data.action}`, "activities", data.activityId, patch);
    return { ok: true };
  });

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
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { activityId, entry_fee, ...rest } = data;
    const fee = entry_fee ?? null;
    const patch: any = {
      ...rest,
      entry_fee: fee,
      is_free: !fee || fee === 0,
      date_time: rest.date_time ? new Date(rest.date_time).toISOString() : null,
      registration_deadline: rest.registration_deadline
        ? new Date(rest.registration_deadline).toISOString()
        : null,
    };
    const current = await context.supabase
      .from("activities")
      .select("invite_code, registered_count")
      .eq("id", activityId)
      .maybeSingle();
    if (!current.data) throw new Error("Активность не найдена.");
    if (patch.max_participants < (current.data.registered_count ?? 0)) {
      throw new Error("Мест не может быть меньше, чем уже записалось участников.");
    }
    if (patch.is_private && !current.data.invite_code) {
      patch.invite_code = crypto.randomUUID().slice(0, 8);
    }
    const { error } = await context.supabase.from("activities").update(patch).eq("id", activityId);
    if (error) throw new Error(error.message);
    await logAction(context, "activity.edit", "activities", activityId, { title: patch.title });
    return { ok: true };
  });


/* ---------------- Admin audit log ---------------- */

export const listAdminLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("admin_audit_log")
      .select("id, actor_id, action, entity, entity_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const actors = await context.supabase.from("profiles").select("id, name, email");
    const byId: Record<string, { name: string; email: string | null }> = {};
    for (const p of (actors.data ?? []) as { id: string; name: string; email: string | null }[]) {
      byId[p.id] = { name: p.name, email: p.email };
    }
    return (data ?? []).map((row: any) => ({ ...row, actor: row.actor_id ? byId[row.actor_id] : null }));
  });
