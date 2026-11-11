import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { buildApp } from "../app";

const prisma = new PrismaClient();

let app: FastifyInstance;

export { prisma };

const SUITE_ADMIN_EMAIL = "suite-admin@test.com";

/**
 * Fournit un token ADMIN pour les tests, sans dépendre d'un mot de passe
 * versionné ni des données de seed. Un compte de test dédié est créé/mis à
 * jour avec un mot de passe aléatoire propre à l'exécution.
 */
export async function getAdminToken(app: FastifyInstance): Promise<string> {
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email: SUITE_ADMIN_EMAIL },
    update: { passwordHash, role: "ADMIN", isActive: true },
    create: {
      email: SUITE_ADMIN_EMAIL,
      passwordHash,
      firstName: "Suite",
      lastName: "Admin",
      role: "ADMIN",
      isActive: true,
      emailVerified: true,
    },
  });

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: SUITE_ADMIN_EMAIL, password },
  });

  if (login.statusCode !== 200) {
    throw new Error(`Impossible d'obtenir un token ADMIN de test (HTTP ${login.statusCode}).`);
  }

  return login.json().token;
}

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = undefined as any;
  }
  await prisma.$disconnect();
}

/**
 * Trace des entités créées par un fichier de test, supprimées à la fin du run.
 *
 * On identifie les users par email (unique, explicite — jamais un pattern de
 * nom) puis on supprime par ID primaire, dans l'ordre des clés étrangères :
 * dépendants avant parents. Tout ce qui pend encore à un user ou à un pet
 * (messages, audit_logs, notifications, codes de vérification, RDV, dossiers
 * médicaux, rappels, documents) est supprimé en cascade au moment de la
 * suppression du parent, y compris si un test a échoué avant d'avoir pu
 * remonter l'ID de l'enfant.
 *
 * Ne jamais y passer d'email ou d'ID issu des données de seed (prisma/seed.ts).
 */
export interface TestEntityIds {
  userEmails?: string[];
  veterinarianIds?: string[];
  petIds?: string[];
  appointmentIds?: string[];
  conversationIds?: string[];
}

export async function deleteTestEntities(ids: TestEntityIds): Promise<void> {
  const conversationIds = ids.conversationIds ?? [];
  const appointmentIds = ids.appointmentIds ?? [];
  const petIds = ids.petIds ?? [];
  const veterinarianIds = ids.veterinarianIds ?? [];

  const userIds =
    ids.userEmails && ids.userEmails.length > 0
      ? (
          await prisma.user.findMany({
            where: { email: { in: ids.userEmails } },
            select: { id: true },
          })
        ).map((user) => user.id)
      : [];

  if (
    conversationIds.length === 0 &&
    appointmentIds.length === 0 &&
    petIds.length === 0 &&
    veterinarianIds.length === 0 &&
    userIds.length === 0
  ) {
    return;
  }

  if (conversationIds.length > 0) {
    await prisma.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
  }
  if (appointmentIds.length > 0) {
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
  }
  if (petIds.length > 0) {
    await prisma.pet.deleteMany({ where: { id: { in: petIds } } });
  }
  if (veterinarianIds.length > 0) {
    await prisma.veterinarian.deleteMany({ where: { id: { in: veterinarianIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
