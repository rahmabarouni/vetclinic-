import { FastifyInstance } from "fastify";
import { AppointmentStatus, AppointmentType } from "@prisma/client";
import { z } from "zod";
import { getPaginationParams, paginatedResponse, searchFilter } from "../utils/pagination";
import { notifyUser } from "../services/notify";

const appointmentTypeValues = ["CONSULTATION", "VACCINATION", "SURGERY", "EMERGENCY", "CHECKUP", "GROOMING", "OTHER"] as const;
const appointmentStatusValues = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;

const createAppointmentSchema = z
  .object({
    petId: z.string().uuid(),
    veterinarianId: z.string().uuid().nullable().optional(),
    appointmentType: z.enum(appointmentTypeValues),
    scheduledStart: z.coerce.date(),
    scheduledEnd: z.coerce.date(),
    reason: z.string().min(1).optional(),
  })
  .refine((data) => data.scheduledEnd > data.scheduledStart, {
    message: "scheduledEnd doit être postérieur à scheduledStart",
    path: ["scheduledEnd"],
  });

const updateAppointmentStatusSchema = z.object({
  status: z.enum(appointmentStatusValues),
});

const appointmentSelect = {
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
  client: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
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
  medicalRecord: {
    select: {
      id: true,
    },
  },
} as const;

function overlaps(existingStart: Date, existingEnd: Date, nextStart: Date, nextEnd: Date) {
  return existingStart < nextEnd && existingEnd > nextStart;
}

async function veterinarianHasAvailabilityConflict(
  fastify: FastifyInstance,
  veterinarianId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeAppointmentId?: string
) {
  const conflictingAppointment = await fastify.prisma.appointment.findFirst({
    where: {
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      veterinarianId,
      status: {
        in: ["PENDING", "CONFIRMED"],
      },
      scheduledStart: {
        lt: scheduledEnd,
      },
      scheduledEnd: {
        gt: scheduledStart,
      },
    },
    select: { id: true },
  });

  if (conflictingAppointment) {
    return true;
  }

  const conflictingBlock = await fastify.prisma.timeSlotBlock.findFirst({
    where: {
      veterinarianId,
      startDatetime: {
        lt: scheduledEnd,
      },
      endDatetime: {
        gt: scheduledStart,
      },
    },
    select: { id: true },
  });

  return Boolean(conflictingBlock);
}

