import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";

// Run independently: node tests/game-alerts-database.mjs
const db = new PGlite();
const migration = "20261004093000_game_alert_subscriptions.sql";
const host = "b4000000-0000-4000-8000-000000000001";
const player = "b4000000-0000-4000-8000-000000000002";
const other = "b4000000-0000-4000-8000-000000000003";
const muted = "b4000000-0000-4000-8000-000000000004";
const restricted = "b4000000-0000-4000-8000-000000000005";

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
async function preferences(user, action = "get", payload = {}) {
  return (
    await as(user, "SELECT game_alert_preferences($1,$2) result", [
      action,
      JSON.stringify(payload),
    ])
  ).rows[0].result;
}
async function notifications(user, activityId) {
  return (
    await as(user, "SELECT * FROM profile_notifications WHERE dedupe=$1", [
      `new-game:${user}:${activityId}`,
    ])
  ).rows;
}
const draft = {
  title: "Игра по подписке",
  type: "daily_game",
  sport: "Футбол",
  city: "Астана",
  location_text: "Тестовая площадка",
  date_time: new Date(Date.now() + 86400000).toISOString(),
  duration_minutes: 90,
  entry_fee: 0,
  max_participants: 10,
  participation_mode: "individual",
};
async function eventRpc(action, payload) {
  return (
    await as(host, "SELECT event_workspace($1,$2) result", [
      action,
      JSON.stringify(payload),
    ])
  ).rows[0].result;
}
async function publish(extra = {}) {
  const document = await eventRpc("document", {
    kind: "draft",
    name: draft.title,
    data: { ...draft, ...extra },
  });
  return eventRpc("publish", { id: document.id });
}
async function insert(extra = {}) {
  const values = {
    status: "open",
    is_private: false,
    registered_count: 0,
    registration_deadline: null,
    ...draft,
    ...extra,
  };
  return (
    await root(
      "INSERT INTO activities(title,type,sport,city,location_text,date_time,is_free,max_participants,registered_count,status,is_private,registration_deadline,manager_id) VALUES($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11,$12) RETURNING id",
      [
        values.title,
        values.type,
        values.sport,
        values.city,
        values.location_text,
        values.date_time,
        values.max_participants,
        values.registered_count,
        values.status,
        values.is_private,
        values.registration_deadline,
        host,
      ],
    )
  ).rows[0].id;
}

