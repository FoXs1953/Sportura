export async function testPaidTournamentDrafts(db, as, assert) {
  const host = "33333333-3333-4333-8333-333333333333";
  const user = "11111111-1111-4111-8111-111111111111";
  const rpc = async (actor, action, payload) =>
    (
      await as(actor, "SELECT event_workspace($1,$2) data", [
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].data;
  const paidBefore = Number(
    (
      await as(
        host,
        "SELECT count(*) n FROM public.activities WHERE entry_fee>0",
      )
    ).rows[0].n,
  );
  const denied = async (run, message) => {
    let failed = false;
    try {
      await run();
    } catch {
      failed = true;
    }
    assert(failed, message);
  };
  const data = {
    title: "Платный спортивный турнир",
    type: "tournament",
    sport: "Футбол",
    city: "Астана",
    location_text: "Стадион",
    date_time: new Date(Date.now() + 4 * 86400000).toISOString(),
    duration_minutes: 240,
    entry_fee: 2000,
    max_participants: 16,
    min_participants: 4,
    participation_mode: "individual",
    tier: "blitz",
    competition_format: "single_elimination",
    kaspi_payment_link: "",
  };
  const blitz = await rpc(host, "document", {
    kind: "draft",
    name: data.title,
    data,
  });
  assert(
    blitz.data.entry_fee === 2000 && blitz.data.tier === "blitz",
    "one-day paid tournament saved as draft",
  );
  const marathonData = { ...data, tier: "marathon", duration_minutes: 2880 };
  const marathon = await rpc(host, "document", {
    kind: "draft",
    name: "Два дня",
    data: marathonData,
  });
  assert(
    marathon.data.duration_minutes === 2880,
    "multi-day paid tournament saved as draft",
  );
  await denied(
    () => rpc(host, "publish", { id: blitz.id }),
    "paid tournament cannot publish without provider",
  );
  await denied(
    () => rpc(user, "document", { kind: "draft", data }),
    "non-organizer cannot save paid tournament",
  );
  await denied(
    () =>
      rpc(host, "document", {
        kind: "draft",
        data: { ...data, sport: "Шахматы" },
      }),
    "unsupported discipline rejected",
  );
  await denied(
    () =>
      rpc(host, "document", {
        kind: "draft",
        data: { ...data, tier: "marathon" },
      }),
    "multi-day tier requires more than one day",
  );
  await denied(
    () =>
      rpc(host, "document", {
        kind: "draft",
        data: { ...data, entry_fee: 0, tier: "marathon" },
      }),
    "marathon cannot bypass the fee rule",
  );
  await denied(
    () =>
      rpc(host, "document", {
        kind: "draft",
        data: { ...data, kaspi_payment_link: "https://example.test/pay" },
      }),
    "direct payment link rejected",
  );
  await denied(
    () => rpc(host, "document", { kind: "template", data }),
    "paid tournament cannot be saved as template",
  );
  await denied(
    () =>
      rpc(host, "document", {
        kind: "draft",
        activity_id: "11111111-1111-4111-8111-111111111111",
        data,
      }),
    "published event cannot become paid draft",
  );
  const publicPaid = (
    await as(host, "SELECT count(*) n FROM public.activities WHERE entry_fee>0")
  ).rows[0].n;
  assert(
    Number(publicPaid) === paidBefore,
    "no new paid event enters public activities",
  );
  await db.exec("RESET ROLE");
}
