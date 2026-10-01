import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { z } from "zod";
import type { AppRole } from "./sportura";

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
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MyProfile> => {
    const { userId } = context.caller;
    const { asUser } = await import("./db.server");
    const { p, roles, application } = await asUser(context.caller, async (tx) => ({
      p: (await tx<Record<string, unknown>[]>`
        SELECT * FROM public.profiles WHERE id = ${userId}`)[0],
      roles: await tx<{ role: AppRole }[]>`
        SELECT role FROM public.user_roles WHERE user_id = ${userId}`,
      application: (await tx<NonNullable<MyProfile["application"]>[]>`
        SELECT id, status, requested_role, motivation, admin_notes, created_at
        FROM public.manager_applications
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1`)[0],
    }));
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
      account_status:
        (p?.["account_status"] as MyProfile["account_status"]) ?? "active",
      roles: roles.map((r) => r.role),
      application: application ?? null,
    };
  });

export const applyForHostRole = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requested_role: z.enum(["sports_manager", "tournament_organizer"]),
        motivation: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context.caller;
    const { asService, asUser } = await import("./db.server");
    const [identity] = await asService(
      (tx) => tx<{ confirmed: boolean }[]>`
        SELECT (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL) AS confirmed
        FROM auth.users WHERE id = ${userId}`,
    );
    await asUser(context.caller, async (tx) => {
      const [profile] = await tx<
        { name: string | null; phone: string | null; account_status: string | null }[]
      >`SELECT name, phone, account_status FROM public.profiles WHERE id = ${userId}`;
      if (!profile) throw new Error("Профиль не найден");
      if (!identity?.confirmed) {
        throw new Error("Сначала подтвердите e-mail или телефон в профиле.");
      }
      if (profile.account_status && profile.account_status !== "active") {
        throw new Error(
          "Аккаунт ограничен, заявку рассмотреть нельзя. Напишите администратору.",
        );
      }
      if (!profile.name || profile.name.trim().length < 2) {
        throw new Error("Укажите имя и фамилию в профиле перед подачей заявки.");
      }
      if (!profile.phone) {
        throw new Error(
          "Укажите телефон в профиле — администратор должен связаться с вами.",
        );
      }
      const roles = (
        await tx<{ role: string }[]>`SELECT role FROM public.user_roles WHERE user_id = ${userId}`
      ).map((r) => r.role);
      if (roles.includes(data.requested_role) || roles.includes("admin")) {
        throw new Error("Эта роль у вас уже есть.");
      }
      const [pending] = await tx`
        SELECT 1 FROM public.manager_applications
        WHERE user_id = ${userId} AND status = 'pending'
        LIMIT 1`;
      if (pending) {
        throw new Error(
          "У вас уже есть заявка на рассмотрении. Дождитесь решения администратора.",
        );
      }
      await tx`INSERT INTO public.manager_applications (user_id, requested_role, motivation)
               VALUES (${userId}, ${data.requested_role}, ${data.motivation?.trim() || null})`;
    });
    return { ok: true };
  });
