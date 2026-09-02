import { FastifyInstance } from "fastify";
import { z } from "zod";

const createTimeSlotBlockSchema = z
  .object({
    veterinarianId: z.string().uuid(),
    startDatetime: z.coerce.date(),
    endDatetime: z.coerce.date(),
    reason: z.string().min(1).optional(),
    isRecurring: z.boolean().optional(),
  })
  .refine((data) => data.endDatetime > data.startDatetime, {
    message: "endDatetime doit être postérieur à startDatetime",
    path: ["endDatetime"],
  });

const blockSelect = {
  id: true,
  veterinarianId: true,
  startDatetime: true,
  endDatetime: true,
  reason: true,
  isRecurring: true,
  createdAt: true,
  updatedAt: true,
  veterinarian: {
    select: {
      id: true,
      userId: true,
      specialty: true,
      bio: true,
      isAvailableForBooking: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  },
} as const;

export default async function timeSlotBlockRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.authorize(["VETERINARIAN", "ADMIN", "STAFF"]));

  fastify.post("/time-slot-blocks", async (request, reply) => {
    const parsed = createTimeSlotBlockSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const veterinarian = await fastify.prisma.veterinarian.findUnique({
      where: { id: parsed.data.veterinarianId },
      select: { id: true },
    });

    if (!veterinarian) {
      return reply.code(404).send({ error: "Vétérinaire introuvable." });
    }

    const overlappingBlock = await fastify.prisma.timeSlotBlock.findFirst({
      where: {
        veterinarianId: parsed.data.veterinarianId,
        startDatetime: {
          lt: parsed.data.endDatetime,
        },
        endDatetime: {
          gt: parsed.data.startDatetime,
        },
      },
      select: { id: true },
    });

    if (overlappingBlock) {
      return reply.code(409).send({ error: "Créneau déjà bloqué." });
    }

    const timeSlotBlock = await fastify.prisma.timeSlotBlock.create({
      data: {
        veterinarianId: parsed.data.veterinarianId,
        startDatetime: parsed.data.startDatetime,
        endDatetime: parsed.data.endDatetime,
        reason: parsed.data.reason,
        isRecurring: parsed.data.isRecurring ?? false,
      },
      select: blockSelect,
    });

    return reply.code(201).send({ timeSlotBlock });
  });

  fastify.get("/time-slot-blocks", async (_request, reply) => {
    const timeSlotBlocks = await fastify.prisma.timeSlotBlock.findMany({
      orderBy: { startDatetime: "asc" },
      select: blockSelect,
    });

    return reply.send({ timeSlotBlocks });
  });

  fastify.delete("/time-slot-blocks/:id", async (request, reply) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const timeSlotBlock = await fastify.prisma.timeSlotBlock.findUnique({
      where: { id: parsed.data.id },
      select: { id: true },
    });

    if (!timeSlotBlock) {
      return reply.code(404).send({ error: "Blocage introuvable." });
    }

    await fastify.prisma.timeSlotBlock.delete({ where: { id: parsed.data.id } });

    return reply.code(204).send();
  });
}
