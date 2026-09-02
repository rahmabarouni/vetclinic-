import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

const CRON_SCHEDULE = process.env.REMINDER_CRON_SCHEDULE || "0 8 * * *"; // tous les jours à 8h

export function startReminderCron(prisma: PrismaClient): void {
  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const dueReminders = await prisma.reminder.findMany({
        where: {
          dueDate: { lte: in7Days },
          notifiedAt: null,
          isCompleted: false,
        },
        include: {
          pet: {
            select: {
              id: true,
              name: true,
              ownerId: true,
            },
          },
        },
      });

      if (dueReminders.length === 0) {
        return;
      }

      let created = 0;
      for (const reminder of dueReminders) {
        await prisma.notification.create({
          data: {
            recipientId: reminder.pet.ownerId,
            type: "REMINDER",
            title: `Rappel: ${reminder.title}`,
            message: `Le rappel "${reminder.title}" pour ${reminder.pet.name} est prévu le ${reminder.dueDate.toLocaleDateString("fr-FR")}.`,
          },
        });

        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { notifiedAt: now },
        });

        created++;
      }

      console.log(`[Cron] ${created} rappel(s) traité(s) — notifications créées.`);
    } catch (err) {
      console.error("[Cron] Erreur lors du traitement des rappels:", err);
    }
  });

  console.log(`[Cron] Job de rappels démarré — planification: ${CRON_SCHEDULE}`);
}
