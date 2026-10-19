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

test("shared files, auth, infrastructure and unknown owners stay frozen", () => {
  for (const owner of ["nadir", "iskander"]) {
    for (const path of [
      "package.json",
      "bun.lock",
      "src/routeTree.gen.ts",
      "src/lib/event-model.ts",
      "src/lib/auth.server.ts",
      "src/lib/mail.server.ts",
      "src/components/ui/button.tsx",
      "src/styles/events.css",
      ".github/workflows/deploy-staging.yml",
      "scripts/check-task-scope.mjs",
      "docs/team-ownership.md",
    ])
      assert.equal(isAllowedPath(owner, path), false, `${owner}: ${path}`);
  }
  assert.equal(isAllowedPath("admin", "src/routes/index.tsx"), false);
  assert.equal(isAllowedPath("__proto__", "src/routes/index.tsx"), false);
});

test("Nadir migration allocation is one reserved hour, filename and owner", () => {
  assert.equal(
    isAllowedPath(
      "nadir",
      "supabase/migrations/20261019113000_nadir_event_readiness.sql",
    ),
    true,
  );
  for (const path of [
    "supabase/migrations/20261019113000_other_event_readiness.sql",
    "supabase/migrations/20261019113000_nadir_.sql",
    "supabase/migrations/20261019116000_nadir_event.sql",
    "supabase/migrations/20261019120000_nadir_event.sql",
    "supabase/migrations/20261002091000_event_rejoin_checkin.sql",
  ])
    assert.equal(isAllowedPath("nadir", path), false, path);
  assert.equal(
    isAllowedPath(
      "iskander",
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
  for (const path of [
    "/src/routes/index.tsx",
    "src/components/events/host/../shared.tsx",
    "src/components/events/host//wizard.tsx",
    "src/components/events/host/./wizard.tsx",
    "tests/nadir-../auth.ts",
    "tests/nadir-backslash\\file.ts",
    "tests/nadir-null\0file.ts",
  ])
    assert.equal(isAllowedPath("nadir", path), false, path);
});
