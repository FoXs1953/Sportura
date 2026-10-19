import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { PublicActivity } from "../src/lib/activities.functions.ts";
import { isRegistrationOpen } from "../src/lib/feed-filters.ts";
import { DISCIPLINES } from "../src/lib/disciplines.ts";
import { formatLocalizedDate, translator } from "../src/lib/i18n/core.ts";

const require = createRequire(import.meta.url);

// Render the actual client component with routing and language supplied by this
// harness. Compile TSX in memory so the normal node:test command needs no loader.
function clientModule(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  );
  new Function("require", "exports", outputText)(
    (specifier: string) =>
      Object.hasOwn(dependencies, specifier)
        ? dependencies[specifier]
        : require(specifier),
    exports,
  );
  return exports;
}

const sportura = clientModule("../src/lib/sportura.ts", {
  "./i18n/core": { formatLocalizedDate },
  "./disciplines": { DISCIPLINES },
  ...Object.fromEntries(
    ["football", "minifootball", "basketball", "volleyball"].map((sport) => [
      `@/assets/sport-${sport}.jpg`,
      { default: `/sport-${sport}.jpg` },
    ]),
  ),
});

type CardActivity = PublicActivity & {
  duration_minutes?: number;
  participation_mode?: string;
  host_rating_count?: number;
};

function components(language: "ru" | "kk" = "ru") {
  return clientModule("../src/components/sportura/activity-card.tsx", {
    "@/lib/i18n": { useI18n: () => ({ language, tr: translator(language) }) },
    "@/lib/feed-filters": { isRegistrationOpen },
    "@/lib/sportura": sportura,
    "@tanstack/react-router": {
      Link: ({ children }: { children: ReactNode }) =>
        createElement("a", null, children),
    },
  }) as {
    ActivityCard: ComponentType<{ activity: CardActivity }>;
    CapacityMeter: ComponentType<{ registered: number; max: number }>;
  };
}

function activity(values: Partial<CardActivity> = {}): CardActivity {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Вечерний футбол",
    city: "Астана",
    location_text: "Арена",
    sport: "Футбол",
    host_name: "Данияр",
    host_rating: null,
    type: "daily_game",
    status: "open",
    is_free: true,
    registered_count: 2,
    max_participants: 10,
    date_time: null,
    registration_deadline: null,
    entry_fee: 0,
    ...values,
  } as CardActivity;
}

function render(
  values: Partial<CardActivity> = {},
  language: "ru" | "kk" = "ru",
) {
  return renderToStaticMarkup(
    createElement(components(language).ActivityCard, {
      activity: activity(values),
    }),
  );
}

test("a registration deadline with places remaining is closed rather than full", () => {
  const html = render({
    date_time: "2099-01-01T12:00:00+05:00",
    registration_deadline: "2000-01-01T12:00:00+05:00",
  });
  assert.match(html, /feed-status-closed/);
  assert.doesNotMatch(html, /feed-status-full/);
  assert.match(html, /Регистрация закрыта/);
});

test("a full future game retains the full badge", () => {
  const html = render({
    date_time: "2099-01-01T12:00:00+05:00",
    registered_count: 10,
  });
  assert.match(html, /feed-status-full/);
  assert.match(html, /Мест нет/);
});

test("an elapsed game with stale open status has completed styling", () => {
  const html = render({ date_time: "2000-01-01T12:00:00+05:00" });
  assert.match(html, /feed-status-completed/);
  assert.match(html, /feed-card-closed/);
  assert.doesNotMatch(html, /feed-status-full/);
  assert.match(html, /Завершилось/);
});

test("a game currently in progress is not presented as full", (context) => {
  context.mock.method(Date, "now", () => Date.parse("2026-10-19T13:00:00Z"));
  const html = render({
    date_time: "2026-10-19T12:00:00Z",
    duration_minutes: 120,
  });
  assert.match(html, /Идёт сейчас/);
  assert.match(html, /feed-status-closed/);
  assert.doesNotMatch(html, /feed-status-full|feed-card-closed/);
});

test("an explicit extended deadline continues accepting registrations after start", () => {
  const html = render({
    date_time: "2000-01-01T12:00:00+05:00",
    registration_deadline: "2099-01-01T12:00:00+05:00",
  });
  assert.match(html, /Идёт набор/);
  assert.doesNotMatch(html, /feed-card-closed|feed-status-completed/);
});

test("cancellation takes precedence over elapsed time and full capacity", () => {
  const html = render({
    status: "cancelled",
    registered_count: 10,
    date_time: "2000-01-01T12:00:00+05:00",
  });
  assert.match(html, /feed-status-cancelled/);
  assert.match(html, /Отменено/);
});

test("an invalid date uses the understandable time placeholder", () => {
  const html = render({ date_time: "not-a-date" });
  assert.match(html, /Время уточняется/);
});

test("an empty capacity meter does not show registered participants", () => {
  const html = renderToStaticMarkup(
    createElement(components().CapacityMeter, { registered: 0, max: 10 }),
  );
  assert.match(html, /width:0%/);
});

test("Kazakh cards translate closed registration, team price and rating count", () => {
  const html = render(
    {
      participation_mode: "team",
      host_rating: 4.5,
      host_rating_count: 12,
      date_time: "2099-01-01T12:00:00+05:00",
      registration_deadline: "2000-01-01T12:00:00+05:00",
    },
    "kk",
  );
  assert.doesNotMatch(html, /Регистрация закрыта|за команду|\sкоманд<|оценок/);
  assert.match(html, /12 баға/);
});
