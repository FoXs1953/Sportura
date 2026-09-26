import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancellationLabel,
  safeInternalHref,
  reviewAverage,
  type ProfileRegistration,
  type ProfileReview,
} from "../src/lib/profile-model.ts";
import { rankForPlayer } from "../src/lib/profile-recommendations.ts";
import type { PublicActivity } from "../src/lib/activities.functions.ts";
test("cancellation threshold includes exactly three hours and preserves unknown history", () => {
  const r = {
    status: "cancelled",
    cancelled_at: "2026-09-26T12:00:00Z",
    activity: { date_time: "2026-09-26T15:00:00Z" },
  } as ProfileRegistration;
  assert.equal(cancellationLabel(r), "Отмена за 3+ часа");
  assert.equal(
    cancellationLabel({ ...r, cancelled_at: "2026-09-26T12:00:01Z" }),
    "Поздняя отмена",
  );
  assert.equal(
    cancellationLabel({ ...r, cancelled_at: null }),
    "Время отмены не зафиксировано",
  );
});
test("notifications cannot navigate to external or script URLs", () => {
  for (const href of [
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "/auth",
  ])
    assert.equal(safeInternalHref(href), "/profile?tab=notifications");
  assert.equal(
    safeInternalHref("/profile?tab=help&ticket=abc"),
    "/profile?tab=help&ticket=abc",
  );
});
test("empty rating is unknown, valid rating is arithmetic mean", () => {
  assert.equal(reviewAverage([]), null);
  assert.equal(
    reviewAverage([{ rating: 3 }, { rating: 5 }] as ProfileReview[]),
    4,
  );
});
test("recommendations use local Kazakhstan time and do not mutate feed", () => {
  const rows = [
    {
      id: "b",
      city: "Алматы",
      sport: "Баскетбол",
      type: "daily_game",
      date_time: "2026-09-26T13:00:00Z",
    },
    {
      id: "a",
      city: "Астана",
      sport: "Футбол",
      type: "daily_game",
      date_time: "2026-09-26T13:00:00Z",
    },
  ] as PublicActivity[];
  assert.deepEqual(
    rankForPlayer(rows, {
      city: "Астана",
      sports: ["Футбол"],
      days: [6],
      time_from: "18:00",
      time_to: "22:00",
      event_types: ["daily_game"],
    }).map((r) => r.id),
    ["a", "b"],
  );
  assert.equal(rows[0]?.id, "b");
});
