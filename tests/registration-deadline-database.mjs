import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";

const db = new PGlite();
const host = "c9000000-0000-4000-8000-000000000001";
const player = "c9000000-0000-4000-8000-000000000002";
const second = "c9000000-0000-4000-8000-000000000003";
const waiter = "c9000000-0000-4000-8000-000000000004";
const outsider = "c9000000-0000-4000-8000-000000000005";
const day = 86400000;
const start = new Date(Date.now() + day).toISOString();
const deadline = new Date(Date.parse(start) + 30 * day).toISOString();
const draft = {
  title: "Проверка срока регистрации",
  type: "daily_game",
  sport: "Футбол",
  city: "Астана",
  location_text: "Тестовая площадка",
  date_time: start,
  duration_minutes: 120,
  entry_fee: 0,
  max_participants: 4,
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
async function publish(extra = {}) {
  const doc = await rpc(host, "document", {
    kind: "draft",
    name: draft.title,
    data: { ...draft, ...extra },
  });
  return rpc(host, "publish", { id: doc.id });
}
async function movePastStart(id, closing = true) {
  await root(
    "UPDATE activities SET date_time=now()-interval '10 minutes',registration_deadline=CASE WHEN $2 THEN now()+interval '6 hours' ELSE NULL END WHERE id=$1",
    [id, closing],
  );
}

try {
  await db.exec(fs.readFileSync("./db/platform.sql", "utf8"));
  for (const file of fs.readdirSync("./supabase/migrations").sort()) {
    if (file.endsWith(".sql"))
      await db.exec(fs.readFileSync(`./supabase/migrations/${file}`, "utf8"));
  }
  await root(
    "INSERT INTO auth.users(id,email,email_confirmed_at) SELECT id,id::text||'@example.test',now() FROM unnest($1::uuid[]) id",
    [[host, player, second, waiter, outsider]],
  );
  await root(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'sports_manager'),($1,'tournament_organizer')",
    [host],
  );

  const game = await publish({ registration_deadline: deadline });
  const saved = (
    await root(
      "SELECT date_time,registration_deadline FROM activities WHERE id=$1",
      [game.id],
    )
  ).rows[0];
  assert.equal(
    new Date(saved.date_time).toISOString(),
    start,
    "Publication must preserve the selected start",
  );
  assert.equal(
    new Date(saved.registration_deadline).toISOString(),
    deadline,
    "Exactly 30 elapsed days is accepted",
  );
  await assert.rejects(
    () =>
      publish({
        registration_deadline: new Date(Date.parse(deadline) + 1).toISOString(),
      }),
    /Не позже 30 дней после начала/,
  );
  await assert.rejects(
    () =>
      root(
        "UPDATE activities SET registration_deadline=date_time+interval '720 hours 1 millisecond' WHERE id=$1",
        [game.id],
      ),
    /Не позже 30 дней после начала/,
  );
  await assert.rejects(
    () =>
      publish({
        date_time: new Date(Date.now() - day).toISOString(),
        registration_deadline: start,
      }),
    /Проверьте название, площадку, время/,
  );
  await publish({
    registration_deadline: new Date(Date.parse(start) - day / 2).toISOString(),
  });

  await movePastStart(game.id);
  const registration = await rpc(player, "join", {
    activity_id: game.id,
    accepted_terms: true,
  });
  assert.ok(
    registration.id,
    "A player may join after the unchanged event start, before its explicit deadline",
  );
  await assert.rejects(
    () => rpc(player, "cancel", { registration_id: registration.id }),
    /Отмена этой записи недоступна|после начала/,
    "Existing cancellation rules still apply after start",
  );
  const feed = (
    await as(null, "SELECT event_feed($1,0) data", [
      JSON.stringify({ open: true, q: draft.title }),
    ])
  ).rows[0].data;
  assert.ok(
    feed.items.some((a) => a.id === game.id),
    "An event with registration still open remains in the open feed",
  );
  await root(
    "UPDATE activities SET registration_deadline=now()-interval '1 millisecond' WHERE id=$1",
    [game.id],
  );
  await assert.rejects(
    () => rpc(second, "join", { activity_id: game.id, accepted_terms: true }),
    /Регистрация закрыта/,
  );
  await assert.rejects(
    () =>
      as(
        second,
        "INSERT INTO registrations(activity_id,user_id,payment_status) VALUES($1,$2,'paid')",
        [game.id, second],
      ),
    /Регистрация закрыта/,
    "Direct inserts cannot bypass closing time",
  );

  const fallback = await publish();
  await movePastStart(fallback.id, false);
  await assert.rejects(
    () =>
      rpc(player, "join", { activity_id: fallback.id, accepted_terms: true }),
    /Регистрация закрыта/,
    "Without a deadline, registration still closes at start",
  );

  const queued = await publish({
    max_participants: 2,
    registration_deadline: deadline,
  });
  await rpc(player, "join", { activity_id: queued.id, accepted_terms: true });
  await rpc(second, "join", { activity_id: queued.id, accepted_terms: true });
  await movePastStart(queued.id);
  await rpc(waiter, "waitlist_join", {
    activity_id: queued.id,
    accepted_terms: true,
  });
  await root(
    "UPDATE registrations SET status='rejected' WHERE activity_id=$1 AND user_id=$2",
    [queued.id, second],
  );
  const offer = (await rpc(waiter, "player")).waitlist.find(
    (w) => w.activity_id === queued.id,
  );
  assert.ok(
    offer.offered_at && offer.offer_expires_at,
    "Waitlist offers remain available after start while registration is open",
  );
  await assert.rejects(
    () =>
      rpc(outsider, "join", { activity_id: queued.id, accepted_terms: true }),
    /листа ожидания|очередь/,
  );
  assert.ok(
    (
      await rpc(waiter, "join", {
        activity_id: queued.id,
        accepted_terms: true,
      })
    ).id,
    "The offered waiter may join after start",
  );
  await rpc(outsider, "waitlist_join", {
    activity_id: queued.id,
    accepted_terms: true,
  });
  await root(
    "UPDATE activities SET registration_deadline=now()-interval '1 millisecond' WHERE id=$1",
    [queued.id],
  );
  await root("SELECT notify_waitlist($1)", [queued.id]);
  await assert.rejects(
    () =>
      rpc(outsider, "join", { activity_id: queued.id, accepted_terms: true }),
    /Регистрация закрыта|листа ожидания/,
  );
  await assert.rejects(
    () =>
      rpc(second, "waitlist_join", {
        activity_id: queued.id,
        accepted_terms: true,
      }),
    /Регистрация закрыта/,
  );

  const tournament = await publish({
    type: "tournament",
    tier: "spark",
    registration_deadline: deadline,
  });
  await movePastStart(tournament.id);
  await root("SELECT event_lifecycle_maintenance()");
  assert.equal(
    (await root("SELECT status FROM activities WHERE id=$1", [tournament.id]))
      .rows[0].status,
    "open",
    "Minimum-participant cancellation waits until the selected deadline",
  );
  await root(
    "UPDATE activities SET registration_deadline=now()-interval '1 millisecond' WHERE id=$1",
    [tournament.id],
  );
  await root("SELECT event_lifecycle_maintenance()");
  assert.equal(
    (await root("SELECT status FROM activities WHERE id=$1", [tournament.id]))
      .rows[0].status,
    "cancelled",
  );
  console.log(
    "PASS 30-day registration cap, unchanged start, publishing, direct guards, late joining, waitlist and lifecycle deadline",
  );
} finally {
  await db.close();
}
