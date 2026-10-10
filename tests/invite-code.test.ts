import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultParseSearch,
  defaultStringifySearch,
} from "@tanstack/router-core";
import {
  formatInviteCode,
  inviteCodeFromSearch,
  normalizeInviteCode,
} from "../src/lib/invite-code.ts";

test("normalizes grouped numeric invitations including pasted nonbreaking spaces", () => {
  for (const input of [
    "12345678",
    " 1234 5678 ",
    "1234-5678",
    "1234\u00a05678",
    "12 34-56 78",
  ]) {
    assert.equal(normalizeInviteCode(input), "12345678");
  }
});

test("keeps legacy invitation characters and separators intact", () => {
  assert.equal(
    normalizeInviteCode("  AbC12-Legacy-XY98  "),
    "abc12-legacy-xy98",
  );
  assert.equal(normalizeInviteCode("  A1B2 C3D4  "), "a1b2 c3d4");
  assert.equal(normalizeInviteCode(""), "");
});

test("formats exactly eight-digit invitations as two readable groups", () => {
  assert.equal(formatInviteCode("12345678"), "1234 5678");
  assert.equal(formatInviteCode("01234567"), "0123 4567");
});

test("leaves older invitation formats unchanged for sharing compatibility", () => {
  for (const code of [
    "abc12-legacy-xy98",
    "aBcdEf89",
    "1234567",
    "123456789",
    "",
  ]) {
    assert.equal(formatInviteCode(code), code);
  }
});

test("copied numeric links survive the router's number parsing", () => {
  const search = defaultParseSearch("?code=48271936");
  assert.equal(typeof search.code, "number");
  assert.equal(inviteCodeFromSearch(search.code), "48271936");
  assert.equal(
    inviteCodeFromSearch(defaultParseSearch("?code=01234567").code),
    "01234567",
  );
});

test("router-generated string links preserve short and legacy invitations", () => {
  for (const [code, expected] of [
    ["48271936", "48271936"],
    ["4827 1936", "48271936"],
    ["4827-1936", "48271936"],
    ["4827\u00a01936", "48271936"],
    ["  AbC12-Legacy-XY98  ", "abc12-legacy-xy98"],
  ]) {
    const search = defaultParseSearch(defaultStringifySearch({ code }));
    assert.equal(typeof search.code, "string");
    assert.equal(inviteCodeFromSearch(search.code), expected);
  }
});

test("manually formatted links normalize after URL decoding", () => {
  for (const code of ["4827 1936", "4827-1936", "4827\u00a01936"]) {
    const search = defaultParseSearch("?code=" + encodeURIComponent(code));
    assert.equal(inviteCodeFromSearch(search.code), "48271936");
  }
  const legacy = defaultParseSearch(
    "?code=" + encodeURIComponent("AbC12-Legacy-XY98"),
  );
  assert.equal(inviteCodeFromSearch(legacy.code), "abc12-legacy-xy98");
});

test("invalid search values cannot become invitations", () => {
  for (const value of [
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    {},
    [],
    null,
    undefined,
    true,
  ]) {
    assert.equal(inviteCodeFromSearch(value), "");
  }
  for (const value of [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    { code: "48271936" },
    [48271936],
  ]) {
    const search = defaultParseSearch(defaultStringifySearch({ code: value }));
    assert.equal(inviteCodeFromSearch(search.code), "");
  }
});
