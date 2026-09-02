import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcrypt";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export default async function passwordResetRoutes(fastify: FastifyInstance) {
  fastify.post("/auth/forgot-password", async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const { email } = parsed.data;
    const user = await fastify.prisma.user.findUnique({ where: { email } });

    if (!user) {
      return reply.send({ message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
    }

    await fastify.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await fastify.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    console.log(`[PasswordReset] Token pour ${email}: ${token}`);

    return reply.send({ message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
  });

  fastify.post("/auth/reset-password", async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const { token, newPassword } = parsed.data;

    const resetToken = await fastify.prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return reply.code(400).send({ error: "Token invalide ou expiré." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await fastify.prisma.$transaction([
      fastify.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      fastify.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    return reply.send({ message: "Mot de passe réinitialisé avec succès." });
  });
}
