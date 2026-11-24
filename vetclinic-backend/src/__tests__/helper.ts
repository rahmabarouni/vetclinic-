import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { randomBytes, randomUUID } from "node:crypto";
import { buildApp } from "../app";

const prisma = new PrismaClient();

let app: FastifyInstance;

export { prisma };

/**
 * Comptes ADMIN éphémères créés par getAdminToken. Un email distinct par
 * appel évite qu'un fichier de test exécuté en parallèle écrase le hash de
 * mot de passe d'un autre (les suites Vitest tournent dans des workers
 * séparés mais partagent la même base).
 */
const adminEmails = new Set<string>();

/**
 * Fournit un token ADMIN pour les tests, sans dépendre d'un mot de passe
 * versionné ni des données de seed. Un compte de test dédié est créé avec un
 * mot de passe aléatoire propre à l'exécution.
 */
export async function getAdminToken(app: FastifyInstance): Promise<string> {
  const email = `suite-admin-${randomUUID().slice(0, 8)}@test.com`;
  adminEmails.add(email);
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
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
    remoteAddress: `127.${(adminEmails.size % 250) + 1}.0.1`,
    payload: { email, password },
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
  if (adminEmails.size > 0) {
    await prisma.user.deleteMany({ where: { email: { in: [...adminEmails] } } });
    adminEmails.clear();
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
