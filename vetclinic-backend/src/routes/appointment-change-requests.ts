import { FastifyInstance } from "fastify";
import { AppointmentChangeRequestStatus, AppointmentType } from "@prisma/client";
import { z } from "zod";
import { getPaginationParams, paginatedResponse } from "../utils/pagination";
import { notifyUser } from "../services/notify";
import {
  formatDisplayDateTime,
  sendAppointmentEventEmail,
} from "../services/appointment-emails";
import { petHasAvailabilityConflict, veterinarianHasAvailabilityConflict } from "../utils/availability";

const appointmentTypeValues = ["CONSULTATION", "VACCINATION", "SURGERY", "EMERGENCY", "CHECKUP", "GROOMING", "OTHER"] as const;
const changeRequestStatusValues = ["PENDING", "APPROVED", "REJECTED"] as const;

const createChangeRequestSchema = z
  .object({
    proposedStart: z.coerce.date(),
    proposedEnd: z.coerce.date(),
    proposedType: z.enum(appointmentTypeValues).optional(),
    proposedReason: z.string().min(1).optional(),
  })
  .refine((data) => data.proposedEnd > data.proposedStart, {
    message: "proposedEnd doit être postérieur à proposedStart",
    path: ["proposedEnd"],
  });

const responseSchema = z.object({
  responseNote: z.string().min(1).max(1000).optional(),
});

