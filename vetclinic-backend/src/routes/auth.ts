import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }
    const { email, password, firstName, lastName } = parsed.data;

    const existing = await fastify.prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "Email déjà utilisé." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await fastify.prisma.user.create({
      data: { email, passwordHash, firstName, lastName, role: "CLIENT" },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    const token = fastify.jwt.sign({ userId: user.id, role: user.role });
    return reply.code(201).send({ user, token });
  });

  fastify.post("/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await fastify.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ error: "Email ou mot de passe incorrect." });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return reply.code(401).send({ error: "Email ou mot de passe incorrect." });
    }

    const token = fastify.jwt.sign({ userId: user.id, role: user.role });
    return reply.send({
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
      token,
    });
  });
}