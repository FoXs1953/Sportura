import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultFeedFilters,
  feedSearchSchema,
  filterFeed,
} from "../src/lib/feed-filters.ts";
import type { PublicActivity } from "../src/lib/activities.functions.ts";

function activity(
  id: string,
  values: Partial<PublicActivity> = {},
): PublicActivity {
  return {
    id,
    title: "Игра",
    location_text: "Астана",
    sport: "Футбол",
    host_name: "Данияр",
    type: "daily_game",
    status: "open",
    is_free: false,
    registered_count: 2,
    max_participants: 10,
    date_time: null,
    entry_fee: 2000,
    ...values,
  } as PublicActivity;
}
const ids = (activities: PublicActivity[]) => activities.map((item) => item.id);

test("today uses Kazakhstan midnight, and excludes undated and invalid dates", () => {
  const rows = [
    activity("yesterday", { date_time: "2026-09-24T18:59:59Z" }),
    activity("today", { date_time: "2026-09-24T19:00:00Z" }),
    activity("tomorrow", { date_time: "2026-09-25T19:00:00Z" }),
    activity("undated"),
    activity("invalid", { date_time: "invalid" }),
  ];
  assert.deepEqual(
    ids(
      filterFeed(
        rows,
        { ...defaultFeedFilters, date: "today" },
        new Date("2026-09-24T20:00:00Z"),
      ),
    ),
    ["today"],
  );
});

test("weekend includes only the upcoming weekend, including the current Sunday", () => {
  const rows = [
    activity("saturday", { date_time: "2026-09-26T10:00:00Z" }),
    activity("sunday", { date_time: "2026-09-27T10:00:00Z" }),
    activity("next-week", { date_time: "2026-10-03T10:00:00Z" }),
  ];
  const filters = { ...defaultFeedFilters, date: "weekend" as const };
  assert.deepEqual(
    ids(filterFeed(rows, filters, new Date("2026-09-25T10:00:00Z"))),
    ["saturday", "sunday"],
  );
  assert.deepEqual(
    ids(filterFeed(rows, filters, new Date("2026-09-27T10:00:00Z"))),
    ["sunday"],
  );
});

test("available filter excludes full capacity, cancelled and completed events", () => {
  const rows = [
    activity("open"),
    activity("full-count", { registered_count: 10 }),
    activity("cancelled", { status: "cancelled" }),
    activity("completed", { status: "completed" }),
    activity("nearly", { status: "nearly_full", registered_count: 9 }),
  ];
  assert.deepEqual(
    ids(filterFeed(rows, { ...defaultFeedFilters, open: true })),
    ["open", "nearly"],
  );
});

test("sport, format, free and case-insensitive organizer search combine", () => {
  const rows = [
    activity("match", { is_free: true, type: "tournament" }),
    activity("paid", { type: "tournament" }),
    activity("other-format", { is_free: true }),
  ];
  assert.deepEqual(
    ids(
      filterFeed(rows, {
        ...defaultFeedFilters,
        sport: "Футбол",
        type: "tournament",
        free: true,
        q: "  ДАНИЯР  ",
      }),
    ),
    ["match"],
  );
});

test("sorts free first and unknown prices last without mutating input", () => {
  const rows = [
    activity("unknown", { entry_fee: null }),
    activity("paid"),
    activity("free", { is_free: true, entry_fee: null }),
  ];
  assert.deepEqual(
    ids(filterFeed(rows, { ...defaultFeedFilters, sort: "price" })),
    ["free", "paid", "unknown"],
  );
  assert.deepEqual(ids(rows), ["unknown", "paid", "free"]);
});

test("malformed URL filters fall back to valid defaults", () => {
  assert.deepEqual(
    feedSearchSchema.parse({
      type: "invalid",
      date: "invalid",
      sort: "invalid",
      free: "false",
      open: "yes",
    }),
    defaultFeedFilters,
  );
});
