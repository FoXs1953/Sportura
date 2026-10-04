import assert from "node:assert/strict";
import test from "node:test";
import {
  authContinuationPath,
  safeAuthRedirect,
} from "../src/lib/auth-redirect.ts";

test("auth redirects preserve internal paths, queries and fragments", () => {
  for (const path of [
    "/",
    "/my-games",
    "/activity/abc?code=invite%20code&view=players#roster",
    "/?sort=personal",
    "/?view=saved",
    "/profile?tab=security",
    "/search?q=%D0%B8%D0%B3%D1%80%D0%B0",
  ]) {
    assert.equal(safeAuthRedirect(path), path);
  }
});

test("auth redirects reject external URLs, protocols and malformed paths", () => {
  for (const value of [
    undefined,
    null,
    1,
    {},
    "",
    "my-games",
    "https://outside.example/my-games",
    "http://outside.example",
    "//outside.example",
    "///outside.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "/\\outside.example",
    "/my-games\\anything",
    "/%5coutside.example",
    "/%2foutside.example",
    "/.%2e//outside.example",
    "/my-games\n",
    "/my-games\r",
    "/my-games\t",
    "/my-games\u0000",
    "/my-games\u007f",
    "/my-games\u0085",
    "/my-games%0a",
    "/my-games%0D",
    "/my-games%c2%85",
    "/%invalid",
  ]) {
    assert.equal(safeAuthRedirect(value), "/", String(value));
  }
});

test("email recovery and confirmation callbacks keep the original destination", () => {
  const redirect = "/activity/abc?code=a%26b&view=players#roster";
  const token = "a_token_that_is_only_for_the_email_link";
  const recovery = new URL(
    authContinuationPath("/reset-password", redirect, { token }),
    "https://sportura.example",
  );
  assert.equal(recovery.searchParams.get("token"), token);
  assert.equal(recovery.searchParams.get("redirect"), redirect);

  // Removing the single-use token retains the safe continuation path.
  const cleaned = new URL(
    authContinuationPath(
      "/reset-password",
      recovery.searchParams.get("redirect"),
    ),
    recovery,
  );
  assert.equal(cleaned.searchParams.get("token"), null);
  assert.equal(cleaned.searchParams.get("redirect"), redirect);
  const login = new URL(
    authContinuationPath("/auth", cleaned.searchParams.get("redirect")),
    cleaned,
  );
  assert.equal(login.searchParams.get("redirect"), redirect);

  const confirmation = new URL(
    authContinuationPath("/api/auth/confirm", redirect, { token }),
    recovery,
  );
  const confirmedLogin = new URL(
    authContinuationPath("/auth", confirmation.searchParams.get("redirect"), {
      confirmed: "1",
    }),
    confirmation,
  );
  assert.equal(confirmedLogin.searchParams.get("confirmed"), "1");
  assert.equal(confirmedLogin.searchParams.get("redirect"), redirect);
  assert.equal(confirmedLogin.searchParams.get("token"), null);
});

test("auth callbacks sanitize untrusted destinations and keep legacy defaults", () => {
  assert.equal(authContinuationPath("/auth", undefined), "/auth");
  assert.equal(
    authContinuationPath("/reset-password", undefined, { token: "test" }),
    "/reset-password?token=test",
  );
  assert.equal(
    authContinuationPath("/auth", "//outside.example", {
      confirmed: "1",
      redirect: "https://outside.example",
    }),
    "/auth?confirmed=1",
  );
});
