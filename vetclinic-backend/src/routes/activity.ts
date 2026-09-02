import { FastifyInstance } from "fastify";
import { getPaginationParams, paginatedResponse, searchFilter } from "../utils/pagination";

const auditLogSelect = {
  id: true,
  userId: true,
  action: true,
  targetType: true,
  targetId: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
} as const;

export default async function activityRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/activity", async (request, reply) => {
    const { userId, role } = request.user;
    const query = request.query as { page?: string; limit?: string; search?: string; action?: string };
    const { page, limit, skip } = getPaginationParams(query);

    const baseWhere = role === "ADMIN" || role === "STAFF" ? {} : { userId };
    const searchWhere = query.action ? { action: { contains: query.action, mode: "insensitive" as const } } : {};

    const where = { ...baseWhere, ...searchWhere };

    const [logs, total] = await Promise.all([
      fastify.prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, select: auditLogSelect }),
      fastify.prisma.auditLog.count({ where }),
    ]);

    return reply.send(paginatedResponse(logs, total, page, limit));
  });

  fastify.get("/activity/stats", async (request, reply) => {
    const { userId, role } = request.user;
    const where = role === "ADMIN" || role === "STAFF" ? {} : { userId };

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalAllTime, last30Days, byAction] = await Promise.all([
      fastify.prisma.auditLog.count({ where }),
      fastify.prisma.auditLog.count({ where: { ...where, createdAt: { gte: thirtyDaysAgo } } }),
      fastify.prisma.auditLog.groupBy({
        by: ["action"],
        where: { ...where, createdAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
    ]);

    return reply.send({
      stats: {
        totalAllTime,
        last30Days,
        byAction: Object.fromEntries(byAction.map((a) => [a.action, a._count.id])),
      },
    });
  });
}
