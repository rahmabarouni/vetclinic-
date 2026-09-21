import { FastifyInstance } from "fastify";
import { z } from "zod";

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const profileSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  address: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/users/profile", async (request, reply) => {
    const { userId } = request.user;

    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!user) {
      return reply.code(404).send({ error: "Utilisateur introuvable." });
    }

    return reply.send({ user });
  });

  fastify.put("/users/profile", {
    schema: {
      body: {
        type: "object",
        properties: {
          firstName: { type: "string", minLength: 1 },
          lastName: { type: "string", minLength: 1 },
          phone: { type: "string" },
          address: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const { userId } = request.user;
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: "Aucun champ à modifier." });
    }

    const user = await fastify.prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });

    return reply.send({ user });
  });
}
