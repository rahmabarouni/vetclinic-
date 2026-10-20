import { FastifyInstance } from "fastify";
import { AppointmentStatus, AppointmentType } from "@prisma/client";
import { z } from "zod";
import { getPaginationParams, paginatedResponse, searchFilter } from "../utils/pagination";
import { notifyUser } from "../services/notify";
import { sendAppointmentEmail, formatDisplayDateTime } from "../services/appointment-emails";
import { petHasAvailabilityConflict, veterinarianHasAvailabilityConflict } from "../utils/availability";

const appointmentTypeValues = ["CONSULTATION", "VACCINATION", "SURGERY", "EMERGENCY", "CHECKUP", "GROOMING", "OTHER"] as const;
const appointmentStatusValues = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;

const createAppointmentSchema = z
  .object({
    petId: z.string().uuid(),
    clientId: z.string().uuid().optional(),
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

const patchAppointmentSchema = z
  .object({
    scheduledStart: z.coerce.date().optional(),
    scheduledEnd: z.coerce.date().optional(),
    appointmentType: z.enum(appointmentTypeValues).optional(),
    reason: z.string().min(1).optional(),
  })
  .refine(
    (data) =>
      data.scheduledStart !== undefined ||
      data.scheduledEnd !== undefined ||
      data.appointmentType !== undefined ||
      data.reason !== undefined,
    { message: "Au moins un champ à modifier est requis" }
  )
  .refine(
    (data) =>
      data.scheduledStart === undefined ||
      data.scheduledEnd === undefined ||
      data.scheduledEnd > data.scheduledStart,
    {
      message: "scheduledEnd doit être postérieur à scheduledStart",
      path: ["scheduledEnd"],
    }
  );

const updateAppointmentStatusSchema = z.object({
  status: z.enum(appointmentStatusValues),
});

export const pendingChangeRequestSelect = {
  id: true,
  proposedStart: true,
  proposedEnd: true,
  proposedType: true,
  proposedReason: true,
  status: true,
  createdAt: true,
  requestedById: true,
} as const;

export const appointmentSelect = {
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
  reminderSentAt: true,
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
  changeRequests: {
    where: { status: "PENDING" as const },
    select: pendingChangeRequestSelect,
  },
} as const;

type AppointmentWithPending = {
  changeRequests: { id: string }[];
  [key: string]: unknown;
};

/**
 * Le front attend `pendingChangeRequest` (objet ou null) et non la liste brute
 * des demandes : on ne garde que la demande en attente, filtrée côté Prisma.
 */
export function toAppointmentDto<T extends AppointmentWithPending>(
  appointment: T
): Omit<T, "changeRequests"> & { pendingChangeRequest: T["changeRequests"][number] | null } {
  const { changeRequests, ...rest } = appointment;
  return {
    ...rest,
    pendingChangeRequest: changeRequests?.[0] ?? null,
  };
}

async function veterinarianById(fastify: FastifyInstance, userId: string) {
  return fastify.prisma.veterinarian.findUnique({
    where: { userId },
    select: { id: true, userId: true },
  });
}

async function veterinarianProfileEmail(fastify: FastifyInstance, veterinarianId: string) {
  const veterinarian = await fastify.prisma.veterinarian.findUnique({
    where: { id: veterinarianId },
    select: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  return veterinarian?.user ?? null;
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
          clientId: { type: "string", format: "uuid" },
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
    const isStaff = role === "VETERINARIAN" || role === "ADMIN" || role === "STAFF";

    if (!isStaff && role !== "CLIENT") {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    let clientId: string;
    if (isStaff) {
      if (!parsed.data.clientId) {
        return reply.code(400).send({ error: "clientId est requis pour créer un rendez-vous pour un client." });
      }
      const client = await fastify.prisma.user.findFirst({
        where: { id: parsed.data.clientId, role: "CLIENT" },
        select: { id: true, email: true, firstName: true },
      });
      if (!client) {
        return reply.code(404).send({ error: "Client introuvable." });
      }
      clientId = client.id;
    } else {
      clientId = userId;
    }

    const pet = await fastify.prisma.pet.findFirst({
      where: {
        id: parsed.data.petId,
        ownerId: clientId,
      },
      select: { id: true, name: true },
    });

    if (!pet) {
      return reply.code(isStaff ? 404 : 403).send({
        error: isStaff ? "Animal introuvable pour ce client." : "Accès refusé.",
      });
    }

    const conflictingPetAppt = await petHasAvailabilityConflict(
      fastify,
      parsed.data.petId,
      parsed.data.scheduledStart,
      parsed.data.scheduledEnd
    );

    if (conflictingPetAppt) {
      return reply.code(409).send({ error: "Créneau déjà occupé pour cet animal." });
    }

    let veterinarianId = parsed.data.veterinarianId ?? null;
    if (!veterinarianId && role === "VETERINARIAN") {
      const ownProfile = await veterinarianById(fastify, userId);
      veterinarianId = ownProfile?.id ?? null;
    }

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
        clientId,
        veterinarianId,
        appointmentType: parsed.data.appointmentType as AppointmentType,
        status: isStaff ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING,
        scheduledStart: parsed.data.scheduledStart,
        scheduledEnd: parsed.data.scheduledEnd,
        reason: parsed.data.reason,
      },
      select: appointmentSelect,
    });

    const dto = toAppointmentDto(appointment);

    if (isStaff) {
      await notifyUser(fastify, {
        recipientId: clientId,
        type: "APPOINTMENT",
        title: "Nouveau rendez-vous confirmé",
        body: `${pet.name} — ${formatDisplayDateTime(appointment.scheduledStart)}`,
      }).catch((err) => fastify.log.error("Notification RDV client échouée: %s", String(err)));

      const client = await fastify.prisma.user.findUnique({
        where: { id: clientId },
        select: { email: true },
      });
      if (client?.email) {
        await sendAppointmentEmail(fastify, {
          to: client.email,
          subject: "Votre rendez-vous est confirmé",
          heading: "Rendez-vous confirmé",
          lines: [
            `Animal : ${pet.name}`,
            `Date : ${formatDisplayDateTime(appointment.scheduledStart)}`,
            `Type : ${appointment.appointmentType}`,
          ],
          footer: "Vous pouvez consulter ce rendez-vous dans l'application VetClinic.",
        });
      }
    } else if (appointment.veterinarian?.userId) {
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

    return reply.code(201).send({ appointment: dto });
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
      return reply.send(paginatedResponse(appointments.map(toAppointmentDto), total, page, limit));
    }

    if (role === "VETERINARIAN") {
      const veterinarian = await veterinarianById(fastify, userId);
      if (!veterinarian) {
        return reply.code(404).send({ error: "Profil vétérinaire introuvable." });
      }
      const where = { veterinarianId: veterinarian.id, ...searchWhere };
      const [appointments, total] = await Promise.all([
        fastify.prisma.appointment.findMany({ where, skip, take: limit, orderBy: { scheduledStart: "asc" }, select: appointmentSelect }),
        fastify.prisma.appointment.count({ where }),
      ]);
      return reply.send(paginatedResponse(appointments.map(toAppointmentDto), total, page, limit));
    }

    const where = { ...searchWhere };
    const [appointments, total] = await Promise.all([
      fastify.prisma.appointment.findMany({ where, skip, take: limit, orderBy: { scheduledStart: "asc" }, select: appointmentSelect }),
      fastify.prisma.appointment.count({ where }),
    ]);
    return reply.send(paginatedResponse(appointments.map(toAppointmentDto), total, page, limit));
  });

  fastify.patch(
    "/appointments/:id",
    {
      preHandler: [fastify.authorize(["VETERINARIAN", "ADMIN", "STAFF"])],
      schema: {
        body: {
          type: "object",
          properties: {
            scheduledStart: { type: "string", format: "date-time" },
            scheduledEnd: { type: "string", format: "date-time" },
            appointmentType: { type: "string", enum: ["CONSULTATION", "VACCINATION", "SURGERY", "EMERGENCY", "CHECKUP", "GROOMING", "OTHER"] },
            reason: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
      }

      const parsedBody = patchAppointmentSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsedBody.error.flatten() });
      }

      const { userId, role } = request.user;

      const appointment = await fastify.prisma.appointment.findUnique({
        where: { id: parsedParams.data.id },
        select: {
          id: true,
          petId: true,
          clientId: true,
          veterinarianId: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          pet: { select: { name: true } },
          client: { select: { email: true, firstName: true, lastName: true } },
        },
      });

      if (!appointment) {
        return reply.code(404).send({ error: "Rendez-vous introuvable." });
      }

      if (role === "VETERINARIAN") {
        const ownProfile = await veterinarianById(fastify, userId);
        if (!ownProfile || appointment.veterinarianId !== ownProfile.id) {
          return reply.code(404).send({ error: "Rendez-vous introuvable." });
        }
      }

      if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
        return reply.code(409).send({ error: "Ce rendez-vous ne peut plus être modifié." });
      }

      const now = new Date();
      if (appointment.scheduledStart <= now) {
        return reply.code(409).send({ error: "Un rendez-vous passé ne peut pas être modifié." });
      }

      const nextStart = parsedBody.data.scheduledStart ?? appointment.scheduledStart;
      const nextEnd = parsedBody.data.scheduledEnd ?? appointment.scheduledEnd;
      const nextType = parsedBody.data.appointmentType ?? undefined;
      const nextReason = parsedBody.data.reason;

      const timeChanged =
        nextStart.getTime() !== appointment.scheduledStart.getTime() ||
        nextEnd.getTime() !== appointment.scheduledEnd.getTime();

      if (timeChanged) {
        if (nextEnd <= nextStart) {
          return reply.code(400).send({ error: "scheduledEnd doit être postérieur à scheduledStart" });
        }

        if (appointment.veterinarianId) {
          const vetConflict = await veterinarianHasAvailabilityConflict(
            fastify,
            appointment.veterinarianId,
            nextStart,
            nextEnd,
            appointment.id
          );
          if (vetConflict) {
            return reply.code(409).send({ error: "Créneau déjà occupé." });
          }
        }

        const petConflict = await petHasAvailabilityConflict(
          fastify,
          appointment.petId,
          nextStart,
          nextEnd,
          appointment.id
        );
        if (petConflict) {
          return reply.code(409).send({ error: "Créneau déjà occupé pour cet animal." });
        }
      }

      const updated = await fastify.prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          ...(parsedBody.data.scheduledStart ? { scheduledStart: parsedBody.data.scheduledStart } : {}),
          ...(parsedBody.data.scheduledEnd ? { scheduledEnd: parsedBody.data.scheduledEnd } : {}),
          ...(nextType ? { appointmentType: nextType as AppointmentType } : {}),
          ...(parsedBody.data.reason !== undefined ? { reason: parsedBody.data.reason } : {}),
        },
        select: appointmentSelect,
      });

      const changedLines = [
        `Animal : ${appointment.pet?.name ?? "—"}`,
        `Nouvelle date : ${formatDisplayDateTime(updated.scheduledStart)}`,
        `Type : ${updated.appointmentType}`,
      ];

      await notifyUser(fastify, {
        recipientId: appointment.clientId,
        type: "APPOINTMENT",
        title: "Rendez-vous mis à jour par le vétérinaire",
        body: `${appointment.pet?.name ?? "RDV"} — ${formatDisplayDateTime(updated.scheduledStart)}`,
      }).catch((err) => fastify.log.error("Notification mise à jour RDV échouée: %s", String(err)));

      if (appointment.client.email) {
        await sendAppointmentEmail(fastify, {
          to: appointment.client.email,
          subject: "Votre rendez-vous a été mis à jour",
          heading: "Rendez-vous mis à jour",
          lines: changedLines,
          footer: "Aucune donnée médicale n'est transmise par e-mail.",
        });
      }

      return reply.send({ appointment: toAppointmentDto(updated) });
    }
  );

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

      return reply.send({ appointment: toAppointmentDto(updatedAppointment) });
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

    return reply.send({ appointment: toAppointmentDto(cancelledAppointment) });
  });
}
