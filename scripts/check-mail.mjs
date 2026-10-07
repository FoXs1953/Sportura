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
  if (report.connection === "ready") report.providerCheck = "timed_out";
  else {
    report.connection = "failed";
    report.code = "ETIMEDOUT";
  }
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
    // Read only provider configuration, never messages or recovery links.
    if (report.connection === "ready" && url.hostname === "smtp.resend.com") {
      try {
        const headers = {
          Authorization: `Bearer ${decodeURIComponent(url.password)}`,
        };
        const domainsResponse = await fetch(
          "https://api.resend.com/domains?limit=100",
          {
            headers,
            signal: AbortSignal.timeout(3_500),
          },
        );
        report.providerReadStatus = domainsResponse.status;
        const domains = await domainsResponse.json();
        if (!domainsResponse.ok) {
          // A sending-only key cannot read domains; its SMTP access is valid.
          const names = [
            "restricted_api_key",
            "suspended_api_key",
            "invalid_permission",
            "invalid_api_key",
            "rate_limit_exceeded",
          ];
          report.providerReadError = names.includes(domains.name)
            ? domains.name
            : "unavailable";
        } else if (Array.isArray(domains.data)) {
          const domainName = sender.split("@").at(-1).toLowerCase();
          const domain = domains.data.find(
            (entry) => entry.name?.toLowerCase() === domainName,
          );
          const statuses = [
            "not_started",
            "pending",
            "verified",
            "failed",
            "temporary_failure",
            "partially_verified",
            "partially_failed",
          ];
          report.senderDomainStatus = domain
            ? statuses.includes(domain.status)
              ? domain.status
              : "unknown"
            : domains.has_more
              ? "not_checked"
              : "not_found";
          if (["enabled", "disabled"].includes(domain?.capabilities?.sending)) {
            report.senderDomainSending = domain.capabilities.sending;
          }
          const usageResponse = await fetch("https://api.resend.com/usage", {
            headers,
            signal: AbortSignal.timeout(3_500),
          });
          report.providerUsageStatus = usageResponse.status;
          if (usageResponse.ok) {
            const usage = await usageResponse.json();
            for (const window of ["daily", "monthly"]) {
              const quota = usage.emails?.[window];
              if (
                typeof quota?.limit === "number" &&
                Number.isFinite(quota.limit) &&
                typeof quota.used === "number" &&
                Number.isFinite(quota.used)
              ) {
                report[`${window}QuotaExhausted`] = quota.used >= quota.limit;
              }
            }
          }
        }
      } catch {
        report.providerCheck = "unavailable";
      }
    }
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
