import assert from "node:assert/strict";
import { test } from "node:test";
import { healthResponse } from "../src/lib/health-check.ts";

test("readiness succeeds after the database responds", async () => {
  const response = await healthResponse(async () => []);
  const report = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(report.status, "ok");
  assert.equal(report.database, "ok");
  assert.ok(Number.isFinite(Date.parse(report.time)));
});

test("readiness fails when the database is unavailable without exposing credentials", async () => {
  const response = await healthResponse(async () => {
    throw new Error("connection refused: postgres://owner:secret@localhost/app");
  });
  assert.equal(response.status, 503);
  assert.deepEqual(Object.keys(await response.clone().json()).sort(), [
    "database",
    "status",
    "time",
  ]);
  const report = await response.json();
  assert.equal(report.status, "degraded");
  assert.equal(report.database, "unreachable");
});

test("readiness fails when no database is configured", async () => {
  const response = await healthResponse();
  const report = await response.json();
  assert.equal(response.status, 503);
  assert.equal(report.status, "degraded");
  assert.equal(report.database, "not_configured");
});
