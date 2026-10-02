// Outgoing email (confirmation, password recovery, email change).
// SMTP_URL example: smtps://user:password@smtp.example.kz:465
// Success means the SMTP service accepted the recipient. Missing configuration,
// rejection and transport failures must never be reported as delivered mail.
import nodemailer, { type Transporter } from "nodemailer";

let transport: Transporter | undefined;
let transportUrl: string | undefined;
const SMTP_TIMEOUT_MS = 15_000;

export const MAIL_NOT_CONFIGURED =
  "Отправка писем пока недоступна. Попробуйте позже или обратитесь в поддержку.";
export const MAIL_DELIVERY_FAILED =
  "Не удалось отправить письмо. Попробуйте ещё раз позже или обратитесь в поддержку.";
export class MailDeliveryError extends Error {
  constructor() {
    super(MAIL_DELIVERY_FAILED);
  }
}

export function mailConfigured() {
  return Boolean(process.env["SMTP_URL"]?.trim());
}

export function requireMailConfigured() {
  const url = process.env["SMTP_URL"]?.trim();
  if (!url) throw new Error(MAIL_NOT_CONFIGURED);
  return url;
}

function mailTransport() {
  const url = requireMailConfigured();
  if (!transport || transportUrl !== url) {
    transport?.close?.();
    transport = nodemailer.createTransport({
      url,
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 8_000,
    });
    transportUrl = url;
  }
  return transport;
}

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error("SMTP timeout"), { code: "ETIMEDOUT" }),
          );
        }, SMTP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function deliveryError(error: unknown): Error {
  // SMTP errors can contain addresses, credentials or message content. Keep
  // only diagnostic codes in the server log; never log confirmation links.
  const details = error as { code?: unknown; responseCode?: unknown } | null;
  console.error("[mail] delivery failed", {
    code: typeof details?.code === "string" ? details.code : "UNKNOWN",
    responseCode:
      typeof details?.responseCode === "number"
        ? details.responseCode
        : undefined,
  });
  return new MailDeliveryError();
}

/** Check service availability before looking up an account for recovery. */
export async function verifyMailService() {
  requireMailConfigured();
  try {
    const smtp = mailTransport();
    if (!(await bounded(smtp.verify())))
      throw new Error("SMTP verification failed");
  } catch (error) {
    throw deliveryError(error);
  }
}

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  requireMailConfigured();
  try {
    const smtp = mailTransport();
    const result = await bounded(
      smtp.sendMail({
        from: process.env["MAIL_FROM"] || "Sportura <no-reply@sportura.kz>",
        ...message,
      }),
    );
    const accepted: unknown[] = result.accepted ?? [];
    if (
      !accepted.some(
        (recipient) =>
          typeof recipient === "string" &&
          recipient.toLowerCase() === message.to.trim().toLowerCase(),
      )
    ) {
      throw Object.assign(new Error("SMTP recipient was not accepted"), {
        code: "ERECIPIENT",
      });
    }
  } catch (error) {
    throw deliveryError(error);
  }
}
