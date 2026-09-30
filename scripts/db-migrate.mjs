// Applies db/platform.sql and then every file in supabase/migrations that has
// not been applied yet, each in its own transaction.
// Usage: DATABASE_URL=postgres://owner:pass@host:5432/sportura node scripts/db-migrate.mjs
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const root = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql.unsafe(fs.readFileSync(path.join(root, "db", "platform.sql"), "utf8"));
  await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const applied = new Set(
    (await sql`SELECT version FROM public.schema_migrations`).map((r) => r.version),
  );
  const pending = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && !applied.has(f))
    .sort();

  for (const file of pending) {
    const body = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      if (body.trim()) await tx.unsafe(body);
      await tx`INSERT INTO public.schema_migrations(version) VALUES (${file})`;
    });
    console.log("applied", file);
  }
  console.log(pending.length ? `done, ${pending.length} applied` : "up to date");

  // Optional: ensure the application's login role (see db/README.md).
  const appUser = process.env.APP_DB_USER;
  const appPassword = process.env.APP_DB_PASSWORD;
  if (appUser && appPassword) {
    if (!/^[a-z_][a-z0-9_]*$/.test(appUser)) throw new Error("invalid APP_DB_USER");
    const literal = `'${appPassword.replaceAll("'", "''")}'`;
    const [{ exists }] = await sql`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${appUser}) AS exists`;
    await sql.unsafe(
      exists
        ? `ALTER ROLE ${appUser} LOGIN NOINHERIT PASSWORD ${literal}`
        : `CREATE ROLE ${appUser} LOGIN NOINHERIT PASSWORD ${literal}`,
    );
    const [{ db }] = await sql`SELECT current_database() AS db`;
    await sql.unsafe(`GRANT anon, authenticated, service_role TO ${appUser}`);
    await sql.unsafe(`GRANT CONNECT ON DATABASE "${db.replaceAll('"', '""')}" TO ${appUser}`);
    console.log(`app role ${appUser} ready`);
  }
} catch (e) {
  console.error("migration failed:", e.message);
  if (e.position) console.error("at position", e.position);
  process.exitCode = 1;
} finally {
  await sql.end();
}
