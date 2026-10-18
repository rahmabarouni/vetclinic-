import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Purge ponctuelle des artefacts de tests accumules en base de developpement.
 *
 * Deux modes :
 *   npx tsx scripts/clean-test-pollution.ts --dry-run   -> liste sans rien supprimer
 *   npx tsx scripts/clean-test-pollution.ts             -> supprime reellement
 *
 * Regles de securite :
 *  - Les donnees de seed (prisma/seed.ts) sont listees en dur ci-dessous et
 *    ne JAMAIS supprimees : elles servent de liste blanche pour les pets et
 *    les appointments.
 *  - Tout est cible par ID/predicate, jamais par DELETE large a l'aveugle :
 *    chaque etape est filtree sur un ensemble d'utilisateurs connus (tests ou
 *    seed), si bien qu'un utilisateur d'origine inconnue est automatiquement
 *    exclu et signale plutot que supprime.
 *  - Les entites ambigues (ni seed ni test) sont signalees, jamais supprimees.
 *  - Suppression dans l'ordre des cles etrangeres : dependants avant parents.
 */

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const MAX_ROWS_PRINTED = 10;

// ─── Seed : prisma/seed.ts (liste blanche, ne jamais supprimer) ───
const SEED_EMAILS = [
  "admin@vetclinic.test",
  "dr.martin@vetclinic.test",
  "dr.durand@vetclinic.test",
  "jean.dupont@email.test",
  "marie.leroy@email.test",
  "pierre.moreau@email.test",
];

const SEED_PETS: { ownerEmail: string; name: string }[] = [
  { ownerEmail: "jean.dupont@email.test", name: "Rex" },
  { ownerEmail: "jean.dupont@email.test", name: "Mimi" },
  { ownerEmail: "marie.leroy@email.test", name: "Tweety" },
  { ownerEmail: "marie.leroy@email.test", name: "Luna" },
  { ownerEmail: "pierre.moreau@email.test", name: "Biscuit" },
];

// Les suites de tests n'utilisent que ce suffixe (statut "test-*"-VCR).
const TEST_EMAIL_SUFFIX = "@test.com";

interface Row {
  id: string;
  info: string;
}

interface Step {
  table: string;
  why: string;
  find: () => Promise<Row[]>;
  remove: (rows: Row[]) => Promise<number>;
}

function prefixOf(email: string): string {
  return email.split("@")[0].replace(/[\d-]+$/, "") + "@";
}

function printRows(step: Step, rows: Row[]): void {
  console.log(`\n  ${step.table} — ${rows.length} ligne(s)  [${step.why}]`);
  if (rows.length === 0) {
    console.log("    (rien)");
    return;
  }
  rows.slice(0, MAX_ROWS_PRINTED).forEach((row) => console.log(`    ${row.id}  ${row.info}`));
  if (rows.length > MAX_ROWS_PRINTED) {
    console.log(`    … +${rows.length - MAX_ROWS_PRINTED} autre(s)`);
  }
}

