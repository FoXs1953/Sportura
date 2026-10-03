import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAllDrafts,
  clearDraft,
  draftKey,
  loadDraft,
  saveDraft,
} from "../src/lib/form-draft.ts";

// Minimal browser storage so the helpers run under Node.
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    keys: () => [...data.keys()],
  };
}

const DAY = 24 * 60 * 60 * 1000;

test("drafts are kept per account and expire after the given age", (t) => {
  const storage = memoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    value: new Proxy(storage, {
      ownKeys: () => storage.keys(),
      getOwnPropertyDescriptor: () => ({
        enumerable: true,
        configurable: true,
      }),
    }),
    configurable: true,
  });
  const mine = draftKey("organizer-application", "user-a");
  const theirs = draftKey("organizer-application", "user-b");
  saveDraft(mine, { venues: "Arena" });
  assert.deepEqual(loadDraft(mine, DAY), { venues: "Arena" });
  assert.equal(loadDraft(theirs, DAY), null);

  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + DAY + 1 });
  assert.equal(loadDraft(mine, DAY), null, "expired drafts are dropped");
  assert.equal(storage.getItem(mine), null);
  t.mock.timers.reset();

  saveDraft(mine, { venues: "Arena" });
  clearDraft(mine);
  assert.equal(loadDraft(mine, DAY), null);

  saveDraft(mine, { venues: "Arena" });
  saveDraft(theirs, { venues: "Park" });
  storage.setItem("sportura.analytics-consent", "yes");
  clearAllDrafts();
  assert.deepEqual(storage.keys(), ["sportura.analytics-consent"]);
});

test("unavailable or corrupt storage never breaks the form", () => {
  Object.defineProperty(globalThis, "localStorage", {
    get() {
      throw new Error("blocked");
    },
    configurable: true,
  });
  assert.equal(loadDraft("sportura.draft.x.y", DAY), null);
  assert.doesNotThrow(() => saveDraft("sportura.draft.x.y", {}));
  assert.doesNotThrow(() => clearAllDrafts());

  const storage = memoryStorage();
  storage.setItem("sportura.draft.x.y", "{not json");
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  assert.equal(loadDraft("sportura.draft.x.y", DAY), null);
});
