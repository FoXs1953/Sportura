import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  findToken,
  invalidateIdentityTokens,
  issueToken,
  sha256,
} from "../src/lib/auth-tokens.server.ts";
import { publicOrganizerActivitySummary } from "../src/lib/organizer-public-profile.ts";
import {
  accountForVerifiedGoogleEmail,
  GoogleLinkNeedsConfirmationError,
} from "../src/lib/auth-identities.server.ts";
import type { Tx } from "../src/lib/db.server.ts";

// Execute the production token queries in isolated PostgreSQL. Only the tagged
// template adapter is replaced, so these tests exercise real SQL semantics.
function tokenTx(db: PGlite): Tx {
  function tx(first: TemplateStringsArray | unknown[], ...values: unknown[]) {
    if (!Object.hasOwn(first, "raw")) return { list: first };
    const parameters: unknown[] = [];
    let query = first[0];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value && typeof value === "object" && "list" in value) {
        query += `(${(value.list as unknown[])
          .map((entry) => {
            parameters.push(entry);
            return `$${parameters.length}`;
          })
          .join(",")})`;
      } else {
        parameters.push(value);
        query += `$${parameters.length}`;
      }
      query += first[i + 1];
    }
    return db.query(query as string, parameters).then((result) => result.rows);
  }
  return tx as unknown as Tx;
}

test("recovery links are single use and bound to the current email", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("db/platform.sql", "utf8"));
    const user = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4)", [
      user,
      "old@example.test",
      other,
      "other@example.test",
    ]);
    const tx = tokenTx(db);
    await assert.rejects(
      accountForVerifiedGoogleEmail(tx, "old@example.test"),
      GoogleLinkNeedsConfirmationError,
    );
    await db.query(
      "UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1",
      [user],
    );
    assert.equal(
      await accountForVerifiedGoogleEmail(tx, "old@example.test"),
      user,
    );
    assert.equal(
      await accountForVerifiedGoogleEmail(tx, "unregistered@example.test"),
      null,
    );
    const first = await issueToken(
      tx,
      user,
      "recovery",
      "old@example.test",
      60,
    );
    const replacement = await issueToken(
      tx,
      user,
      "recovery",
      "old@example.test",
      60,
    );
    assert.equal(await findToken(tx, first, ["recovery"], false), null);
    assert.equal(
      (await findToken(tx, replacement, ["recovery"], false))?.user_id,
      user,
    );
    assert.equal(
      await findToken(tx, replacement, ["confirm_email"], true),
      null,
    );
    assert.equal(
      (await findToken(tx, replacement, ["recovery"], true))?.user_id,
      user,
    );
    assert.equal(await findToken(tx, replacement, ["recovery"], true), null);

    const oldAddress = await issueToken(
      tx,
      user,
      "recovery",
      "old@example.test",
      60,
    );
    await db.query("UPDATE auth.users SET email=$1 WHERE id=$2", [
      "new@example.test",
      user,
    ]);
    assert.equal(await findToken(tx, oldAddress, ["recovery"], false), null);
    assert.equal(await findToken(tx, oldAddress, ["recovery"], true), null);

    const expired = await issueToken(
      tx,
      user,
      "recovery",
      "new@example.test",
      -1,
    );
    assert.equal(await findToken(tx, expired, ["recovery"], false), null);
    const change = await issueToken(
      tx,
      user,
      "email_change",
      "next@example.test",
      60,
    );
    assert.equal(
      (await findToken(tx, change, ["email_change"], false))?.email,
      "next@example.test",
    );
    const otherToken = await issueToken(
      tx,
      other,
      "recovery",
      "other@example.test",
      60,
    );
    await invalidateIdentityTokens(tx, user);
    assert.equal(await findToken(tx, change, ["email_change"], false), null);
    assert.equal(
      (await findToken(tx, otherToken, ["recovery"], false))?.user_id,
      other,
    );
    const stored = await db.query<{ token_hash: string }>(
      "SELECT token_hash FROM auth.one_time_tokens",
    );
    assert.equal(stored.rows[0].token_hash, sha256(otherToken));
    assert.notEqual(stored.rows[0].token_hash, otherToken);
  } finally {
    await db.close();
  }
});

