import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export default async function emailVerificationRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.authorize(["CLIENT"]));

  fastify.post(
    "/auth/verify-email",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["email", "code"],
          properties: {
            email: { type: "string", format: "email" },
            code: { type: "string", minLength: 6, maxLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = verifyEmailSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
      }

      const { email, code } = parsed.data;
      const { userId, role } = request.user;

      if (role !== "CLIENT") {
        return reply.code(403).send({ error: "Accès refusé." });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.email !== email) {
        return reply.code(404).send({ error: "Utilisateur introuvable." });
      }

      if (user.emailVerified) {
        return reply.code(400).send({ error: "Email déjà vérifié." });
      }

      const codes = await fastify.prisma.emailVerificationCode.findMany({
        where: {
          userId: userId,
          expiresAt: { gt: new Date() },
          usedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });

      const validCode = codes.find((c) => c.code === code);
      if (!validCode) {
        return reply.code(400).send({ error: "Code invalide ou expiré." });
      }

      await fastify.prisma.$transaction([
        fastify.prisma.emailVerificationCode.update({
          where: { id: validCode.id },
          data: { usedAt: new Date() },
        }),
        fastify.prisma.user.update({
          where: { id: userId },
          data: { emailVerified: true },
        }),
      ]);

      return reply.send({ message: "Email vérifié avec succès." });
    }
  );

  fastify.post(
    "/auth/resend-verification",
    {
      config: { rateLimit: { max: 1, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = resendVerificationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
      }

      const { email } = parsed.data;
      const { userId, role } = request.user;

      if (role !== "CLIENT") {
        return reply.code(403).send({ error: "Accès refusé." });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user || user.email !== email) {
        return reply.code(404).send({ error: "Utilisateur introuvable." });
      }

      if (user.emailVerified) {
        return reply.code(400).send({ error: "Email déjà vérifié." });
      }

      const existingCodes = await fastify.prisma.emailVerificationCode.findMany({
        where: {
          userId: userId,
          expiresAt: { gt: new Date() },
          usedAt: null,
        },
      });

      if (existingCodes.length > 0) {
        const oldest = existingCodes[existingCodes.length - 1];
        if (oldest.createdAt.getTime() > Date.now() - 60 * 1000) {
          return reply.code(429).send({ error: "Veuillez attendre avant de renvoyer un code." });
        }
      }

      await fastify.prisma.emailVerificationCode.deleteMany({
        where: { userId: userId, usedAt: null },
      });

      const code = crypto.randomBytes(3).toString("hex").toUpperCase();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await fastify.prisma.emailVerificationCode.create({
        data: { userId, code, expiresAt },
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
          text: `Votre code de vérification est : ${code}`,
          html: `<p>Votre code de vérification est : <strong>${code}</strong></p><p>Ce code expire dans 10 minutes.</p>`,
        });
      } catch (err) {
        fastify.log.error("Failed to send verification email");
        console.error("Email send error:", err);
      }

      return reply.send({ message: "Code de vérification envoyé." });
    }
  );
}
