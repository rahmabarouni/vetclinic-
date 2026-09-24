import { FastifyInstance } from "fastify";
import { z } from "zod";

const fcmTokenSchema = z.object({
  token: z.string().min(1).max(512),
});

export default async function fcmRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.put("/fcm-token", {
    schema: {
      body: {
        type: "object",
        required: ["token"],
        properties: { token: { type: "string", minLength: 1, maxLength: 512 } },
      },
    },
  }, async (request, reply) => {
    const parsed = fcmTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const { userId } = request.user;
    await fastify.prisma.user.update({
      where: { id: userId },
      data: { fcmToken: parsed.data.token },
    });

    return reply.send({ message: "Token FCM enregistré." });
  });

  fastify.delete("/fcm-token", async (request, reply) => {
    const { userId } = request.user;
    await fastify.prisma.user.update({
      where: { id: userId },
      data: { fcmToken: null },
    });

    return reply.send({ message: "Token FCM supprimé." });
  });
}