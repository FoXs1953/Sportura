import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { z } from "zod";
import type { Json } from "./database.types";
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
type Caller = { userId: string; sessionId: string };
const db = () => import("./db.server");
async function profileWorkspace(
  caller: Caller,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const { asUser } = await db();
  const [row] = await asUser(
    caller,
    (tx) =>
      tx<{ result: unknown }[]>`SELECT public.profile_workspace(${action}, ${tx.json(payload as never)}) AS result`,
  );
  return row?.result;
}
export const getProfileWorkspace = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return (await profileWorkspace(context.caller, "get")) as ProfileWorkspace;
  });
export const saveProfileSection = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ action: actionSchema, payload: z.record(z.unknown()) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    return (await profileWorkspace(
      context.caller,
      data.action,
      data.payload,
    )) as { ok: boolean; id?: string };
  });
export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return (await profileWorkspace(context.caller, "export")) as Json;
  });
export const getSupportAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return (await profileWorkspace(
      context.caller,
      "admin_tickets",
    )) as SupportTicket[];
  });
export const getPublicPlayer = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { asAnon } = await db();
    const [row] = await asAnon(
      (tx) =>
        tx<{ result: unknown }[]>`SELECT public.public_player_profile(${data.id}) AS result`,
    );
    const publicProfile = (row?.result ?? null) as {
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
      const files = await import("./files.server");
      if (!files.isExternal(publicProfile.avatar_url)) {
        publicProfile.avatar_url = files.isObjectName(publicProfile.avatar_url)
          ? files.signedUrl("avatars", publicProfile.avatar_url)
          : null;
      }
    }
    return publicProfile;
  });
export const updateMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().max(500).nullable() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context.caller;
    if (
      data.path &&
      (!data.path.startsWith(`${userId}/`) || data.path.includes(".."))
    )
      throw new Error("Некорректное фото");
    const { asUser } = await db();
    const previous = await asUser(context.caller, async (tx) => {
      const [row] = await tx<{ avatar_url: string | null }[]>`
        SELECT avatar_url FROM public.profiles WHERE id = ${userId}`;
      await tx`UPDATE public.profiles SET avatar_url = ${data.path} WHERE id = ${userId}`;
      return row?.avatar_url ?? null;
    });
    // One stored photo per user. External photos (Google) are not stored files.
    if (previous && previous !== data.path) {
      const { removeFiles } = await import("./files.server");
      await removeFiles(context.caller, "avatars", [previous]).catch(
        () => undefined,
      );
    }
    return { ok: true };
  });
export const updateMyContact = createServerFn({ method: "POST" })
  .middleware([requireAuth])
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
    const { asUser } = await db();
    await asUser(
      context.caller,
      (tx) =>
        tx`UPDATE public.profiles SET phone = ${data.phone || null} WHERE id = ${context.caller.userId}`,
    );
    return { ok: true };
  });
export const getMySessions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { asUser } = await db();
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<{ result: unknown }[]>`SELECT public.profile_sessions('list') AS result`,
    );
    return row?.result as {
      id: string;
      user_agent: string | null;
      created_at: string;
      last_active: string;
      current: boolean;
    }[];
  });
export const revokeMySession = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { asUser } = await db();
    await asUser(
      context.caller,
      (tx) => tx`SELECT public.profile_sessions('revoke', ${data.id})`,
    );
    return { ok: true };
  });
export const checkAccountDeletion = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { asUser } = await db();
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<{ result: unknown }[]>`SELECT public.profile_deletion_check() AS result`,
    );
    return row?.result as { allowed: boolean; blockers: string[] };
  });
export const getFeedPreferences = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { asUser } = await db();
    const [row] = await asUser(
      context.caller,
      (tx) =>
        tx<{ result: unknown }[]>`SELECT public.profile_preferences_for_feed() AS result`,
    );
    return row?.result as {
      city: string;
      sports: string[];
      days: number[];
      time_from: string;
      time_to: string;
      event_types: string[];
    };
  });
