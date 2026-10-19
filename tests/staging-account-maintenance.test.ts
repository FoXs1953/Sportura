import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const scriptPath = "scripts/staging-account-maintenance.sh";
const script = readFileSync(scriptPath, "utf8");
const changeSql = script
  .split("<<'SQL_MAINTENANCE'\n")[1]!
  .split("\nSQL_MAINTENANCE")[0]!;
const inspectSql = script
  .split("<<'SQL_INSPECT'\n")[1]!
  .split("\nSQL_INSPECT")[0]!;
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";

// psql :'variable' expands to a SQL literal. Execute the actual embedded SQL,
// preserving apostrophes, rather than recreating its guards in a test helper.
function bind(sql: string, input: Record<string, string>) {
  return sql.replace(/:'([a-z_]+)'/g, (_, name: string) => {
    assert.ok(Object.hasOwn(input, name));
    return `'${input[name]!.replaceAll("'", "''")}'`;
  });
}
async function database() {
  const db = new PGlite();
  await db.exec(readFileSync("db/platform.sql", "utf8"));
  await db.exec(
    readFileSync(
      "supabase/migrations/20260922102529_654496b2-a206-48fb-9475-96d69d229b34.sql",
      "utf8",
    ),
  );
  await db.query(
    "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,'owner@example.test',now()),($2,'other@example.test',NULL)",
    [owner, other],
  );
  return db;
}
async function change(
  db: PGlite,
  operation: string,
  email: string,
  id: string,
  apply = true,
) {
  try {
    return await db.exec(
      bind(changeSql, {
        operation,
        account_email: email,
        expected_user_id: id,
        apply_change: String(apply),
      }),
    );
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

test("reset requires exact single email/UUID, preserves the last admin and supports preflight", async () => {
  const db = await database();
  try {
    await db.query(
      "INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",
      [owner],
    );
    await assert.rejects(
      change(db, "reset", "owner@example.test", other),
      /UUID changed/,
    );
    await assert.rejects(
      change(db, "reset", "missing@example.test", owner),
      /exactly one/,
    );
    await assert.rejects(
      change(db, "reset", "owner@example.test", owner),
      /last administrator/,
    );
    await db.query(
      "INSERT INTO auth.users(email) VALUES('OWNER@example.test')",
    );
    await assert.rejects(
      change(db, "reset", "owner@example.test", owner),
      /exactly one/,
    );
    await db.query("DELETE FROM auth.users WHERE email='OWNER@example.test'");
    await change(db, "reset", "other@example.test", other, false);
    assert.equal(
      (
        await db.query("SELECT count(*)::int n FROM auth.users WHERE id=$1", [
          other,
        ])
      ).rows[0]!.n,
      1,
    );
    await db.query(
      "INSERT INTO auth.sessions(user_id,token_hash) VALUES($1,'private-test-hash')",
      [other],
    );
    await change(db, "reset", "OTHER@example.test", other);
    assert.equal(
      (
        await db.query("SELECT count(*)::int n FROM auth.users WHERE id=$1", [
          other,
        ])
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM auth.sessions")).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM public.profiles WHERE id=$1",
          [other],
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM public.user_roles WHERE user_id=$1",
          [owner],
        )
      ).rows[0]!.n,
      2,
    );
  } finally {
    await db.close();
  }
});

test("grant-admin requires confirmed email, is idempotent, and cannot bypass identity checks", async () => {
  const db = await database();
  try {
    await assert.rejects(
      change(db, "grant-admin", "other@example.test", other),
      /Confirm the email/,
    );
    await assert.rejects(
      change(db, "grant-admin", "owner@example.test", other),
      /UUID changed/,
    );
    await assert.rejects(
      change(db, "unexpected", "owner@example.test", owner),
      /Unsupported/,
    );
    await change(db, "grant-admin", "owner@example.test", owner);
    await change(db, "grant-admin", "owner@example.test", owner);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM public.user_roles WHERE user_id=$1 AND role='admin'",
          [owner],
        )
      ).rows[0]!.n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT email_confirmed_at FROM auth.users WHERE id=$1",
          [other],
        )
      ).rows[0]!.email_confirmed_at,
      null,
    );
    await assert.rejects(
      change(db, "reset", "' OR true; --@example.test", owner),
      /exactly one/,
    );
    await db.query("UPDATE auth.users SET email=$1 WHERE id=$2", [
      "o'neil@example.test",
      owner,
    ]);
    await change(db, "grant-admin", "o'neil@example.test", owner);
    const report = await db.exec(
      bind(inspectSql, { account_email: "o'neil@example.test" }),
    );
    assert.match(JSON.stringify(report), /email_confirmed/);
    assert.doesNotMatch(
      JSON.stringify(report),
      /password_hash|token_hash|o'neil/,
    );
  } finally {
    await db.close();
  }
});

