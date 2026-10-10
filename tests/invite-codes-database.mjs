import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";

// Exercise the released schema and upgrade from previously shared invitations.
const db = new PGlite();
const migration = "20261010120000_short_invite_codes.sql";
const host = "b8000000-0000-4000-8000-000000000001";
const player = "b8000000-0000-4000-8000-000000000002";
const second = "b8000000-0000-4000-8000-000000000003";
const waiter = "b8000000-0000-4000-8000-000000000004";
const other = "b8000000-0000-4000-8000-000000000005";
const outsider = "b8000000-0000-4000-8000-000000000006";
const legacyCode = "AbC12-Legacy-Volleyball-XY98";
const zeroLeadingCode = "01234567";
const existingNumericCode = "12345678";
const draft = {
  title: "Игра по короткому приглашению",
  type: "daily_game",
  sport: "Волейбол",
  city: "Астана",
  location_text: "Тестовая площадка",
  date_time: new Date(Date.now() + 86400000).toISOString(),
  duration_minutes: 90,
  entry_fee: 0,
  max_participants: 2,
  min_participants: 2,
  participation_mode: "individual",
};

async function root(query, params = []) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  return db.query(query, params);
}
async function as(user, query, params = []) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(
      user ? { sub: user, role: "authenticated" } : { role: "anon" },
    ),
  ]);
  await db.exec(user ? "SET ROLE authenticated" : "SET ROLE anon");
  return db.query(query, params);
}
async function rpc(user, action, payload = {}) {
  return (
    await as(user, "SELECT event_workspace($1,$2) data", [
      action,
      JSON.stringify(payload),
    ])
  ).rows[0].data;
}
async function insert(code = null, isPrivate = true) {
  return (
    await root(
      "INSERT INTO activities(title,type,sport,city,location_text,date_time,is_free,entry_fee,max_participants,manager_id,is_private,invite_code) VALUES($1,$2,$3,$4,$5,$6,true,0,$7,$8,$9,$10) RETURNING id,invite_code",
      [
        draft.title,
        draft.type,
        draft.sport,
        draft.city,
        draft.location_text,
        draft.date_time,
        draft.max_participants,
        host,
        isPrivate,
        code,
      ],
    )
  ).rows[0];
}
async function lookup(code, user = null) {
  return (await as(user, "SELECT find_activity_by_invite($1) id", [code]))
    .rows[0].id;
}
async function read(id, code = "", user = null) {
  return (await as(user, "SELECT event_public($1,$2) data", [id, code])).rows[0]
    .data;
}
function formatted(code, separator = " ") {
  return code.slice(0, 4) + separator + code.slice(4);
}
function canonical(code) {
  assert.match(
    code,
    /^[1-9][0-9]{7}$/,
    "Invitation must have eight digits without a leading zero",
  );
}

