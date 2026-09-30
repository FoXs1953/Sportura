export async function testReplacements(db, as, assert) {
  const host = "33333333-3333-4333-8333-333333333333";
  const [u, v, w, x] = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "66666666-6666-4666-8666-666666666666",
    "88888888-8888-4888-8888-888888888888",
  ];
  const rpc = async (user, action, payload = {}) =>
    (
      await as(user, "SELECT event_workspace($1,$2) data", [
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
  async function setup(team = false) {
    const data = {
      title: "Замены после чек-ина",
      type: "tournament",
      sport: "Футбол",
      city: "Астана",
      location_text: "Стадион",
      date_time: new Date(Date.now() + 86400000).toISOString(),
      duration_minutes: 120,
      entry_fee: 0,
      max_participants: 2,
      min_participants: 2,
      participation_mode: team ? "team" : "individual",
      team_min: 2,
      team_max: 3,
      tier: "spark",
      competition_format: "single_elimination",
    };
    const d = await rpc(host, "document", {
      kind: "draft",
      name: data.title,
      data,
    });
    const aid = (await rpc(host, "publish", { id: d.id })).id;
    const roster = (user) =>
      team
        ? {
            team_name: "Команда " + user[0],
            team_members: ["Капитан " + user[0], "Игрок " + user[0]],
          }
        : {};
    const regs = [];
    for (const user of [u, v])
      regs.push(
        await rpc(user, "join", {
          activity_id: aid,
          accepted_terms: true,
          ...roster(user),
        }),
      );
    for (const user of [w, x])
      await rpc(user, "waitlist_join", {
        activity_id: aid,
        accepted_terms: true,
        ...roster(user),
      });
    const queue = (
      await as(
        host,
        "SELECT * FROM event_waitlist WHERE activity_id=$1 ORDER BY created_at,id",
        [aid],
      )
    ).rows;
    return { aid, regs, queue };
  }
  async function start(aid) {
    await db.exec(
      "RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false)",
    );
    await db.query(
      "UPDATE activities SET date_time=now()-interval '40 minutes',registration_deadline=now()-interval '1 hour' WHERE id=$1",
      [aid],
    );
  }
  const one = await setup();
  const payload = {
    activity_id: one.aid,
    waitlist_id: one.queue[0].id,
    confirmed_present: true,
  };
  await deny(
    () => rpc(host, "replace_no_show", payload),
    "replacement unavailable before event starts",
  );
  await start(one.aid);
  await deny(
    () => rpc(host, "replace_no_show", payload),
    "replacement requires explicit check-in closure",
  );
  await rpc(host, "close_checkin", { activity_id: one.aid });
  await deny(
    () => rpc(w, "replace_no_show", payload),
    "waiter cannot replace another participant",
  );
  await deny(
    () =>
      rpc(host, "replace_no_show", { ...payload, confirmed_present: false }),
    "host must confirm presence",
  );
  await deny(
    () =>
      rpc(host, "replace_no_show", {
        ...payload,
        waitlist_id: one.queue[1].id,
      }),
    "host cannot skip queue order",
  );
  await deny(
    () => rpc(w, "join", { activity_id: one.aid, accepted_terms: true }),
    "late ordinary registration stays closed",
  );
  await deny(
    () =>
      as(
        w,
        "INSERT INTO registrations(activity_id,user_id,payment_status,checked_in_at) VALUES($1,$2,'paid',now())",
        [one.aid, w],
      ),
    "late direct REST bypass stays closed",
  );
  const replacement = await rpc(host, "replace_no_show", payload);
  const reg = (
    await as(host, "SELECT * FROM registrations WHERE id=$1", [replacement.id])
  ).rows[0];
  assert(
    reg.user_id === one.queue[0].user_id &&
      reg.status === "registered" &&
      reg.checked_in_at,
    "host adds first waiter and confirms check-in",
  );
  let workspace = await rpc(host, "host");
  assert(
    workspace.checkin_closures.includes(one.aid) &&
      workspace.replaced_registrations.length === 1,
    "host sees closure and replacement audit",
  );
  assert(
    workspace.activities.find((a) => a.id === one.aid).registered_count === 1,
    "no-show records do not consume playing spots",
  );
  await deny(
    () => rpc(host, "replace_no_show", payload),
    "duplicate replacement does not create a second record",
  );
  await deny(
    () =>
      rpc(host, "participant", {
        registration_id: workspace.replaced_registrations[0],
        status: "attended",
        reason: "Вернулся",
      }),
    "replaced no-show cannot reclaim the occupied spot",
  );
  const second = await rpc(host, "replace_no_show", {
    ...payload,
    waitlist_id: one.queue[1].id,
  });
  assert(second.id !== replacement.id, "next waiter fills the second absence");
  workspace = await rpc(host, "host");
  assert(
    workspace.activities.find((a) => a.id === one.aid).registered_count === 2,
    "replacement cannot exceed capacity",
  );
  await rpc(host, "close_checkin", { activity_id: one.aid });
  assert(
    (
      await as(host, "SELECT status FROM registrations WHERE id=$1", [
        replacement.id,
      ])
    ).rows[0].status === "registered",
    "repeated closure preserves checked-in replacement",
  );
  await deny(
    () =>
      as(
        host,
        "INSERT INTO event_replacements(activity_id,absent_registration_id,user_id,actor_id) VALUES($1,$2,$3,$4)",
        [one.aid, one.regs[0].id, x, host],
      ),
    "private replacement authorization ledger cannot be forged",
  );
  const team = await setup(true);
  await start(team.aid);
  await rpc(host, "close_checkin", { activity_id: team.aid });
  await rpc(host, "skip_waiter", {
    activity_id: team.aid,
    waitlist_id: team.queue[0].id,
    confirmed_absent: true,
  });
  const tr = await rpc(host, "replace_no_show", {
    activity_id: team.aid,
    waitlist_id: team.queue[1].id,
    confirmed_present: true,
  });
  const members = (
    await as(
      host,
      "SELECT team_name,team_members FROM registrations WHERE id=$1",
      [tr.id],
    )
  ).rows[0];
  assert(
    members.team_members.length === 2 &&
      members.team_name === team.queue[1].team_name,
    "absent waiter can be skipped and next team keeps its roster",
  );
  const ended = await setup();
  await start(ended.aid);
  await rpc(host, "close_checkin", { activity_id: ended.aid });
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE activities SET date_time=now()-interval '3 hours' WHERE id=$1",
    [ended.aid],
  );
  await deny(
    () =>
      rpc(host, "replace_no_show", {
        activity_id: ended.aid,
        waitlist_id: ended.queue[0].id,
        confirmed_present: true,
      }),
    "replacement blocked after scheduled event end",
  );
  const bracket = await setup();
  await start(bracket.aid);
  await rpc(host, "close_checkin", { activity_id: bracket.aid });
  await db.exec("RESET ROLE");
  await db.query(
    "INSERT INTO event_matches(activity_id,round,position,home_id,away_id) VALUES($1,1,1,$2,$3)",
    [bracket.aid, bracket.regs[0].id, bracket.regs[1].id],
  );
  await deny(
    () =>
      rpc(host, "replace_no_show", {
        activity_id: bracket.aid,
        waitlist_id: bracket.queue[0].id,
        confirmed_present: true,
      }),
    "replacement blocked after bracket creation",
  );
}
