import "dotenv/config";
import { buildApp } from "./app";
import { startReminderCron } from "./cron/reminders";
import { startAppointmentReminderCron } from "./cron/appointment-reminders";

async function start() {
  const fastify = await buildApp();

  startReminderCron(fastify.prisma);
  startAppointmentReminderCron(fastify);

  await fastify.listen({ port: 3000, host: "0.0.0.0" });
  console.log("🐾 Serveur démarré sur http://localhost:3000");
}

start();
