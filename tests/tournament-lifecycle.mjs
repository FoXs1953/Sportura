export async function testTournamentLifecycle(db, as, assert) {
  const host = "33333333-3333-4333-8333-333333333333";
  const [u, v, w, x] = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "66666666-6666-4666-8666-666666666666",
    "88888888-8888-4888-8888-888888888888",
  ];
  await db.exec("RESET ROLE");
  await db.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'queue@example.test',now())",
    [x],
  );
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
  const maintain = async () => {
    await db.exec(
      "RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); SET ROLE service_role",
    );
    await db.query("SELECT profile_maintenance()");
  };
  const create = async (extra = {}) => {
    const data = {
      title: "Проверка жизненного цикла",
      type: "tournament",
      sport: "Футбол",
      city: "Астана",
      location_text: "Стадион",
      date_time: new Date(Date.now() + 86400000).toISOString(),
      duration_minutes: 90,
      entry_fee: 0,
      max_participants: 2,
      min_participants: 2,
      participation_mode: "individual",
      tier: "spark",
      competition_format: "single_elimination",
      ...extra,
    };
    const d = await rpc(host, "document", {
      kind: "draft",
      name: data.title,
      data,
    });
    return (await rpc(host, "publish", { id: d.id })).id;
  };
  const join = (user, activity_id, extra = {}) =>
    rpc(user, "join", { activity_id, accepted_terms: true, ...extra });
  const wait = (user, activity_id, extra = {}) =>
    rpc(user, "waitlist_join", { activity_id, accepted_terms: true, ...extra });
  const queue = async (activity_id) =>
    (
      await as(
        host,
        "SELECT * FROM event_waitlist WHERE activity_id=$1 ORDER BY created_at,id",
        [activity_id],
      )
    ).rows;
  const cancel = (user, id) =>
    rpc(user, "cancel", { registration_id: id, reason: "Планы изменились" });

  const aid = await create();
  const first = await join(u, aid);
  await join(v, aid);
  await wait(w, aid);
  await wait(x, aid);
  assert(
    (await queue(aid)).every((r) => r.offered_at === null),
    "full event makes no offers",
  );
  await cancel(u, first.id);
  let rows = await queue(aid);
  assert(
    rows[0].user_id === w && rows[0].offered_at && !rows[1].offered_at,
    "first waiter gets the one free place",
  );
  assert(
    new Date(rows[0].offer_expires_at) - new Date(rows[0].offered_at) ===
      15 * 60000,
    "offer lasts fifteen minutes",
  );
  const offerId = rows[0].id;
  const before = rows[0].offer_expires_at;
  await rpc(w, "player");
  await rpc(host, "host");
  await maintain();
  assert(
    +new Date((await queue(aid))[0].offer_expires_at) === +new Date(before),
    "refresh and scheduled job do not extend offer",
  );
  const notifications = (
    await as(
      w,
      "SELECT count(*) n FROM profile_notifications WHERE dedupe=$1",
      ["waitlist-offer:" + offerId],
    )
  ).rows[0].n;
  assert(Number(notifications) === 1, "offer notification delivered only once");
  await deny(
    () =>
      as(
        x,
        "INSERT INTO registrations(activity_id,user_id,payment_status) VALUES($1,$2,'paid')",
        [aid, x],
      ),
    "direct REST cannot bypass reserved place",
  );
  await deny(
    () =>
      as(
        w,
        "UPDATE event_waitlist SET offer_expires_at=now()+interval '1 day' WHERE id=$1",
        [offerId],
      ),
    "participant cannot extend their reservation",
  );
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE event_waitlist SET offered_at=now()-interval '16 minutes',offer_expires_at=now()-interval '1 minute' WHERE id=$1",
    [offerId],
  );
  await maintain();
  rows = await queue(aid);
  assert(
    rows.length === 1 && rows[0].user_id === x && rows[0].offered_at,
    "expiry advances offer to next participant",
  );
  await deny(() => join(w, aid), "expired waiter cannot steal the next offer");
  await wait(w, aid);
  assert(
    (await queue(aid))[1].user_id === w,
    "expired participant can rejoin at the end",
  );
  await join(x, aid);
  assert(
    (await queue(aid)).length === 1 && !(await queue(aid))[0].offered_at,
    "claim consumes reservation without exceeding capacity",
  );

  await as(host, "UPDATE activities SET max_participants=3 WHERE id=$1", [aid]);
  assert((await queue(aid))[0].offered_at, "capacity increase offers the new place");
  await deny(
    () => as(host, "UPDATE activities SET max_participants=2 WHERE id=$1", [aid]),
    "capacity cannot be reduced below active reservations",
  );

  const multiple = await create();
  const one = await join(u, multiple),
    two = await join(v, multiple);
  await wait(w, multiple);
  await wait(x, multiple);
  await cancel(u, one.id);
  await cancel(v, two.id);
  assert(
    (await queue(multiple)).every((r) => r.offered_at),
    "two vacancies reserve two places",
  );
  await join(x, multiple);
  await join(w, multiple);
  assert(
    (await queue(multiple)).length === 0,
    "parallel offers may be claimed in either order",
  );
  await deny(
    () => join(u, multiple),
    "capacity still enforced after all claims",
  );

  const short = await create({
    registration_deadline: new Date(Date.now() + 5 * 60000).toISOString(),
  });
  const shortReg = await join(u, short);
  await join(v, short);
  await wait(w, short);
  await cancel(u, shortReg.id);
  const shortOffer = (await queue(short))[0];
  assert(
    new Date(shortOffer.offer_expires_at) - new Date(shortOffer.offered_at) <=
      5 * 60000,
    "offer ends at registration deadline",
  );
  await rpc(host, "event_status", {
    activity_id: short,
    status: "cancelled",
    reason: "Отмена проверки",
  });
  await maintain();
  assert(
    (await queue(short)).every((r) => !r.offered_at),
    "cancelled event no longer displays an active offer",
  );

  const under = await create({ min_participants: 3, max_participants: 3 });
  await join(u, under);
  const enough = await create();
  await join(u, enough);
  await join(v, enough);
  const daily = await create({ type: "daily_game", tier: null });
  const future = await create();
  for (const id of [under, enough, daily]) {
    await as(
      host,
      "UPDATE activities SET registration_deadline=now()-interval '1 minute' WHERE id=$1",
      [id],
    );
  }
  const noDeadline = await create();
  await as(
    host,
    "UPDATE activities SET date_time=now()-interval '1 minute' WHERE id=$1",
    [noDeadline],
  );
  const drawn = await create();
  await join(u, drawn);
  await join(v, drawn);
  await as(
    host,
    "SELECT event_competition('generate',jsonb_build_object('activity_id',$1::text))",
    [drawn],
  );
  await maintain();
  await maintain();
  const states = (
    await as(
      host,
      "SELECT id,status,cancellation_reason FROM activities WHERE id=ANY($1::uuid[])",
      [[under, enough, daily, future, noDeadline, drawn]],
    )
  ).rows;
  assert(
    states.find((a) => a.id === under).status === "cancelled",
    "underfilled tournament cancelled at deadline",
  );
  assert(
    states
      .find((a) => a.id === under)
      .cancellation_reason.includes("1 из необходимых 3"),
    "cancellation explains actual and required counts",
  );
  assert(
    states.find((a) => a.id === noDeadline).status === "cancelled",
    "start is the fallback deadline",
  );
  assert(
    states
      .filter((a) => [enough, daily, future, drawn].includes(a.id))
      .every((a) => a.status !== "cancelled"),
    "enough participants, daily games, future events and existing brackets are preserved",
  );
  const audit = (
    await as(
      host,
      "SELECT count(*) n FROM event_history WHERE activity_id=$1 AND action='Автоматическая отмена при недоборе'",
      [under],
    )
  ).rows[0].n;
  assert(Number(audit) === 1, "scheduled cancellation is idempotent");
  assert(
    (
      await as(
        u,
        "SELECT id FROM profile_notifications WHERE user_id=$1 AND title='Событие отменено' AND href=$2",
        [u, "/activity/" + under],
      )
    ).rows.length === 1,
    "registered participant receives cancellation notice",
  );
  await deny(
    () => as(u, "SELECT event_lifecycle_maintenance()"),
    "participant cannot call global maintenance",
  );
  await deny(
    () =>
      as(u, "INSERT INTO event_minimum_checks(activity_id) VALUES($1)", [
        future,
      ]),
    "participant cannot bypass minimum checks",
  );

  const privateEvent = await create({ is_private: true });
  const hidden = (await as(x, "SELECT event_public($1) data", [privateEvent]))
    .rows[0].data;
  assert(
    hidden === null,
    "public queue count preserves private-event access checks",
  );
  await deny(
    () => as(u, "SELECT event_workspace_queue_base('player','{}')"),
    "old wrapper is not directly callable",
  );
  await deny(
    () => as(u, "SELECT event_public_queue_base($1,'')", [privateEvent]),
    "public wrapper cannot be bypassed",
  );

  const teams = await create({
    participation_mode: "team",
    team_min: 2,
    team_max: 3,
    min_participants: 2,
    max_participants: 2,
  });
  const rosterA = {
    team_name: "Команда А",
    team_members: ["Первый игрок", "Второй игрок"],
  };
  const rosterB = {
    team_name: "Команда Б",
    team_members: ["Третий игрок", "Четвёртый игрок"],
  };
  const rosterC = {
    team_name: "Команда В",
    team_members: ["Пятый игрок", "Шестой игрок"],
  };
  const teamReg = await join(u, teams, rosterA);
  await join(v, teams, rosterB);
  await wait(w, teams, rosterC);
  await cancel(u, teamReg.id);
  const teamOffer = (await rpc(w, "player")).waitlist.find(
    (r) => r.activity_id === teams,
  );
  assert(
    teamOffer.team_name === rosterC.team_name &&
      teamOffer.team_members.length === 2 &&
      teamOffer.offer_expires_at,
    "team offer preserves saved roster",
  );
  await join(w, teams, {
    team_name: teamOffer.team_name,
    team_members: teamOffer.team_members,
  });
  await cancel(
    v,
    (await rpc(v, "player")).registrations.find((r) => r.activity_id === teams)
      .id,
  );
  await as(
    host,
    "UPDATE activities SET registration_deadline=now()-interval '1 minute' WHERE id=$1",
    [teams],
  );
  await maintain();
  assert(
    (await as(host, "SELECT status FROM activities WHERE id=$1", [teams]))
      .rows[0].status === "cancelled",
    "minimum counts teams, not players in the roster",
  );
  console.log("TOURNAMENT LIFECYCLE CHECKS PASSED");
}
