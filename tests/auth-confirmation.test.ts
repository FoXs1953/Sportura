import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { requireEmailConfirmation } from "../src/lib/auth-confirmation.server.ts";
import { sendMail } from "../src/lib/mail.server.ts";
import { translateText } from "../src/lib/i18n/core.ts";

test("unconfirmed sign-in reports failed mail without claiming a link was sent", async (t) => {
  const previousUrl = process.env["SMTP_URL"];
  t.after(() => {
    if (previousUrl === undefined) delete process.env["SMTP_URL"];
    else process.env["SMTP_URL"] = previousUrl;
  });
  t.mock.method(console, "error", () => {});
  let provider: () => Promise<{ accepted: string[] }> = async () => ({
    accepted: [],
  });
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: () => provider(),
    close: () => {},
  }));
  const resend = () =>
    sendMail({
      to: "verify@example.test",
      subject: "Local confirmation",
      text: "token=private-confirmation-link",
    });

  const failures = [
    () => {
      delete process.env["SMTP_URL"];
    },
    () => {
      process.env["SMTP_URL"] = "smtp://confirmation-verification.invalid:2525";
    },
    () => {
      provider = async () => {
        throw Object.assign(new Error("password=private-credential"), {
          code: "EAUTH",
          responseCode: 535,
        });
      };
    },
  ];
  for (const prepare of failures) {
    prepare();
    await assert.rejects(requireEmailConfirmation(resend), (error: Error) => {
      assert.match(error.message, /^Подтвердите e-mail, чтобы войти\./);
      assert.match(error.message, /Не удалось отправить новую ссылку/);
      assert.doesNotMatch(error.message, /принят|Мы отправили|private|535/);
      assert.notEqual(translateText(error.message, "kk"), error.message);
      return true;
    });
  }
});

test("unconfirmed sign-in waits for mail acceptance and still requires confirmation", async (t) => {
  const previousUrl = process.env["SMTP_URL"];
  t.after(() => {
    if (previousUrl === undefined) delete process.env["SMTP_URL"];
    else process.env["SMTP_URL"] = previousUrl;
  });
  process.env["SMTP_URL"] = "smtp://confirmation-acceptance.invalid:2525";
  let accept!: (result: { accepted: string[] }) => void;
  const pending = new Promise<{ accepted: string[] }>((resolve) => {
    accept = resolve;
  });
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: () => pending,
    close: () => {},
  }));
  let reported = false;
  const response = requireEmailConfirmation(() =>
    sendMail({
      to: "verify@example.test",
      subject: "Local confirmation",
      text: "Local confirmation link",
    }),
  );
  const checked = assert.rejects(response, (error: Error) => {
    reported = true;
    assert.match(error.message, /^Подтвердите e-mail, чтобы войти\./);
    assert.match(error.message, /Запрос новой ссылки принят/);
    assert.doesNotMatch(error.message, /Мы отправили|доставлено/);
    assert.notEqual(translateText(error.message, "kk"), error.message);
    return true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reported, false);
  accept({ accepted: ["verify@example.test"] });
  await checked;
  assert.equal(reported, true);
});
