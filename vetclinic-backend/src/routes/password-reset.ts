import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { sendEmail } from "../services/mailer";

/** Durée de validité d'un code (D1). */
const RESET_CODE_VALIDITY_MS = 15 * 60 * 1000;
/** Nombre maximal d'essais avant invalidation du code (D3). */
const MAX_CODE_ATTEMPTS = 5;
/** Plancher de latence identique sur les deux branches de forgot-password (D5/Q6). */
const FORGOT_RESPONSE_FLOOR_MS = 400;
/** Sel fictif utilisé quand l'email n'existe pas, pour un travail crypto identique. */
const DUMMY_USER_ID = "00000000-0000-0000-0000-000000000000";

const GENERIC_FORGOT_MESSAGE = "Si cet email existe, un code de réinitialisation a été envoyé.";
const INVALID_CODE_MESSAGE = "Code invalide ou expiré.";

/** Erreur interne : le code a déjà été réservé par une requête concurrente. */
class ResetClaimConflict extends Error {
  constructor() {
    super("reset-claim-conflict");
    this.name = "ResetClaimConflict";
  }
}

/** Limite complémentaire par email (D4) : 3 demandes par heure. */
const EMAIL_HOURLY_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_HOURLY_MAX = 3;
const emailHits = new Map<string, number[]>();

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8),
});

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashCode(code: string, userId: string): string {
  return crypto.createHash("sha256").update(`${code}:${userId}`).digest("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function consumeEmailQuota(email: string): boolean {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const recent = (emailHits.get(key) ?? []).filter((at) => now - at < EMAIL_HOURLY_WINDOW_MS);
  if (recent.length >= EMAIL_HOURLY_MAX) return false;
  recent.push(now);
  emailHits.set(key, recent);

  if (emailHits.size > 1000) {
    for (const [candidate, times] of emailHits) {
      if (!times.some((at) => now - at < EMAIL_HOURLY_WINDOW_MS)) emailHits.delete(candidate);
    }
  }
  return true;
}

const messageResponse = {
  type: "object",
  additionalProperties: true,
  properties: { message: { type: "string" } },
  required: ["message"],
};

const errorResponse = {
  type: "object",
  additionalProperties: true,
  properties: {
    error: { type: "string" },
    details: { type: "object", additionalProperties: true },
  },
};

export default async function passwordResetRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/auth/forgot-password",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email" } },
        },
        response: { 200: messageResponse, 400: errorResponse, 429: errorResponse },
      },
    },
    async (request, reply) => {
      const startedAt = Date.now();
      const parsed = forgotPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Données invalides", details: parsed.error.flatten() });
      }

      const { email } = parsed.data;

      if (!consumeEmailQuota(email)) {
        return reply.code(429).send({ error: "Trop de demandes. Réessayez plus tard." });
      }

      const user = await fastify.prisma.user.findUnique({ where: { email } });

      // Même travail cryptographique dans les deux branches (D5).
      const code = generateCode();
      const hash = hashCode(code, user?.id ?? DUMMY_USER_ID);
      const expiresAt = new Date(Date.now() + RESET_CODE_VALIDITY_MS);

      if (user) {
        await fastify.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await fastify.prisma.passwordResetToken.create({
          data: { userId: user.id, token: hash, expiresAt },
        });

        const sent = await sendEmail({
          to: email,
          subject: "Réinitialisation de votre mot de passe VetClinic",
          text: [
            `Votre code de réinitialisation est : ${code}`,
            "Ce code expire dans 15 minutes.",
            "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
          ].join("\n"),
          html: [
            `<p>Votre code de réinitialisation est : <strong>${code}</strong></p>`,
            "<p>Ce code expire dans 15 minutes.</p>",
            "<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>",
          ].join(""),
          sensitiveValues: [code, email],
        });

        if (!sent.ok) {
          // Le mailer a déjà journalisé l'échec avec destinataire et code masqués.
          console.error("[PasswordReset] envoi impossible - réponse inchangée");
        }
      }

      const remaining = FORGOT_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
      if (remaining > 0) await sleep(remaining);

      return reply.send({ message: GENERIC_FORGOT_MESSAGE });
    }
  );

  fastify.post(
    "/auth/reset-password",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["email", "code", "newPassword"],
          properties: {
            email: { type: "string", format: "email" },
            code: { type: "string", minLength: 6, maxLength: 6, pattern: "^[0-9]{6}$" },
            newPassword: { type: "string", minLength: 8 },
          },
        },
        response: { 200: messageResponse, 400: errorResponse, 429: errorResponse },
      },
    },
    async (request, reply) => {
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Données invalides", details: parsed.error.flatten() });
      }

      const { email, code, newPassword } = parsed.data;
      const user = await fastify.prisma.user.findUnique({ where: { email } });
      const candidateHash = hashCode(code, user?.id ?? DUMMY_USER_ID);

      const record = user
        ? await fastify.prisma.passwordResetToken.findFirst({
            where: { userId: user.id, usedAt: null },
            orderBy: { createdAt: "desc" },
          })
        : null;

      // Comparaison en temps constant même quand le compte n'existe pas.
      const storedHash = record?.token ?? hashCode("000000", DUMMY_USER_ID);
      const matches = constantTimeEquals(candidateHash, storedHash);
      const now = new Date();

      if (!user || !record || record.expiresAt <= now || record.attempts >= MAX_CODE_ATTEMPTS) {
        return reply.code(400).send({ error: INVALID_CODE_MESSAGE });
      }

      if (!matches) {
        // Borne de 5 essais appliquée par le SGBD, pas par un test en JavaScript :
        // les appels concurrents qui arrivent après la limite ne comptent plus.
        const counted = await fastify.prisma.passwordResetToken.updateMany({
          where: { id: record.id, usedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
          data: { attempts: { increment: 1 } },
        });
        if (counted.count !== 1) {
          // Limite déjà atteinte : aucun message distinct n'est exposé.
          return reply.code(400).send({ error: INVALID_CODE_MESSAGE });
        }
        return reply.code(400).send({ error: INVALID_CODE_MESSAGE });
      }

      // Hachage coûteux (coût 12) avant toute écriture, jamais pour un mauvais code.
      const passwordHash = await bcrypt.hash(newPassword, 12);

      try {
        await fastify.prisma.$transaction(async (tx) => {
          // CAS : une seule requête peut réserver le code, même sous concurrence.
          const claimed = await tx.passwordResetToken.updateMany({
            where: {
              id: record.id,
              usedAt: null,
              token: candidateHash,
              attempts: { lt: MAX_CODE_ATTEMPTS },
            },
            data: { usedAt: new Date() },
          });
          if (claimed.count !== 1) {
            // Erreur interne : annule la transaction ; réponse uniforme ci-dessous.
            throw new ResetClaimConflict();
          }
          await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
          // D6 : tous les codes de l'utilisateur sont supprimés.
          await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        });
      } catch (err) {
        if (err instanceof ResetClaimConflict) {
          return reply.code(400).send({ error: INVALID_CODE_MESSAGE });
        }
        // Tout autre échec annule déjà la réservation ; on ne consomme pas le code.
        throw err;
      }

      const sent = await sendEmail({
        to: email,
        subject: "Votre mot de passe a été modifié",
        text: [
          "Le mot de passe de votre compte VetClinic a été réinitialisé.",
          "Si vous n'êtes pas à l'origine de cette action, contactez la clinique.",
        ].join("\n"),
        html: [
          "<p>Le mot de passe de votre compte VetClinic a été réinitialisé.</p>",
          "<p>Si vous n'êtes pas à l'origine de cette action, contactez la clinique.</p>",
        ].join(""),
        sensitiveValues: [email],
      });
      if (!sent.ok) {
        console.error("[PasswordReset] notification impossible - réponse inchangée");
      }

      return reply.send({ message: "Mot de passe réinitialisé avec succès." });
    }
  );
}
