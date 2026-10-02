import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

// Opt-in integration test. Use a dedicated local QA database with the release
// migrations applied and a request-role login configured as in db/README.md.
const ownerUrl = process.env.QA_DATABASE_URL;
const appUrl = process.env.QA_APP_DATABASE_URL;
if (!ownerUrl || !appUrl)
  throw Error(
    "Set QA_DATABASE_URL and QA_APP_DATABASE_URL to a dedicated local QA database",
  );
for (const connectionUrl of [ownerUrl, appUrl]) {
  const parsed = new URL(connectionUrl);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname),
    "Concurrency checks only support an isolated local database",
  );
  assert.match(parsed.pathname, /(?:qa|test)/i, "Use a QA or test database");
}
assert.equal(new URL(ownerUrl).pathname, new URL(appUrl).pathname);
const applicationName = `sportura-concurrency-${randomUUID()}`;
const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });
const app = postgres(appUrl, {
  max: 4,
  onnotice: () => {},
  connection: { application_name: applicationName, statement_timeout: 10000 },
});
const actors = Array.from({ length: 5 }, () => randomUUID());
const [host, first, racerA, racerB, outsider] = actors;
const pending = [];
let activityId;
let documentId;
let usersSeeded = false;
async function asUser(user, callback) {
  return app.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: user, session_id: randomUUID(), role: "authenticated" })}, true), set_config('role','authenticated',true)`;
    return callback(tx);
  });
}
async function rpc(user, action, payload = {}) {
  return asUser(user, async (tx) => {
    const [row] =
      await tx`SELECT public.event_workspace(${action},${tx.json(payload)}) result`;
    return row.result;
  });
}
// Queue both real connections behind the activity lock before releasing them.
// This makes the contention reproducible instead of relying on request timing.
async function contend(actions) {
  const jobs = [];
  await owner.begin(async (tx) => {
    await tx`SELECT id FROM activities WHERE id=${activityId} FOR UPDATE`;
    for (const action of actions) {
      const job = action().then(
        (result) => ({ ok: true, result }),
        (error) => ({ ok: false, error }),
      );
      jobs.push(job);
      pending.push(job);
    }
    let blocked = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      // Flush the transaction's statistics snapshot before checking active waits.
      await tx`SELECT pg_stat_clear_snapshot()`;
      const [row] =
        await tx`SELECT count(*)::int n FROM pg_stat_activity WHERE application_name=${applicationName} AND wait_event_type='Lock'`;
      blocked = row.n;
      if (blocked === actions.length) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(
      blocked,
      actions.length,
      "Both requests must actually contend on the activity row lock",
    );
  });
  return Promise.all(jobs);
}
try {
  await owner`INSERT INTO auth.users(id,email,email_confirmed_at) SELECT id,id::text||'@example.test',now() FROM unnest(${actors}::uuid[]) id`;
  usersSeeded = true;
  await owner`INSERT INTO public.user_roles(user_id,role) VALUES(${host},'sports_manager'),(${host},'tournament_organizer')`;
  const identities = await Promise.all(
    [racerA, racerB].map((user) =>
      asUser(user, async (tx) => {
        const [identity] =
          await tx`SELECT auth.uid() uid,current_user request_role,session_user login_role`;
        assert.equal(identity.uid, user);
        assert.equal(identity.request_role, "authenticated");
        assert.equal(identity.login_role, new URL(appUrl).username);
        return identity;
      }),
    ),
  );
  assert.notEqual(identities[0].uid, identities[1].uid);
  console.log(
    "PASS concurrent request transactions preserve independent claims and use the app login role",
  );

  const draft = await rpc(host, "document", {
    kind: "draft",
    name: "QA simultaneous registrations",
    data: {
      title: "QA simultaneous registrations",
      type: "daily_game",
      sport: "Футбол",
      city: "Астана",
      location_text: "Isolated QA pitch",
      date_time: new Date(Date.now() + 86400000).toISOString(),
      duration_minutes: 120,
      entry_fee: 0,
      max_participants: 2,
      min_participants: 2,
      participation_mode: "individual",
      venue_type: "outdoor",
      tier: null,
    },
  });
  documentId = draft.id;
  activityId = (await rpc(host, "publish", { id: draft.id })).id;
  const initialRegistration = await rpc(first, "join", {
    activity_id: activityId,
    accepted_terms: true,
  });
  const outcomes = await contend(
    [racerA, racerB].map(
      (user) => () =>
        rpc(user, "join", { activity_id: activityId, accepted_terms: true }),
    ),
  );
  assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1);
  assert.equal(outcomes.filter((outcome) => !outcome.ok).length, 1);
  assert.match(
    outcomes.find((outcome) => !outcome.ok).error.message,
    /Мест больше нет/,
  );
  const winner = outcomes[0].ok ? racerA : racerB;
  const loser = outcomes[0].ok ? racerB : racerA;
  let [counts] =
    await owner`SELECT registered_count,(SELECT count(*)::int FROM registrations WHERE activity_id=${activityId} AND status='registered') actual FROM activities WHERE id=${activityId}`;
  assert.equal(counts.registered_count, 2);
  assert.equal(counts.actual, 2);
  console.log(
    "PASS two simultaneous joins to the last place: one succeeds, one fails, capacity stays at two",
  );

  // The same user's simultaneous retries reuse one registration.
  const sameUser = await contend([
    () =>
      rpc(winner, "join", { activity_id: activityId, accepted_terms: true }),
    () =>
      rpc(winner, "join", { activity_id: activityId, accepted_terms: true }),
  ]);
  assert.ok(sameUser.every((outcome) => outcome.ok));
  assert.equal(sameUser[0].result.id, sameUser[1].result.id);
  console.log("PASS parallel duplicate joins remain idempotent");

  await rpc(loser, "waitlist_join", {
    activity_id: activityId,
    accepted_terms: true,
  });
  await rpc(outsider, "waitlist_join", {
    activity_id: activityId,
    accepted_terms: true,
  });
  const cancelRace = await contend([
    () =>
      rpc(first, "cancel", {
        registration_id: initialRegistration.id,
        reason: "QA cancelled registration",
      }),
    () =>
      rpc(outsider, "join", { activity_id: activityId, accepted_terms: true }),
  ]);
  assert.ok(cancelRace[0].ok);
  assert.equal(cancelRace[1].ok, false);
  assert.match(
    cancelRace[1].error.message,
    /Мест больше нет|место предложено|очереди|листа ожидания/,
  );
  const offers =
    await owner`SELECT user_id,offered_at,offer_expires_at FROM event_waitlist WHERE activity_id=${activityId} ORDER BY created_at,id`;
  assert.equal(offers[0].user_id, loser);
  assert.ok(offers[0].offered_at && offers[0].offer_expires_at);
  assert.equal(offers[1].offered_at, null);
  await rpc(loser, "join", { activity_id: activityId, accepted_terms: true });
  [counts] =
    await owner`SELECT registered_count,(SELECT count(*)::int FROM registrations WHERE activity_id=${activityId} AND status='registered') actual FROM activities WHERE id=${activityId}`;
  assert.equal(counts.registered_count, 2);
  assert.equal(counts.actual, 2);
  assert.equal(
    Number(
      (
        await owner`SELECT count(*) n FROM event_waitlist WHERE activity_id=${activityId} AND user_id=${loser}`
      )[0].n,
    ),
    0,
  );
  console.log(
    "PASS cancellation racing with a later waiter cannot steal the reserved place; the first waiter fills it",
  );

  // Check the two presence fixes against PostgreSQL as well as PGlite.
  await owner`UPDATE activities SET date_time=now()+interval '20 minutes' WHERE id=${activityId}`;
  await rpc(winner, "checkin", { activity_id: activityId });
  const currentRegistration = (await rpc(winner, "player")).registrations.find(
    (registration) => registration.activity_id === activityId,
  );
  assert.ok(currentRegistration.checked_in_at);
  await rpc(winner, "cancel", {
    registration_id: currentRegistration.id,
    reason: "QA repeat registration",
  });
  await rpc(outsider, "waitlist_leave", { activity_id: activityId });
  await rpc(winner, "join", { activity_id: activityId, accepted_terms: true });
  assert.equal(
    (await rpc(winner, "player")).registrations.find(
      (registration) => registration.activity_id === activityId,
    ).checked_in_at,
    null,
  );
  await rpc(winner, "checkin", { activity_id: activityId });
  await asUser(
    host,
    async (tx) =>
      tx`SELECT event_competition('weather',${tx.json({ activity_id: activityId, starts_at: new Date(Date.now() + 86400000).toISOString(), reason: "QA postponement caused by heavy rain" })})`,
  );
  assert.equal(
    (await rpc(winner, "player")).registrations.find(
      (registration) => registration.activity_id === activityId,
    ).checked_in_at,
    null,
  );
  await assert.rejects(
    () => rpc(winner, "checkin", { activity_id: activityId }),
    /Отметка доступна/,
  );
  console.log(
    "PASS real PostgreSQL clears check-in on rejoin and weather postponement and enforces the new window",
  );
} finally {
  await Promise.allSettled(pending);
  await app.end();
  // Only remove records with fresh UUIDs created by this test run.
  if (usersSeeded) {
    await owner.begin(async (tx) => {
      if (activityId) {
        await tx`DELETE FROM event_waitlist WHERE activity_id=${activityId}`;
        await tx`DELETE FROM registrations WHERE activity_id=${activityId}`;
      }
      if (documentId)
        await tx`DELETE FROM host_documents WHERE id=${documentId}`;
      if (activityId) await tx`DELETE FROM activities WHERE id=${activityId}`;
      await tx`DELETE FROM auth.users WHERE id=ANY(${actors}::uuid[])`;
    });
  }
  await owner.end();
}
