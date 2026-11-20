import nodemailer, { Transporter } from "nodemailer";
import { appendToOutbox } from "./dev-outbox";

export type MailMode = "smtp" | "dry-run" | "test";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  ics?: string;
  icsFilename?: string;
  /**
   * Valeurs ne jamais imprimer (code à usage unique, adresse complète...).
   * Le mail reste écrit intégralement dans l'outbox de dev (fichier ignoré).
   */
  sensitiveValues?: string[];
}

function maskAddress(address: string): string {
  const at = address.indexOf("@");
  if (at <= 0) return "<adresse masquee>";
  return `${address.slice(0, 1)}***@${address.slice(at + 1)}`;
}

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length > 0) out = out.split(secret).join("<REDACTE>");
  }
  return out.slice(0, 300);
}

export interface SentEmailRecord {
  at: string;
  mode: MailMode;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  ics?: string;
  hasIcs: boolean;
}

export interface SendEmailResult {
  ok: boolean;
  mode: MailMode;
  messageId?: string;
}

export const sentEmails: SentEmailRecord[] = [];

export function clearSentEmails(): void {
  sentEmails.length = 0;
}

export function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST !== undefined;
}

export function getMailMode(): MailMode {
  if (isTestEnv()) return "test";
  // MAIL_MODE est prioritaire : permet de rester en dry-run sans modifier .env
  // ni tenter une connexion SMTP quand les identifiants sont invalides.
  const override = process.env.MAIL_MODE?.trim().toLowerCase();
  if (override === "dry-run" || override === "smtp") return override;
  if (!process.env.SMTP_PASS || process.env.SMTP_PASS.trim() === "") return "dry-run";
  return "smtp";
}

export function getMailFrom(): string {
  const configured = process.env.SMTP_FROM?.trim();
  if (configured) return configured;
  const user = process.env.SMTP_USER?.trim();
  if (user) return `VetClinic <${user}>`;
  return "VetClinic <no-reply@vetclinic.local>";
}

export function describeMailConfig(): string {
  const port = process.env.SMTP_PORT?.trim() || "587";
  return [
    `mode           : ${getMailMode()}`,
    `SMTP_HOST      : ${process.env.SMTP_HOST?.trim() || "(absent)"}`,
    `SMTP_PORT      : ${port}`,
    `SMTP_USER      : ${process.env.SMTP_USER?.trim() || "(absent)"}`,
    `SMTP_FROM      : ${getMailFrom()}`,
    `SMTP_PASS      : ${process.env.SMTP_PASS?.trim() ? "(renseigne)" : "(absent)"}`,
  ].join("\n");
}

let cachedTransport: Transporter | null = null;
let cachedMode: MailMode | null = null;

function buildTransport(mode: MailMode): Transporter {
  if (mode === "test") {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.example.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER?.trim() || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

export function getTransport(): Transporter {
  const mode = getMailMode();
  if (!cachedTransport || cachedMode !== mode) {
    cachedTransport = buildTransport(mode);
    cachedMode = mode;
  }
  return cachedTransport;
}

export function resetTransportCache(): void {
  cachedTransport = null;
  cachedMode = null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const mode = getMailMode();
  const from = getMailFrom();
  const hasIcs = Boolean(input.ics && input.ics.trim().length > 0);
  const attachment = hasIcs
    ? {
        filename: input.icsFilename || "calendar.ics",
        contentType: "text/calendar",
        content: input.ics as string,
      }
    : undefined;

  if (mode !== "smtp") {
    const record: SentEmailRecord = {
      at: new Date().toISOString(),
      mode,
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      ics: input.ics,
      hasIcs,
    };
    sentEmails.push(record);
    if (mode === "dry-run") appendToOutbox(record);
  }

  const secrets = input.sensitiveValues ?? [];
  const logRecipient = secrets.length > 0 ? maskAddress(input.to) : input.to;

  if (mode === "dry-run") {
    console.log(
      `[MAIL][DRY-RUN] to=${logRecipient} subject="${input.subject}" ics=${hasIcs ? "oui" : "non"}`,
    );
    return { ok: true, mode };
  }

  try {
    const info = await getTransport().sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(attachment ? { attachments: [attachment] } : {}),
    });
    return { ok: true, mode, messageId: info.messageId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `[MAIL][ERROR] to=${logRecipient} subject="${input.subject}" mode=${mode} error=${redact(reason, secrets)}`,
    );
    return { ok: false, mode };
  }
}
