import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import crypto from "crypto";
import nodemailer from "nodemailer";

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

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/auth/register", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: {
      body: {
        type: "object",
        required: ["email", "password", "firstName", "lastName"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          firstName: { type: "string", minLength: 1 },
          lastName: { type: "string", minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
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

    const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await fastify.prisma.emailVerificationCode.create({
      data: { userId: user.id, code: verificationCode, expiresAt },
    });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.ethereal.email",
      port: parseInt((process.env.SMTP_PORT || "587") as string),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || "test@example.com",
        pass: process.env.SMTP_PASS || "test",
      },
    });

    try {
      await transporter.sendMail({
        from: `"VetClinic" <${(process.env.SMTP_USER || "test@example.com") as string}>`,
        to: email,
        subject: "Vérification d'email VetClinic",
        text: `Votre code de vérification est : ${verificationCode}`,
        html: `<p>Votre code de vérification est : <strong>${verificationCode}</strong></p><p>Ce code expire dans 10 minutes.</p>`,
      });
    } catch (err) {
      fastify.log.error("Failed to send verification email");
      console.error("Email send error:", err);
    }

    const token = fastify.jwt.sign({ userId: user.id, role: user.role });
    return reply.code(201).send({ user, token, emailVerified: false });
  });

  fastify.post("/auth/login", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: {
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
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

  fastify.post("/auth/change-password", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string", minLength: 1 },
          newPassword: { type: "string", minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const { currentPassword, newPassword } = parsed.data;
    const { userId } = request.user;

    const user = await fastify.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({ error: "Utilisateur introuvable." });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return reply.code(401).send({ error: "Mot de passe actuel incorrect." });
    }

    if (currentPassword === newPassword) {
      return reply.code(400).send({ error: "Le nouveau mot de passe doit être différent de l'actuel." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await fastify.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return reply.send({ message: "Mot de passe changé avec succès." });
  });
}