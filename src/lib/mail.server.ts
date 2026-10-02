// Outgoing email (confirmation, password recovery, email change).
// SMTP_URL example: smtps://user:password@smtp.example.kz:465
// Without SMTP_URL the message is written to the server log instead, which is
// enough for local development and for a staging server without a mail provider.
import nodemailer, { type Transporter } from "nodemailer";

let transport: Transporter | undefined;

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  const url = process.env["SMTP_URL"];
  if (!url) {
    console.info(
      `[mail] SMTP_URL is not set; not sending "${message.subject}" to ${message.to}:\n${message.text}`,
    );
    return;
  }
  transport ??= nodemailer.createTransport(url);
  await transport.sendMail({
    from: process.env["MAIL_FROM"] || "Sportura <no-reply@sportura.kz>",
    ...message,
  });
}

/** Mail failures must not fail the request that triggered them. */
export function sendMailInBackground(message: Parameters<typeof sendMail>[0]) {
  sendMail(message).catch((error: unknown) =>
    console.error("[mail] delivery failed", error),
  );
}
