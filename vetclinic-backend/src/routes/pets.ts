import { logAudit } from "../utils/audit";
import { getPaginationParams, paginatedResponse, searchFilter } from "../utils/pagination";
import { FastifyInstance } from "fastify";
import { z } from "zod";

const createPetSchema = z.object({
  name: z.string().min(1),
  species: z.enum(["DOG", "CAT", "BIRD", "RABBIT", "RODENT", "REPTILE", "OTHER"]),
  breed: z.string().optional(),
  sex: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional(),
  weightKg: z.number().positive().optional(),
});

const updatePetSchema = z.object({
  name: z.string().min(1).optional(),
  species: z.enum(["DOG", "CAT", "BIRD", "RABBIT", "RODENT", "REPTILE", "OTHER"]).optional(),
  breed: z.string().optional(),
  sex: z.enum(["MALE", "FEMALE", "UNKNOWN"]).optional(),
  weightKg: z.number().positive().optional(),
});

export default async function petsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/pets", async (request, reply) => {
    const { userId, role } = request.user;
    const query = request.query as { page?: string; limit?: string; search?: string };
    const { page, limit, skip } = getPaginationParams(query);

    const where = {
      ...(role === "CLIENT" ? { ownerId: userId } : {}),
      isActive: true,
      ...searchFilter(query.search, ["name", "breed"]),
    };

    const [pets, total] = await Promise.all([
      fastify.prisma.pet.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
      fastify.prisma.pet.count({ where }),
    ]);

    return reply.send(paginatedResponse(pets, total, page, limit));
  });

  fastify.post("/pets", {
    schema: {
      body: {
        type: "object",
        required: ["name", "species"],
        properties: {
          name: { type: "string", minLength: 1, examples: ["Rex"] },
          species: { type: "string", enum: ["DOG", "CAT", "BIRD", "RABBIT", "RODENT", "REPTILE", "OTHER"], examples: ["DOG"] },
          breed: { type: "string", examples: ["Berger Allemand"] },
          sex: { type: "string", enum: ["MALE", "FEMALE", "UNKNOWN"] },
          weightKg: { type: "number", examples: [25] },
        },
      },
    },
  }, async (request, reply) => {
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

  fastify.patch("/pets/:id", {
    schema: {
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          species: { type: "string", enum: ["DOG", "CAT", "BIRD", "RABBIT", "RODENT", "REPTILE", "OTHER"] },
          breed: { type: "string" },
          sex: { type: "string", enum: ["MALE", "FEMALE", "UNKNOWN"] },
          weightKg: { type: "number", minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const parsedBody = updatePetSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedBody.error.flatten() });
    }

    const { userId, role } = request.user;
    const pet = await fastify.prisma.pet.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, ownerId: true, isActive: true },
    });

    if (!pet) {
      return reply.code(404).send({ error: "Animal introuvable." });
    }

    if (!pet.isActive) {
      return reply.code(404).send({ error: "Animal supprimé." });
    }

    if (role === "CLIENT" && pet.ownerId !== userId) {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    const updated = await fastify.prisma.pet.update({
      where: { id: pet.id },
      data: parsedBody.data,
    });

    return reply.send({ pet: updated });
  });

  fastify.delete("/pets/:id", async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const { userId, role } = request.user;
    const pet = await fastify.prisma.pet.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, ownerId: true, isActive: true },
    });

    if (!pet) {
      return reply.code(404).send({ error: "Animal introuvable." });
    }

    if (!pet.isActive) {
      return reply.code(404).send({ error: "Animal déjà supprimé." });
    }

    if (role === "CLIENT" && pet.ownerId !== userId) {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    await fastify.prisma.pet.update({
      where: { id: pet.id },
      data: { isActive: false },
    });

    await logAudit(fastify.prisma, {
      userId: userId,
      action: "DELETE_PET",
      targetType: "Pet",
      targetId: pet.id,
    });

    return reply.send({ message: "Animal supprimé." });
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