import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedPath,
  pathsFromNameStatus,
} from "../scripts/check-task-scope.mjs";

test("owners can change their assigned routes and tests, never each other's", () => {
  assert.equal(
    isAllowedPath("nadir", "src/routes/_authenticated/host.tsx"),
    true,
  );
  assert.equal(
    isAllowedPath("nadir", "src/components/events/host/wizard.tsx"),
    true,
  );
  assert.equal(isAllowedPath("iskander", "src/routes/index.tsx"), true);
  assert.equal(isAllowedPath("iskander", "src/styles/feed.css"), true);
  assert.equal(isAllowedPath("nadir", "tests/nadir-readiness.test.ts"), true);
  assert.equal(isAllowedPath("iskander", "tests/iskander-feed.mjs"), true);
  assert.equal(isAllowedPath("nadir", "src/routes/index.tsx"), false);
  assert.equal(
    isAllowedPath("iskander", "src/components/events/host/wizard.tsx"),
    false,
  );
  assert.equal(
    isAllowedPath("iskander", "tests/nadir-readiness.test.ts"),
    false,
  );
});

test("Nadir owns the auth and account-maintenance paths only", () => {
  for (const path of [
    "src/lib/auth.server.ts",
    "src/lib/auth.functions.ts",
    "src/lib/auth-redirect.ts",
    "src/lib/mail.server.ts",
    "src/routes/auth.tsx",
    "src/routes/forgot-password.tsx",
    "src/routes/reset-password.tsx",
    "src/routes/api/auth/confirm.ts",
    "src/routes/api/auth/google.callback.ts",
    "src/routes/api/auth/nested/callback.ts",
    "scripts/check-mail.mjs",
    "scripts/staging-account-maintenance.sh",
    "tests/staging-account-maintenance.test.ts",
    ".github/workflows/staging-account-maintenance.yml",
    "docs/account-maintenance.md",
  ]) {
    assert.equal(isAllowedPath("nadir", path), true, path);
    assert.equal(isAllowedPath("iskander", path), false, path);
    assert.equal(isAllowedPath("iskander-coordinator", path), false, path);
  }
  for (const path of [
    "src/lib/oauth.server.ts",
    "src/lib/auth/server.ts",
    "src/lib/mail.server.ts.bak",
    "src/routes/auth.tsx.bak",
    "src/routes/authentication.tsx",
    "src/routes/api/authentication/confirm.ts",
    "src/routes/api/auth.ts",
    "scripts/check-mail.mjs.bak",
    "scripts/staging-account-maintenance.sh.bak",
    "tests/staging-account-maintenance.test.ts.bak",
    ".github/workflows/staging-account-maintenance.yml.bak",
    "docs/account-maintenance.md.bak",
  ])
    assert.equal(isAllowedPath("nadir", path), false, path);
});

test("Iskander coordination adds explicit shared paths to the feed scope", () => {
  for (const path of [
    "docs/team-ownership.md",
    "docs/deploy.md",
    "docs/event-workspaces.md",
    "docs/iskander-release-qa-2026-10-19.md",
    "scripts/check-task-scope.mjs",
    "tests/task-scope.test.ts",
    "tests/deploy-workflow.test.ts",
    ".github/workflows/deploy-production.yml",
    ".github/workflows/deploy-staging.yml",
    ".github/workflows/deploy-vps.yml",
    "eslint.config.js",
    "vite.config.ts",
    "tsconfig.json",
  ]) {
    assert.equal(isAllowedPath("iskander-coordinator", path), true, path);
    assert.equal(isAllowedPath("iskander", path), false, path);
    assert.equal(isAllowedPath("nadir", path), false, path);
    assert.equal(isAllowedPath("iskander-coordinator", `${path}.bak`), false);
  }
  for (const path of [
    "src/routes/index.tsx",
    "src/styles/feed.css",
    "tests/iskander-feed.test.ts",
    "docs/iskander-design-qa-2026-10-19.md",
  ])
    assert.equal(isAllowedPath("iskander-coordinator", path), true, path);
  for (const path of [
    "src/routes/_authenticated/host.tsx",
    "src/components/events/host/wizard.tsx",
    "src/lib/event.functions.ts",
    "tests/nadir-readiness.test.ts",
    "docs/nadir-readiness-2026-10-19.md",
    "docs/customer-review-2026-10-05.md",
    ".github/workflows/new-workflow.yml",
    "scripts/other-check.mjs",
    "tests/task-scope.test.ts/child",
  ])
    assert.equal(isAllowedPath("iskander-coordinator", path), false, path);
});

