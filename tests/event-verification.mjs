import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";

// Exercise the complete released schema using the same JSON claims as the server.
const db = new PGlite();
try {
  await db.exec(fs.readFileSync("./db/platform.sql", "utf8"));
  for (const file of fs.readdirSync("./supabase/migrations").sort()) {
    if (file.endsWith(".sql"))
      await db.exec(fs.readFileSync(`./supabase/migrations/${file}`, "utf8"));
  }
  const host = "a2000000-0000-4000-8000-000000000001";
  const player = "a2000000-0000-4000-8000-000000000002";
  const second = "a2000000-0000-4000-8000-000000000003";
  const waiter = "a2000000-0000-4000-8000-000000000004";
  await db.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) SELECT id, id::text || '@example.test', now() FROM unnest($1::uuid[]) id",
    [[host, player, second, waiter]],
  );
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES ($1,'sports_manager'),($1,'tournament_organizer')",
    [host],
  );
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
  const draft = {
    title: "Проверка текущего выпуска",
    type: "daily_game",
    sport: "Футбол",
    city: "Астана",
    location_text: "Тестовая площадка",
    date_time: new Date(Date.now() + 30 * 60000).toISOString(),
    duration_minutes: 120,
    entry_fee: 0,
    max_participants: 2,
    min_participants: 2,
    participation_mode: "individual",
    tier: null,
  };
  async function publish(extra = {}) {
    const document = await rpc(host, "document", {
      kind: "draft",
      name: draft.title,
      data: { ...draft, ...extra },
    });
    return rpc(host, "publish", { id: document.id });
  }
  const game = await publish();
  await assert.rejects(
    () => rpc(player, "document", { kind: "draft", data: draft }),
    /роль организатора/,
  );
  const registration = await rpc(player, "join", {
    activity_id: game.id,
    accepted_terms: true,
  });
  assert.equal(
    (await rpc(player, "join", { activity_id: game.id, accepted_terms: true }))
      .id,
    registration.id,
  );
  await rpc(second, "join", { activity_id: game.id, accepted_terms: true });
  await assert.rejects(
    () => rpc(waiter, "join", { activity_id: game.id, accepted_terms: true }),
    /Мест больше нет/,
  );
  await rpc(waiter, "waitlist_join", {
    activity_id: game.id,
    accepted_terms: true,
  });
  await assert.rejects(
    () => rpc(second, "cancel", { registration_id: registration.id }),
    /Отмена этой записи недоступна/,
  );
  await rpc(player, "checkin", { activity_id: game.id });
  assert.ok(
    (await rpc(player, "player")).registrations.find(
      (r) => r.id === registration.id,
    ).checked_in_at,
  );
  await rpc(player, "cancel", {
    registration_id: registration.id,
    reason: "Изменились планы",
  });
  await rpc(waiter, "waitlist_leave", { activity_id: game.id });
  await rpc(player, "join", { activity_id: game.id, accepted_terms: true });
  const renewed = (await rpc(player, "player")).registrations.find(
    (r) => r.id === registration.id,
  );
  assert.equal(renewed.status, "registered");
  assert.equal(
    renewed.checked_in_at,
    null,
    "Rejoining must require a new check-in instead of retaining presence from the cancelled registration",
  );
  // A repeated idempotent join must retain an actual fresh check-in.
  await rpc(second, "checkin", { activity_id: game.id });
  const secondCheckedIn = (await rpc(second, "player")).registrations.find(
    (r) => r.activity_id === game.id,
  ).checked_in_at;
  await rpc(second, "join", { activity_id: game.id, accepted_terms: true });
  assert.equal(
    (await rpc(second, "player")).registrations.find(
      (r) => r.activity_id === game.id,
    ).checked_in_at,
    secondCheckedIn,
  );
  await rpc(waiter, "waitlist_join", {
    activity_id: game.id,
    accepted_terms: true,
  });
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  await db.query(
    "UPDATE activities SET date_time=now()-interval '40 minutes' WHERE id=$1",
    [game.id],
  );
  await rpc(host, "close_checkin", { activity_id: game.id });
  assert.equal(
    (await rpc(player, "player")).registrations.find(
      (r) => r.id === registration.id,
    ).status,
    "no_show",
  );
  const queue = (await rpc(host, "host")).waitlist.find(
    (r) => r.activity_id === game.id,
  );
  const replacement = await rpc(host, "replace_no_show", {
    activity_id: game.id,
    waitlist_id: queue.id,
    confirmed_present: true,
  });
  const replaced = (await rpc(waiter, "player")).registrations.find(
    (r) => r.id === replacement.id,
  );
  assert.equal(replaced.status, "registered");
  assert.ok(
    replaced.checked_in_at,
    "Host-confirmed replacement must retain its new check-in",
  );
  assert.equal(
    (await rpc(host, "host")).activities.find((a) => a.id === game.id)
      .registered_count,
    1,
  );

  const outdoor = await publish({ venue_type: "outdoor" });
  const outdoorRegistration = await rpc(player, "join", {
    activity_id: outdoor.id,
    accepted_terms: true,
  });
  await rpc(player, "checkin", { activity_id: outdoor.id });
  const originalCheckIn = (await rpc(player, "player")).registrations.find(
    (r) => r.id === outdoorRegistration.id,
  ).checked_in_at;
  await as(host, "UPDATE activities SET date_time=date_time WHERE id=$1", [
    outdoor.id,
  ]);
  assert.equal(
    (await rpc(player, "player")).registrations.find(
      (r) => r.id === outdoorRegistration.id,
    ).checked_in_at,
    originalCheckIn,
    "Saving an unchanged date must preserve a valid check-in",
  );
  const postponedStart = new Date(Date.now() + 24 * 60 * 60000).toISOString();
  await as(host, "SELECT event_competition('weather',$1)", [
    JSON.stringify({
      activity_id: outdoor.id,
      starts_at: postponedStart,
      reason: "Площадка закрыта из-за сильного дождя",
    }),
  ]);
  assert.equal(
    (await rpc(player, "player")).registrations.find(
      (r) => r.id === outdoorRegistration.id,
    ).checked_in_at,
    null,
    "Rescheduled event must require check-in for its new time",
  );
  await assert.rejects(
    () => rpc(player, "checkin", { activity_id: outdoor.id }),
    /Отметка доступна/,
  );
  const postponementLog = (
    await as(
      host,
      "SELECT detail FROM event_history WHERE activity_id=$1 AND action='Чек-ин сброшен после переноса'",
      [outdoor.id],
    )
  ).rows;
  assert.equal(postponementLog.length, 1);
  assert.equal(postponementLog[0].detail.registrations, 1);

  const paidDraft = await rpc(host, "document", {
    kind: "draft",
    name: "Платный турнир",
    data: { ...draft, type: "tournament", tier: "blitz", entry_fee: 1000 },
  });
  assert.equal(paidDraft.data.entry_fee, 1000);
  await assert.rejects(
    () => rpc(host, "publish", { id: paidDraft.id }),
    /платёжный провайдер/i,
  );
  await assert.rejects(
    () =>
      rpc(player, "proof", {
        registration_id: registration.id,
        payment_reference: "test",
      }),
    /Платежи отключены/,
  );

  const tournament = await publish({
    type: "tournament",
    tier: "spark",
    competition_format: "single_elimination",
    date_time: new Date(Date.now() + 24 * 60 * 60000).toISOString(),
  });
  await rpc(player, "join", {
    activity_id: tournament.id,
    accepted_terms: true,
  });
  await rpc(second, "join", {
    activity_id: tournament.id,
    accepted_terms: true,
  });
  async function competition(user, action, payload = {}) {
    return (
      await as(user, "SELECT event_competition($1,$2) data", [
        action,
        JSON.stringify({ activity_id: tournament.id, ...payload }),
      ])
    ).rows[0].data;
  }
  await competition(host, "generate");
  const match = (
    await as(host, "SELECT event_public($1) data", [tournament.id])
  ).rows[0].data.matches[0];
  await assert.rejects(
    () =>
      competition(player, "match", {
        id: match.id,
        home_score: 2,
        away_score: 1,
        duration_minutes: 60,
      }),
    /Недостаточно прав|недоступно/,
  );
  await competition(host, "match", {
    id: match.id,
    home_score: 2,
    away_score: 1,
    duration_minutes: 60,
  });
  await assert.rejects(
    () => competition(host, "publish_results"),
    /не завершилось|ещё|раньше|начал/i,
  );
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  await db.query(
    "UPDATE activities SET date_time=now()-interval '1 day' WHERE id=$1",
    [tournament.id],
  );
  await competition(host, "publish_results");
  const finished = (
    await as(null, "SELECT event_public($1) data", [tournament.id])
  ).rows[0].data;
  assert.equal(finished.activity.status, "completed");
  assert.equal(finished.results[0].participant_name, match.home_name);
  console.log(
    "PASS current-schema registration, fresh check-in, rescheduling, replacement, paid drafts and competition permissions",
  );
} finally {
  await db.close();
}
