import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPaginationParams, paginatedResponse } from "../utils/pagination";

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
} as const;

export default async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/notifications", async (request, reply) => {
    const { userId, role } = request.user;
    const query = request.query as { page?: string; limit?: string };
    const { page, limit, skip } = getPaginationParams(query);

    const where = role === "ADMIN" || role === "STAFF" ? undefined : { recipientId: userId };

    const [notifications, total] = await Promise.all([
      fastify.prisma.notification.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, select: notificationSelect }),
      fastify.prisma.notification.count({ where }),
    ]);

    return reply.send(paginatedResponse(notifications, total, page, limit));
  });

  fastify.get("/notifications/unread-count", async (request, reply) => {
    const { userId, role } = request.user;
    const where = role === "ADMIN" || role === "STAFF"
      ? { isRead: false }
      : { recipientId: userId, isRead: false };

    const count = await fastify.prisma.notification.count({ where });
    return reply.send({ count });
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

  fastify.patch("/notifications/read-all", async (request, reply) => {
    const { userId, role } = request.user;
    const where = role === "ADMIN" || role === "STAFF"
      ? { isRead: false }
      : { recipientId: userId, isRead: false };

    const result = await fastify.prisma.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    return reply.send({ updated: result.count });
  });

  fastify.delete("/notifications/:id", async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const { userId, role } = request.user;
    const notification = await fastify.prisma.notification.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, recipientId: true },
    });

    if (!notification) {
      return reply.code(404).send({ error: "Notification introuvable." });
    }

    if (role !== "ADMIN" && role !== "STAFF" && notification.recipientId !== userId) {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    await fastify.prisma.notification.delete({ where: { id: notification.id } });
    return reply.send({ message: "Notification supprimée." });
  });

  fastify.patch("/notifications/mark-read", async (request, reply) => {
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const { userId, role } = request.user;

    const where = role === "ADMIN" || role === "STAFF"
      ? { id: { in: parsed.data.ids } }
      : { id: { in: parsed.data.ids }, recipientId: userId };

    const result = await fastify.prisma.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    return reply.send({ updated: result.count });
  });
}