try {
  await db.exec(fs.readFileSync("./db/platform.sql", "utf8"));
  const migrations = fs
    .readdirSync("./supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  assert.ok(
    migrations.includes(migration),
    "The short-code migration must be included in the released schema",
  );
  for (const file of migrations.filter((f) => f < migration)) {
    await db.exec(fs.readFileSync(`./supabase/migrations/${file}`, "utf8"));
  }
  await root(
    "INSERT INTO auth.users(id,email,email_confirmed_at) SELECT id,id::text||'@example.test',now() FROM unnest($1::uuid[]) id",
    [[host, player, second, waiter, other, outsider]],
  );
  await root(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'sports_manager')",
    [host],
  );
  const legacy = await insert(legacyCode);
  const zeroLeading = await insert(zeroLeadingCode);
  const numeric = await insert(existingNumericCode);
  const missing = await insert();
  for (const file of migrations.filter((f) => f >= migration)) {
    await db.exec(fs.readFileSync(`./supabase/migrations/${file}`, "utf8"));
  }
  const backfilled = (
    await root(
      "SELECT id,invite_code FROM activities WHERE id=ANY($1::uuid[])",
      [[legacy.id, zeroLeading.id, numeric.id, missing.id]],
    )
  ).rows;
  for (const event of backfilled) canonical(event.invite_code);
  const legacyShort = backfilled.find((e) => e.id === legacy.id).invite_code;
  assert.notEqual(legacyShort, legacyCode);
  assert.notEqual(
    backfilled.find((e) => e.id === zeroLeading.id).invite_code,
    zeroLeadingCode,
  );
  assert.equal(
    backfilled.find((e) => e.id === numeric.id).invite_code,
    existingNumericCode,
  );
  assert.equal(
    await lookup(zeroLeadingCode),
    zeroLeading.id,
    "Previously shared zero-leading codes remain valid aliases",
  );
  assert.equal(await lookup(existingNumericCode), numeric.id);

  for (const code of [
    legacyShort,
    formatted(legacyShort),
    formatted(legacyShort, "-"),
    formatted(legacyShort, "\u00a0"),
    "  " + legacyCode.toUpperCase() + "  ",
    legacyCode.toLowerCase(),
  ]) {
    assert.equal(await lookup(code), legacy.id);
    assert.equal(await lookup(code, outsider), legacy.id);
    const event = await read(legacy.id, code);
    assert.equal(event.activity.id, legacy.id);
    assert.ok(
      !("invite_code" in event.activity),
      "Guest reads must not expose the canonical code or registry",
    );
  }
  assert.equal(await lookup("not-an-invitation"), null);
  assert.equal(await lookup(""), null);
  assert.equal(await read(legacy.id), null);
  assert.equal(
    await read(legacy.id, existingNumericCode),
    null,
    "An invitation for another event cannot open a private event",
  );
  for (const action of ["join", "waitlist_join"]) {
    for (const code of ["", "not-an-invitation", existingNumericCode]) {
      await assert.rejects(
        () =>
          rpc(outsider, action, {
            activity_id: legacy.id,
            code,
            accepted_terms: true,
          }),
        /код приглашения/i,
      );
    }
  }
  const joined = await rpc(player, "join", {
    activity_id: legacy.id,
    code: legacyCode.toUpperCase(),
    accepted_terms: true,
  });
  assert.equal(
    (
      await rpc(player, "join", {
        activity_id: legacy.id,
        code: formatted(legacyShort),
        accepted_terms: true,
      })
    ).id,
    joined.id,
    "Old and new codes address the same registration",
  );
  await rpc(second, "join", {
    activity_id: legacy.id,
    code: formatted(legacyShort, "-"),
    accepted_terms: true,
  });
  await rpc(waiter, "waitlist_join", {
    activity_id: legacy.id,
    code: legacyCode.toLowerCase(),
    accepted_terms: true,
  });
  await rpc(other, "waitlist_join", {
    activity_id: legacy.id,
    code: formatted(legacyShort, "\u00a0"),
    accepted_terms: true,
  });
  assert.equal(
    (await rpc(waiter, "player")).waitlist.filter(
      (e) => e.activity_id === legacy.id,
    ).length,
    1,
  );
  assert.equal(
    (await rpc(other, "player")).waitlist.filter(
      (e) => e.activity_id === legacy.id,
    ).length,
    1,
  );
  assert.equal(
    (await read(legacy.id, "", player)).activity.id,
    legacy.id,
    "Participant access survives the invitation upgrade",
  );
  assert.equal(
    (await read(legacy.id, "", host)).activity.id,
    legacy.id,
    "Host access survives the invitation upgrade",
  );

  const document = await rpc(host, "document", {
    kind: "draft",
    name: draft.title,
    data: { ...draft, is_private: true },
  });
  const published = await rpc(host, "publish", { id: document.id });
  canonical(published.invite_code);
  assert.equal(
    await lookup(formatted(published.invite_code)),
    published.id,
    "Publish returns the reserved short code",
  );
  const adminStyle = await insert("aBcdEf89");
  canonical(adminStyle.invite_code);
  assert.equal(
    await lookup("ABCDEF89"),
    adminStyle.id,
    "Old admin-style codes survive as aliases",
  );
  const publicEvent = await insert(null, false);
  assert.equal(publicEvent.invite_code, null);
  const privatized = (
    await root(
      "UPDATE activities SET is_private=true WHERE id=$1 RETURNING invite_code",
      [publicEvent.id],
    )
  ).rows[0];
  canonical(privatized.invite_code);
  assert.equal(
    await lookup(privatized.invite_code),
    publicEvent.id,
    "Privatizing an event reserves its invitation",
  );
  await root("UPDATE activities SET title=title WHERE id=$1", [publicEvent.id]);
  assert.equal(
    (
      await root("SELECT invite_code FROM activities WHERE id=$1", [
        publicEvent.id,
      ])
    ).rows[0].invite_code,
    privatized.invite_code,
    "Saving unrelated fields preserves the shared code",
  );

  const many = (
    await root(
      "INSERT INTO activities(title,type,sport,city,location_text,date_time,is_free,entry_fee,max_participants,manager_id,is_private) SELECT 'Проверка уникальности '||n,'daily_game',$1,$2,$3,$4,true,0,2,$5,true FROM generate_series(1,200) n RETURNING id,invite_code",
      [draft.sport, draft.city, draft.location_text, draft.date_time, host],
    )
  ).rows;
  assert.equal(many.length, 200);
  for (const event of many) canonical(event.invite_code);
  assert.equal(
    new Set(many.map((event) => event.invite_code)).size,
    many.length,
    "Fresh invitations are unique",
  );
  await assert.rejects(
    () => insert(legacyCode.toLowerCase()),
    /уже используется/i,
    "Another event cannot steal a legacy alias",
  );
  await assert.rejects(
    () => insert(published.invite_code),
    /уже используется/i,
    "Another event cannot steal a short code",
  );

  for (const user of [null, outsider]) {
    await assert.rejects(
      () => as(user, "SELECT * FROM activity_invite_codes"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        as(user, "SELECT event_public_invite_base($1,$2)", [
          legacy.id,
          legacyShort,
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        as(user, "SELECT event_workspace_invite_base('join',$1)", [
          JSON.stringify({
            activity_id: legacy.id,
            code: legacyShort,
            accepted_terms: true,
          }),
        ]),
      /permission denied/,
    );
  }
  for (const role of ["anon", "authenticated"]) {
    for (const fn of [
      "public.remember_activity_invite_code(uuid,text)",
      "public.reserve_activity_invite_code(uuid)",
      "public.resolve_activity_invite_code(uuid,text)",
    ]) {
      assert.equal(
        (
          await root("SELECT has_function_privilege($1,$2,'EXECUTE') allowed", [
            role,
            fn,
          ])
        ).rows[0].allowed,
        false,
        `${role} cannot call registry helpers directly`,
      );
    }
  }
  console.log(
    "PASS invite-code upgrade, unique short codes, formatted/legacy lookup, private reads, join, waitlist and registry permissions",
  );
} finally {
  await db.close();
}
