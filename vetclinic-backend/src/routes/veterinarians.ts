import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";

const createVeterinarianSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  bio: z.string().min(1).optional(),
});

const veterinarianSelect = {
  id: true,
  userId: true,
  specialty: true,
  bio: true,
  isAvailableForBooking: true,
  createdAt: true,
  updatedAt: true,
} as const;

const userSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export default async function veterinariansRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

fastify.post("/veterinarians", {
      preHandler: [fastify.authorize(["ADMIN"])],
      schema: {
      body: {
        type: "object",
        required: ["email", "password", "firstName", "lastName"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          firstName: { type: "string", minLength: 1 },
          lastName: { type: "string", minLength: 1 },
          phone: { type: "string" },
          specialty: { type: "string" },
          bio: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const parsed = createVeterinarianSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const veterinarian = await fastify.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: parsed.data.email },
        select: { id: true },
      });

      if (existingUser) {
        return null;
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = await tx.user.create({
        data: {
          email: parsed.data.email,
          passwordHash,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: parsed.data.phone,
          role: "VETERINARIAN",
        },
        select: userSelect,
      });

      const veterinarianProfile = await tx.veterinarian.create({
        data: {
          userId: user.id,
          specialty: parsed.data.specialty ?? "",
          bio: parsed.data.bio,
          isAvailableForBooking: true,
        },
        select: veterinarianSelect,
      });

      return { ...user, veterinarian: veterinarianProfile };
    });

    if (!veterinarian) {
      return reply.code(409).send({ error: "Email déjà utilisé." });
    }

    return reply.code(201).send(veterinarian);
  });

  fastify.get(
    "/veterinarians",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystestring: {
          type: "object",
          properties: {
            availableOnly: { type: "boolean" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    firstName: { type: "string" },
                    lastName: { type: "string" },
                    specialty: { type: "string" },
                    bio: { type: "string" },
                    isAvailableForBooking: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { availableOnly } = request.query as { availableOnly?: boolean };
      const where = {
        ...(availableOnly ? { isAvailableForBooking: true } : {}),
      };

      const veterinarians = await fastify.prisma.veterinarian.findMany({
        where,
        select: {
          id: true,
          userId: true,
          specialty: true,
          bio: true,
          isAvailableForBooking: true,
          createdAt: true,
          updatedAt: true,
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
      });

      return reply.send({ data: veterinarians });
    }
  );
}