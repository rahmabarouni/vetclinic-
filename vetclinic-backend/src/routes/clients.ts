import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPaginationParams, paginatedResponse, searchFilter } from "../utils/pagination";
import { logAudit } from "../utils/audit";
import { appointmentSelect, toAppointmentDto } from "./appointments";

const clientSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export default async function clientsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.authorize(["VETERINARIAN", "ADMIN", "STAFF"]));

  fastify.get("/clients", async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; search?: string };
    const { page, limit, skip } = getPaginationParams(query);

    const where = {
      role: "CLIENT" as const,
      ...searchFilter(query.search, ["firstName", "lastName", "email", "phone"]),
    };

    const [clients, total] = await Promise.all([
      fastify.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          ...clientSelect,
          _count: { select: { pets: true, clientAppointments: true } },
        },
      }),
      fastify.prisma.user.count({ where }),
    ]);

    const data = clients.map((client) => {
      const { _count, ...rest } = client;
      return { ...rest, petsCount: _count.pets, appointmentsCount: _count.clientAppointments };
    });

    return reply.send(paginatedResponse(data, total, page, limit));
  });

  fastify.get("/clients/:id", async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const client = await fastify.prisma.user.findFirst({
      where: { id: parsedParams.data.id, role: "CLIENT" },
      select: {
        ...clientSelect,
        pets: {
          select: {
            id: true,
            name: true,
            species: true,
            breed: true,
            sex: true,
            birthDate: true,
            weightKg: true,
            photoUrl: true,
            isActive: true,
            createdAt: true,
            _count: { select: { medicalRecords: true, appointments: true, reminders: true, documents: true } },
          },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!client) {
      return reply.code(404).send({ error: "Client introuvable." });
    }

    const appointments = await fastify.prisma.appointment.findMany({
      where: { clientId: client.id },
      orderBy: { scheduledStart: "desc" },
      take: 50,
      select: appointmentSelect,
    });

    await logAudit(fastify.prisma, {
      userId: request.user.userId,
      action: "VIEW_CLIENT",
      targetType: "User",
      targetId: client.id,
    });

    const { pets, ...rest } = client;
    const petsWithCounts = pets.map((pet) => {
      const { _count, ...petRest } = pet;
      return {
        ...petRest,
        medicalRecordsCount: _count.medicalRecords,
        appointmentsCount: _count.appointments,
        remindersCount: _count.reminders,
        documentsCount: _count.documents,
      };
    });

    return reply.send({
      client: { ...rest, pets: petsWithCounts },
      appointments: appointments.map(toAppointmentDto),
    });
  });
}
