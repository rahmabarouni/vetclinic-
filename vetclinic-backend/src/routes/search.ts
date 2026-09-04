import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function searchRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/search", async (request, reply) => {
    const { userId, role } = request.user;
    const query = request.query as { q?: string; limit?: string };
    const term = query.q?.trim();
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || "20", 10) || 20));

    if (!term) {
      return reply.code(400).send({ error: "Paramètre 'q' requis." });
    }

    const petWhere = {
      ...(role === "CLIENT" ? { ownerId: userId } : {}),
      OR: [
        { name: { contains: term, mode: "insensitive" as const } },
        { breed: { contains: term, mode: "insensitive" as const } },
      ],
    };

    const appointmentWhere = {
      ...(role === "CLIENT" ? { clientId: userId } : {}),
      OR: [
        { reason: { contains: term, mode: "insensitive" as const } },
      ],
    };

    const medicalRecordWhere = {
      ...(role === "CLIENT" ? { pet: { ownerId: userId } } : {}),
      OR: [
        { title: { contains: term, mode: "insensitive" as const } },
        { diagnosis: { contains: term, mode: "insensitive" as const } },
        { description: { contains: term, mode: "insensitive" as const } },
      ],
    };

    const [pets, appointments, medicalRecords] = await Promise.all([
      fastify.prisma.pet.findMany({
        where: petWhere,
        take: limit,
        select: { id: true, name: true, species: true, breed: true },
      }),
      fastify.prisma.appointment.findMany({
        where: appointmentWhere,
        take: limit,
        orderBy: { scheduledStart: "desc" },
        select: {
          id: true, appointmentType: true, status: true, scheduledStart: true, reason: true,
          pet: { select: { name: true, species: true } },
        },
      }),
      fastify.prisma.medicalRecord.findMany({
        where: medicalRecordWhere,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, recordType: true, title: true, diagnosis: true, createdAt: true,
          pet: { select: { name: true, species: true } },
        },
      }),
    ]);

    return reply.send({
      results: { pets, appointments, medicalRecords },
      total: pets.length + appointments.length + medicalRecords.length,
    });
  });
}
