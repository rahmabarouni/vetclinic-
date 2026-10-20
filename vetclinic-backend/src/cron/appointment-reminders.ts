import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { notifyUser } from "../services/notify";
import { formatDisplayDateTime, sendAppointmentEventEmail } from "../services/appointment-emails";

/** Toutes les 20 minutes : assez fréquent pour un rappel J-1 fiable. */
const CRON_SCHEDULE = process.env.APPOINTMENT_REMINDER_CRON || "*/20 * * * *";

const DEFAULT_WINDOW_HOURS = 24;

export interface ReminderRunResult {
  scanned: number;
  sent: number;
}

/**
 * Envoie un rappel aux rendez-vous CONFIRMED à venir dans ~24 h dont
 * `reminderSentAt` est encore vide. Idempotent : `reminderSentAt` est renseigné
 * juste après l'envoi, et un rendez-vous déjà rappelé est ignoré. Les
 * rendez-vous annulés/terminés ne sont jamais sélectionnés.
 */
export async function runAppointmentReminders(
  fastify: FastifyInstance,
  options: { windowHours?: number; now?: Date } = {}
): Promise<ReminderRunResult> {
  const now = options.now ?? new Date();
  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

  const due = await fastify.prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      scheduledStart: { gt: now, lte: windowEnd },
    },
    select: {
      id: true,
      appointmentType: true,
      scheduledStart: true,
      scheduledEnd: true,
      pet: { select: { name: true } },
      client: { select: { id: true, email: true, firstName: true } },
    },
  });

  let sent = 0;

  for (const appointment of due) {
    await notifyUser(fastify, {
      recipientId: appointment.client.id,
      type: "APPOINTMENT",
      title: "Rappel : rendez-vous demain",
      body: `${appointment.pet?.name ?? "Votre animal"} — ${formatDisplayDateTime(appointment.scheduledStart)}`,
    }).catch((err) => fastify.log.error("Notification rappel J-1 échouée: %s", String(err)));

    if (appointment.client.email) {
      await sendAppointmentEventEmail(fastify, {
        kind: "reminder",
        to: appointment.client.email,
        ctx: {
          appointmentId: appointment.id,
          petName: appointment.pet?.name ?? "—",
          type: appointment.appointmentType,
          start: appointment.scheduledStart,
          end: appointment.scheduledEnd,
        },
      });
    }

    // Idempotence : on marque même si l'e-mail a échoué, pour ne pas boucler.
    await fastify.prisma.appointment.update({
      where: { id: appointment.id },
      data: { reminderSentAt: new Date() },
    });

    sent++;
  }

  return { scanned: due.length, sent };
}

export function startAppointmentReminderCron(
  fastify: FastifyInstance
): void {
  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      const result = await runAppointmentReminders(fastify);
      if (result.sent > 0) {
        console.log(`[Cron] ${result.sent} rappel(s) J-1 envoyé(s).`);
      }
    } catch (err) {
      console.error("[Cron] Erreur rappels J-1:", err);
    }
  });

  console.log(`[Cron] Job rappels J-1 démarré — planification: ${CRON_SCHEDULE}`);
}