test("package, shared components and unassigned infrastructure stay frozen", () => {
  for (const owner of ["nadir", "iskander", "iskander-coordinator"]) {
    for (const path of [
      "package.json",
      "bun.lock",
      "src/routeTree.gen.ts",
      "src/lib/event-model.ts",
      "package-lock.json",
      "src/lib/database.types.ts",
      "src/lib/db.server.ts",
      "src/lib/sportura.ts",
      "src/components/ui/button.tsx",
      "src/components/events/shared.tsx",
      "src/styles/events.css",
      "deploy/docker-compose.yml",
      "scripts/db-migrate.mjs",
    ])
      assert.equal(isAllowedPath(owner, path), false, `${owner}: ${path}`);
  }
  assert.equal(isAllowedPath("admin", "src/routes/index.tsx"), false);
  assert.equal(isAllowedPath("coordinator", "src/routes/index.tsx"), false);
  assert.equal(isAllowedPath("__proto__", "src/routes/index.tsx"), false);
});

test("Nadir migration allocation is one reserved hour, filename and owner", () => {
  for (const path of [
    "supabase/migrations/20261019110000_nadir_start.sql",
    "supabase/migrations/20261019113000_nadir_event_readiness.sql",
    "supabase/migrations/20261019115959_nadir_end.sql",
  ])
    assert.equal(isAllowedPath("nadir", path), true, path);
  for (const path of [
    "supabase/migrations/20261019113000_other_event_readiness.sql",
    "supabase/migrations/20261019113000_nadir_.sql",
    "supabase/migrations/20261019116000_nadir_event.sql",
    "supabase/migrations/20261019110060_nadir_event.sql",
    "supabase/migrations/20261019120000_nadir_event.sql",
    "supabase/migrations/20261019113000_nadir_Event.sql",
    "supabase/migrations/20261019113000_nadir_event.sql.bak",
    "supabase/migrations/20261019113000_nadir_event.sql/child",
    "supabase/migrations/20261002091000_event_rejoin_checkin.sql",
  ])
    assert.equal(isAllowedPath("nadir", path), false, path);
  for (const owner of ["iskander", "iskander-coordinator"])
    assert.equal(
      isAllowedPath(
        owner,
        "supabase/migrations/20261019113000_nadir_event.sql",
      ),
      false,
    );
});

test("renames and copies check both paths, including deleted frozen sources", () => {
  const paths = pathsFromNameStatus(
    "R100\0src/lib/auth.server.ts\0tests/nadir-auth.mjs\0C095\0src/styles/events.css\0src/styles/feed.css\0D\0package.json\0M\0src/routes/index.tsx\0",
  );
  assert.deepEqual(paths, [
    "src/lib/auth.server.ts",
    "tests/nadir-auth.mjs",
    "src/styles/events.css",
    "src/styles/feed.css",
    "package.json",
    "src/routes/index.tsx",
  ]);
  assert.deepEqual(
    paths.filter((path) => !isAllowedPath("iskander", path)),
    [
      "src/lib/auth.server.ts",
      "tests/nadir-auth.mjs",
      "src/styles/events.css",
      "package.json",
    ],
  );
  assert.deepEqual(pathsFromNameStatus(""), []);
  assert.throws(() => pathsFromNameStatus("R100\0src/styles/feed.css\0"));
});

test("path tricks cannot escape the assigned directories", () => {
  for (const owner of ["nadir", "iskander", "iskander-coordinator"]) {
    for (const path of [
      "",
      "/src/routes/index.tsx",
      "src/components/events/host/../shared.tsx",
      "src/components/events/host//wizard.tsx",
      "src/components/events/host/./wizard.tsx",
      "src/lib/auth../db.server.ts",
      "src/routes/api/auth/../public/cron/maintenance.ts",
      "src/routes/api/auth//confirm.ts",
      "src/routes/api/auth/./confirm.ts",
      "docs/../package.json",
      "docs//team-ownership.md",
      "./docs/team-ownership.md",
      "tests/nadir-../auth.ts",
      "tests/nadir-backslash\\file.ts",
      "tests/iskander-null\0file.ts",
      "src/lib/auth\\db.server.ts",
    ])
      assert.equal(isAllowedPath(owner, path), false, `${owner}: ${path}`);
    assert.equal(isAllowedPath(owner, null), false);
    assert.equal(isAllowedPath(owner, undefined), false);
  }
});
