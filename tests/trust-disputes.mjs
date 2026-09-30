export async function testTrustDisputes(db, as, assert) {
  const host = "33333333-3333-4333-8333-333333333333",
    u = "99000000-0000-4000-8000-000000000001",
    outsider = "99000000-0000-4000-8000-000000000040";
  const deny = async (fn, label) => {
    let failed = false;
    try {
      await fn();
    } catch {
      failed = true;
    }
    assert(failed, label);
  };
  const trust = (await as(u, "SELECT organizer_trust($1) t", [u])).rows[0].t;
  assert(
    trust.level === "novice" && trust.limit === 32,
    "New organizer limited to 32",
  );
  await deny(
    () =>
      as(u, "SELECT set_organizer_partner($1,true,$2)", [
        u,
        "Поддельное одобрение",
      ]),
    "Participant cannot grant partnership",
  );
  await db.exec("RESET ROLE");
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'tournament_organizer') ON CONFLICT DO NOTHING",
    [u],
  );
  await as(host, "SELECT set_organizer_partner($1,true,$2)", [
    u,
    "Договор тест",
  ]);
  assert(
    (await as(u, "SELECT organizer_trust($1) t", [u])).rows[0].t.level ===
      "partner",
    "Admin grants partnership",
  );
  await as(host, "SELECT set_organizer_partner($1,false,$2)", [
    u,
    "Прекращён договор",
  ]);
  assert(
    (await as(u, "SELECT organizer_trust($1) t", [u])).rows[0].t.level ===
      "novice",
    "Partnership removal recalculates level",
  );
  await db.exec("RESET ROLE");
  const aid = (
    await db.query(
      "SELECT activity_id FROM registrations r JOIN activities a ON a.id=r.activity_id WHERE r.user_id=$1 AND a.title LIKE 'Формат %' LIMIT 1",
      [u],
    )
  ).rows[0].activity_id;
  await db.query(
    "UPDATE activities SET dispute_window_ends_at=now()+interval '2 hours' WHERE id=$1",
    [aid],
  );
  const rpc = async (user, action, payload) =>
    (
      await as(user, "SELECT event_disputes($1,$2) d", [
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].d;
  await deny(
    () =>
      rpc(outsider, "open", {
        activity_id: aid,
        body: "Я не участник этого события",
      }),
    "Nonparticipant cannot open dispute",
  );
  const d = await rpc(u, "open", {
    activity_id: aid,
    body: "Проверьте счёт последнего матча",
  });
  await deny(
    () =>
      rpc(u, "open", {
        activity_id: aid,
        body: "Дублирующее обращение по матчу",
      }),
    "Duplicate open dispute rejected",
  );
  assert(
    (await rpc(outsider, "list", { activity_id: aid })).length === 0,
    "Dispute hidden from unrelated user",
  );
  await deny(
    () =>
      rpc(u, "resolve", {
        id: d.id,
        status: "approved",
        body: "Я сам решил свой спор",
      }),
    "Participant cannot resolve own dispute",
  );
  await rpc(host, "reply", { id: d.id, body: "Проверяем протокол матча" });
  await rpc(u, "reply", { id: d.id, body: "Уточняю время матча: 15:00" });
  assert(
    (await rpc(host, "list", { activity_id: aid }))[0].messages.length === 2,
    "Both sides can discuss dispute",
  );
  await rpc(host, "resolve", {
    id: d.id,
    status: "rejected",
    body: "Протокол подтверждает опубликованный счёт",
  });
  assert(
    (await rpc(u, "list", { activity_id: aid }))[0].status === "rejected",
    "Organizer decision visible to participant",
  );
  await deny(
    () => rpc(host, "reply", { id: d.id, body: "Позднее изменение" }),
    "Closed dispute cannot be silently changed",
  );
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE activities SET dispute_window_ends_at=now()-interval '1 second' WHERE id=$1",
    [aid],
  );
  await deny(
    () =>
      rpc(u, "open", { activity_id: aid, body: "Попытка после конца окна" }),
    "Expired dispute window enforced in database",
  );
}
