process.on("uncaughtException", (e) => {
  console.error(e.message, e.where ?? "");
  process.exit(1);
});
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,phone text,raw_user_meta_data jsonb DEFAULT '{}',email_confirmed_at timestamptz,phone_confirmed_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),user_agent text,created_at timestamptz DEFAULT now(),updated_at timestamptz,refreshed_at timestamptz,not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name,'/') $$;
GRANT USAGE ON SCHEMA auth,public,storage TO anon,authenticated,service_role;
GRANT SELECT ON storage.objects TO authenticated;`);
for (const file of fs.readdirSync("./supabase/migrations").sort()) {
  try {
    await db.exec(fs.readFileSync("./supabase/migrations/" + file, "utf8"));
    console.log("PASS migration", file);
  } catch (e) {
    console.error(
      "FAIL",
      file,
      e.message,
      e.position,
      fs
        .readFileSync("./supabase/migrations/" + file, "utf8")
        .slice(Number(e.position) - 180, Number(e.position) + 80),
    );
    process.exit(1);
  }
}
const u = "11111111-1111-4111-8111-111111111111",
  v = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333";
await db.exec(
  `INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('${u}','a@example.test',now()),('${v}','b@example.test',now()),('${admin}','admin@example.test',now()); INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin') ON CONFLICT DO NOTHING;`,
);
async function as(user, query, params = []) {
  await db.exec(
    `RESET ROLE;SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`,
  );
  return db.query(query, params);
}
async function rpc(user, action, payload = {}) {
  return (
    await as(user, "SELECT profile_workspace($1,$2) data", [
      action,
      JSON.stringify(payload),
    ])
  ).rows[0].data;
}
function assert(v, msg) {
  if (!v) throw Error(msg);
  console.log("PASS", msg);
}
let data = await rpc(u, "get");
assert(
  data.email_confirmed && data.tickets.length === 0,
  "initial profile and truthful verification",
);
await rpc(u, "basic", {
  name: "Test User",
  city: "Астана",
  bio: "Test bio",
  district: "Test district",
});
await rpc(u, "privacy", { bio: false, sports: false, stats: false });
let p = (await db.query("SELECT public_player_profile($1) data", [u])).rows[0]
  .data;
assert(
  p.bio === "" && p.rating === null && !("email" in p),
  "public profile obeys privacy and excludes contact data",
);
let ticket = await rpc(u, "ticket", {
  topic: "general",
  subject: "Test request",
  body: "Detailed support request",
});
try {
  await rpc(v, "reply", { id: ticket.id, body: "Unauthorized" });
  throw Error("cross-user write allowed");
} catch (e) {
  assert(e.message.includes("недоступно"), "cross-user ticket reply blocked");
}
assert(
  (await rpc(v, "get")).tickets.length === 0,
  "cross-user ticket data not returned",
);
try {
  await rpc(u, "moderate", {
    id: ticket.id,
    body: "Unauthorized",
    status: "resolved",
  });
  throw Error("moderation allowed");
} catch (e) {
  assert(e.message.includes("администратора"), "nonadmin moderation blocked");
}
await rpc(admin, "moderate", {
  id: ticket.id,
  body: "Support answer",
  status: "needs_user",
  resolution: "reply",
});
data = await rpc(u, "get");
assert(
  data.tickets[0].status === "needs_user" &&
    data.tickets[0].messages.length === 2,
  "support conversation and status persisted",
);
assert(
  data.notifications.some((n) => n.category === "support"),
  "support reply notification created",
);
await rpc(u, "read", {});
assert(
  (await rpc(u, "get")).notifications.every((n) => n.read_at),
  "read all persisted",
);
let exported = await rpc(u, "export");
assert(
  exported.profile.name === "Test User" && !("admin_notes" in exported.profile),
  "data export excludes internal notes",
);
try {
  await rpc(u, "ticket", {
    topic: "general",
    subject: "Test invalid attachment",
    body: "Detailed request",
    attachments: [v + "/file.pdf"],
  });
  throw Error("foreign attachment allowed");
} catch (e) {
  assert(e.message.includes("вложение"), "foreign attachment blocked");
}

await rpc(u, "sports", {
  skills: [{ sport: "Футбол", level: "amateur", position: "Вратарь" }],
  days: [1, 5],
  time_from: "18:00",
  time_to: "22:00",
  event_types: ["daily_game"],
});
assert(
  (await rpc(u, "get")).preferences.skills[0].sport === "Футбол",
  "sport preferences saved",
);
try {
  await rpc(u, "sports", {
    skills: [],
    days: [8],
    time_from: "18:00",
    time_to: "22:00",
    event_types: [],
  });
  throw Error("bad day allowed");
} catch (e) {
  assert(e.message.includes("дни"), "invalid schedule rejected");
}
await db.exec(
  `RESET ROLE; INSERT INTO public.activities(id,title,type,sport,location_text,max_participants,host_name,date_time,is_free,manager_id) VALUES('44444444-4444-4444-8444-444444444444','Test game','daily_game','Футбол','Test venue',10,'Test host',now()+interval '30 minutes',true,'${admin}');`,
);
const reg = (
  await as(
    u,
    `INSERT INTO public.registrations(activity_id,user_id,payment_status) VALUES('44444444-4444-4444-8444-444444444444','${u}','paid') RETURNING id`,
  )
).rows[0].id;
assert(
  (await rpc(u, "get")).notifications.some((n) => n.title === "Скоро игра"),
  "game reminder generated",
);
const count = (await rpc(u, "get")).notifications.length;
assert(
  (await rpc(u, "get")).notifications.length === count,
  "reminder is deduplicated",
);
try {
  await as(u, "UPDATE public.registrations SET status='attended' WHERE id=$1", [
    reg,
  ]);
  throw Error("self attendance forged");
} catch (e) {
  assert(e.message.includes("организатор"), "self attendance forgery blocked");
}
try {
  await as(u, "UPDATE public.profiles SET rating=5 WHERE id=$1", [u]);
  throw Error("rating forged");
} catch (e) {
  assert(e.message.includes("Показатели"), "rating forgery blocked");
}
await as(u, `UPDATE public.registrations SET status='cancelled' WHERE id=$1`, [
  reg,
]);
assert(
  (await rpc(u, "get")).registrations[0].cancelled_at !== null,
  "cancellation timestamp persisted",
);
const dispute = await rpc(u, "ticket", {
  topic: "attendance",
  registration_id: reg,
  subject: "Attendance mistake",
  body: "I attended this game",
});
await rpc(admin, "moderate", {
  id: dispute.id,
  body: "Verified the attendance",
  status: "resolved",
  resolution: "correct_attendance",
});
assert(
  (await rpc(u, "get")).registrations[0].status === "attended",
  "admin attendance correction persists",
);
const blockers = (await as(u, "SELECT profile_deletion_check() data")).rows[0]
  .data;
assert(!blockers.allowed, "deletion blocked by open support ticket");
const sessions = (await as(u, "SELECT profile_sessions('list') data")).rows[0]
  .data;
assert(Array.isArray(sessions), "session list query valid");
await db.exec("RESET ROLE;SET ROLE anon;");
try {
  await db.query("SELECT profile_workspace('get')");
  throw Error("anonymous profile access");
} catch (e) {
  assert(
    e.message.includes("permission denied"),
    "anonymous workspace access blocked",
  );
}
console.log("DATABASE CHECKS PASSED");
await db.close();
