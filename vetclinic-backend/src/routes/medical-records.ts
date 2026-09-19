import { logAudit } from "../utils/audit";
import { FastifyInstance } from "fastify";
import { MedicalRecordType, ReminderType } from "@prisma/client";
import { z } from "zod";

const medicalRecordTypeValues = ["CONSULTATION", "VACCINATION", "SURGERY", "TREATMENT", "ALLERGY", "OTHER"] as const;

const createMedicalRecordSchema = z.object({
  petId: z.string().uuid(),
  appointmentId: z.string().uuid().nullable().optional(),
  veterinarianId: z.string().uuid(),
  recordType: z.enum(medicalRecordTypeValues),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  diagnosis: z.string().min(1).optional(),
});

const medicalRecordSelect = {
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
} as const;

const reminderSelect = {
  id: true,
  petId: true,
  medicalRecordId: true,
  reminderType: true,
  title: true,
  dueDate: true,
  notifiedAt: true,
  isCompleted: true,
  createdAt: true,
  updatedAt: true,
} as const;

function twelveMonthsFrom(date: Date) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 12);
  return result;
}

export default async function medicalRecordsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.authorize(["VETERINARIAN", "ADMIN", "STAFF"]));

  fastify.post("/medical-records", {
    schema: {
      body: {
        type: "object",
        required: ["petId", "veterinarianId", "recordType", "title"],
        properties: {
          petId: { type: "string", format: "uuid" },
          appointmentId: { type: "string", format: "uuid", nullable: true },
          veterinarianId: { type: "string", format: "uuid" },
          recordType: { type: "string", enum: ["CONSULTATION", "VACCINATION", "SURGERY", "TREATMENT", "ALLERGY", "OTHER"] },
          title: { type: "string", minLength: 1 },
          description: { type: "string" },
          diagnosis: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const parsed = createMedicalRecordSchema.safeParse(request.body);
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

    const veterinarian = await fastify.prisma.veterinarian.findUnique({
      where: { id: parsed.data.veterinarianId },
      select: { id: true },
    });

    if (!veterinarian) {
      return reply.code(404).send({ error: "Vétérinaire introuvable." });
    }

    if (parsed.data.appointmentId) {
      const appointment = await fastify.prisma.appointment.findUnique({
        where: { id: parsed.data.appointmentId },
        select: { id: true, petId: true },
      });

      if (!appointment || appointment.petId !== parsed.data.petId) {
        return reply.code(400).send({ error: "Rendez-vous invalide pour cet animal." });
      }
    }

    const medicalRecord = await fastify.prisma.medicalRecord.create({
      data: {
        petId: parsed.data.petId,
        appointmentId: parsed.data.appointmentId ?? null,
        veterinarianId: parsed.data.veterinarianId,
        recordType: parsed.data.recordType as MedicalRecordType,
        title: parsed.data.title,
        description: parsed.data.description,
        diagnosis: parsed.data.diagnosis,
      },
      select: medicalRecordSelect,
    });

    let reminder = null;
    if (parsed.data.recordType === "VACCINATION") {
      reminder = await fastify.prisma.reminder.create({
        data: {
          petId: parsed.data.petId,
          medicalRecordId: medicalRecord.id,
          reminderType: ReminderType.VACCINE,
          title: `Rappel vaccin: ${parsed.data.title}`,
          dueDate: twelveMonthsFrom(medicalRecord.createdAt),
        },
        select: reminderSelect,
      });
    }

    await logAudit(fastify.prisma, {
      userId: request.user.userId,
      action: "CREATE_MEDICAL_RECORD",
      targetType: "MedicalRecord",
      targetId: medicalRecord.id,
    });

    return reply.code(201).send({ medicalRecord, reminder });
  });
}
