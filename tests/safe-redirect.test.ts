import assert from "node:assert/strict";
import { test } from "node:test";
import { safeRedirectPath } from "../src/lib/safe-redirect.ts";

test("keeps same-site paths", () => {
  assert.equal(safeRedirectPath("/my-games?tab=upcoming"), "/my-games?tab=upcoming");
  assert.equal(safeRedirectPath("/activity/123?code=abc#top"), "/activity/123?code=abc#top");
  assert.equal(safeRedirectPath("/?city=Астана&q=мини футбол"), "/?city=Астана&q=мини футбол");
});

test("rejects other sites and malformed values", () => {
  for (const value of [
    "//evil.example",
    "/\t/evil.example/auth",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "my-games",
    "",
    undefined,
    null,
    42,
  ]) {
    assert.equal(safeRedirectPath(value), "/", JSON.stringify(value));
  }
});