test("public organizer response excludes drafts/private games and hidden statistics", () => {
  const events = [
    {
      id: "draft",
      type: "daily_game",
      status: "draft",
      is_private: false,
      registered_count: 99,
    },
    {
      id: "private",
      type: "daily_game",
      status: "open",
      is_private: true,
      registered_count: 98,
    },
    {
      id: "open",
      type: "daily_game",
      status: "open",
      is_private: false,
      registered_count: 3,
    },
    {
      id: "finished",
      type: "tournament",
      status: "completed",
      is_private: false,
      registered_count: 8,
    },
    {
      id: "cancelled",
      type: "daily_game",
      status: "cancelled",
      is_private: false,
      registered_count: 0,
    },
  ];
  const visible = publicOrganizerActivitySummary(events, true);
  assert.deepEqual(
    visible.upcoming.map((event) => event.id),
    ["open"],
  );
  assert.deepEqual(visible.stats, {
    games: 2,
    competitions: 1,
    completed: 1,
    cancelled: 1,
    players: 11,
  });
  const hidden = publicOrganizerActivitySummary(events, false);
  assert.deepEqual(
    hidden.upcoming.map((event) => event.id),
    ["open"],
  );
  assert.deepEqual(hidden.stats, {
    games: 0,
    competitions: 0,
    completed: 0,
    cancelled: 0,
    players: 0,
  });
});

test("support attachments and device sessions stay inside the owner's account", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync("db/platform.sql", "utf8"));
    for (const file of readdirSync("supabase/migrations").sort()) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    }
    const owner = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    const staff = "33333333-3333-4333-8333-333333333333";
    const current = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const foreign = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await db.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'owner@example.test',now()),($2,'other@example.test',now()),($3,'staff@example.test',now())",
      [owner, other, staff],
    );
    await db.query(
      "INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin') ON CONFLICT DO NOTHING",
      [staff],
    );
    await db.query(
      "INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,now()+interval '1 day'),($3,$2,now()+interval '1 day'),($4,$5,now()+interval '1 day')",
      [current, owner, second, foreign, other],
    );
    const attached = `${staff}/attached.pdf`;
    const unrelated = `${staff}/unrelated.pdf`;
    await db.query(
      "INSERT INTO storage.objects(bucket_id,name) VALUES('support',$1),('support',$2)",
      [attached, unrelated],
    );

    async function as(
      user: string,
      query: string,
      params: unknown[] = [],
      session = current,
    ) {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({
          sub: user,
          session_id: session,
          role: "authenticated",
        }),
      ]);
      await db.exec("SET ROLE authenticated");
      return db.query(query, params);
    }
    const ticket = (
      await as(
        owner,
        "SELECT public.profile_workspace('ticket',$1) AS result",
        [
          JSON.stringify({
            topic: "general",
            subject: "Test attachment",
            body: "Detailed support message",
          }),
        ],
      )
    ).rows[0].result as { id: string };
    assert.equal(
      (
        await as(
          owner,
          "SELECT name FROM storage.objects WHERE bucket_id='support'",
        )
      ).rows.length,
      0,
    );
    await as(staff, "SELECT public.profile_workspace('moderate',$1)", [
      JSON.stringify({
        id: ticket.id,
        body: "Staff answer with document",
        status: "needs_user",
        attachments: [attached],
      }),
    ]);
    assert.deepEqual(
      (
        await as(
          owner,
          "SELECT name FROM storage.objects WHERE bucket_id='support'",
        )
      ).rows,
      [{ name: attached }],
    );
    assert.equal(
      (
        await as(
          other,
          "SELECT name FROM storage.objects WHERE bucket_id='support'",
        )
      ).rows.length,
      0,
    );
    const deleted = await as(
      owner,
      "DELETE FROM storage.objects WHERE bucket_id='support' AND name=$1 RETURNING name",
      [attached],
    );
    assert.equal(deleted.rows.length, 0);
    assert.equal(
      (
        await as(
          staff,
          "SELECT name FROM storage.objects WHERE bucket_id='support'",
        )
      ).rows.length,
      2,
    );

    const sessions = (
      await as(owner, "SELECT public.profile_sessions('list') AS result")
    ).rows[0].result as { id: string; current: boolean }[];
    assert.equal(sessions.length, 2);
    assert.equal(sessions.find((session) => session.current)?.id, current);
    assert(!sessions.some((session) => session.id === foreign));
    await assert.rejects(
      as(owner, "SELECT public.profile_sessions('revoke',$1)", [current]),
      /текущего устройства/,
    );
    await as(owner, "SELECT public.profile_sessions('revoke',$1)", [foreign]);
    assert.equal(
      (
        (
          await as(
            other,
            "SELECT public.profile_sessions('list') AS result",
            [],
            foreign,
          )
        ).rows[0].result as unknown[]
      ).length,
      1,
    );
    await as(owner, "SELECT public.profile_sessions('revoke',$1)", [second]);
    assert.equal(
      (
        (await as(owner, "SELECT public.profile_sessions('list') AS result"))
          .rows[0].result as unknown[]
      ).length,
      1,
    );
  } finally {
    await db.close();
  }
});
