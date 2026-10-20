import { FastifyInstance } from "fastify";
import { sendEmail } from "./mailer";

/**
 * Toutes les heures affichées aux utilisateurs le sont en Africa/Tunis,
 * conformément au cahier des charges. Le stockage reste en UTC.
 */
export const DISPLAY_TIME_ZONE = "Africa/Tunis";

export function formatDisplayDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export interface AppointmentEmailInput {
  to: string;
  subject: string;
  heading: string;
  /** Aucune donnée médicale ici : uniquement dates, type et statut. */
  lines: string[];
  footer?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml({ heading, lines, footer }: Omit<AppointmentEmailInput, "to" | "subject">): string {
  const items = lines.map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`).join("");
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;">`,
    `<h2 style="margin:0 0 14px;color:#4A7FC9;">${escapeHtml(heading)}</h2>`,
    items,
    footer ? `<p style="margin:18px 0 0;color:#6b7280;">${escapeHtml(footer)}</p>` : "",
    `<p style="margin:18px 0 0;color:#6b7280;">VetClinic</p>`,
    `</div>`,
  ].join("");
}

/**
 * Envoie un e-mail transactionnel lié à un rendez-vous. Un échec d'envoi est
 * journalisé sans jamais casser la requête appelante : le canal principal
 * reste la notification push.
 */
export async function sendAppointmentEmail(
  fastify: FastifyInstance,
  input: AppointmentEmailInput
): Promise<boolean> {
  const text = [input.heading, "", ...input.lines, "", input.footer ?? "", "VetClinic"]
    .filter((line, index, all) => !(line === "" && (index === 0 || all[index - 1] === "")))
    .join("\n");

  const result = await sendEmail({
    to: input.to,
    subject: input.subject,
    text,
    html: buildHtml(input),
  });

  if (!result.ok) {
    fastify.log.error(
      "E-mail RDV non envoyé to=%s subject=%s mode=%s",
      input.to,
      input.subject,
      result.mode
    );
  }

  return result.ok;
}
