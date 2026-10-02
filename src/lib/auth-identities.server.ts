import type { Tx } from "./db.server";

export class GoogleLinkNeedsConfirmationError extends Error {
  constructor() {
    super(
      "Этот e-mail уже зарегистрирован, но ещё не подтверждён. Восстановите пароль по e-mail, затем повторите вход через Google.",
    );
  }
}

/** Verified Google email can only automatically link a confirmed account. */
export async function accountForVerifiedGoogleEmail(tx: Tx, email: string) {
  const [user] = await tx<{ id: string; confirmed: boolean }[]>`
    SELECT id, email_confirmed_at IS NOT NULL AS confirmed
    FROM auth.users WHERE email = ${email}`;
  // An unconfirmed account may have been created by somebody who does not own
  // the email. Linking it would retain their password and active sessions.
  if (user && !user.confirmed) throw new GoogleLinkNeedsConfirmationError();
  return user?.id ?? null;
}
