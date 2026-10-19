import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const owners = {
  nadir: new Set([
    "src/routes/_authenticated/host.tsx",
    "src/lib/event.functions.ts",
    "src/lib/registration-window.ts",
    "src/lib/i18n/kk-events.ts",
    "src/styles/host-start.css",
    "src/lib/mail.server.ts",
    "src/routes/auth.tsx",
    "src/routes/forgot-password.tsx",
    "src/routes/reset-password.tsx",
    "scripts/check-mail.mjs",
    "scripts/staging-account-maintenance.sh",
    "tests/staging-account-maintenance.test.ts",
    ".github/workflows/staging-account-maintenance.yml",
    "docs/account-maintenance.md",
    "docs/nadir-readiness-2026-10-19.md",
  ]),
  iskander: new Set([
    "src/routes/index.tsx",
    "src/components/sportura/activity-card.tsx",
    "src/components/sportura/feed-shell.tsx",
    "src/components/sportura/city-select.tsx",
    "src/components/sportura/guest-info.tsx",
    "src/styles/feed.css",
    "src/styles/city-select.css",
    "src/styles/guest-info.css",
    "src/lib/i18n/kk-client-audit.ts",
    "docs/iskander-design-qa-2026-10-19.md",
  ]),
  "iskander-coordinator": new Set([
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
  ]),
};

export function isAllowedPath(owner, path) {
  if (!Object.hasOwn(owners, owner) || typeof path !== "string") return false;
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    return false;
  if (owners[owner].has(path)) return true;
  // Coordination adds only the explicit shared paths above to the feed scope.
  if (owner === "iskander-coordinator") return isAllowedPath("iskander", path);
  if (new RegExp(`^tests/${owner}-[^/]+$`).test(path)) return true;
  return (
    owner === "nadir" &&
    (path.startsWith("src/components/events/host/") ||
      /^src\/lib\/auth[^/]*$/.test(path) ||
      path.startsWith("src/routes/api/auth/") ||
      /^supabase\/migrations\/2026101911[0-5][0-9][0-5][0-9]_nadir_[a-z0-9_]+\.sql$/.test(
        path,
      ))
  );
}

// git diff --name-status -z: status, path; renames/copies contain two paths.
export function pathsFromNameStatus(output) {
  const tokens = output.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  const paths = [];
  for (let i = 0; i < tokens.length;) {
    const status = tokens[i++];
    if (!/^[ACDMRTUXB](?:\d+)?$/.test(status))
      throw new Error("Unexpected Git change status.");
    const count = /^[RC]/.test(status) ? 2 : 1;
    for (let j = 0; j < count; j++) {
      const path = tokens[i++];
      if (!path) throw new Error("Incomplete Git change record.");
      paths.push(path);
    }
  }
  return paths;
}

function main(args) {
  const [owner, base = "origin/dev"] = args;
  if (args.length > 2 || !Object.hasOwn(owners, owner ?? ""))
    throw new Error(
      "Usage: node scripts/check-task-scope.mjs <nadir|iskander|iskander-coordinator> [git-base]; default: origin/dev",
    );
  if (!base || base.startsWith("-") || /[\s\0]/.test(base))
    throw new Error("Invalid Git base reference.");
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const git = (...argv) =>
    execFileSync("git", argv, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
  let commit;
  try {
    commit = git(
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${base}^{commit}`,
    ).trim();
  } catch {
    throw new Error("Git base must resolve to an existing commit.");
  }
  const diffArgs = [
    "diff",
    "--no-ext-diff",
    "--name-status",
    "--find-renames",
    "-z",
  ];
  const paths = new Set([
    ...pathsFromNameStatus(git(...diffArgs, `${commit}...HEAD`, "--")),
    ...pathsFromNameStatus(git(...diffArgs, "--cached", "--")),
    ...pathsFromNameStatus(git(...diffArgs, "--")),
    ...git("ls-files", "--others", "--exclude-standard", "-z")
      .split("\0")
      .filter(Boolean),
  ]);
  const forbidden = [...paths]
    .filter((path) => !isAllowedPath(owner, path))
    .sort();
  if (forbidden.length) {
    process.stderr.write(
      `Scope check failed for ${owner}; outside the assigned paths:\n${forbidden.map((path) => `  ${JSON.stringify(path)}`).join("\n")}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Scope check passed for ${owner}: ${paths.size} changed path(s).\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Scope check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
