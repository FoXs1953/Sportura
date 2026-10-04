import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/deploy-vps.yml", import.meta.url),
  "utf8",
);
const deployStep = workflow.split("- name: Pull image, migrate, restart")[1];
assert.ok(deployStep, "The shared workflow must contain the deployment step");
const heredoc = deployStep.match(
  /^([ \t]*)ssh "\$TARGET" bash -s <<EOF\r?\n([\s\S]*?)^\1EOF$/m,
);
assert.ok(heredoc, "Extract the exact remote Bash deployment script");
const indentation = heredoc[1]!;
const deployment = heredoc[2]!
  .split("\n")
  .map((line) =>
    line.startsWith(indentation) ? line.slice(indentation.length) : line,
  )
  .join("\n");

function runDeployment(script: string) {
  const directory = mkdtempSync(join(tmpdir(), "sportura-deploy workflow-"));
  const bin = join(directory, "bin");
  const stack = join(directory, "application stack");
  const proxy = join(directory, "proxy stack");
  const log = join(directory, "docker.log");
  for (const path of [bin, stack, proxy]) mkdirSync(path);
  // Docker Compose attaches stdin by default for run/exec. Consume it even
  // when the container's command does not: the attaching Docker CLI reads it.
  writeFileSync(
    join(bin, "docker"),
    `#!/bin/sh
printf '%s|%s\\n' "$PWD" "$*" >> "$SPORTURA_DEPLOY_TEST_LOG"
if [ "$1" = compose ] && { [ "$2" = run ] || [ "$2" = exec ]; }; then
  interactive=true
  for argument in "$@"; do
    if [ "$argument" = --interactive=false ]; then interactive=false; fi
  done
  if [ "$interactive" = true ]; then cat > /dev/null; fi
fi
`,
    { mode: 0o755 },
  );
  try {
    const result = spawnSync("bash", ["-s"], {
      input: script,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env["PATH"] ?? "/usr/bin:/bin"}`,
        STACK_DIR: stack,
        PROXY_DIR: proxy,
        SPORTURA_DEPLOY_TEST_LOG: log,
      },
    });
    assert.equal(result.error, undefined, "The deployment script must finish");
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("|");
        return {
          directory: line.slice(0, separator),
          command: line.slice(separator + 1),
        };
      });
    return {
      calls,
      applicationRestarted: calls.some(
        (call) =>
          call.directory === stack &&
          call.command === "compose up -d --remove-orphans",
      ),
      proxyRestarted: calls.some(
        (call) => call.directory === proxy && call.command === "compose up -d",
      ),
      proxyReloaded: calls.some(
        (call) =>
          call.directory === proxy &&
          call.command.startsWith("compose exec ") &&
          call.command.includes(
            "caddy caddy reload --config /etc/caddy/Caddyfile",
          ),
      ),
      loggedOut: calls.some((call) => call.command === "logout ghcr.io"),
      imagesPruned: calls.some((call) => call.command === "image prune -f"),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const removeStdinProtection = (script: string) =>
  script
    .replace(/\s+--interactive=false/g, "")
    .replace(/[ \t]+<[ \t]+\/dev\/null/g, "");

test("the exact remote deployment runs migration, app restart, proxy reload and logout", () => {
  const result = runDeployment(deployment);
  assert.ok(
    result.calls.some((call) => call.command.startsWith("compose run ")),
    "The migration is executed",
  );
  assert.ok(
    result.applicationRestarted,
    "The new app is started after migration",
  );
  assert.ok(result.proxyRestarted, "The proxy is started in its own directory");
  assert.ok(result.proxyReloaded, "Caddy receives the new proxy configuration");
  assert.ok(result.loggedOut, "Temporary registry authentication is removed");
  assert.ok(result.imagesPruned, "The deployment reaches its final command");
});

test("unprotected migration reproduces a successful exit that skips the new app", () => {
  const result = runDeployment(removeStdinProtection(deployment));
  assert.ok(
    result.calls.some((call) => call.command.startsWith("compose run ")),
  );
  assert.equal(result.applicationRestarted, false);
  assert.equal(result.proxyReloaded, false);
  assert.equal(result.loggedOut, false);
  assert.equal(result.imagesPruned, false);
});

test("unprotected Caddy exec consumes the remaining registry cleanup commands", () => {
  const unsafeReload = deployment
    .split("\n")
    .map((line) =>
      line.includes("docker compose exec ")
        ? removeStdinProtection(line)
        : line,
    )
    .join("\n");
  const result = runDeployment(unsafeReload);
  assert.ok(result.applicationRestarted);
  assert.ok(result.proxyReloaded);
  assert.equal(result.loggedOut, false);
  assert.equal(result.imagesPruned, false);
});
