import assert from "node:assert/strict";
import test from "node:test";
import {
  registrationDeadlineAllowed,
  registrationDeadlineLimit,
  registrationTimeOpen,
} from "../src/lib/registration-window.ts";
import { registrationOpen } from "../src/lib/event-model.ts";
import { isRegistrationOpen } from "../src/lib/feed-filters.ts";

const start = "2026-10-13T08:46:00+05:00";

test("allows November 8 without moving October 13 and caps at exactly 30 days", () => {
  assert.equal(registrationDeadlineLimit(start), "2026-11-12T03:46:00.000Z");
  assert.equal(
    registrationDeadlineAllowed(start, "2026-11-08T08:46:00+05:00"),
    true,
  );
  assert.equal(
    registrationDeadlineAllowed(start, "2026-11-12T08:46:00+05:00"),
    true,
  );
  assert.equal(
    registrationDeadlineAllowed(start, "2026-11-12T08:46:01+05:00"),
    false,
  );
});

test("uses 30 days across short months rather than one calendar month", () => {
  assert.equal(
    registrationDeadlineLimit("2027-02-01T08:46:00+05:00"),
    "2027-03-03T03:46:00.000Z",
  );
});

test("retains optional and earlier deadlines and rejects malformed deadlines", () => {
  assert.equal(registrationDeadlineAllowed(start, ""), true);
  assert.equal(
    registrationDeadlineAllowed(start, "2026-10-12T08:46:00+05:00"),
    true,
  );
  assert.equal(registrationDeadlineAllowed(start, "invalid"), false);
});

test("registration remains open after start until the chosen deadline", () => {
  const activity = {
    date_time: start,
    registration_deadline: "2026-11-08T08:46:00+05:00",
    status: "open" as const,
    registered_count: 1,
    max_participants: 10,
  };
  const now = Date.parse("2026-11-07T08:46:00+05:00");
  assert.equal(registrationTimeOpen(activity, now), true);
  assert.equal(registrationOpen(activity, now), true);
  assert.equal(
    isRegistrationOpen(
      activity as Parameters<typeof isRegistrationOpen>[0],
      now,
    ),
    true,
  );
  for (const helper of [
    registrationTimeOpen,
    registrationOpen,
    isRegistrationOpen,
  ]) {
    assert.equal(
      helper(
        activity as Parameters<typeof isRegistrationOpen>[0],
        Date.parse(activity.registration_deadline),
      ),
      false,
    );
  }
  assert.equal(
    registrationOpen({ ...activity, status: "cancelled" }, now),
    false,
  );
  assert.equal(
    registrationOpen({ ...activity, status: "completed" }, now),
    false,
  );
  assert.equal(
    registrationOpen({ ...activity, registered_count: 10 }, now),
    false,
  );
});

test("without an explicit deadline registration still closes at start", () => {
  const activity = { date_time: start, registration_deadline: null };
  assert.equal(registrationTimeOpen(activity, Date.parse(start) - 1), true);
  assert.equal(registrationTimeOpen(activity, Date.parse(start)), false);
});
