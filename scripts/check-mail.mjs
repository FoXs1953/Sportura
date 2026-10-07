// Deployment preflight: verify SMTP authentication without sending a message.
// Print configuration flags and diagnostic codes only, never credentials.
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const report = {
  configured: Boolean(process.env.SMTP_URL?.trim()),
  senderConfigured: Boolean(process.env.MAIL_FROM?.trim()),
};
let transport;
const deadline = setTimeout(() => {
  report.connection = "failed";
  report.code = "ETIMEDOUT";
  process.stdout.write(
    `[mail] deployment preflight ${JSON.stringify(report)}\n`,
    () => process.exit(0),
  );
}, 15_000);
try {
  if (report.configured) {
    const url = new URL(process.env.SMTP_URL.trim());
    // URL options override transport options; prohibit unsanitized SMTP logs.
    for (const flag of ["logger", "debug", "transactionLog"]) {
      url.searchParams.delete(flag);
    }
    report.host = url.hostname;
    report.port = url.port || (url.protocol === "smtps:" ? "465" : "587");
    const from =
      process.env.MAIL_FROM?.trim() || "Sportura <no-reply@sportura.kz>";
    const sender = /<([^>]+)>/.exec(from)?.[1]?.trim() || from;
    const username = decodeURIComponent(url.username);
    report.smtpUserIsEmail = /^[^\s@<>]+@[^\s@<>]+$/.test(username);
    if (report.smtpUserIsEmail) {
      report.senderMatchesSmtpUser =
        sender.toLowerCase() === username.toLowerCase();
    }
    const directory = path.resolve(
      import.meta.dirname,
      "../.output/server/_libs",
    );
    const files = await readdir(directory);
    const name = files.find((name) =>
      /^nodemailer(?:[-.].*)?\.mjs$/.test(name),
    );
    if (!name) throw Object.assign(new Error(), { code: "TRANSPORT_MISSING" });
    const module = await import(pathToFileURL(path.join(directory, name)).href);
    const nodemailer = Object.values(module).find(
      (value) => value && typeof value.createTransport === "function",
    );
    if (!nodemailer)
      throw Object.assign(new Error(), { code: "TRANSPORT_MISSING" });
    transport = nodemailer.createTransport({
      url: url.toString(),
      logger: false,
      debug: false,
      transactionLog: false,
      dnsTimeout: 8_000,
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 8_000,
    });
    report.connection = (await transport.verify()) ? "ready" : "failed";
  } else {
    report.connection = "not_configured";
  }
} catch (error) {
  report.connection = "failed";
  report.code = /^[A-Z][A-Z0-9_]{0,31}$/.test(error?.code)
    ? error.code
    : "UNKNOWN";
  if (
    Number.isInteger(error?.responseCode) &&
    error.responseCode >= 100 &&
    error.responseCode <= 599
  ) {
    report.responseCode = error.responseCode;
  }
} finally {
  transport?.close();
  clearTimeout(deadline);
}
// Mail failure does not stop migrations or take the rest of the app offline.
console.log("[mail] deployment preflight", JSON.stringify(report));
