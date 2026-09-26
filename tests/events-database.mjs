export async function testEvents(db, as, assert) {
  const host = "33333333-3333-4333-8333-333333333333",
    p = "11111111-1111-4111-8111-111111111111",
    q = "22222222-2222-4222-8222-222222222222";
  const rpc = async (user, action, payload = {}) =>
    (
      await as(user, "SELECT event_workspace($1,$2) data", [
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].data;
  const reject = async (fn, text) => {
    try {
      await fn();
      throw Error("UNEXPECTED SUCCESS");
    } catch (e) {
      if (e.message === "UNEXPECTED SUCCESS") throw e;
      assert(true, text);
    }
  };
  const draft = {
    title: "Рабочая тестовая игра",
    type: "daily_game",
    sport: "Футбол",
    city: "Астана",
    location_text: "Площадка",
    date_time: new Date(Date.now() + 86400000).toISOString(),
    duration_minutes: 90,
    entry_fee: 1000,
    max_participants: 2,
    kaspi_payment_link: "https://pay.kaspi.kz/pay/test",
    participation_mode: "individual",
  };
  const doc = await rpc(host, "document", {
    kind: "draft",
    data: draft,
    name: draft.title,
  });
  await reject(
    () => rpc(p, "delete_document", { id: doc.id }),
    "foreign draft protected",
  );
  const a = await rpc(host, "publish", { id: doc.id, version: doc.updated_at });
  assert(
    (await rpc(host, "publish", { id: doc.id })).id === a.id,
    "publishing is idempotent",
  );
  const r = await rpc(p, "join", { activity_id: a.id, accepted_terms: true });
  assert(
    (await rpc(p, "join", { activity_id: a.id, accepted_terms: true })).id ===
      r.id,
    "join is idempotent",
  );
  let player = await rpc(p, "player");
  assert(
    player.registrations.find((x) => x.id === r.id).amount_due === 1000,
    "price captured at registration",
  );
  await reject(
    () => rpc(q, "cancel", { registration_id: r.id }),
    "foreign cancellation denied",
  );
  await rpc(p, "cancel", { registration_id: r.id, reason: "Другие планы" });
  assert(
    (await rpc(p, "player")).registrations.some(
      (x) => x.id === r.id && x.status === "cancelled",
    ),
    "cancelled entry retained",
  );
  await rpc(p, "join", { activity_id: a.id, accepted_terms: true });
  await rpc(p, "proof", {
    registration_id: r.id,
    payment_reference: "reference-1",
  });
  await rpc(host, "payment", {
    registration_id: r.id,
    status: "rejected",
    reason: "Нечитаемый чек",
  });
  await rpc(p, "proof", {
    registration_id: r.id,
    payment_reference: "reference-2",
  });
  assert(
    (await rpc(p, "player")).registrations.find((x) => x.id === r.id).proofs
      .length === 2,
    "rejected proof can be resubmitted with history",
  );
  await rpc(host, "payment", { registration_id: r.id, status: "paid" });
  await rpc(p, "cancel", {
    registration_id: r.id,
    reason: "Отмена оплаченной записи",
  });
  player = await rpc(p, "player");
  assert(
    player.registrations.find((x) => x.id === r.id).refund.status ===
      "requested",
    "paid cancellation creates refund request",
  );
  await reject(
    () =>
      rpc(q, "refund", {
        registration_id: r.id,
        status: "completed",
        reason: "forged",
        reference: "xxx",
        amount: 1000,
      }),
    "foreign refund denied",
  );
  await rpc(host, "refund", {
    registration_id: r.id,
    status: "completed",
    reason: "Возвращено",
    reference: "transaction-1",
    amount: 1000,
  });
  assert(
    (await rpc(p, "player")).registrations.find((x) => x.id === r.id)
      .payment_status === "refunded",
    "refund completion persisted",
  );
  await rpc(p, "favorite", { activity_id: a.id, saved: true });
  assert(
    (await rpc(p, "player")).saved.some((x) => x.activity_id === a.id),
    "favorites persist",
  );
  const feed = (
    await as(p, "SELECT event_feed($1,0) data", [
      JSON.stringify({ city: "Астана", q: "Рабочая тестовая" }),
    ])
  ).rows[0].data;
  assert(
    feed.total === 1 && feed.items[0].saved,
    "server feed filters and favorites work",
  );
  await reject(
    () => as(p, "UPDATE registrations SET amount_due=1 WHERE id=$1", [r.id]),
    "price cannot be forged",
  );
  const compDoc = await rpc(host, "document", {
    kind: "draft",
    name: "Турнир",
    data: { ...draft, type: "league", entry_fee: 0 },
  });
  const comp = await rpc(host, "publish", { id: compDoc.id });
  await rpc(p, "join", { activity_id: comp.id, accepted_terms: true });
  await rpc(q, "join", { activity_id: comp.id, accepted_terms: true });
  const crpc = async (action, payload = {}) =>
    (
      await as(host, "SELECT event_competition($1,$2) data", [
        action,
        JSON.stringify({ activity_id: comp.id, ...payload }),
      ])
    ).rows[0].data;
  await crpc("generate");
  const hw = await rpc(host, "host");
  const m = hw.matches.find((x) => x.activity_id === comp.id);
  assert(!!m, "league schedule generated");
  await crpc("match", {
    id: m.id,
    home_score: 2,
    away_score: 1,
    duration_minutes: 60,
    location: "Площадка",
  });
  const pub = (await as(p, "SELECT event_public($1) data", [comp.id])).rows[0]
    .data;
  assert(
    pub.standings.find((x) => x.registration_id === m.home_id).points === 3,
    "league standings calculated",
  );
  await reject(
    () => crpc("publish_results"),
    "future competition cannot publish results",
  );
  await reject(
    () => rpc(q, "join", { activity_id: a.id }),
    "terms confirmation required",
  );
  await reject(
    () =>
      rpc(host, "participant", {
        registration_id: r.id,
        status: "attended",
        reason: "test",
      }),
    "future attendance blocked",
  );
  await reject(
    () => rpc(host, "document", { id: doc.id, kind: "draft", data: draft }),
    "published drafts immutable",
  );
  const missing = await rpc(host, "document", {
    kind: "draft",
    data: { type: "daily_game" },
    name: "Incomplete",
  });
  await reject(
    () => rpc(host, "publish", { id: missing.id }),
    "incomplete publication rejected",
  );
  const privateDoc = await rpc(host, "document", {
    kind: "draft",
    name: "Private",
    data: { ...draft, is_private: true, entry_fee: 0 },
  });
  const privateEvent = await rpc(host, "publish", { id: privateDoc.id });
  assert(
    (await as(p, "SELECT event_public($1) data", [privateEvent.id])).rows[0]
      .data === null,
    "private event hidden without invite",
  );
  assert(
    !!(
      await as(p, "SELECT event_public($1,$2) data", [
        privateEvent.id,
        privateEvent.invite_code,
      ])
    ).rows[0].data,
    "private event opens with exact invite",
  );
  await reject(
    () =>
      rpc(p, "join", { activity_id: privateEvent.id, accepted_terms: true }),
    "private join requires invitation",
  );
  const privateReg = await rpc(p, "join", {
    activity_id: privateEvent.id,
    code: privateEvent.invite_code,
    accepted_terms: true,
  });
  await rpc(q, "join", {
    activity_id: privateEvent.id,
    code: privateEvent.invite_code,
    accepted_terms: true,
  });
  await reject(
    () =>
      rpc(host, "join", { activity_id: privateEvent.id, accepted_terms: true }),
    "capacity cannot be exceeded",
  );
  await reject(
    () =>
      as(host, "UPDATE activities SET max_participants=1 WHERE id=$1", [
        privateEvent.id,
      ]),
    "capacity cannot shrink under occupied places",
  );
  assert(
    !!(await as(p, "SELECT event_public($1) data", [privateEvent.id])).rows[0]
      .data,
    "private participant retains access without code",
  );
  const publicRows = await as(q, "SELECT * FROM activities WHERE id=$1", [
    privateEvent.id,
  ]);
  assert(
    publicRows.rows.length === 1,
    "private activity RLS works for registered participant",
  );
  await reject(
    () => rpc(q, "payment", { registration_id: privateReg.id, status: "paid" }),
    "participant cannot approve another payment",
  );
  await reject(
    () => rpc(p, "review", { registration_id: privateReg.id, rating: 5 }),
    "review cannot precede confirmed attendance",
  );
  await crpc("match", {
    id: m.id,
    home_score: 2,
    away_score: 1,
    duration_minutes: 60,
    location: "Площадка",
    reason: "Исправление",
  });
  await reject(
    () => rpc(p, "cancel", { registration_id: m.home_id, reason: "cancel" }),
    "bracket participants cannot withdraw without review",
  );
  await reject(
    () =>
      crpc("payout", {
        id: "00000000-0000-4000-8000-000000000000",
        reference: "test",
      }),
    "prize cannot be paid before dispute window",
  );
  await as(
    host,
    "UPDATE activities SET date_time=now()-interval '2 days' WHERE id=$1",
    [comp.id],
  );
  await crpc("publish_results");
  const published = (await as(p, "SELECT event_public($1) data", [comp.id]))
    .rows[0].data;
  assert(
    published.activity.status === "completed" && published.results.length === 1,
    "completed competition publishes real winner",
  );
  await reject(
    () =>
      crpc("match", {
        id: m.id,
        home_score: 1,
        away_score: 2,
        duration_minutes: 60,
      }),
    "result correction requires reason",
  );
  await crpc("match", {
    id: m.id,
    home_score: 1,
    away_score: 2,
    duration_minutes: 60,
    reason: "Исправили ошибочный счёт",
  });
  assert(
    (await as(p, "SELECT event_public($1) data", [comp.id])).rows[0].data
      .results.length === 0,
    "stale published result hidden pending republication",
  );
  const ticketPayload = {
    activity_id: privateEvent.id,
    topic: "general",
    subject: "Проверка поддержки",
    body: "Уточните пожалуйста время игры",
  };
  const ticket1 = (
    await as(p, "SELECT profile_workspace($1,$2) data", [
      "ticket",
      JSON.stringify(ticketPayload),
    ])
  ).rows[0].data;
  const ticket2 = (
    await as(p, "SELECT profile_workspace($1,$2) data", [
      "ticket",
      JSON.stringify(ticketPayload),
    ])
  ).rows[0].data;
  assert(ticket1.id === ticket2.id, "contextual support requests deduplicated");
  const count = (
    await as(p, "SELECT count(*) n FROM support_messages WHERE ticket_id=$1", [
      ticket1.id,
    ])
  ).rows[0].n;
  assert(
    Number(count) === 1,
    "repeated support submit does not duplicate message",
  );
  await as(p, "SELECT profile_workspace($1,$2) data", [
    "ticket",
    JSON.stringify({
      ...ticketPayload,
      body: "И ещё уточните название площадки",
    }),
  ]);
  assert(
    Number(
      (
        await as(
          p,
          "SELECT count(*) n FROM support_messages WHERE ticket_id=$1",
          [ticket1.id],
        )
      ).rows[0].n,
    ) === 2,
    "follow-up message appended to existing ticket",
  );
  await rpc(host, "event_status", {
    activity_id: privateEvent.id,
    status: "cancelled",
    reason: "Площадка закрылась",
  });
  assert(
    (await rpc(p, "player")).registrations.find((x) => x.id === privateReg.id)
      .activity.status === "cancelled",
    "host cancellation remains visible to participant",
  );
  console.log("EVENT WORKSPACE CHECKS PASSED");
}
