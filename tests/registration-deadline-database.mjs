import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";

const db = new PGlite();
const host = "c9000000-0000-4000-8000-000000000001";
const player = "c9000000-0000-4000-8000-000000000002";
const second = "c9000000-0000-4000-8000-000000000003";
const waiter = "c9000000-0000-4000-8000-000000000004";
const outsider = "c9000000-0000-4000-8000-000000000005";
const day = 86400000;
const start = new Date(Date.now() + day).toISOString();
const deadline = new Date(Date.parse(start) + 30 * day).toISOString();
const draft = {
  title: "Проверка срока регистрации",
  type: "daily_game",
  sport: "Футбол",
  city: "Астана",
  location_text: "Тестовая площадка",
  date_time: start,
  duration_minutes: 120,
  entry_fee: 0,
  max_participants: 4,
  min_participants: 2,
  participation_mode: "individual",
};

async function root(query, params = []) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claims','{}',false)");
  return db.query(query, params);
}
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
async function publish(extra = {}) {
  const doc = await rpc(host, "document", {
    kind: "draft",
    name: draft.title,
    data: { ...draft, ...extra },
  });
  return rpc(host, "publish", { id: doc.id });
}
async function movePastStart(id, closing = true) {
  await root(
    "UPDATE activities SET date_time=now()-interval '10 minutes',registration_deadline=CASE WHEN $2 THEN now()+interval '6 hours' ELSE NULL END WHERE id=$1",
    [id, closing],
  );
}

try {
  await db.exec(fs.readFileSync("./db/platform.sql", "utf8"));
  for (const file of fs.readdirSync("./supabase/migrations").sort()) {
    if (file.endsWith(".sql"))
      await db.exec(fs.readFileSync());
  }
