export async function testCalendarPrizes(db, as, assert) {
  const host = "33333333-3333-4333-8333-333333333333",
    u = "99000000-0000-4000-8000-000000000001",
    v = "99000000-0000-4000-8000-000000000002";
  const deny = async (fn, label) => {
    let failed = false;
    try {
      await fn();
    } catch {
      failed = true;
    }
    assert(failed, label);
  };
  const rpc = async (fn, action, payload, user = host) =>
    (await as(user, `SELECT ${fn}($1,$2) d`, [action, JSON.stringify(payload)]))
      .rows[0].d;
  const start = new Date(Date.now() + 86400000).toISOString();
  const draft = {
    title: "Кубок с вещевым призом",
    type: "tournament",
    sport: "Футбол",
    city: "Астана",
    location_text: "Стадион",
    date_time: start,
    duration_minutes: 4320,
    venue_type: "outdoor",
    entry_fee: 0,
    max_participants: 4,
    min_participants: 2,
    participation_mode: "individual",
    tier: "spark",
    competition_format: "single_elimination",
    event_extras: { series: "sponsor_cup" },
  };
  const doc = await rpc("event_workspace", "document", {
    kind: "draft",
    name: draft.title,
    data: draft,
  });
  const aid = (await rpc("event_workspace", "publish", { id: doc.id })).id;
  const leagueDoc = await rpc("event_workspace", "document", {
    kind: "draft",
    name: "Сезон 10 недель",
    data: {
      ...draft,
      title: "Сезон 10 недель",
      type: "league",
      duration_minutes: 100800,
      event_extras: { series: "open" },
      competition_format: "league_playoff",
    },
  });
  assert(
    !!(await rpc("event_workspace", "publish", { id: leagueDoc.id })).id,
    "Ten-week league publishes successfully",
  );
  let pub = (await as(host, "SELECT event_public($1) d", [aid])).rows[0].d;
  assert(
    pub.activity.event_extras.series === "sponsor_cup",
    "Series persists through publication",
  );
  await rpc("event_competition", "prize_add", {
    activity_id: aid,
    name: "Футбольный мяч",
    sponsor: "Тестовый партнёр",
  });
  await rpc(
    "event_workspace",
    "join",
    { activity_id: aid, accepted_terms: true },
    u,
  );
  await rpc(
    "event_workspace",
    "join",
    { activity_id: aid, accepted_terms: true },
    v,
  );
  await deny(
    () =>
      rpc("event_competition", "prize_add", {
        activity_id: aid,
        name: "Поздний приз",
      }),
    "Prize terms fixed after registration",
  );
  await rpc("event_competition", "generate", {
    activity_id: aid,
    seeding: "rating",
  });
  await deny(
    () =>
      rpc(
        "event_competition",
        "schedule",
        {
          activity_id: aid,
          starts_at: start,
          minutes: 60,
          gap: 10,
          per_day: 2,
        },
        u,
      ),
    "Only organizer schedules",
  );
  await rpc("event_competition", "schedule", {
    activity_id: aid,
    starts_at: start,
    minutes: 60,
    gap: 10,
    per_day: 2,
  });
  pub = (await as(host, "SELECT event_public($1) d", [aid])).rows[0].d;
  assert(
    pub.matches[0].starts_at !== null,
    "Schedule assigns real match times",
  );
  await deny(
    () =>
      rpc("event_competition", "schedule", {
        activity_id: aid,
        starts_at: start,
        minutes: 60,
        gap: 10,
        per_day: 2,
      }),
    "Existing match times are preserved",
  );
  const postponed = new Date(Date.parse(start) + 86400000).toISOString();
  await rpc("event_competition", "weather", {
    activity_id: aid,
    starts_at: postponed,
    reason: "Сильный ливень на открытой площадке",
  });
  pub = (await as(host, "SELECT event_public($1) d", [aid])).rows[0].d;
  assert(
    Date.parse(pub.matches[0].starts_at) === Date.parse(postponed),
    "Weather postponement moves matches with event",
  );
  await deny(
    () =>
      rpc("event_competition", "weather", {
        activity_id: aid,
        starts_at: new Date(Date.parse(start) + 3 * 86400000).toISOString(),
        reason: "Повторный перенос из-за дождя",
      }),
    "Repeated weather moves cannot bypass original 48-hour limit",
  );
  const m = pub.matches[0],
    prize = pub.item_prizes[0];
  await rpc("event_competition", "match", {
    activity_id: aid,
    id: m.id,
    home_score: 2,
    away_score: 1,
  });
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE activities SET date_time=now()-interval '1 hour' WHERE id=$1",
    [aid],
  );
  await rpc("event_competition", "publish_results", { activity_id: aid });
  await deny(
    () =>
      rpc("event_competition", "prize_award", {
        activity_id: aid,
        id: prize.id,
        registration_id: m.home_id,
      }),
    "Awards wait for dispute window",
  );
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE activities SET dispute_window_ends_at=now()-interval '1 second' WHERE id=$1",
    [aid],
  );
  await rpc("event_competition", "prize_award", {
    activity_id: aid,
    id: prize.id,
    registration_id: m.home_id,
  });
  await rpc("event_competition", "prize_deliver", {
    activity_id: aid,
    id: prize.id,
    note: "Передан лично на награждении",
  });
  pub = (await as(host, "SELECT event_public($1) d", [aid])).rows[0].d;
  assert(
    pub.item_prizes[0].delivered_at !== null && pub.item_prizes[0].recipient,
    "Public prize has winner and delivery status",
  );
  await deny(
    () =>
      rpc("event_competition", "prize_deliver", {
        activity_id: aid,
        id: prize.id,
        note: "Повторная выдача",
      }),
    "Prize cannot be delivered twice",
  );
}
