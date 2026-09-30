export async function testDiscovery(db, assert) {
  await db.exec(`RESET ROLE;
    INSERT INTO activities(title,type,sport,city,district,location_text,max_participants,host_name,date_time,is_free,is_private)
    SELECT 'Discovery fixture '||n,'daily_game',CASE WHEN n<=25 THEN 'Футбол' ELSE 'Баскетбол' END,'Тестовый город','Район '||(n%2),'Площадка',10,'Организатор',now()+interval '2 days',true,false FROM generate_series(1,28) n;
    INSERT INTO activities(title,type,sport,city,district,location_text,max_participants,host_name,date_time,is_free,is_private)
    VALUES ('Private discovery','daily_game','Волейбол','Тестовый город','Скрытый район','Площадка',10,'Организатор',now()+interval '2 days',true,true);
    SET ROLE anon;`);
  async function feed(sport, page = 0) {
    return (
      await db.query("SELECT event_feed($1,$2) data", [
        JSON.stringify({ city: "Тестовый город", sport }),
        page,
      ])
    ).rows[0].data;
  }
  const combined = await feed(["Футбол", "Баскетбол"]);
  const next = await feed(["Футбол", "Баскетбол"], 1);
  assert(
    combined.total === 28 &&
      combined.items.length === 24 &&
      next.items.length === 4,
    "multi-sport OR filter paginates and counts all matching events",
  );
  assert(
    new Set([...combined.items, ...next.items].map((x) => x.id)).size === 28,
    "multi-sport pages have no duplicates",
  );
  assert(
    (await feed(["Баскетбол"])).total === 3 &&
      (await feed("Футбол")).total === 25,
    "single selection and legacy sport links still work",
  );
  assert(
    (await feed([])).total === 28 && (await feed("all")).total === 28,
    "empty selection resets to all public sports",
  );
  assert(
    (await feed(["Теннис"])).total === 0,
    "unmatched sport returns no events",
  );
  assert(
    combined.districts.length === 2 &&
      !combined.districts.includes("Скрытый район"),
    "district choices are city-scoped and never disclose private events",
  );
}