test("shell rejects malformed or dangerous action inputs before touching a VPS stack", () => {
  for (const args of [
    [],
    ["unknown"],
    ["reset", "owner@example.test"],
    ["grant-admin", "owner@example.test", "bad-uuid"],
    ["inspect", "owner@example.test\nother@example.test"],
    ["inspect", "bad\u001b@example.test"],
    ["diagnostics", "owner@example.test"],
  ]) {
    const result = spawnSync("bash", [scriptPath, ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^Maintenance refused:/);
    assert.doesNotMatch(result.stderr, /docker|\/opt\/sportura/);
  }
  assert.equal(spawnSync("bash", ["-n", scriptPath]).status, 0);
});

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "sportura-maintenance-"));
  const stack = path.join(directory, "stack");
  const bin = path.join(directory, "bin");
  mkdirSync(stack);
  mkdirSync(bin);
  writeFileSync(
    path.join(stack, ".env"),
    "DEPLOY_ENV=staging\nSITE_DOMAIN=staging.sportura.kz\n",
  );
  const docker = path.join(bin, "docker");
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FIXTURE_LOG"
case "$*" in
  *pg_dump*) [[ "$FIXTURE_DUMP" != fail ]] || exit 1; printf 'PGDMP-private-fixture' ;;
  *psql*) cat > /dev/null ;;
  *'compose run'*) printf '[mail] deployment preflight {"configured":false}\\n' ;;
  *'compose logs'*)
    printf "%s\\n" "[mail] delivery failed { code: 'EAUTH', responseCode: 535 }"
    printf '%s\\n' '[mail] unsafe token=must-not-print' 'confirmation token=must-not-print'
    ;;
esac
`,
  );
  chmodSync(docker, 0o700);
  return {
    directory,
    stack,
    run(operation: string, dump = "ok") {
      // The shell receives the same streamed-script stdin shape as SSH.
      return spawnSync("bash", ["-s"], {
        input: `operation=${operation}\naccount_email=${operation === "diagnostics" ? "" : "owner@example.test"}\nexpected_user_id=${operation === "diagnostics" ? "" : owner}\n${script.replaceAll("/opt/sportura", stack)}\nprintf 'STREAM_FINISHED\\n'\n`,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          FIXTURE_LOG: path.join(directory, "docker.log"),
          FIXTURE_DUMP: dump,
        },
      });
    },
    log() {
      return readFileSync(path.join(directory, "docker.log"), "utf8");
    },
    close() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("streamed reset backs up privately before mutation and aborts when backup fails", () => {
  for (const fail of [true, false]) {
    const f = fixture();
    try {
      const result = f.run("reset", fail ? "fail" : "ok");
      const log = f.log();
      assert.ok(
        log.indexOf("--set=apply_change=false") < log.indexOf("pg_dump"),
      );
      const backupDirectory = path.join(f.stack, "backups/account-maintenance");
      if (fail) {
        assert.equal(result.status, 1);
        assert.match(result.stderr, /backup failed/);
        assert.doesNotMatch(log, /--set=apply_change=true/);
        assert.deepEqual(readdirSync(backupDirectory), []);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /STREAM_FINISHED/);
        assert.ok(
          log.indexOf("pg_dump") < log.indexOf("--set=apply_change=true"),
        );
        const backup = path.join(
          backupDirectory,
          readdirSync(backupDirectory)[0]!,
        );
        assert.equal(readFileSync(backup, "utf8"), "PGDMP-private-fixture");
        assert.equal(statSync(backup).mode & 0o777, 0o600);
        assert.equal(statSync(backupDirectory).mode & 0o777, 0o700);
      }
    } finally {
      f.close();
    }
  }
});

test("bootstrap diagnostics perform no account query, migration or email send and filter logs", () => {
  const f = fixture();
  try {
    const result = f.run("diagnostics");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /configured/);
    assert.match(result.stdout, /EAUTH/);
    assert.match(result.stdout, /STREAM_FINISHED/);
    assert.doesNotMatch(result.stdout, /token|must-not-print/);
    assert.match(f.log(), /migrate node scripts\/check-mail\.mjs/);
    assert.doesNotMatch(f.log(), /psql|pg_dump|db-migrate/);
  } finally {
    f.close();
  }
});
