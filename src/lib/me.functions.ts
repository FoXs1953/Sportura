import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { AppRole } from "./sportura";
import { kaspiLinkSchema, kzPhoneSchema } from "@/lib/kz-validation";

export type MyProfile = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  sports: string[];
  city: string;
  verified: boolean;
  kaspi_payment_link: string | null;
  rating: number | null;
  rating_count: number;
  no_show_count: number;
  dispute_count: number;
  cancellation_count: number;
  account_status: "active" | "flagged" | "suspended" | "banned";
  roles: AppRole[];
  application: {
    id: string;
    status: "pending" | "approved" | "rejected";
    requested_role: AppRole;
    motivation: string | null;
    admin_notes: string | null;
    created_at: string;
  } | null;
};

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyProfile> => {
    const { supabase, userId } = context;
    const [profileRes, rolesRes, appRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("manager_applications")
        .select("id, status, requested_role, motivation, admin_notes, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (profileRes.error) throw new Error(profileRes.error.message);
    const p = profileRes.data as Record<string, unknown> | null;
    return {
      id: userId,
      name: (p?.["name"] as string) ?? "Игрок",
      phone: (p?.["phone"] as string) ?? null,
      email: (p?.["email"] as string) ?? null,
      avatar_url: (p?.["avatar_url"] as string) ?? null,
      sports: (p?.["sports"] as string[]) ?? [],
      city: (p?.["city"] as string) ?? "Астана",
      verified: Boolean(p?.["verified"]),
      kaspi_payment_link: (p?.["kaspi_payment_link"] as string) ?? null,
      rating: (p?.["rating"] as number) ?? null,
      rating_count: (p?.["rating_count"] as number) ?? 0,
      no_show_count: (p?.["no_show_count"] as number) ?? 0,
      dispute_count: (p?.["dispute_count"] as number) ?? 0,
      cancellation_count: (p?.["cancellation_count"] as number) ?? 0,
      account_status: (p?.["account_status"] as MyProfile["account_status"]) ?? "active",
      roles: ((rolesRes.data ?? []) as { role: AppRole }[]).map((r) => r.role),
      application: (appRes.data as MyProfile["application"]) ?? null,
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(2).max(80),
        phone: kzPhoneSchema,
        city: z.string().max(60),
        sports: z.array(z.string().max(40)).max(10),
        kaspi_payment_link: kaspiLinkSchema,
        avatar_url: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        name: data.name,
        phone: data.phone ?? null,
        city: data.city,
        sports: data.sports,
        kaspi_payment_link: data.kaspi_payment_link ?? null,
        ...(data.avatar_url === undefined ? {} : { avatar_url: data.avatar_url }),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Marks the account as verified once the email/phone is confirmed in the session claims. */
export const confirmVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = context.claims as Record<string, unknown>;
    const verified = Boolean(claims["email"]) || Boolean(claims["phone"]);
    if (!verified) return { verified: false };
    const { error } = await context.supabase
      .from("profiles")
      .update({ verified: true })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { verified: true };
  });

export const applyForHostRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requested_role: z.enum(["sports_manager", "tournament_organizer"]),
        motivation: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [profileRes, rolesRes, pendingRes] = await Promise.all([
      supabase.from("profiles").select("name, phone, verified, account_status").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("manager_applications")
        .select("id, requested_role")
        .eq("user_id", userId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle(),
    ]);
    const profile = profileRes.data as
      | { name?: string; phone?: string | null; verified?: boolean; account_status?: string }
      | null;
    if (!profile?.verified) {
      throw new Error("Сначала подтвердите e-mail или телефон в профиле.");
    }
    if (profile.account_status && profile.account_status !== "active") {
      throw new Error("Аккаунт ограничен, заявку рассмотреть нельзя. Напишите администратору.");
    }
    if (!profile.name || profile.name.trim().length < 2) {
      throw new Error("Укажите имя и фамилию в профиле перед подачей заявки.");
    }
    if (!profile.phone) {
      throw new Error("Укажите телефон в профиле — администратор должен связаться с вами.");
    }
    const roles = ((rolesRes.data ?? []) as { role: string }[]).map((r) => r.role);
    if (roles.includes(data.requested_role) || roles.includes("admin")) {
      throw new Error("Эта роль у вас уже есть.");
    }
    if (pendingRes.data) {
      throw new Error("У вас уже есть заявка на рассмотрении. Дождитесь решения администратора.");
    }
    const { error } = await supabase.from("manager_applications").insert({
      user_id: userId,
      requested_role: data.requested_role,
      motivation: data.motivation?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("registrations")
      .select(
        "id, status, payment_status, payment_reference, receipt_url, created_at, activity:activities(id, title, sport, type, status, location_text, two_gis_url, time_text, date_time, price_text, entry_fee, max_participants, registered_count, host_name, host_rating, kaspi_payment_link, manager_id, organizer_id, results_submitted_at, dispute_window_ends_at)",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
