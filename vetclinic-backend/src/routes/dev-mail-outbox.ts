import { FastifyInstance } from "fastify";
import { readOutbox } from "../services/dev-outbox";

/** Seules les boucles locales peuvent lire l'outbox de développement. */
const LOCAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export default async function devMailOutboxRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/dev/mail-outbox",
    {
      schema: {
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                at: { type: "string" },
                mode: { type: "string" },
                from: { type: "string" },
                to: { type: "string" },
                subject: { type: "string" },
                text: { type: "string" },
                html: { type: "string" },
                ics: { type: "string" },
                hasIcs: { type: "boolean" },
              },
            },
          },
          403: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      if (!LOCAL_IPS.has(request.ip)) {
        return reply.code(403).send({ error: "Accès réservé à la boucle locale." });
      }
      return reply.send(readOutbox());
    }
  );
}
