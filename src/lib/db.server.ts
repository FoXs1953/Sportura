// PostgreSQL access for server code. Every query runs inside a transaction that
// first switches to a request role, so the row-level security policies in
// supabase/migrations decide what each caller may read and write:
//   asUser(id)  -> role authenticated, auth.uid() = id
//   asAnon()    -> role anon (signed-out visitors)
//   asService() -> role service_role (bypasses RLS; trusted server code only)
// See db/README.md for the role setup.
import postgres from "postgres";

export type Tx = postgres.TransactionSql;
export type { Json } from "./database.types";

let pool: postgres.Sql | undefined;

function db(): postgres.Sql {
  if (pool) return pool;
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured");
  pool = postgres(url, {
    max: 10,
    idle_timeout: 30,
    onnotice: () => {},
    // Match the JSON shapes the app used with PostgREST: numbers and ISO strings.
    types: {
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (value: unknown) => String(value),
        parse: (value: string) => Number(value),
      },
      timestamptz: {
        to: 1184,
        from: [1184],
        serialize: (value: unknown) =>
          value instanceof Date ? value.toISOString() : String(value),
        parse: (value: string) => new Date(value).toISOString(),
      },
    },
  });
  return pool;
}

type Role = "anon" | "authenticated" | "service_role";

function run<T>(
  role: Role,
  claims: Record<string, string>,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db().begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ ...claims, role })}, true),
                    set_config('role', ${role}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export type Caller = { userId: string; sessionId: string };

export function asUser<T>(caller: Caller, fn: (tx: Tx) => Promise<T>) {
  return run(
    "authenticated",
    { sub: caller.userId, session_id: caller.sessionId },
    fn,
  );
}

export function asAnon<T>(fn: (tx: Tx) => Promise<T>) {
  return run("anon", {}, fn);
}

/** Signed-in visitors act as themselves, everyone else as anon. */
export function asVisitor<T>(caller: Caller | null, fn: (tx: Tx) => Promise<T>) {
  return caller ? asUser(caller, fn) : asAnon(fn);
}

export function asService<T>(fn: (tx: Tx) => Promise<T>) {
  return run("service_role", {}, fn);
}

/** Postgres unique_violation, e.g. a duplicate email or role. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof postgres.PostgresError && error.code === "23505"
  );
}
