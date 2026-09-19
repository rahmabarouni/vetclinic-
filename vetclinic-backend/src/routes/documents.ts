import { logAudit } from "../utils/audit";
import { FastifyInstance } from "fastify";
import { DocumentType } from "@prisma/client";
import { z } from "zod";

const documentTypeValues = ["XRAY", "LAB_RESULT", "PRESCRIPTION", "PHOTO", "OTHER"] as const;

const createDocumentSchema = z.object({
  petId: z.string().uuid(),
  medicalRecordId: z.string().uuid().nullable().optional(),
  fileUrl: z.string().url(),
  fileType: z.enum(documentTypeValues),
  title: z.string().min(1),
});

const documentSelect = {
  id: true,
  petId: true,
  medicalRecordId: true,
  uploadedBy: true,
  fileUrl: true,
  fileType: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  pet: {
    select: {
      id: true,
      name: true,
      species: true,
      breed: true,
      sex: true,
      ownerId: true,
    },
  },
  medicalRecord: {
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
    },
  },
  uploader: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
} as const;

export default async function documentsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post(
    "/documents",
    {
      preHandler: [fastify.authorize(["VETERINARIAN", "ADMIN", "STAFF"])],
      schema: {
        body: {
          type: "object",
          required: ["petId", "fileUrl", "fileType", "title"],
          properties: {
            petId: { type: "string", format: "uuid" },
            medicalRecordId: { type: "string", format: "uuid", nullable: true },
            fileUrl: { type: "string", format: "uri" },
            fileType: { type: "string", enum: ["XRAY", "LAB_RESULT", "PRESCRIPTION", "PHOTO", "OTHER"] },
            title: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = createDocumentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
      }

      const pet = await fastify.prisma.pet.findUnique({
        where: { id: parsed.data.petId },
        select: { id: true },
      });

      if (!pet) {
        return reply.code(404).send({ error: "Animal introuvable." });
      }

      if (parsed.data.medicalRecordId) {
        const medicalRecord = await fastify.prisma.medicalRecord.findUnique({
          where: { id: parsed.data.medicalRecordId },
          select: { id: true, petId: true },
        });

        if (!medicalRecord || medicalRecord.petId !== parsed.data.petId) {
          return reply.code(400).send({ error: "Dossier médical invalide pour cet animal." });
        }
      }

      const document = await fastify.prisma.document.create({
        data: {
          petId: parsed.data.petId,
          medicalRecordId: parsed.data.medicalRecordId ?? null,
          uploadedBy: request.user.userId,
          fileUrl: parsed.data.fileUrl,
          fileType: parsed.data.fileType as DocumentType,
          title: parsed.data.title,
        },
        select: documentSelect,
      });

      await logAudit(fastify.prisma, {
        userId: request.user.userId,
        action: "CREATE_DOCUMENT",
        targetType: "Document",
        targetId: document.id,
      });

      return reply.code(201).send({ document });
    }
  );

  fastify.get("/pets/:id/documents", async (request, reply) => {
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

    const documents = await fastify.prisma.document.findMany({
      where: { petId: pet.id },
      orderBy: { createdAt: "desc" },
      select: documentSelect,
    });

    await logAudit(fastify.prisma, {
      userId: userId,
      action: "VIEW_DOCUMENTS",
      targetType: "Pet",
      targetId: parsedParams.data.id,
    });

    return reply.send({ documents });
  });
}
