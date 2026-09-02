import { FastifyInstance } from "fastify";
import { z } from "zod";

const notificationSelect = {
  id: true,
  recipientId: true,
  type: true,
  title: true,
  message: true,
  isRead: true,
  readAt: true,
  createdAt: true,
  updatedAt: true,
  recipient: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
} as const;

export default async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/notifications", async (request, reply) => {
    const { userId, role } = request.user;

    const notifications = await fastify.prisma.notification.findMany({
      where: role === "ADMIN" || role === "STAFF" ? undefined : { recipientId: userId },
      orderBy: { createdAt: "desc" },
      select: notificationSelect,
    });

    return reply.send({ notifications });
  });

  fastify.patch("/notifications/:id/read", async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const { userId, role } = request.user;
    const notification = await fastify.prisma.notification.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, recipientId: true, isRead: true },
    });

    if (!notification) {
      return reply.code(404).send({ error: "Notification introuvable." });
    }

    if (role !== "ADMIN" && role !== "STAFF" && notification.recipientId !== userId) {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    const updatedNotification = await fastify.prisma.notification.update({
      where: { id: notification.id },
      data: {
        isRead: true,
        readAt: notification.isRead ? undefined : new Date(),
      },
      select: notificationSelect,
    });

    return reply.send({ notification: updatedNotification });
  });
}
