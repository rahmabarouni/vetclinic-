import { FastifyInstance } from "fastify";
import { z } from "zod";

export default async function downloadsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/downloads", async (request, reply) => {
    const parsed = z.object({ key: z.string().min(1) }).safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Clé invalide", details: parsed.error.flatten() });
    }

    const { key } = parsed.data;
    const { userId, role } = request.user;

    if (role !== "ADMIN" && role !== "STAFF") {
      const document = await fastify.prisma.document.findFirst({
        where: { fileUrl: key },
        select: { pet: { select: { ownerId: true } } },
      });

      if (document) {
        if (document.pet.ownerId !== userId) {
          return reply.code(403).send({ error: "Accès refusé." });
        }
      } else {
        const message = await fastify.prisma.message.findFirst({
          where: { attachmentUrl: key },
          select: {
            conversation: {
              select: { clientId: true, veterinarianId: true },
            },
          },
        });

        if (message) {
          const isClient = message.conversation.clientId === userId;
          const isVet = message.conversation.veterinarianId
            ? (await fastify.prisma.veterinarian.findUnique({
                where: { userId },
                select: { id: true },
              }))?.id === message.conversation.veterinarianId
            : false;

          if (!isClient && !isVet) {
            return reply.code(403).send({ error: "Accès refusé." });
          }
        } else {
          return reply.code(403).send({ error: "Accès refusé." });
        }
      }
    }

    try {
      const presignedUrl = await fastify.minio.getPresignedUrl(key, 3600);
      return reply.send({ url: presignedUrl, expiresIn: 3600 });
    } catch {
      return reply.code(404).send({ error: "Fichier introuvable." });
    }
  });
}
