import assert from "node:assert/strict";
import { test } from "node:test";
import nodemailer, { type StreamSentMessageInfo } from "nodemailer";
import { createServer } from "node:net";
import { once } from "node:events";
import {
  MAIL_DELIVERY_FAILED,
  MAIL_NOT_CONFIGURED,
  mailConfigured,
  sendMail,
  verifyMailService,
} from "../src/lib/mail.server.ts";

function decodeQuotedPrintable(value: string): string {
  return value
    .replace(/=\r\n/g, "")
    .replace(/(?:=[0-9A-F]{2})+/gi, (encoded) =>
      Buffer.from(encoded.replaceAll("=", ""), "hex").toString("utf8"),
    );
}

test("missing SMTP fails clearly and never logs recovery/confirmation links", async (t) => {
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

  assert.equal(mailConfigured(), false);
  await assert.rejects(
    sendMail({
      to: "verify@example.test",
      subject: "Подтвердите e-mail в Sportura",
      text: "https://sportura.test/api/auth/confirm?token=local-verification",
    }),
    { message: MAIL_NOT_CONFIGURED },
  );
  await assert.rejects(verifyMailService(), { message: MAIL_NOT_CONFIGURED });
  assert.equal(logs.length, 0);
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
    return { ...delivered, accepted: delivered.envelope.to };
  });
  let configuredUrl: unknown;
  t.mock.method(nodemailer, "createTransport", (options) => {
    configuredUrl = options;
    return stream;
  });
  process.env["SMTP_URL"] = "smtp://local-verification.invalid:2525";
  process.env["MAIL_FROM"] = "Sportura <no-reply@sportura.test>";
  const subject = "Подтвердите e-mail в Sportura";
  const text =
    "Здравствуйте!\n\nПодтвердите адрес:\nhttps://sportura.test/api/auth/confirm?token=local-verification";

  await sendMail({ to: "verify@example.test", subject, text });

  assert.deepEqual(configuredUrl, {
    url: process.env["SMTP_URL"],
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
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

test("mail waits for provider acceptance and rejects an unaccepted recipient", async (t) => {
  const previousUrl = process.env["SMTP_URL"];
  t.after(() => {
    if (previousUrl === undefined) delete process.env["SMTP_URL"];
    else process.env["SMTP_URL"] = previousUrl;
  });
  process.env["SMTP_URL"] = "smtp://acceptance-verification.invalid:2525";
  const diagnostics: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) =>
    diagnostics.push(args),
  );
  let resolve!: (value: { accepted: string[] }) => void;
  let operation = new Promise<{ accepted: string[] }>((done) => {
    resolve = done;
  });
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: () => operation,
    verify: async () => true,
    close: () => {},
  }));
  let completed = false;
  const sending = sendMail({
    to: "verify@example.test",
    subject: "Test",
    text: "Private confirmation link",
  }).then(() => {
    completed = true;
  });
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(completed, false);
  resolve({ accepted: ["verify@example.test"] });
  await sending;
  assert.equal(completed, true);
  operation = Promise.resolve({ accepted: [] });
  await assert.rejects(
    sendMail({
      to: "rejected@example.test",
      subject: "Test",
      text: "token=secret",
    }),
    { message: MAIL_DELIVERY_FAILED },
  );
  assert(!JSON.stringify(diagnostics).includes("secret"));
  assert.match(JSON.stringify(diagnostics), /ERECIPIENT/);
});

test("SMTP failures are sanitized and a stalled provider times out", async (t) => {
  const previousUrl = process.env["SMTP_URL"];
  t.after(() => {
    if (previousUrl === undefined) delete process.env["SMTP_URL"];
    else process.env["SMTP_URL"] = previousUrl;
  });
  process.env["SMTP_URL"] = "smtp://error-verification.invalid:2525";
  const diagnostics: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) =>
    diagnostics.push(args),
  );
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: () => new Promise(() => {}),
    verify: async () => {
      throw Object.assign(new Error("SMTP password=private token=secret"), {
        code: "EAUTH",
        responseCode: 535,
      });
    },
    close: () => {},
  }));
  await assert.rejects(verifyMailService(), { message: MAIL_DELIVERY_FAILED });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sending = sendMail({
    to: "verify@example.test",
    subject: "Test",
    text: "token=secret",
  });
  t.mock.timers.tick(15_000);
  await assert.rejects(sending, { message: MAIL_DELIVERY_FAILED });
  assert.match(JSON.stringify(diagnostics), /EAUTH/);
  assert.match(JSON.stringify(diagnostics), /ETIMEDOUT/);
  assert(!/private|secret/.test(JSON.stringify(diagnostics)));
});

test("real SMTP handshake accepts mail and rejects a recipient without any external service", async (t) => {
  const previousUrl = process.env["SMTP_URL"];
  const previousFrom = process.env["MAIL_FROM"];
  t.after(() => {
    if (previousUrl === undefined) delete process.env["SMTP_URL"];
    else process.env["SMTP_URL"] = previousUrl;
    if (previousFrom === undefined) delete process.env["MAIL_FROM"];
    else process.env["MAIL_FROM"] = previousFrom;
  });
  const messages: string[] = [];
  const smtp = createServer((socket) => {
    let buffer = "";
    let body: string[] | null = null;
    socket.write("220 local verification SMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (body) {
          if (line === ".") {
            messages.push(body.join("\r\n"));
            body = null;
            socket.write("250 message accepted\r\n");
          } else body.push(line);
        } else if (/^(EHLO|HELO)/i.test(line))
          socket.write("250-local verification\r\n250 SIZE 10485760\r\n");
        else if (/^MAIL FROM/i.test(line))
          socket.write("250 sender accepted\r\n");
        else if (/^RCPT TO/i.test(line))
          socket.write(
            /rejected@example\.test/i.test(line)
              ? "550 recipient rejected\r\n"
              : "250 recipient accepted\r\n",
          );
        else if (/^DATA$/i.test(line)) {
          body = [];
          socket.write("354 send message\r\n");
        } else if (/^QUIT$/i.test(line)) socket.end("221 goodbye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  smtp.listen(0, "127.0.0.1");
  await once(smtp, "listening");
  t.after(async () => {
    await new Promise<void>((done) => smtp.close(() => done()));
  });
  const address = smtp.address();
  assert(address && typeof address !== "string");
  process.env["SMTP_URL"] = `smtp://127.0.0.1:${address.port}`;
  process.env["MAIL_FROM"] = "Sportura <no-reply@example.test>";
  t.mock.method(console, "error", () => {});
  await verifyMailService();
  await sendMail({
    to: "verify@example.test",
    subject: "Local confirmation",
    text: "Local mail link",
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /Local mail link/);
  await assert.rejects(
    sendMail({
      to: "rejected@example.test",
      subject: "Local confirmation",
      text: "Rejected mail",
    }),
    { message: MAIL_DELIVERY_FAILED },
  );
  assert.equal(messages.length, 1);
});
