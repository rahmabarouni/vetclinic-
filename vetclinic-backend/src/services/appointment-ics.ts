import { createEvent } from "ics";

/**
 * Référence stable d'un rendez-vous pour un calendrier externe.
 * On utilise l'id du rendez-vous comme UID : Google/Outlook mettent alors à
 * jour l'événement existant au lieu d'en créer un nouveau à chaque envoi.
 */
export function appointmentUid(appointmentId: string): string {
  return `${appointmentId}@vetclinic`;
}

export interface IcsAppointmentInput {
  appointmentId: string;
  /** 0 = création/confirmation, incrémenté à chaque modification. */
  sequence: number;
  title: string;
  description: string;
  location?: string;
  start: Date;
  end: Date;
  /** "CANCEL" produit un METHOD:CANCEL qui supprime l'événement côté client. */
  method?: "REQUEST" | "CANCEL";
  status?: "CONFIRMED" | "CANCELLED";
  organizerEmail?: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Le paquet `ics` accepte un DateArray `[y, m, d, h, min]` interprété en UTC
 * lorsque startInputType/outputType valent "utc". On construit donc le tableau
 * à partir des composantes UTC pour ne jamais décaler l'heure.
 */
function toUtcArray(date: Date): [number, number, number, number, number] {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
}

/**
 * Génère une pièce jointe .ics pour un rendez-vous.
 * - UID stable = id du rendez-vous ;
 * - SEQUENCE contrôlée par l'appelant ;
 * - METHOD:REQUEST (défaut) ou CANCEL ;
 * - alarme VALARM -P1D (rappel 1 jour avant).
 * Retourne null si la librairie refuse de générer l'événement.
 */
export function buildAppointmentIcs(input: IcsAppointmentInput): string | null {
  const method = input.method ?? "REQUEST";
  const { error, value } = createEvent({
    uid: appointmentUid(input.appointmentId),
    sequence: input.sequence,
    method,
    title: input.title,
    description: input.description,
    location: input.location ?? "Clinique vétérinaire VetClinic",
    start: toUtcArray(input.start),
    startInputType: "utc",
    startOutputType: "utc",
    end: toUtcArray(input.end),
    endInputType: "utc",
    endOutputType: "utc",
    status: input.status ?? (method === "CANCEL" ? "CANCELLED" : "CONFIRMED"),
    busyStatus: "BUSY",
    organizer: input.organizerEmail
      ? { name: "VetClinic", email: input.organizerEmail }
      : { name: "VetClinic", email: "no-reply@vetclinic.local" },
    alarms: [
      {
        action: "display",
        description: "Rappel : rendez-vous vétérinaire demain",
        trigger: { days: 1, before: true },
      },
    ],
  });

  if (error || !value) return null;
  return value;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Lien "Ajouter à Google Agenda" prêt à cliquer. Les dates sont au format
 * UTC compact attendu par Google (YYYYMMDDTHHMMSSZ).
 */
export function buildGoogleCalendarLink(input: {
  title: string;
  details?: string;
  location?: string;
  start: Date;
  end: Date;
}): string {
  const fmt = (date: Date) =>
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
      date.getUTCHours()
    )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${fmt(input.start)}/${fmt(input.end)}`,
  });
  if (input.details) params.set("details", input.details);
  if (input.location) params.set("location", input.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Utilitaire exposé pour les tests : nombre de millisecondes d'une heure. */
export const ONE_HOUR_MS = HOUR_MS;
