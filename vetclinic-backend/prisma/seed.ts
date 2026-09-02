import { PrismaClient, UserRole, AppointmentStatus, MedicalRecordType, ReminderType } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

function twelveMonthsFrom(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 12);
  return result;
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function printRecap(
  admin: { email: string },
  vet1User: { email: string },
  vet2User: { email: string },
  client1: { email: string },
  client2: { email: string },
  client3: { email: string },
) {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║           SEED VETCLINIC — COMPTES CRÉÉS               ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║                                                        ║");
  console.log("║  RÔLE          EMAIL                          MDP       ║");
  console.log("║  ─────         ─────                          ───       ║");
  console.log(`║  ADMIN         ${admin.email.padEnd(30)} REDACTED_DEMO_PASSWORD ║`);
  console.log(`║  VÉTÉRINAIRE   ${vet1User.email.padEnd(30)} REDACTED_DEMO_PASSWORD ║`);
  console.log(`║  VÉTÉRINAIRE   ${vet2User.email.padEnd(30)} REDACTED_DEMO_PASSWORD ║`);
  console.log(`║  CLIENT        ${client1.email.padEnd(30)} REDACTED_DEMO_PASSWORD ║`);
  console.log(`║  CLIENT        ${client2.email.padEnd(30)} REDACTED_DEMO_PASSWORD ║`);
  console.log(`║  CLIENT        ${client3.email.padEnd(30)} REDACTED_DEMO_PASSWORD ║`);
  console.log("║                                                        ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  ANIMAUX : Rex (chien), Mimi (chat), Tweety (oiseau),   ║");
  console.log("║            Luna (chat), Biscuit (lapin)                  ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  RDV : 5 créés (COMPLETED, CONFIRMED, PENDING,         ║");
  console.log("║        CANCELLED) — répartis sur les 2 vétérinaires     ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  DOSSIERS MÉDICAUX : 2 (dont 1 VACCINATION + Reminder) ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

async function main() {
  const passwordHash = await bcrypt.hash("REDACTED_DEMO_PASSWORD", 12);

  // ─── USERS (idempotent via upsert on email) ───
  const admin = await prisma.user.upsert({
    where: { email: "admin@vetclinic.test" },
    update: {},
    create: {
      email: "admin@vetclinic.test",
      passwordHash,
      firstName: "Admin",
      lastName: "VetClinic",
      role: UserRole.ADMIN,
    },
  });

  const vet1User = await prisma.user.upsert({
    where: { email: "dr.martin@vetclinic.test" },
    update: {},
    create: {
      email: "dr.martin@vetclinic.test",
      passwordHash,
      firstName: "Sophie",
      lastName: "Martin",
      role: UserRole.VETERINARIAN,
    },
  });

  const vet1Profile = await prisma.veterinarian.upsert({
    where: { userId: vet1User.id },
    update: {},
    create: {
      userId: vet1User.id,
      specialty: "Généraliste",
      bio: "Vétérinaire généraliste avec 10 ans d'expérience.",
      isAvailableForBooking: true,
    },
  });

  const vet2User = await prisma.user.upsert({
    where: { email: "dr.durand@vetclinic.test" },
    update: {},
    create: {
      email: "dr.durand@vetclinic.test",
      passwordHash,
      firstName: "Thomas",
      lastName: "Durand",
      role: UserRole.VETERINARIAN,
    },
  });

  const vet2Profile = await prisma.veterinarian.upsert({
    where: { userId: vet2User.id },
    update: {},
    create: {
      userId: vet2User.id,
      specialty: "Chirurgie",
      bio: "Spécialiste en chirurgie orthopédique et soft tissue.",
      isAvailableForBooking: true,
    },
  });

  const client1 = await prisma.user.upsert({
    where: { email: "jean.dupont@email.test" },
    update: {},
    create: {
      email: "jean.dupont@email.test",
      passwordHash,
      firstName: "Jean",
      lastName: "Dupont",
      role: UserRole.CLIENT,
      phone: "06 12 34 56 78",
    },
  });

  const client2 = await prisma.user.upsert({
    where: { email: "marie.leroy@email.test" },
    update: {},
    create: {
      email: "marie.leroy@email.test",
      passwordHash,
      firstName: "Marie",
      lastName: "Leroy",
      role: UserRole.CLIENT,
      phone: "06 98 76 54 32",
    },
  });

  const client3 = await prisma.user.upsert({
    where: { email: "pierre.moreau@email.test" },
    update: {},
    create: {
      email: "pierre.moreau@email.test",
      passwordHash,
      firstName: "Pierre",
      lastName: "Moreau",
      role: UserRole.CLIENT,
    },
  });

  // ─── PETS (idempotent: skip if already exist for this owner) ───
  const existingPets = await prisma.pet.findMany({
    where: { ownerId: { in: [client1.id, client2.id, client3.id] } },
    select: { ownerId: true, name: true },
  });
  const existingPetKeys = new Set(existingPets.map((p) => `${p.ownerId}:${p.name}`));

  async function getOrCreatePet(
    ownerId: string,
    name: string,
    species: "DOG" | "CAT" | "BIRD" | "RABBIT",
    breed: string,
    sex: "MALE" | "FEMALE",
    weightKg: number,
    birthDate: string,
  ) {
    if (existingPetKeys.has(`${ownerId}:${name}`)) {
      return prisma.pet.findFirst({ where: { ownerId, name } });
    }
    return prisma.pet.create({
      data: { ownerId, name, species, breed, sex, weightKg, birthDate: new Date(birthDate) },
    });
  }

  const pet1 = await getOrCreatePet(client1.id, "Rex", "DOG", "Berger Allemand", "MALE", 32, "2020-03-15");
  const pet2 = await getOrCreatePet(client1.id, "Mimi", "CAT", "Siamois", "FEMALE", 4.2, "2022-07-20");
  const pet3 = await getOrCreatePet(client2.id, "Tweety", "BIRD", "Perroquet", "MALE", 0.3, "2021-11-10");
  const pet4 = await getOrCreatePet(client2.id, "Luna", "CAT", "Maine Coon", "FEMALE", 6.5, "2023-01-05");
  const pet5 = await getOrCreatePet(client3.id, "Biscuit", "RABBIT", "Lop-eared", "FEMALE", 1.8, "2023-06-12");

  if (!pet1) {
    console.log("Les animaux existent déjà — seed appointments/medical records ignoré.");
    printRecap(admin, vet1User, vet2User, client1, client2, client3);
    return;
  }

  // ─── APPOINTMENTS ───
  const existingAppointments = await prisma.appointment.count();
  if (existingAppointments > 0) {
    console.log("Les appointments existent déjà — seed appointments ignoré.");
    printRecap(admin, vet1User, vet2User, client1, client2, client3);
    return;
  }

  const appointment1 = await prisma.appointment.create({
    data: {
      petId: pet1!.id,
      clientId: client1.id,
      veterinarianId: vet1Profile.id,
      appointmentType: "VACCINATION",
      status: AppointmentStatus.COMPLETED,
      scheduledStart: daysFromNow(-30),
      scheduledEnd: daysFromNow(-30),
      reason: "Vaccination annuelle antirabique",
    },
  });

  const appointment2 = await prisma.appointment.create({
    data: {
      petId: pet2!.id,
      clientId: client1.id,
      veterinarianId: vet1Profile.id,
      appointmentType: "CONSULTATION",
      status: AppointmentStatus.CONFIRMED,
      scheduledStart: daysFromNow(3),
      scheduledEnd: daysFromNow(3),
      reason: "Contrôle annuel",
    },
  });

  const appointment3 = await prisma.appointment.create({
    data: {
      petId: pet3!.id,
      clientId: client2.id,
      veterinarianId: vet2Profile.id,
      appointmentType: "SURGERY",
      status: AppointmentStatus.PENDING,
      scheduledStart: daysFromNow(7),
      scheduledEnd: daysFromNow(7),
      reason: "Intervention chirurgicale pour bec cassé",
    },
  });

  const appointment4 = await prisma.appointment.create({
    data: {
      petId: pet4!.id,
      clientId: client2.id,
      veterinarianId: vet1Profile.id,
      appointmentType: "CHECKUP",
      status: AppointmentStatus.COMPLETED,
      scheduledStart: daysFromNow(-15),
      scheduledEnd: daysFromNow(-15),
      reason: "Bilan de santé",
    },
  });

  await prisma.appointment.create({
    data: {
      petId: pet5!.id,
      clientId: client3.id,
      veterinarianId: vet2Profile.id,
      appointmentType: "EMERGENCY",
      status: AppointmentStatus.CANCELLED,
      scheduledStart: daysFromNow(-5),
      scheduledEnd: daysFromNow(-5),
      reason: "Urgence — ingestion suspecte",
      cancellationReason: "Animal récupéré, pas d'ingestion réelle",
    },
  });

  // ─── MEDICAL RECORDS ───
  const vaccinationRecord = await prisma.medicalRecord.create({
    data: {
      petId: pet1!.id,
      appointmentId: appointment1.id,
      veterinarianId: vet1Profile.id,
      recordType: MedicalRecordType.VACCINATION,
      title: "Vaccination antirabique",
      description: "Vaccin rabique administré — prochain rappel dans 12 mois.",
      diagnosis: null,
    },
  });

  await prisma.reminder.create({
    data: {
      petId: pet1!.id,
      medicalRecordId: vaccinationRecord.id,
      reminderType: ReminderType.VACCINE,
      title: "Rappel vaccin: Vaccination antirabique",
      dueDate: twelveMonthsFrom(vaccinationRecord.createdAt),
    },
  });

  await prisma.medicalRecord.create({
    data: {
      petId: pet4!.id,
      appointmentId: appointment4.id,
      veterinarianId: vet1Profile.id,
      recordType: MedicalRecordType.CONSULTATION,
      title: "Bilan de santé annuel",
      description: "Examen complet, poids dans les normes.",
      diagnosis: "Aucune pathologie détectée.",
    },
  });

  // ─── TIME SLOT BLOCK ───
  const today = new Date();
  const lunchStart = new Date(today);
  lunchStart.setHours(12, 0, 0, 0);
  const lunchEnd = new Date(today);
  lunchEnd.setHours(13, 0, 0, 0);

  await prisma.timeSlotBlock.create({
    data: {
      veterinarianId: vet1Profile.id,
      startDatetime: lunchStart,
      endDatetime: lunchEnd,
      reason: "Pause déjeuner",
      isRecurring: true,
    },
  });

  printRecap(admin, vet1User, vet2User, client1, client2, client3);
}

main()
  .catch((e) => {
    console.error("Erreur lors du seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