async function main(): Promise<void> {
  const mode = DRY_RUN ? "DRY-RUN (aucune suppression)" : "EXECUTION REELLE";
  console.log(`\n${"=".repeat(70)}\nPurge des artefacts de tests — ${mode}\n${"=".repeat(70)}`);

  const seedUsers = await prisma.user.findMany({
    where: { email: { in: SEED_EMAILS } },
    select: { id: true, email: true, role: true },
  });
  const missingSeed = SEED_EMAILS.filter((email) => !seedUsers.some((u) => u.email === email));
  if (missingSeed.length > 0) {
    console.error(`Seed introuvable (${missingSeed.join(", ")}) — lancez \`npm run prisma:seed\` d'abord.`);
    process.exit(1);
  }
  const seedIdByEmail = new Map(seedUsers.map((u) => [u.email, u.id]));
  const seedUserIds = seedUsers.map((u) => u.id);

  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: TEST_EMAIL_SUFFIX } },
    select: { id: true, email: true, role: true },
  });
  const testUserIds = testUsers.map((u) => u.id);

  // Utilisateurs ni seed ni test : origine inconnue -> signale, jamais supprime.
  const ambiguousUsers = await prisma.user.findMany({
    where: {
      AND: [{ NOT: { email: { endsWith: TEST_EMAIL_SUFFIX } } }, { NOT: { email: { in: SEED_EMAILS } } }],
    },
    select: { id: true, email: true, role: true },
  });

  const scopeUserIds = [...testUserIds, ...seedUserIds];

  const petsOfSeedOwners = await prisma.pet.findMany({
    where: { ownerId: { in: seedUserIds } },
    select: { id: true, name: true, ownerId: true, owner: { select: { email: true } } },
  });
  const seedPetIds = petsOfSeedOwners
    .filter((pet) => SEED_PETS.some((s) => s.name === pet.name && seedIdByEmail.get(s.ownerEmail) === pet.ownerId))
    .map((pet) => pet.id);
  const pollutionPetsOfSeedOwners = petsOfSeedOwners.filter((pet) => !seedPetIds.includes(pet.id));

  const targetConversationIds = (
    await prisma.conversation.findMany({
      where: { clientId: { in: scopeUserIds } },
      select: { id: true },
    })
  ).map((c) => c.id);

  // ─── Etapes, dans l'ordre des cles etrangeres (dependants avant parents) ───
  const steps: Step[] = [
    {
      table: "documents",
      why: "seed.ts n'en cree aucun",
      find: () =>
        prisma.document
          .findMany({ where: { uploadedBy: { in: scopeUserIds } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `"${r.title}" uploade par ${r.uploadedBy}` }))),
      remove: async () => prisma.document.deleteMany({ where: { uploadedBy: { in: scopeUserIds } } }).then((r) => r.count),
    },
    {
      table: "reminders",
      why: "rappels sur pets hors seed",
      find: () =>
        prisma.reminder
          .findMany({ where: { petId: { notIn: seedPetIds }, pet: { ownerId: { in: scopeUserIds } } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `"${r.title}"` }))),
      remove: async () =>
        prisma.reminder
          .deleteMany({ where: { petId: { notIn: seedPetIds }, pet: { ownerId: { in: scopeUserIds } } } })
          .then((r) => r.count),
    },
    {
      table: "medical_records",
      why: "dossiers hors seed (seed en cree exactement 2 sur ses 5 pets)",
      find: () =>
        prisma.medicalRecord
          .findMany({ where: { petId: { notIn: seedPetIds }, pet: { ownerId: { in: scopeUserIds } } } })
          .then((rows) =>
            rows.map((r) => ({ id: r.id, info: `"${r.title}" (pet ${r.petId}, vet ${r.veterinarianId})` })),
          ),
      remove: async () =>
        prisma.medicalRecord
          .deleteMany({ where: { petId: { notIn: seedPetIds }, pet: { ownerId: { in: scopeUserIds } } } })
          .then((r) => r.count),
    },
    {
      table: "messages",
      why: "seed.ts n'en cree aucun",
      find: () =>
        prisma.message
          .findMany({
            where: { OR: [{ conversationId: { in: targetConversationIds } }, { senderId: { in: scopeUserIds } }] },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, info: (r.content ?? "(fichier)").slice(0, 60) }))),
      remove: async () =>
        prisma.message
          .deleteMany({
            where: { OR: [{ conversationId: { in: targetConversationIds } }, { senderId: { in: scopeUserIds } }] },
          })
          .then((r) => r.count),
    },
    {
      table: "conversations",
      why: "seed.ts n'en cree aucune",
      find: () =>
        prisma.conversation
          .findMany({ where: { id: { in: targetConversationIds } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `client=${r.clientId} vet=${r.veterinarianId ?? "-"}` }))),
      remove: async () =>
        prisma.conversation.deleteMany({ where: { id: { in: targetConversationIds } } }).then((r) => r.count),
    },
    {
      table: "notifications",
      why: "seed.ts n'en cree aucune",
      find: () =>
        prisma.notification
          .findMany({ where: { recipientId: { in: scopeUserIds } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `${r.type} "${r.title}"` }))),
      remove: async () =>
        prisma.notification.deleteMany({ where: { recipientId: { in: scopeUserIds } } }).then((r) => r.count),
    },
    {
      table: "audit_logs",
      why: "traces d'activite, seed.ts n'en ecrit aucune",
      find: () =>
        prisma.auditLog
          .findMany({ where: { userId: { in: scopeUserIds } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `${r.action} ${r.targetType} ${r.targetId}` }))),
      remove: async () =>
        prisma.auditLog.deleteMany({ where: { userId: { in: scopeUserIds } } }).then((r) => r.count),
    },
    {
      table: "password_reset_tokens",
      why: "jetons de test",
      find: () =>
        prisma.passwordResetToken
          .findMany({ where: { userId: { in: scopeUserIds } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `user=${r.userId}` }))),
      remove: async () =>
        prisma.passwordResetToken.deleteMany({ where: { userId: { in: scopeUserIds } } }).then((r) => r.count),
    },
    {
      table: "email_verification_codes",
      why: "codes OTP de test",
      find: () =>
        prisma.emailVerificationCode
          .findMany({ where: { userId: { in: scopeUserIds } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `user=${r.userId}` }))),
      remove: async () =>
        prisma.emailVerificationCode.deleteMany({ where: { userId: { in: scopeUserIds } } }).then((r) => r.count),
    },
    {
      table: "time_slot_blocks",
      why: "les tests n'en creent aucun (0 attendu)",
      find: () =>
        prisma.timeSlotBlock
          .findMany({ where: { veterinarian: { user: { email: { endsWith: TEST_EMAIL_SUFFIX } } } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `${r.reason ?? "-"} (${r.veterinarianId})` }))),
      remove: async () =>
        prisma.timeSlotBlock
          .deleteMany({ where: { veterinarian: { user: { email: { endsWith: TEST_EMAIL_SUFFIX } } } } })
          .then((r) => r.count),
    },
    {
      table: "appointments",
      why: "RDV sur des pets hors seed (les 5 RDV de seed sont conserves)",
      find: () =>
        prisma.appointment
          .findMany({ where: { petId: { notIn: seedPetIds }, clientId: { in: scopeUserIds } } })
          .then((rows) =>
            rows.map((r) => ({
              id: r.id,
              info: `${r.appointmentType}/${r.status} pet=${r.petId} client=${r.clientId}`,
            })),
          ),
      remove: async () =>
        prisma.appointment
          .deleteMany({ where: { petId: { notIn: seedPetIds }, clientId: { in: scopeUserIds } } })
          .then((r) => r.count),
    },
    {
      table: "pets",
      why: "pets des users de test + pets hors liste seed rattaches a un user seed",
      find: () =>
        prisma.pet
          .findMany({
            where: {
              OR: [
                { ownerId: { in: testUserIds } },
                { ownerId: { in: seedUserIds }, id: { notIn: seedPetIds } },
              ],
            },
            select: { id: true, name: true, owner: { select: { email: true } } },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `${r.name} (owner ${r.owner.email})` }))),
      remove: async () =>
        prisma.pet
          .deleteMany({
            where: {
              OR: [
                { ownerId: { in: testUserIds } },
                { ownerId: { in: seedUserIds }, id: { notIn: seedPetIds } },
              ],
            },
          })
          .then((r) => r.count),
    },
    {
      table: "veterinarians",
      why: "profils des users de test (les 2 vets de seed + les profils ambigus sont conserves)",
      find: () =>
        prisma.veterinarian
          .findMany({ where: { userId: { in: testUserIds } }, select: { id: true, user: { select: { email: true } } } })
          .then((rows) => rows.map((r) => ({ id: r.id, info: `vet de ${r.user.email}` }))),
      remove: async () =>
        prisma.veterinarian.deleteMany({ where: { userId: { in: testUserIds } } }).then((r) => r.count),
    },
    {
      table: "users",
      why: `tous les comptes *${TEST_EMAIL_SUFFIX}`,
      find: async () => testUsers.map((u) => ({ id: u.id, info: `${u.email} (${u.role})` })),
      remove: async () => prisma.user.deleteMany({ where: { id: { in: testUserIds } } }).then((r) => r.count),
    },
  ];

  const found: { step: Step; rows: Row[] }[] = [];
  for (const step of steps) {
    found.push({ step, rows: await step.find() });
  }

  console.log("\n── Ce qui serait SUPPRIME ──");
  let total = 0;
  for (const { step, rows } of found) {
    printRows(step, rows);
    total += rows.length;
  }

  console.log(`\n  TOTAL : ${total} ligne(s) sur ${steps.length} tables.`);

  console.log("\n── Ce qui est CONSERVE (seed, prisma/seed.ts) ──");
  console.log(`  users               : ${SEED_EMAILS.length}`);
  SEED_EMAILS.forEach((email) => console.log(`      ${email}`));
  console.log(`  pets                : ${seedPetIds.length}`);
  const seedAppointmentCount = await prisma.appointment.count({ where: { petId: { in: seedPetIds } } });
  console.log(
    `  appointments        : ${seedAppointmentCount} (seed en cree 5 ; ${5 - seedAppointmentCount} deja absent(s) avant la purge)`,
  );
  console.log(`  medical_records     : ${await prisma.medicalRecord.count({ where: { petId: { in: seedPetIds } } })}`);
  console.log(`  reminders           : ${await prisma.reminder.count({ where: { petId: { in: seedPetIds } } })}`);
  console.log(`  veterinarians       : ${seedUsers.filter((u) => u.role === "VETERINARIAN").length}`);
  console.log(`  time_slot_blocks    : ${await prisma.timeSlotBlock.count()} (les tests n'en creent aucun)`);

  console.log("\n── SIGNALEMENT : origine inconnue, ni seed ni test, NON supprime ──");
  if (ambiguousUsers.length === 0) {
    console.log("  (aucun)");
  } else {
    ambiguousUsers.forEach((u) => console.log(`  ${u.email} (${u.role})`));
    console.log(
      `  -> ${ambiguousUsers.length} utilisateur(s) hors seed.ts et hors suffixe ${TEST_EMAIL_SUFFIX}.`,
    );
    console.log("     Decision a prendre manuellement (aucune suppression automatique).");
  }

  console.log("\n── Repartition des comptes de test a supprimer (par prefixe d'email) ──");
  const byPrefix = new Map<string, number>();
  testUsers.forEach((u) => byPrefix.set(prefixOf(u.email), (byPrefix.get(prefixOf(u.email)) ?? 0) + 1));
  [...byPrefix.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([prefix, count]) => console.log(`  ${prefix.padEnd(24)} ${count}`));

  if (DRY_RUN) {
    console.log("\nDRY-RUN termine : rien n'a ete supprime. Relancez sans --dry-run pour executer.\n");
    await prisma.$disconnect();
    return;
  }

  if (total === 0) {
    console.log("\nRien a supprimer.\n");
    await prisma.$disconnect();
    return;
  }

  console.log("\n── Suppression (ordre des cles etrangeres) ──");
  for (const { step, rows } of found) {
    if (rows.length === 0) continue;
    const count = await step.remove(rows);
    console.log(`  ${step.table.padEnd(26)} ${count} supprime(s)`);
  }

  console.log("\n── Comptages apres purge ──");
  const counts: [string, Promise<number>][] = [
    ["users", prisma.user.count()],
    ["veterinarians", prisma.veterinarian.count()],
    ["pets", prisma.pet.count()],
    ["appointments", prisma.appointment.count()],
    ["conversations", prisma.conversation.count()],
    ["messages", prisma.message.count()],
    ["medical_records", prisma.medicalRecord.count()],
    ["reminders", prisma.reminder.count()],
    ["audit_logs", prisma.auditLog.count()],
    ["notifications", prisma.notification.count()],
    ["email_verification_codes", prisma.emailVerificationCode.count()],
    ["password_reset_tokens", prisma.passwordResetToken.count()],
  ];
  for (const [label, promise] of counts) {
    console.log(`  ${label.padEnd(26)} ${await promise}`);
  }
  console.log("\nTermine.\n");
}

main()
  .catch((error) => {
    console.error("Erreur:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
