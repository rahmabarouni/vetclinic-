import { FastifyInstance } from "fastify";

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.authorize(["VETERINARIAN", "ADMIN", "STAFF"]));

  fastify.get("/dashboard/stats", async (request, reply) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { veterinarianId } = request.query as { veterinarianId?: string };

    const [
      appointmentsByStatusToday,
      newClientsLast30Days,
      cancellationStats,
      appointmentTypesLast30Days,
      unreadMessages,
    ] = await Promise.all([
      fastify.prisma.appointment.groupBy({
        by: ["status"],
        where: {
          scheduledStart: { gte: todayStart, lt: todayEnd },
        },
        _count: { id: true },
      }),

      fastify.prisma.user.count({
        where: {
          role: "CLIENT",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),

      fastify.prisma.appointment.aggregate({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
      }).then(async (total) => {
        const cancelled = await fastify.prisma.appointment.count({
          where: {
            createdAt: { gte: thirtyDaysAgo },
            status: "CANCELLED",
          },
        });
        return {
          total: total._count.id,
          cancelled,
          rate: total._count.id > 0 ? Math.round((cancelled / total._count.id) * 100) : 0,
        };
      }),

      fastify.prisma.appointment.groupBy({
        by: ["appointmentType"],
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
      }),

      (async () => {
        const where: any = { isRead: false };
        if (veterinarianId) {
          const vet = await fastify.prisma.veterinarian.findUnique({
            where: { id: veterinarianId },
            select: { id: true },
          });
          if (vet) {
            const conversations = await fastify.prisma.conversation.findMany({
              where: { veterinarianId: vet.id },
              select: { id: true },
            });
            where.conversationId = { in: conversations.map((c) => c.id) };
          }
        }
        return fastify.prisma.message.count({ where });
      })(),
    ]);

    const stats = {
      appointmentsToday: {
        byStatus: Object.fromEntries(
          appointmentsByStatusToday.map((s) => [s.status, s._count.id])
        ),
        total: appointmentsByStatusToday.reduce((sum, s) => sum + s._count.id, 0),
      },
      newClientsLast30Days,
      cancellationRate: {
        total: cancellationStats.total,
        cancelled: cancellationStats.cancelled,
        rate: `${cancellationStats.rate}%`,
      },
      appointmentTypesLast30Days: Object.fromEntries(
        appointmentTypesLast30Days.map((t) => [t.appointmentType, t._count.id])
      ),
      unreadMessages,
    };

    return reply.send({ stats });
  });
}