const changeRequestSelect = {
  id: true,
  appointmentId: true,
  requestedById: true,
  proposedStart: true,
  proposedEnd: true,
  proposedType: true,
  proposedReason: true,
  status: true,
  responseNote: true,
  resolvedAt: true,
  resolvedById: true,
  createdAt: true,
  updatedAt: true,
  appointment: {
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      appointmentType: true,
      status: true,
      pet: { select: { id: true, name: true, species: true } },
      client: { select: { id: true, firstName: true, lastName: true, email: true } },
      veterinarian: {
        select: {
          id: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  },
  requestedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  resolvedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
} as const;

async function veterinarianByUserId(fastify: FastifyInstance, userId: string) {
  return fastify.prisma.veterinarian.findUnique({
    where: { userId },
    select: { id: true },
  });
}

export default async function appointmentChangeRequestRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post(
    "/appointments/:id/change-requests",
    {
      preHandler: [fastify.authorize(["CLIENT"])],
      schema: {
        body: {
          type: "object",
          required: ["proposedStart", "proposedEnd"],
          properties: {
            proposedStart: { type: "string", format: "date-time" },
            proposedEnd: { type: "string", format: "date-time" },
            proposedType: { type: "string", enum: ["CONSULTATION", "VACCINATION", "SURGERY", "EMERGENCY", "CHECKUP", "GROOMING", "OTHER"] },
            proposedReason: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
      }

      const parsedBody = createChangeRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsedBody.error.flatten() });
      }

      const { userId } = request.user;

      const appointment = await fastify.prisma.appointment.findFirst({
        where: { id: parsedParams.data.id, clientId: userId },
        select: {
          id: true,
          petId: true,
          clientId: true,
          veterinarianId: true,
          status: true,
          appointmentType: true,
          scheduledStart: true,
          scheduledEnd: true,
          pet: { select: { name: true } },
        },
      });

      if (!appointment) {
        return reply.code(404).send({ error: "Rendez-vous introuvable." });
      }

      if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
        return reply.code(409).send({ error: "Ce rendez-vous ne peut plus être modifié." });
      }

      if (appointment.scheduledStart <= new Date()) {
        return reply.code(409).send({ error: "Un rendez-vous passé ne peut pas être modifié." });
      }

      const existingPending = await fastify.prisma.appointmentChangeRequest.findFirst({
        where: { appointmentId: appointment.id, status: "PENDING" },
        select: { id: true },
      });

      if (existingPending) {
        return reply.code(409).send({ error: "Une demande de modification est déjà en attente pour ce rendez-vous." });
      }

      if (appointment.veterinarianId) {
        const vetConflict = await veterinarianHasAvailabilityConflict(
          fastify,
          appointment.veterinarianId,
          parsedBody.data.proposedStart,
          parsedBody.data.proposedEnd,
          appointment.id
        );
        if (vetConflict) {
          return reply.code(409).send({ error: "Le créneau proposé n'est pas disponible." });
        }
      }

      const petConflict = await petHasAvailabilityConflict(
        fastify,
        appointment.petId,
        parsedBody.data.proposedStart,
        parsedBody.data.proposedEnd,
        appointment.id
      );
      if (petConflict) {
        return reply.code(409).send({ error: "Le créneau proposé n'est pas disponible pour cet animal." });
      }

      const proposedType = (parsedBody.data.proposedType ?? appointment.appointmentType) as AppointmentType;

      if (appointment.status === "PENDING") {
        const [changeRequest] = await fastify.prisma.$transaction([
          fastify.prisma.appointmentChangeRequest.create({
            data: {
              appointmentId: appointment.id,
              requestedById: userId,
              proposedStart: parsedBody.data.proposedStart,
              proposedEnd: parsedBody.data.proposedEnd,
              proposedType,
              proposedReason: parsedBody.data.proposedReason ?? null,
              status: "APPROVED",
              resolvedAt: new Date(),
              responseNote: "Appliqué automatiquement : le rendez-vous n'était pas encore confirmé.",
            },
            select: changeRequestSelect,
          }),
          fastify.prisma.appointment.update({
            where: { id: appointment.id },
            data: {
              scheduledStart: parsedBody.data.proposedStart,
              scheduledEnd: parsedBody.data.proposedEnd,
              appointmentType: proposedType,
              ...(parsedBody.data.proposedReason !== undefined ? { reason: parsedBody.data.proposedReason } : {}),
            },
            select: { id: true },
          }),
        ]);

        if (appointment.veterinarianId) {
          const vetUser = await fastify.prisma.veterinarian.findUnique({
            where: { id: appointment.veterinarianId },
            select: { user: { select: { id: true, email: true } } },
          });

          if (vetUser?.user) {
            await notifyUser(fastify, {
              recipientId: vetUser.user.id,
              type: "APPOINTMENT",
              title: "Rendez-vous modifié par le client",
              body: `${appointment.pet?.name ?? "RDV"} — ${formatDisplayDateTime(parsedBody.data.proposedStart)}`,
            }).catch((err) => fastify.log.error("Notification modification RDV échouée: %s", String(err)));

            if (vetUser.user.email) {
              await sendAppointmentEventEmail(fastify, {
                kind: "updated",
                to: vetUser.user.email,
                ctx: {
                  appointmentId: appointment.id,
                  sequence: 1,
                  petName: appointment.pet?.name ?? "—",
                  type: proposedType,
                  start: parsedBody.data.proposedStart,
                  end: parsedBody.data.proposedEnd,
                  previousStart: appointment.scheduledStart,
                },
              });
            }
          }
        }

        return reply.code(201).send({ changeRequest, applied: true });
      }

      const changeRequest = await fastify.prisma.appointmentChangeRequest.create({
        data: {
          appointmentId: appointment.id,
          requestedById: userId,
          proposedStart: parsedBody.data.proposedStart,
          proposedEnd: parsedBody.data.proposedEnd,
          proposedType,
          proposedReason: parsedBody.data.proposedReason ?? null,
        },
        select: changeRequestSelect,
      });

      if (appointment.veterinarianId) {
        const vetUser = await fastify.prisma.veterinarian.findUnique({
          where: { id: appointment.veterinarianId },
          select: { user: { select: { id: true, email: true } } },
        });

        if (vetUser?.user) {
          await notifyUser(fastify, {
            recipientId: vetUser.user.id,
            type: "APPOINTMENT",
            title: "Nouvelle demande de modification",
            body: `${appointment.pet?.name ?? "RDV"} — ${formatDisplayDateTime(parsedBody.data.proposedStart)}`,
          }).catch((err) => fastify.log.error("Notification demande de modification échouée: %s", String(err)));

          if (vetUser.user.email) {
            await sendAppointmentEventEmail(fastify, {
              kind: "changeReceived",
              to: vetUser.user.email,
              ctx: {
                appointmentId: appointment.id,
                petName: appointment.pet?.name ?? "—",
                type: proposedType,
                start: parsedBody.data.proposedStart,
                end: parsedBody.data.proposedEnd,
              },
            });
          }
        }
      }

      return reply.code(201).send({ changeRequest, applied: false });
    }
  );

  fastify.get("/change-requests", async (request, reply) => {
    const { userId, role } = request.user;
    const query = request.query as { page?: string; limit?: string; status?: string };
    const { page, limit, skip } = getPaginationParams(query);

    if (query.status && !changeRequestStatusValues.includes(query.status as (typeof changeRequestStatusValues)[number])) {
      return reply.code(400).send({ error: "Statut invalide. Valeurs attendues : PENDING, APPROVED, REJECTED." });
    }

    let scope: Record<string, unknown> = {};
    if (role === "CLIENT") {
      scope = { requestedById: userId };
    } else if (role === "VETERINARIAN") {
      const ownProfile = await veterinarianByUserId(fastify, userId);
      if (!ownProfile) {
        return reply.code(404).send({ error: "Profil vétérinaire introuvable." });
      }
      scope = { appointment: { veterinarianId: ownProfile.id } };
    }

    const where = {
      ...scope,
      ...(query.status ? { status: query.status as AppointmentChangeRequestStatus } : {}),
    };

    const [changeRequests, total] = await Promise.all([
      fastify.prisma.appointmentChangeRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: changeRequestSelect,
      }),
      fastify.prisma.appointmentChangeRequest.count({ where }),
    ]);

    return reply.send(paginatedResponse(changeRequests, total, page, limit));
  });

  for (const action of ["approve", "reject"] as const) {
    fastify.patch(
      `/change-requests/:id/${action}`,
      {
        preHandler: [fastify.authorize(["VETERINARIAN", "ADMIN", "STAFF"])],
        schema: {
          body: {
            type: ["object", "null"],
            properties: {
              responseNote: { type: "string" },
            },
          },
        },
      },
      async (request, reply) => {
        const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
        if (!parsedParams.success) {
          return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
        }

        const parsedBody = responseSchema.safeParse(request.body ?? {});
        if (!parsedBody.success) {
          return reply.code(400).send({ error: "Données invalides", details: parsedBody.error.flatten() });
        }

        const { userId, role } = request.user;

        const changeRequest = await fastify.prisma.appointmentChangeRequest.findUnique({
          where: { id: parsedParams.data.id },
          select: {
            id: true,
            appointmentId: true,
            status: true,
            proposedStart: true,
            proposedEnd: true,
            proposedType: true,
            proposedReason: true,
            appointment: {
              select: {
                id: true,
                petId: true,
                clientId: true,
                veterinarianId: true,
                status: true,
                appointmentType: true,
                scheduledStart: true,
                scheduledEnd: true,
                pet: { select: { name: true } },
                client: { select: { email: true, firstName: true, lastName: true } },
              },
            },
          },
        });

        if (!changeRequest) {
          return reply.code(404).send({ error: "Demande de modification introuvable." });
        }

        if (role === "VETERINARIAN") {
          const ownProfile = await veterinarianByUserId(fastify, userId);
          if (!ownProfile || changeRequest.appointment.veterinarianId !== ownProfile.id) {
            return reply.code(404).send({ error: "Demande de modification introuvable." });
          }
        }

        if (changeRequest.status !== "PENDING") {
          return reply.code(409).send({ error: "Cette demande a déjà été traitée." });
        }

        const appointment = changeRequest.appointment;

        if (action === "reject") {
          const rejected = await fastify.prisma.appointmentChangeRequest.update({
            where: { id: changeRequest.id },
            data: {
              status: "REJECTED",
              resolvedAt: new Date(),
              resolvedById: userId,
              responseNote: parsedBody.data.responseNote ?? null,
            },
            select: changeRequestSelect,
          });

          await notifyUser(fastify, {
            recipientId: appointment.clientId,
            type: "APPOINTMENT",
            title: "Demande de modification refusée",
            body: `${appointment.pet?.name ?? "RDV"} — ${formatDisplayDateTime(appointment.scheduledStart)}`,
          }).catch((err) => fastify.log.error("Notification refus modification échouée: %s", String(err)));

          if (appointment.client.email) {
            await sendAppointmentEventEmail(fastify, {
              kind: "changeRejected",
              to: appointment.client.email,
              ctx: {
                appointmentId: appointment.id,
                petName: appointment.pet?.name ?? "—",
                type: appointment.appointmentType,
                start: appointment.scheduledStart,
                end: appointment.scheduledEnd,
                responseNote: parsedBody.data.responseNote ?? null,
              },
            });
          }

          return reply.send({ changeRequest: rejected });
        }

        if (
          appointment.status !== "PENDING" &&
          appointment.status !== "CONFIRMED"
        ) {
          return reply.code(409).send({ error: "Ce rendez-vous ne peut plus être modifié." });
        }

        if (appointment.veterinarianId) {
          const vetConflict = await veterinarianHasAvailabilityConflict(
            fastify,
            appointment.veterinarianId,
            changeRequest.proposedStart,
            changeRequest.proposedEnd,
            appointment.id
          );
          if (vetConflict) {
            return reply.code(409).send({ error: "Le créneau proposé n'est plus disponible." });
          }
        }

        const petConflict = await petHasAvailabilityConflict(
          fastify,
          appointment.petId,
          changeRequest.proposedStart,
          changeRequest.proposedEnd,
          appointment.id
        );
        if (petConflict) {
          return reply.code(409).send({ error: "Le créneau proposé n'est plus disponible pour cet animal." });
        }

        const [approved, updatedAppointment] = await fastify.prisma.$transaction([
          fastify.prisma.appointmentChangeRequest.update({
            where: { id: changeRequest.id },
            data: {
              status: "APPROVED",
              resolvedAt: new Date(),
              resolvedById: userId,
              responseNote: parsedBody.data.responseNote ?? null,
            },
            select: changeRequestSelect,
          }),
          fastify.prisma.appointment.update({
            where: { id: appointment.id },
            data: {
              scheduledStart: changeRequest.proposedStart,
              scheduledEnd: changeRequest.proposedEnd,
              appointmentType: changeRequest.proposedType,
              reminderSentAt: null,
              ...(changeRequest.proposedReason !== null ? { reason: changeRequest.proposedReason } : {}),
            },
            select: {
              id: true,
              scheduledStart: true,
              scheduledEnd: true,
              appointmentType: true,
              pet: { select: { name: true } },
            },
          }),
        ]);

        await notifyUser(fastify, {
          recipientId: appointment.clientId,
          type: "APPOINTMENT",
          title: "Modification de rendez-vous approuvée",
          body: `${updatedAppointment.pet?.name ?? "RDV"} — ${formatDisplayDateTime(updatedAppointment.scheduledStart)}`,
        }).catch((err) => fastify.log.error("Notification approbation échouée: %s", String(err)));

        if (appointment.client.email) {
          await sendAppointmentEventEmail(fastify, {
            kind: "changeApproved",
            to: appointment.client.email,
            ctx: {
              appointmentId: updatedAppointment.id,
              sequence: 1,
              petName: updatedAppointment.pet?.name ?? "—",
              type: updatedAppointment.appointmentType,
              start: updatedAppointment.scheduledStart,
              end: updatedAppointment.scheduledEnd,
            },
          });
        }

        return reply.send({ changeRequest: approved, appointment: updatedAppointment });
      }
    );
  }
}
