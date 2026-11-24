import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { sendEmail } from "../services/mailer";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  // Zod 4 ignore l'ancienne option `errorMap` : le message produit reste celui de z.literal(true).
  privacyConsent: z.literal(true),
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
        required: ["email", "password", "firstName", "lastName", "privacyConsent"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          firstName: { type: "string", minLength: 1 },
          lastName: { type: "string", minLength: 1 },
          privacyConsent: { type: "boolean", const: true },
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
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role: "CLIENT",
        privacyConsentAt: new Date(),
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, tokenVersion: true },
    });

    const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await fastify.prisma.emailVerificationCode.create({
      data: { userId: user.id, code: verificationCode, expiresAt },
    });

    await sendEmail({
      to: email,
      subject: "Vérification d'email VetClinic",
      text: `Votre code de vérification est : ${verificationCode}`,
      html: `<p>Votre code de vérification est : <strong>${verificationCode}</strong></p><p>Ce code expire dans 10 minutes.</p>`,
    });

    const { tokenVersion, ...publicUser } = user;
    const token = fastify.jwt.sign({ userId: user.id, role: user.role, tokenVersion });
    return reply.code(201).send({ user: publicUser, token, emailVerified: false });
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

    const token = fastify.jwt.sign({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
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

  fastify.post(
    "/auth/google",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["idToken"],
          properties: {
            idToken: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = z.object({ idToken: z.string() }).safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
      }

      const { idToken } = parsed.data;
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

      let googleUser;
      try {
        const ticket = await client.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        googleUser = ticket.getPayload();
      } catch (err) {
        return reply.code(401).send({ error: "Token Google invalide." });
      }

      if (!googleUser?.email) {
        return reply.code(400).send({ error: "Email non trouvé dans le token Google." });
      }

      const { email, given_name, family_name } = googleUser;

      const existingUser = await fastify.prisma.user.findUnique({ where: { email } });

      let user;
      if (existingUser) {
        if (existingUser.authProvider !== "GOOGLE") {
          return reply.code(403).send({ error: "Cet email est déjà utilisé avec une connexion classique." });
        }
        user = existingUser;
      } else {
        const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 12);
        user = await fastify.prisma.user.create({
          data: {
            email,
            passwordHash,
            firstName: given_name || "Utilisateur",
            lastName: family_name || "",
            role: "CLIENT",
            emailVerified: true,
            authProvider: "GOOGLE",
            privacyConsentAt: new Date(),
          },
          select: { id: true, email: true, firstName: true, lastName: true, role: true, tokenVersion: true },
        });
      }

      const { tokenVersion, ...publicUser } = user;
      const token = fastify.jwt.sign({ userId: user.id, role: user.role, tokenVersion });
      return reply.send({ user: publicUser, token, authProvider: "GOOGLE" });
    }
  );
}