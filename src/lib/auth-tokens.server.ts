import { createHash, randomBytes } from "node:crypto";
import type { Tx } from "./db.server";

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("base64url");

type TokenPurpose = "confirm_email" | "recovery" | "email_change";

export async function issueToken(
  tx: Tx,
  userId: string,
  purpose: TokenPurpose,
  email: string,
  minutes: number,
): Promise<string> {
  const token = newToken();
  await tx`DELETE FROM auth.one_time_tokens WHERE user_id = ${userId} AND purpose = ${purpose}`;
  await tx`INSERT INTO auth.one_time_tokens (token_hash, user_id, purpose, email, expires_at)
           VALUES (${sha256(token)}, ${userId}, ${purpose}, ${email}, now() + make_interval(mins => ${minutes}))`;
  return token;
}

export async function findToken(
  tx: Tx,
  token: string,
  purposes: TokenPurpose[],
  consume: boolean,
) {
  // Confirmation/recovery links prove ownership of the address they were sent
  // to. They cannot authenticate an account after its address has changed.
  const rows = consume
    ? await tx<{ user_id: string; purpose: TokenPurpose; email: string }[]>`
        DELETE FROM auth.one_time_tokens t USING auth.users u
        WHERE t.user_id = u.id AND t.token_hash = ${sha256(token)}
          AND t.purpose IN ${tx(purposes)} AND t.expires_at > now()
          AND (t.purpose = 'email_change' OR t.email = u.email)
        RETURNING t.user_id, t.purpose, t.email`
    : await tx<{ user_id: string; purpose: TokenPurpose; email: string }[]>`
        SELECT t.user_id, t.purpose, t.email
        FROM auth.one_time_tokens t JOIN auth.users u ON u.id = t.user_id
        WHERE t.token_hash = ${sha256(token)} AND t.purpose IN ${tx(purposes)}
          AND t.expires_at > now()
          AND (t.purpose = 'email_change' OR t.email = u.email)`;
  return rows[0] ?? null;
}

export async function invalidateIdentityTokens(tx: Tx, userId: string) {
  await tx`DELETE FROM auth.one_time_tokens WHERE user_id = ${userId}`;
}
