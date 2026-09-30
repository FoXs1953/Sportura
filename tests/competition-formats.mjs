export async function testFormats(db, as, assert) {
  const host = "33333333-3333-4333-8333-333333333333";
  const users = Array.from(
    { length: 40 },
    (_, i) => `99000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
  await db.exec("RESET ROLE");
  for (const id of users)
    await db.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now()) ON CONFLICT DO NOTHING",
      [id, id + "@example.test"],
    );
  const rpc = async (fn, action, payload, user = host) =>
    (
      await as(user, `SELECT ${fn}($1,$2) data`, [
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].data;
  const deny = async (fn, label) => {
    let failed = false;
    try {
      await fn();
    } catch {
      failed = true;
    }
    assert(failed, label);
  };
  const matches = async (aid) =>
    (
      await as(
        host,
        "SELECT * FROM event_matches WHERE activity_id=$1 ORDER BY round,position",
        [aid],
      )
    ).rows;
  async function event(format, n) {
    const data = {
      title: "Формат " + format,
      type: format === "league_playoff" ? "league" : "tournament",
      sport: "Футбол",
      city: "Астана",
      location_text: "Стадион",
      date_time: new Date(Date.now() + 86400000).toISOString(),
      duration_minutes: 180,
      entry_fee: 0,
      max_participants: n,
      min_participants: 2,
      participation_mode: "individual",
      tier: "spark",
      competition_format: format,
      match_settings: { league_legs: "2" },
    };
    const doc = await rpc("event_workspace", "document", {
      kind: "draft",
      name: data.title,
      data,
    });
    const aid = (await rpc("event_workspace", "publish", { id: doc.id })).id;
    for (const u of users.slice(0, n))
      await rpc(
        "event_workspace",
        "join",
        { activity_id: aid, accepted_terms: true },
        u,
      );
    assert(
      (
        await as(
          host,
          "SELECT competition_format FROM activities WHERE id=$1",
          [aid],
        )
      ).rows[0].competition_format === format,
      format + " persists through publishing",
    );
    return aid;
  }
  for (const [format, n] of [
    ["single_elimination", 5],
    ["round_robin", 6],
    ["double_elimination", 8],
    ["double_elimination", 5],
    ["double_elimination", 2],
    ["groups_playoff", 9],
    ["swiss", 8],
    ["swiss", 5],
    ["swiss", 33],
    ["league_playoff", 6],
  ]) {
    const aid = await event(format, n);
    await deny(
      () =>
        rpc("event_competition", "generate", { activity_id: aid }, users[0]),
      format + " generation requires host",
    );
    await rpc("event_competition", "generate", { activity_id: aid });
    await deny(
      () => rpc("event_competition", "generate", { activity_id: aid }),
      format + " cannot generate twice",
    );
    let round = 0;
    while (round++ < 30) {
      let ms = await matches(aid);
      const incomplete = ms.filter((m) => m.home_score === null);
      assert(incomplete.length > 0, format + " has playable next round");
      for (const m of incomplete) {
        // Away victories force the double-elimination final reset in the two-player case.
        await rpc("event_competition", "match", {
          activity_id: aid,
          id: m.id,
          home_score: format === "double_elimination" ? 0 : 2,
          away_score: format === "double_elimination" ? 1 : 1,
          duration_minutes: 30,
        });
      }
      await db.exec("RESET ROLE");
      await db.query(
        "UPDATE activities SET date_time=now()-interval '1 hour' WHERE id=$1",
        [aid],
      );
      let published = false;
      try {
        await rpc("event_competition", "publish_results", { activity_id: aid });
        published = true;
      } catch (e) {
        if (!/Сначала/.test(e.message)) throw e;
      }
      if (published) break;
      await rpc("event_competition", "advance", { activity_id: aid });
      const old = (await matches(aid))[0];
      await deny(
        () =>
          rpc("event_competition", "match", {
            activity_id: aid,
            id: old.id,
            home_score: 9,
            away_score: 0,
            duration_minutes: 30,
            reason: "Проверка защиты",
          }),
        format + " previous result locked after advancement",
      );
    }
    assert(round < 30, format + " tournament terminates");
    const ms = await matches(aid);
    const result = (
      await as(host, "SELECT * FROM results WHERE activity_id=$1", [aid])
    ).rows;
    assert(result.length === 1, format + " publishes one champion");
    if (format === "swiss") {
      const pairs = ms.map((m) => [m.home_id, m.away_id].sort().join(":"));
      assert(
        new Set(pairs).size === pairs.length,
        "Swiss opponents never repeat",
      );
      await db.exec("RESET ROLE");
      const byes = (
        await db.query(
          "SELECT registration_id,count(*) n FROM event_byes WHERE activity_id=$1 GROUP BY registration_id",
          [aid],
        )
      ).rows;
      assert(
        byes.every((b) => Number(b.n) === 1),
        "Swiss bye assigned at most once",
      );
      assert(
        Math.max(...ms.map((m) => m.round)) ===
          Math.min(n - 1, Math.ceil(Math.log2(n))),
        "Swiss has fixed round count",
      );
    }
    if (format === "double_elimination") {
      const losses = new Map();
      for (const m of ms) {
        const loser = m.winner_id === m.home_id ? m.away_id : m.home_id;
        losses.set(loser, (losses.get(loser) || 0) + 1);
      }
      assert(
        [...losses.values()].filter((x) => x === 2).length === n - 1,
        "double elimination removes players only at second loss",
      );
      if (n === 2)
        assert(
          ms.length === 3,
          "double elimination final reset protects unbeaten finalist",
        );
    }
    if (format === "league_playoff")
      assert(
        ms.filter((m) => m.stage === "groups").length === n * (n - 1),
        "two league legs create home and away fixtures",
      );
    const pub = (await as(host, "SELECT event_public($1) data", [aid])).rows[0]
      .data;
    assert(
      pub.standings.length === n && Array.isArray(pub.byes),
      format + " exposes scoreboard and byes",
    );
  }
}
