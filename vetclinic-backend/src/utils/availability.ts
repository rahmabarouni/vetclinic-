import { FastifyInstance } from "fastify";

/**
 * Vrai si le vétérinaire a déjà un rendez-vous actif ou un bloc de créneau
 * sur la plage demandée. `excludeAppointmentId` sert à ne pas se confronter à
 * soi-même lors d'une modification.
 */
export async function veterinarianHasAvailabilityConflict(
  fastify: FastifyInstance,
  veterinarianId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeAppointmentId?: string
): Promise<boolean> {
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

/**
 * Vrai si l'animal a déjà un rendez-vous actif qui chevauche la plage demandée.
 */
export async function petHasAvailabilityConflict(
  fastify: FastifyInstance,
  petId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeAppointmentId?: string
): Promise<boolean> {
  const conflicting = await fastify.prisma.appointment.findFirst({
    where: {
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      petId,
      status: { in: ["PENDING", "CONFIRMED"] },
      scheduledStart: { lt: scheduledEnd },
      scheduledEnd: { gt: scheduledStart },
    },
    select: { id: true },
  });

  return Boolean(conflicting);
}