export default async function appointmentsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post("/appointments", {
    schema: {
      body: {
        type: "object",
        required: ["petId", "appointmentType", "scheduledStart", "scheduledEnd"],
        properties: {
          petId: { type: "string", format: "uuid" },
          veterinarianId: { type: "string", format: "uuid", nullable: true },
          appointmentType: { type: "string", enum: ["CONSULTATION", "VACCINATION", "SURGERY", "EMERGENCY", "CHECKUP", "GROOMING", "OTHER"] },
          scheduledStart: { type: "string", format: "date-time" },
          scheduledEnd: { type: "string", format: "date-time" },
          reason: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const parsed = createAppointmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const { userId, role } = request.user;
    if (role !== "CLIENT") {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    const pet = await fastify.prisma.pet.findFirst({
      where: {
        id: parsed.data.petId,
        ownerId: userId,
      },
      select: { id: true },
    });

    if (!pet) {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    const conflictingPetAppt = await fastify.prisma.appointment.findFirst({
      where: {
        petId: parsed.data.petId,
        status: { in: ["PENDING", "CONFIRMED"] },
        scheduledStart: { lt: parsed.data.scheduledEnd },
        scheduledEnd: { gt: parsed.data.scheduledStart },
      },
      select: { id: true },
    });

    if (conflictingPetAppt) {
      return reply.code(409).send({ error: "Créneau déjà occupé pour cet animal." });
    }

    const veterinarianId = parsed.data.veterinarianId ?? null;
    if (veterinarianId) {
      const veterinarian = await fastify.prisma.veterinarian.findUnique({
        where: { id: veterinarianId },
        select: { id: true },
      });

      if (!veterinarian) {
        return reply.code(404).send({ error: "Vétérinaire introuvable." });
      }

      const hasConflict = await veterinarianHasAvailabilityConflict(
        fastify,
        veterinarianId,
        parsed.data.scheduledStart,
        parsed.data.scheduledEnd
      );

      if (hasConflict) {
        return reply.code(409).send({ error: "Créneau déjà occupé." });
      }
    }

    const appointment = await fastify.prisma.appointment.create({
      data: {
        petId: parsed.data.petId,
        clientId: userId,
        veterinarianId,
        appointmentType: parsed.data.appointmentType as AppointmentType,
        status: AppointmentStatus.PENDING,
        scheduledStart: parsed.data.scheduledStart,
        scheduledEnd: parsed.data.scheduledEnd,
        reason: parsed.data.reason,
      },
      select: appointmentSelect,
    });

    if (appointment.veterinarian?.userId) {
      try {
        await notifyUser(fastify, {
          recipientId: appointment.veterinarian.userId,
          type: "APPOINTMENT",
          title: "Nouvelle demande de rendez-vous",
          body: `${appointment.pet?.name ?? "Un animal"} — ${appointment.appointmentType}`,
        });
      } catch (err) {
        fastify.log.error("Notification RDV échouée: %s", String(err));
      }
    }

    return reply.code(201).send({ appointment });
  });

  fastify.get("/appointments", async (request, reply) => {
    const { userId, role } = request.user;
    const query = request.query as { page?: string; limit?: string; search?: string };
    const { page, limit, skip } = getPaginationParams(query);

    const searchWhere = searchFilter(query.search, ["reason"]);

    if (role === "CLIENT") {
      const where = { clientId: userId, ...searchWhere };
      const [appointments, total] = await Promise.all([
        fastify.prisma.appointment.findMany({ where, skip, take: limit, orderBy: { scheduledStart: "asc" }, select: appointmentSelect }),
        fastify.prisma.appointment.count({ where }),
      ]);
      return reply.send(paginatedResponse(appointments, total, page, limit));
    }

    if (role === "VETERINARIAN") {
      const veterinarian = await fastify.prisma.veterinarian.findUnique({ where: { userId }, select: { id: true } });
      if (!veterinarian) {
        return reply.code(404).send({ error: "Profil vétérinaire introuvable." });
      }
      const where = { veterinarianId: veterinarian.id, ...searchWhere };
      const [appointments, total] = await Promise.all([
        fastify.prisma.appointment.findMany({ where, skip, take: limit, orderBy: { scheduledStart: "asc" }, select: appointmentSelect }),
        fastify.prisma.appointment.count({ where }),
      ]);
      return reply.send(paginatedResponse(appointments, total, page, limit));
    }

    const where = { ...searchWhere };
    const [appointments, total] = await Promise.all([
      fastify.prisma.appointment.findMany({ where, skip, take: limit, orderBy: { scheduledStart: "asc" }, select: appointmentSelect }),
      fastify.prisma.appointment.count({ where }),
    ]);
    return reply.send(paginatedResponse(appointments, total, page, limit));
  });

  fastify.patch(
    "/appointments/:id/status",
    {
      preHandler: [fastify.authorize(["VETERINARIAN", "ADMIN", "STAFF"])],
      schema: {
        body: {
          type: "object",
          required: ["status"],
          properties: {
            status: { type: "string", enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] },
          },
        },
      },
    },
    async (request, reply) => {
      const parsedBody = updateAppointmentStatusSchema.safeParse(request.body);
      if (!parsedBody.success) {
          return reply.code(400).send({ error: "Données invalides", details: parsedBody.error.flatten() });
      }

      const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!parsedParams.success) {
          return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
      }

      const appointment = await fastify.prisma.appointment.findUnique({
        where: { id: parsedParams.data.id },
        select: {
          id: true,
          veterinarianId: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
        },
      });

      if (!appointment) {
        return reply.code(404).send({ error: "Rendez-vous introuvable." });
      }

      if (parsedBody.data.status === "CONFIRMED" && appointment.veterinarianId) {
        const hasConflict = await veterinarianHasAvailabilityConflict(
          fastify,
          appointment.veterinarianId,
          appointment.scheduledStart,
          appointment.scheduledEnd,
          appointment.id
        );

        if (hasConflict) {
          return reply.code(409).send({ error: "Créneau déjà occupé." });
        }
      }

      const updatedAppointment = await fastify.prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: parsedBody.data.status },
        select: appointmentSelect,
      });

      try {
        await notifyUser(fastify, {
          recipientId: updatedAppointment.clientId,
          type: "APPOINTMENT",
          title: "Statut du rendez-vous mis à jour",
          body: `${updatedAppointment.pet?.name ?? "RDV"} — ${parsedBody.data.status}`,
        });
      } catch (err) {
        fastify.log.error("Notification statut RDV échouée: %s", String(err));
      }

      return reply.send({ appointment: updatedAppointment });
    }
  );

  fastify.delete("/appointments/:id", async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const { userId, role } = request.user;
    if (role !== "CLIENT") {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    const appointment = await fastify.prisma.appointment.findFirst({
      where: {
        id: parsedParams.data.id,
        clientId: userId,
      },
      select: { id: true, status: true },
    });

    if (!appointment) {
      return reply.code(404).send({ error: "Rendez-vous introuvable." });
    }

    const cancelledAppointment = await fastify.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED" },
      select: appointmentSelect,
    });

    return reply.send({ appointment: cancelledAppointment });
  });
}
