import { test } from "node:test";
import assert from "node:assert/strict";
import { feedSchema } from "../src/lib/discovery-filters.ts";
test("discovery accepts old links and normalizes multiple sports", () => {
  assert.deepEqual(feedSchema.parse({ sport: "Футбол" }).sport, ["Футбол"]);
  assert.deepEqual(feedSchema.parse({ sport: "all" }).sport, []);
  assert.deepEqual(
    feedSchema.parse({ sport: ["Футбол", "Баскетбол", "Футбол"] }).sport,
    ["Футбол", "Баскетбол"],
  );
  assert.deepEqual(feedSchema.parse({ sport: { bad: true } }).sport, []);
});
test("discovery rejects invalid dates and times in shared links", () => {
  assert.equal(feedSchema.parse({ from: "2026-02-30" }).from, "");
  assert.equal(feedSchema.parse({ time_from: "25:00" }).time_from, "");
  assert.equal(
    feedSchema.parse({ from: "2026-10-01", time_from: "18:00" }).from,
    "2026-10-01",
  );
});
