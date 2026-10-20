import { FastifyInstance } from "fastify";
import { sendEmail } from "./mailer";
import { buildAppointmentIcs, buildGoogleCalendarLink } from "./appointment-ics";

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
  /** Bouton "Ajouter à Google Agenda" (déposé après les lignes). */
  calendarUrl?: string;
  /** Pièce jointe .ics (confirmé, modifié, approuvé). */
  ics?: string;
  icsFilename?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(
  input: Omit<AppointmentEmailInput, "to" | "subject" | "ics" | "icsFilename">
): string {
  const items = input.lines.map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`).join("");
  const button = input.calendarUrl
    ? [
        `<p style="margin:18px 0;">`,
        `<a href="${escapeHtml(input.calendarUrl)}" style="display:inline-block;background:#4A7FC9;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">Ajouter à Google Agenda</a>`,
        `</p>`,
      ].join("")
    : "";
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;">`,
    `<h2 style="margin:0 0 14px;color:#4A7FC9;">${escapeHtml(input.heading)}</h2>`,
    items,
    button,
    input.footer ? `<p style="margin:18px 0 0;color:#6b7280;">${escapeHtml(input.footer)}</p>` : "",
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
  const textParts = [input.heading, "", ...input.lines];
  if (input.calendarUrl) textParts.push("", `Ajouter à Google Agenda : ${input.calendarUrl}`);
  if (input.footer) textParts.push("", input.footer);
  textParts.push("", "VetClinic");

  const text = textParts
    .filter((line, index, all) => !(line === "" && (index === 0 || all[index - 1] === "")))
    .join("\n");

  const result = await sendEmail({
    to: input.to,
    subject: input.subject,
    text,
    html: buildHtml(input),
    ics: input.ics,
    icsFilename: input.icsFilename,
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

export interface AppointmentEmailContext {
  appointmentId: string;
  /** Incrémenté à chaque modification pour que le calendrier mette à jour. */
  sequence?: number;
  petName: string;
  type: string;
  start: Date;
  end: Date;
  /** Note optionnelle : motif du refus, ancienne date, etc. */
  responseNote?: string | null;
  previousStart?: Date;
}

interface Template {
  subject: string;
  heading: string;
  lines: string[];
  footer?: string;
  withIcs?: boolean;
  icsMethod?: "REQUEST" | "CANCEL";
  icsStatus?: "CONFIRMED" | "CANCELLED";
}

/**
 * Construit le contenu (sujet, titre, lignes) d'un e-mail de rendez-vous.
 * Les données médicales sont volontairement exclues.
 */
export function buildAppointmentTemplate(
  kind:
    | "requested"
    | "confirmed"
    | "cancelled"
    | "updated"
    | "changeReceived"
    | "changeApproved"
    | "changeRejected"
    | "reminder",
  ctx: AppointmentEmailContext
): Template {
  const when = formatDisplayDateTime(ctx.start);
  const base: string[] = [`Animal : ${ctx.petName}`, `Date : ${when}`, `Type : ${ctx.type}`];

  switch (kind) {
    case "requested":
      return {
        subject: "Votre demande de rendez-vous a été enregistrée",
        heading: "Demande de rendez-vous enregistrée",
        lines: [...base],
        footer: "Votre rendez-vous est en attente de confirmation par la clinique.",
      };
    case "confirmed":
      return {
        subject: "Votre rendez-vous est confirmé",
        heading: "Rendez-vous confirmé",
        lines: [...base],
        footer: "Vous pouvez consulter ou modifier ce rendez-vous dans l'application VetClinic.",
        withIcs: true,
      };
    case "cancelled":
      return {
        subject: "Votre rendez-vous a été annulé",
        heading: "Rendez-vous annulé",
        lines: [...base],
        footer: "Si cette annulation n'était pas prévue, contactez la clinique.",
        withIcs: true,
        icsMethod: "CANCEL",
        icsStatus: "CANCELLED",
      };
    case "updated":
      return {
        subject: "Votre rendez-vous a été modifié par la clinique",
        heading: "Rendez-vous modifié",
        lines: [
          `Animal : ${ctx.petName}`,
          ...(ctx.previousStart
            ? [`Ancienne date : ${formatDisplayDateTime(ctx.previousStart)}`]
            : []),
          `Nouvelle date : ${when}`,
          `Type : ${ctx.type}`,
        ],
        footer: "Aucune donnée médicale n'est transmise par e-mail.",
        withIcs: true,
      };
    case "changeReceived":
      return {
        subject: "Nouvelle demande de modification de rendez-vous",
        heading: "Demande de modification",
        lines: [
          `Animal : ${ctx.petName}`,
          `Date proposée : ${when}`,
          `Type : ${ctx.type}`,
        ],
        footer: "Connectez-vous au tableau de bord pour approuver ou refuser cette demande.",
      };
    case "changeApproved":
      return {
        subject: "Votre demande de modification a été approuvée",
        heading: "Rendez-vous modifié",
        lines: [...base],
        footer: "Aucune donnée médicale n'est transmise par e-mail.",
        withIcs: true,
      };
    case "changeRejected":
      return {
        subject: "Votre demande de modification a été refusée",
        heading: "Demande de modification refusée",
        lines: [
          `Animal : ${ctx.petName}`,
          `Rendez-vous maintenu le : ${when}`,
          `Type : ${ctx.type}`,
          ...(ctx.responseNote ? [`Motif : ${ctx.responseNote}`] : []),
        ],
        footer: "Vous pouvez proposer un autre créneau depuis l'application.",
      };
    case "reminder":
      return {
        subject: "Rappel : votre rendez-vous est demain",
        heading: "Rappel de rendez-vous",
        lines: [...base],
        footer: "Votre rendez-vous vétérinaire a lieu demain. À bientôt !",
      };
  }
}

/**
 * Compose et envoie l'e-mail correspondant à un événement de rendez-vous.
 * Génère le .ics et le lien Google Agenda pour les événements confirmés,
 * modifiés ou approuvés. Ne bloque jamais la requête appelante.
 */
export async function sendAppointmentEventEmail(
  fastify: FastifyInstance,
  input: {
    kind: Parameters<typeof buildAppointmentTemplate>[0];
    to: string;
    ctx: AppointmentEmailContext;
  }
): Promise<boolean> {
  const template = buildAppointmentTemplate(input.kind, input.ctx);

  const ics = template.withIcs
    ? buildAppointmentIcs({
        appointmentId: input.ctx.appointmentId,
        sequence: input.ctx.sequence ?? 0,
        title: `RDV vétérinaire — ${input.ctx.petName}`,
        description: template.heading,
        start: input.ctx.start,
        end: input.ctx.end,
        method: template.icsMethod,
        status: template.icsStatus,
      })
    : null;

  const calendarUrl = template.withIcs
    ? buildGoogleCalendarLink({
        title: `RDV vétérinaire — ${input.ctx.petName}`,
        details: template.heading,
        start: input.ctx.start,
        end: input.ctx.end,
      })
    : undefined;

  return sendAppointmentEmail(fastify, {
    to: input.to,
    subject: template.subject,
    heading: template.heading,
    lines: template.lines,
    footer: template.footer,
    calendarUrl,
    ics: ics ?? undefined,
    icsFilename: ics ? `rdv-${input.ctx.appointmentId}.ics` : undefined,
  });
}