try {
  await db.exec(fs.readFileSync("./db/platform.sql", "utf8"));
  for (const file of fs.readdirSync("./supabase/migrations").sort()) {
    if (file.endsWith(".sql") && file !== migration)
      await db.exec(fs.readFileSync(`./supabase/migrations/${file}`, "utf8"));
  }
  await root(
    "INSERT INTO auth.users(id,email,email_confirmed_at) SELECT id,id::text||'@example.test',now() FROM unnest($1::uuid[]) id",
    [[host, player, other, muted, restricted]],
  );
  await root(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'sports_manager')",
    [host],
  );
  const existingId = await insert();
  await db.exec(fs.readFileSync(`./supabase/migrations/${migration}`, "utf8"));
  await assert.rejects(() => preferences(null), /permission denied/);
  await assert.rejects(
    () => as(null, "SELECT * FROM game_alert_subscriptions"),
    /permission denied/,
  );
  await assert.rejects(
    () => as(player, "SELECT * FROM game_alert_publications"),
    /permission denied/,
  );
  await assert.rejects(
    () => as(player, "SELECT notify_new_public_game()"),
    /permission denied/,
  );

  const selection = { city: "Астана", sport: "Футбол" };
  const subscription = await preferences(player, "subscribe", selection);
  assert.equal(
    (
      await preferences(player, "subscribe", {
        city: "  астана  ",
        sport: "  футбол  ",
      })
    ).id,
    subscription.id,
    "City and sport case variants normalize to the existing subscription",
  );
  const initial = (await preferences(player)).subscriptions[0];
  assert.equal(
    (await preferences(player, "subscribe", selection)).id,
    subscription.id,
    "Saving a subscription twice must be idempotent",
  );
  assert.equal(
    (await preferences(player)).subscriptions[0].created_at,
    initial.created_at,
  );
  assert.equal((await preferences(other)).subscriptions.length, 0);
  assert.equal(
    (
      await as(
        other,
        "SELECT * FROM game_alert_subscriptions WHERE user_id=$1",
        [player],
      )
    ).rows.length,
    0,
    "RLS hides another user's subscriptions",
  );
  await assert.rejects(
    () => preferences(other, "unsubscribe", { id: subscription.id }),
    /недоступна/,
  );
  await assert.rejects(
    () =>
      as(
        player,
        "INSERT INTO game_alert_subscriptions(user_id,city,sport) VALUES($1,'Алматы','all')",
        [other],
      ),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      as(player, "DELETE FROM game_alert_subscriptions WHERE id=$1", [
        subscription.id,
      ]),
    /permission denied/,
  );
  for (const city of ["", "all", "Неподдерживаемый город", "a".repeat(81)])
    await assert.rejects(
      () => preferences(player, "subscribe", { city, sport: "all" }),
      /город/,
    );
  for (const sport of ["CS2", "Выдуманный спорт", ""])
    await assert.rejects(
      () => preferences(player, "subscribe", { city: "Астана", sport }),
      /спорт/,
    );
  await preferences(player, "subscribe", { city: "Астана", sport: "all" });
  await root(
    "UPDATE site_settings SET value=jsonb_set(value,'{cities}',$1::jsonb) WHERE key='catalog'",
    [
      JSON.stringify([
        "Астана",
        "Алматы",
        "Костанай",
        ...Array.from({ length: 20 }, (_, n) => `Город ${n + 1}`),
      ]),
    ],
  );
  const customCity = await preferences(other, "subscribe", {
    city: "  костанай  ",
    sport: "ALL",
  });
  assert.equal(
    (await preferences(other)).subscriptions.find((s) => s.id === customCity.id)
      .city,
    "Костанай",
    "Managed catalog cities use the configured canonical spelling",
  );
  await preferences(other, "subscribe", { city: "Астана", sport: "Баскетбол" });
  await preferences(other, "subscribe", { city: "Алматы", sport: "Футбол" });
  for (const user of [host, muted, restricted])
    await preferences(user, "subscribe", selection);
  await root(
    "INSERT INTO profile_preferences(user_id,notifications) VALUES($1,'{\"games\":false}') ON CONFLICT(user_id) DO UPDATE SET notifications=EXCLUDED.notifications",
    [muted],
  );
  await root("UPDATE profiles SET account_status='suspended' WHERE id=$1", [
    restricted,
  ]);
  assert.equal((await preferences(muted)).games_enabled, false);
  await root(
    "UPDATE activities SET date_time=date_time+interval '1 hour' WHERE id=$1",
    [existingId],
  );
  assert.equal(
    (await notifications(player, existingId)).length,
    0,
    "Migrating and editing an existing game must not alert new subscribers",
  );

  const before = (await as(player, "SELECT * FROM profile_notifications")).rows
    .length;
  const document = await eventRpc("document", {
    kind: "draft",
    name: draft.title,
    data: draft,
  });
  assert.equal(
    (await as(player, "SELECT * FROM profile_notifications")).rows.length,
    before,
    "A saved draft must never send alerts",
  );
  const game = await eventRpc("publish", { id: document.id });
  const first = await notifications(player, game.id);
  assert.equal(
    first.length,
    1,
    "Overlapping sport and all-sports subscriptions send only one notification",
  );
  assert.equal(first[0].category, "games");
  assert.equal(first[0].href, `/activity/${game.id}`);
  assert.ok(
    first[0].body.includes("Футбол") && first[0].body.includes("Астана"),
  );
  for (const user of [host, other, muted, restricted])
    assert.equal(
      (await notifications(user, game.id)).length,
      0,
      "Wrong city/sport, host, muted and restricted accounts must not receive this alert",
    );
  await eventRpc("publish", { id: document.id });
  await root(
    "UPDATE activities SET date_time=date_time+interval '1 hour' WHERE id=$1",
    [game.id],
  );
  await root(
    "UPDATE activities SET status='full',registered_count=max_participants WHERE id=$1",
    [game.id],
  );
  await root(
    "UPDATE activities SET status='open',registered_count=0 WHERE id=$1",
    [game.id],
  );
  assert.equal(
    (await notifications(player, game.id)).length,
    1,
    "Republishing, editing and opening another place must not duplicate a new-game alert",
  );
  const basketball = await publish({ sport: "Баскетбол" });
  assert.equal(
    (await notifications(other, basketball.id)).length,
    1,
    "Sport-specific match receives the game",
  );
  const almaty = await publish({ city: "Алматы" });
  assert.equal((await notifications(player, almaty.id)).length, 0);
  assert.equal(
    (await notifications(other, almaty.id)).length,
    1,
    "City-specific match receives the game",
  );

  const privateGame = await publish({ is_private: true });
  assert.equal((await notifications(player, privateGame.id)).length, 0);
  await root("UPDATE activities SET is_private=false WHERE id=$1", [
    privateGame.id,
  ]);
  assert.equal(
    (await notifications(player, privateGame.id)).length,
    1,
    "First public opening of a new private game sends one alert",
  );
  await root("UPDATE activities SET is_private=true WHERE id=$1", [
    privateGame.id,
  ]);
  await root("UPDATE activities SET is_private=false WHERE id=$1", [
    privateGame.id,
  ]);
  assert.equal((await notifications(player, privateGame.id)).length, 1);
  for (const status of ["cancelled", "completed", "full"]) {
    const id = await insert({ status });
    assert.equal(
      (await notifications(player, id)).length,
      0,
      `${status} event must not send alerts`,
    );
  }
  const fullId = await insert({ registered_count: 10 });
  assert.equal(
    (await notifications(player, fullId)).length,
    0,
    "Capacity is checked independently of status",
  );
  await root(
    "UPDATE activities SET status='nearly_full',registered_count=9 WHERE id=$1",
    [fullId],
  );
  assert.equal(
    (await notifications(player, fullId)).length,
    1,
    "A new game first opening registration after being full sends one alert",
  );
  const closedId = await insert({
    registration_deadline: new Date(Date.now() - 60000).toISOString(),
  });
  assert.equal(
    (await notifications(player, closedId)).length,
    0,
    "Closed registration must not send alerts",
  );
  await root(
    "UPDATE activities SET registration_deadline=now()+interval '12 hours' WHERE id=$1",
    [closedId],
  );
  assert.equal(
    (await notifications(player, closedId)).length,
    1,
    "A new game first opening its registration period sends one alert",
  );
  const pastId = await insert({
    date_time: new Date(Date.now() - 86400000).toISOString(),
  });
  assert.equal(
    (await notifications(player, pastId)).length,
    0,
    "Past events must not send alerts",
  );
  const nearlyFullId = await insert({
    status: "nearly_full",
    registered_count: 9,
  });
  assert.equal(
    (await notifications(player, nearlyFullId)).length,
    1,
    "Nearly-full games with room still match",
  );
  await root(
    "UPDATE site_settings SET value=jsonb_set(value,'{registrations_enabled}','false') WHERE key='business'",
  );
  const pausedId = await insert();
  assert.equal(
    (await notifications(player, pausedId)).length,
    0,
    "A global registration pause suppresses new-game alerts",
  );
  await root(
    "UPDATE site_settings SET value=jsonb_set(value,'{registrations_enabled}','true') WHERE key='business'",
  );
  await root(
    "UPDATE activities SET date_time=date_time+interval '1 hour' WHERE id=$1",
    [pausedId],
  );
  assert.equal(
    (await notifications(player, pausedId)).length,
    0,
    "Re-enabling registration and editing must not backfill a paused publication",
  );

  const all = (await preferences(player)).subscriptions.find(
    (s) => s.sport === "all",
  );
  await preferences(player, "unsubscribe", { id: all.id });
  await preferences(player, "unsubscribe", { id: subscription.id });
  const unsubscribedGame = await publish();
  assert.equal(
    (await notifications(player, unsubscribedGame.id)).length,
    0,
    "Unsubscribe takes effect for the next publication",
  );
  await preferences(player, "subscribe", selection);
  await root(
    "UPDATE activities SET date_time=date_time+interval '1 hour' WHERE id=$1",
    [unsubscribedGame.id],
  );
  assert.equal(
    (await notifications(player, unsubscribedGame.id)).length,
    0,
    "Resubscribing must not backfill existing events",
  );
  for (let n = 1; n <= 19; n++)
    await preferences(player, "subscribe", {
      city: `Город ${n}`,
      sport: "all",
    });
  await assert.rejects(
    () => preferences(player, "subscribe", { city: "Город 20", sport: "all" }),
    /20 подписок/,
  );
  assert.equal(
    (await preferences(player, "subscribe", selection)).id,
    (await preferences(player)).subscriptions.find(
      (s) => s.city === selection.city,
    ).id,
    "Existing selections still save at the subscription limit",
  );
  console.log(
    "PASS game-alert subscriptions: RLS, authentication, validation, publication, matching, notification preferences, deduplication, unsubscribe and no backfill",
  );
} finally {
  await db.close();
}
