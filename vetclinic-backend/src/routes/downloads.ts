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

    try {
      const presignedUrl = await fastify.minio.getPresignedUrl(key, 3600);
      return reply.send({ url: presignedUrl, expiresIn: 3600 });
    } catch (err: any) {
      return reply.code(404).send({ error: "Fichier introuvable." });
    }
  });
}
