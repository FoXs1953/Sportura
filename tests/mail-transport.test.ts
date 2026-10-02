import assert from "node:assert/strict";
import { test } from "node:test";
import nodemailer, { type StreamSentMessageInfo } from "nodemailer";
import { sendMail } from "../src/lib/mail.server.ts";

function decodeQuotedPrintable(value: string): string {
  return value
    .replace(/=\r\n/g, "")
    .replace(/(?:=[0-9A-F]{2})+/gi, (encoded) =>
      Buffer.from(encoded.replaceAll("=", ""), "hex").toString("utf8"),
    );
}

test("mail without a provider remains available for local verification", async (t) => {
  const previousUrl = process.env["SMTP_URL"];
  t.after(() => {
    if (previousUrl === undefined) delete process.env["SMTP_URL"];
    else process.env["SMTP_URL"] = previousUrl;
  });
  delete process.env["SMTP_URL"];
  const logs: string[] = [];
  t.mock.method(console, "info", (line: string) => logs.push(line));
  t.mock.method(nodemailer, "createTransport", () => {
    assert.fail("no SMTP transport should be created without a provider");
  });

  await sendMail({
    to: "verify@example.test",
    subject: "Подтвердите e-mail в Sportura",
    text: "https://sportura.test/api/auth/confirm?token=local-verification",
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /verify@example\.test/);
  assert.match(logs[0]!, /token=local-verification/);
});

test("configured mail composes a Russian confirmation email through the upgraded transport", async (t) => {
  const previousUrl = process.env["SMTP_URL"];
  const previousFrom = process.env["MAIL_FROM"];
  t.after(() => {
    if (previousUrl === undefined) delete process.env["SMTP_URL"];
    else process.env["SMTP_URL"] = previousUrl;
    if (previousFrom === undefined) delete process.env["MAIL_FROM"];
    else process.env["MAIL_FROM"] = previousFrom;
  });

  // Use Nodemailer's real MIME/stream transport; no network or outgoing mail.
  const stream = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows",
  });
  const originalSend = stream.sendMail.bind(stream);
  let delivered: StreamSentMessageInfo | undefined;
  t.mock.method(stream, "sendMail", async (message) => {
    delivered = await originalSend(message);
    return delivered;
  });
  let configuredUrl: unknown;
  t.mock.method(nodemailer, "createTransport", (url) => {
    configuredUrl = url;
    return stream;
  });
  process.env["SMTP_URL"] = "smtp://local-verification.invalid:2525";
  process.env["MAIL_FROM"] = "Sportura <no-reply@sportura.test>";
  const subject = "Подтвердите e-mail в Sportura";
  const text =
    "Здравствуйте!\n\nПодтвердите адрес:\nhttps://sportura.test/api/auth/confirm?token=local-verification";

  await sendMail({ to: "verify@example.test", subject, text });

  assert.equal(configuredUrl, process.env["SMTP_URL"]);
  assert.ok(delivered);
  assert.deepEqual(delivered.envelope, {
    from: "no-reply@sportura.test",
    to: ["verify@example.test"],
  });
  const raw = delivered.message.toString();
  const [headers, ...bodyParts] = raw.split("\r\n\r\n");
  const unfoldedHeaders = headers!.replace(/\r\n[ \t]+/g, " ");
  const wireSubject = /^Subject: (.*)$/m.exec(unfoldedHeaders)?.[1] ?? "";
  assert.equal(
    wireSubject
      .replace(/(\?=)\s+(=\?)/g, "$1$2")
      .replace(
        /=\?UTF-8\?([BQ])\?([^?]+)\?=/gi,
        (_, encoding: string, encoded: string) =>
          encoding.toUpperCase() === "B"
            ? Buffer.from(encoded, "base64").toString("utf8")
            : decodeQuotedPrintable(encoded.replaceAll("_", " ")),
      ),
    subject,
  );
  const body = bodyParts.join("\r\n\r\n");
  const decodedBody = /Content-Transfer-Encoding: base64/i.test(headers!)
    ? Buffer.from(body, "base64").toString("utf8")
    : decodeQuotedPrintable(body);
  assert.equal(decodedBody.trimEnd().replaceAll("\r\n", "\n"), text);
});
