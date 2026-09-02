import { logAudit } from "../utils/audit";
import { FastifyInstance } from "fastify";
import { z } from "zod";

const createPetSchema = z.object({
  name: z.string().min(1),
  species: z.enum(["DOG", "CAT", "BIRD", "RABBIT", "RODENT", "REPTILE", "OTHER"]),
  breed: z.string().optional(),
  sex: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional(),
  weightKg: z.number().positive().optional(),
});

export default async function petsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/pets", async (request, reply) => {
    const { userId } = request.user;
    const pets = await fastify.prisma.pet.findMany({ where: { ownerId: userId } });
    return reply.send({ pets });
  });

  fastify.post("/pets", async (request, reply) => {
    const { userId } = request.user;
    const parsed = createPetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid data", details: parsed.error.flatten() });
    }

    const pet = await fastify.prisma.pet.create({
      data: { ...parsed.data, ownerId: userId },
    });

    return reply.code(201).send({ pet });
  });

  fastify.get("/pets/:id/medical-records", async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const { userId, role } = request.user;
    const pet = await fastify.prisma.pet.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, ownerId: true },
    });

    if (!pet) {
      return reply.code(404).send({ error: "Animal introuvable." });
    }

    if (role === "CLIENT" && pet.ownerId !== userId) {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    const medicalRecords = await fastify.prisma.medicalRecord.findMany({
      where: { petId: pet.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        petId: true,
        appointmentId: true,
        veterinarianId: true,
        recordType: true,
        title: true,
        description: true,
        diagnosis: true,
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
        appointment: {
          select: {
            id: true,
            petId: true,
            clientId: true,
            veterinarianId: true,
            appointmentType: true,
            status: true,
            scheduledStart: true,
            scheduledEnd: true,
            reason: true,
            cancellationReason: true,
          },
        },
      },
    });

    await logAudit(fastify.prisma, {
      userId: userId,
      action: "VIEW_MEDICAL_RECORD",
      targetType: "Pet",
      targetId: parsedParams.data.id,
    });

    return reply.send({ medicalRecords });
  });
}