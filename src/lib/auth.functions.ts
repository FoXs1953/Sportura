import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalAuth, requireAuth } from "./auth-middleware";
import { authContinuationPath, safeAuthRedirect } from "./auth-redirect";
import type { Tx } from "./db.server";

const email = z.string().trim().toLowerCase().email().max(254);
const newPassword = z
  .string()
  .min(12, "Пароль должен содержать не менее 12 символов.")
  .max(200);

async function server() {
  const [auth, db, mail] = await Promise.all([
    import("./auth.server"),
    import("./db.server"),
    import("./mail.server"),
  ]);
  return { ...auth, ...db, ...mail };
}

export type SessionUser = { id: string; email: string | null };

export const getSessionUser = createServerFn({ method: "GET" })
  .middleware([optionalAuth])
  .handler(async ({ context }): Promise<SessionUser | null> => {
    if (!context.caller) return null;
    const { asService } = await server();
    const [row] = await asService(
      (tx) =>
        tx<
          { email: string | null }[]
        >`SELECT email FROM auth.users WHERE id = ${context.caller!.userId}`,
    );
    return row ? { id: context.caller.userId, email: row.email } : null;
  });

export const getAuthCapabilities = createServerFn({ method: "GET" }).handler(
  async () => ({
    email: Boolean(process.env["SMTP_URL"]?.trim()),
    google: Boolean(
      process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"],
    ),
    // SMS confirmation needs a messaging provider; none is configured yet.
    phone: false,
  }),
);

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email,
        password: z
          .string()
          .min(6, "Пароль должен быть не короче 6 символов.")
          .max(200),
        name: z.string().trim().max(80).default(""),
        redirect: z.string().optional().transform(safeAuthRedirect),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const s = await server();
    s.rateLimit(`signup:${s.clientKey()}`, 10, 60);
    s.requireMailConfigured();
    const hash = await s.hashPassword(data.password);
    try {
      await s.asService(async (tx) => {
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO auth.users (email, password_hash, raw_user_meta_data)
          VALUES (${data.email}, ${hash}, ${tx.json({ name: data.name || "Игрок" })})
          RETURNING id`;
        const token = await s.issueToken(
          tx,
          user!.id,
          "confirm_email",
          data.email,
          24 * 60,
        );
        await s.sendMail({
          to: data.email,
          subject: "Подтвердите e-mail в Sportura",
          text: `Здравствуйте!\n\nПодтвердите адрес, открыв ссылку (действует 24 часа):\n${s.appUrl()}${authContinuationPath("/api/auth/confirm", data.redirect, { token })}\n\nЕсли вы не регистрировались в Sportura, просто проигнорируйте письмо.`,
        });
        // No session until the address is confirmed; the link leads to sign-in.
      });
    } catch (error) {
      if (s.isUniqueViolation(error))
        throw new Error("Такой e-mail уже зарегистрирован. Войдите.");
      throw error;
    }
    return { ok: true };
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email,
        password: z.string().max(200),
        redirect: z.string().optional().transform(safeAuthRedirect),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const s = await server();
    s.rateLimit(`signin:${data.email}`, 10, 15);
    s.rateLimit(`signin-ip:${s.clientKey()}`, 50, 15);
    const unconfirmed = await s.asService(async (tx) => {
      const [user] = await tx<
        { id: string; password_hash: string | null; confirmed: boolean }[]
      >`
        SELECT id, password_hash,
               (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL) AS confirmed
        FROM auth.users WHERE email = ${data.email}`;
      const ok = await s.verifyPassword(
        data.password,
        user?.password_hash ?? null,
      );
      if (!user || !ok) throw new Error("Неверный e-mail или пароль.");
      if (!user.confirmed) return user.id;
      await s.signInUser(tx, user.id);
      return null;
    });
    if (unconfirmed) {
      // The password is correct, so a fresh link can be sent without revealing
      // anything new.
      await s.requireEmailConfirmation(async () => {
        s.rateLimit(`confirm:${unconfirmed}`, 5, 60);
        s.requireMailConfigured();
        await s.asService((tx) =>
          sendConfirmation(s, tx, unconfirmed, data.email, data.redirect),
        );
      });
    }
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ scope: z.enum(["local", "others"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await server();
    const { userId, sessionId } = context.caller;
    await s.asService((tx) =>
      data.scope === "local"
        ? tx`DELETE FROM auth.sessions WHERE id = ${sessionId}`
        : tx`DELETE FROM auth.sessions WHERE user_id = ${userId} AND id <> ${sessionId}`,
    );
    if (data.scope === "local") s.clearSessionCookie();
    return { ok: true };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email,
        redirect: z.string().optional().transform(safeAuthRedirect),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const s = await server();
    s.rateLimit(`reset:${data.email}`, 5, 60);
    s.rateLimit(`reset-ip:${s.clientKey()}`, 20, 60);
    // Configuration/service failures are identical for registered and unknown
    // addresses. Recipient-specific failures must not reveal account existence.
    await s.verifyMailService();
    try {
      await s.asService(async (tx) => {
        const [user] = await tx<
          { id: string }[]
        >`SELECT id FROM auth.users WHERE email = ${data.email}`;
        if (!user) return;
        const token = await s.issueToken(
          tx,
          user.id,
          "recovery",
          data.email,
          60,
        );
        await s.sendMail({
          to: data.email,
          subject: "Восстановление пароля Sportura",
          text: `Чтобы задать новый пароль, откройте ссылку (действует 1 час):\n${s.appUrl()}${authContinuationPath("/reset-password", data.redirect, { token })}\n\nЕсли вы не запрашивали смену пароля, проигнорируйте письмо.`,
        });
      });
    } catch (error) {
      // The failed token transaction rolls back, preserving any previous link.
      // Transport details are already sanitized and logged by sendMail().
      if (!(error instanceof s.MailDeliveryError)) throw error;
    }
    // This acknowledges the request, not delivery or account existence.
    return { ok: true };
  });

/** Checks a recovery link without using it up. */
export const checkRecoveryToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(20).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const s = await server();
    const found = await s.asService((tx) =>
      s.findToken(tx, data.token, ["recovery"], false),
    );
    return found ? { email: found.email } : null;
  });

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ token: z.string().min(20).max(100), password: newPassword })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const s = await server();
    const hash = await s.hashPassword(data.password);
    await s.asService(async (tx) => {
      const found = await s.findToken(tx, data.token, ["recovery"], true);
      if (!found) throw new Error("Ссылка устарела. Запросите новую.");
      // Opening the emailed link also proves the address belongs to the user.
      const updated = await tx`UPDATE auth.users
               SET password_hash = ${hash},
                   email_confirmed_at = COALESCE(email_confirmed_at, now()),
                   updated_at = now()
               WHERE id = ${found.user_id} AND email = ${found.email}`;
      if (updated.count !== 1)
        throw new Error("Ссылка устарела. Запросите новую.");
      await tx`DELETE FROM auth.sessions WHERE user_id = ${found.user_id}`;
      await s.invalidateIdentityTokens(tx, found.user_id);
    });
    s.clearSessionCookie();
    return { ok: true };
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        current: z.string().max(200).optional(),
        password: newPassword,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const s = await server();
    const { userId, sessionId } = context.caller;
    s.rateLimit(`password:${userId}`, 10, 15);
    const hash = await s.hashPassword(data.password);
    await s.asService(async (tx) => {
      const [user] = await tx<{ password_hash: string | null }[]>`
        SELECT password_hash FROM auth.users WHERE id = ${userId}`;
      if (
        user?.password_hash &&
        !(await s.verifyPassword(data.current ?? "", user.password_hash))
      ) {
        throw new Error("Текущий пароль указан неверно.");
      }
      await tx`UPDATE auth.users SET password_hash = ${hash}, updated_at = now() WHERE id = ${userId}`;
      await tx`DELETE FROM auth.sessions WHERE user_id = ${userId} AND id <> ${sessionId}`;
      await s.invalidateIdentityTokens(tx, userId);
    });
    return { ok: true };
  });

export const requestEmailChange = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ email }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await server();
    const { userId } = context.caller;
    s.rateLimit(`email-change:${userId}`, 5, 60);
    s.requireMailConfigured();
    const result = await s.asService(async (tx) => {
      const [taken] =
        await tx`SELECT 1 FROM auth.users WHERE email = ${data.email}`;
      if (taken)
        throw new Error("Этот e-mail уже используется другим аккаунтом.");
      const [user] = await tx<
        { email: string | null }[]
      >`SELECT email FROM auth.users WHERE id = ${userId}`;
      const token = await s.issueToken(
        tx,
        userId,
        "email_change",
        data.email,
        24 * 60,
      );
      await s.sendMail({
        to: data.email,
        subject: "Подтвердите новый e-mail в Sportura",
        text: `Чтобы привязать этот адрес к аккаунту Sportura, откройте ссылку (действует 24 часа):\n${s.appUrl()}/api/auth/confirm?token=${token}`,
      });
      return { previous: user?.email ?? null };
    });
    if (result.previous) {
      await s
        .sendMail({
          to: result.previous,
          subject: "Смена e-mail в Sportura",
          text: `Для вашего аккаунта запрошена смена адреса на ${data.email}. Если это были не вы, смените пароль и напишите в поддержку.`,
        })
        .catch(() => undefined);
    }
    return { ok: true };
  });

export const resendConfirmation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await server();
    const { userId } = context.caller;
    s.rateLimit(`confirm:${userId}`, 5, 60);
    s.requireMailConfigured();
    await s.asService(async (tx) => {
      const [user] = await tx<{ email: string | null; confirmed: boolean }[]>`
        SELECT email, email_confirmed_at IS NOT NULL AS confirmed FROM auth.users WHERE id = ${userId}`;
      if (!user?.email) throw new Error("В аккаунте не указан e-mail.");
      if (user.confirmed) throw new Error("Этот e-mail уже подтверждён.");
      await sendConfirmation(s, tx, userId, user.email);
    });
    return { ok: true };
  });

async function sendConfirmation(
  s: Awaited<ReturnType<typeof server>>,
  tx: Tx,
  userId: string,
  address: string,
  redirect = "/",
) {
  const token = await s.issueToken(
    tx,
    userId,
    "confirm_email",
    address,
    24 * 60,
  );
  await s.sendMail({
    to: address,
    subject: "Подтвердите e-mail в Sportura",
    text: `Подтвердите адрес, открыв ссылку (действует 24 часа):\n${s.appUrl()}${authContinuationPath("/api/auth/confirm", redirect, { token })}`,
  });
}

export type Identity = { provider: "email" | "google"; email: string | null };

export const getIdentities = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<Identity[]> => {
    const s = await server();
    const { userId } = context.caller;
    return s.asService(async (tx) => {
      const [user] = await tx<
        { email: string | null; has_password: boolean }[]
      >`
        SELECT email, password_hash IS NOT NULL AS has_password FROM auth.users WHERE id = ${userId}`;
      const linked = await tx<{ email: string | null }[]>`
        SELECT email FROM auth.identities WHERE user_id = ${userId} AND provider = 'google'`;
      return [
        ...(user?.has_password
          ? [{ provider: "email" as const, email: user.email }]
          : []),
        ...linked.map((i) => ({ provider: "google" as const, email: i.email })),
      ];
    });
  });

export const unlinkGoogle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await server();
    const { userId } = context.caller;
    await s.asService(async (tx) => {
      const [user] = await tx<{ has_password: boolean }[]>`
        SELECT password_hash IS NOT NULL AS has_password FROM auth.users WHERE id = ${userId}`;
      if (!user?.has_password)
        throw new Error("Нельзя отключить последний способ входа");
      await tx`DELETE FROM auth.identities WHERE user_id = ${userId} AND provider = 'google'`;
    });
    return { ok: true };
  });
