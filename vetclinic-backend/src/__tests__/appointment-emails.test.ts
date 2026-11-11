import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getApp, closeApp, deleteTestEntities, prisma, getAdminToken } from "./helper";
import {
  clearSentEmails,
  sentEmails,
  resetTransportCache,
} from "../services/mailer";
import {
  buildAppointmentTemplate,
} from "../services/appointment-emails";
import { buildAppointmentIcs } from "../services/appointment-ics";
import { runAppointmentReminders } from "../cron/appointment-reminders";

let app: any;
let clientToken: string;
let clientId: string;
let vetToken: string;
let adminToken: string;
let vetUserId: string;
let veterinarianId: string;
let petId: string;

const createdEmails: string[] = [];
const createdPetIds: string[] = [];
const createdVeterinarianIds: string[] = [];
const createdAppointmentIds: string[] = [];

const HOUR = 60 * 60 * 1000;

function slot(offsetHours: number, durationMinutes = 60) {
  const start = new Date(Date.now() + offsetHours * HOUR);
  start.setUTCSeconds(0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function createAppointmentFor(
  token: string,
  start: string,
  end: string,
  extra: Record<string, unknown> = {}
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/appointments",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      petId,
      clientId,
      appointmentType: "CHECKUP",
      scheduledStart: start,
      scheduledEnd: end,
      ...extra,
    },
  });
}

beforeAll(async () => {
  app = await getApp();

  const clientEmail = `p2-client-${Date.now()}@test.com`;
  createdEmails.push(clientEmail);
  const reg = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: "127.0.0.211",
    payload: { email: clientEmail, password: "TestPass123!", firstName: "P2", lastName: "Client", privacyConsent: true },
  });
  clientId = reg.json().user?.id ?? reg.json().userId;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.211",
    payload: { email: clientEmail, password: "TestPass123!" },
  });
  clientToken = login.json().token;
  clientId = login.json().user?.id ?? clientId;

  const petRes = await app.inject({
    method: "POST",
    url: "/api/v1/pets",
    headers: { authorization: `Bearer ${clientToken}` },
    payload: { name: "P2Pet", species: "DOG" },
  });
  petId = petRes.json().pet.id;
  createdPetIds.push(petId);

  adminToken = await getAdminToken(app);

  const vetEmail = `p2-vet-${Date.now()}@test.com`;
  createdEmails.push(vetEmail);
  const vetRes = await app.inject({
    method: "POST",
    url: "/api/v1/veterinarians",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { email: vetEmail, password: "TestPass123!", firstName: "P2", lastName: "Vet", privacyConsent: true, specialty: "GENERALIST" },
  });
  veterinarianId = vetRes.json().veterinarian.id;
  createdVeterinarianIds.push(veterinarianId);

  const profile = await prisma.veterinarian.findUnique({ where: { id: veterinarianId }, select: { userId: true } });
  vetUserId = profile!.userId;

  const vetLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.213",
    payload: { email: vetEmail, password: "TestPass123!" },
  });
  vetToken = vetLogin.json().token;
});

afterEach(() => {
  clearSentEmails();
});

afterAll(async () => {
  clearSentEmails();
  resetTransportCache();
  await deleteTestEntities({
    userEmails: createdEmails,
    petIds: createdPetIds,
    veterinarianIds: createdVeterinarianIds,
    appointmentIds: createdAppointmentIds,
  });
  await closeApp();
});

describe("Templates d'e-mail de rendez-vous", () => {
  const ctx = {
    appointmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    petName: "Rex",
    type: "VACCINATION",
    start: new Date("2026-10-27T09:30:00.000Z"),
    end: new Date("2026-10-27T10:30:00.000Z"),
  };

  it("affiche les heures en Africa/Tunis (aucun décalage d'hôte)", () => {
    const rendered = buildAppointmentTemplate("confirmed", ctx);
    const dateLine = rendered.lines.find((line) => line.startsWith("Date :"));
    expect(dateLine).toBeDefined();
    // 09:30 UTC = 10:30 Africa/Tunis (UTC+1 en octobre).
    expect(dateLine).toContain("10:30");
    expect(dateLine).not.toContain("11:30");
  });

  it("confirme : sujet, ICS et lien Google Agenda", () => {
    const rendered = buildAppointmentTemplate("confirmed", ctx);
    expect(rendered.subject).toBe("Votre rendez-vous est confirmé");
    expect(rendered.withIcs).toBe(true);
  });

  it("annulation : ICS en METHOD:CANCEL", () => {
    const rendered = buildAppointmentTemplate("cancelled", ctx);
    expect(rendered.icsMethod).toBe("CANCEL");
    expect(rendered.icsStatus).toBe("CANCELLED");
  });

  it("refus : reprend la note de réponse", () => {
    const rendered = buildAppointmentTemplate("changeRejected", { ...ctx, responseNote: "Créneau réservé" });
    expect(rendered.lines.some((line) => line.includes("Motif : Créneau réservé"))).toBe(true);
  });

  it("modification : expose ancienne et nouvelle date", () => {
    const rendered = buildAppointmentTemplate("updated", {
      ...ctx,
      previousStart: new Date("2026-10-26T09:30:00.000Z"),
    });
    expect(rendered.lines.some((line) => line.startsWith("Ancienne date :"))).toBe(true);
    expect(rendered.lines.some((line) => line.startsWith("Nouvelle date :"))).toBe(true);
  });
});

describe("Pièce jointe .ics", () => {
  it("contient UID stable, SEQUENCE, alarme -P1D et DTSTART en UTC", () => {
    const ics = buildAppointmentIcs({
      appointmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      sequence: 3,
      title: "RDV vétérinaire — Rex",
      description: "Confirmé",
      start: new Date("2026-10-27T09:30:00.000Z"),
      end: new Date("2026-10-27T10:30:00.000Z"),
    });

    expect(ics).not.toBeNull();
    expect(ics!).toContain("UID:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@vetclinic");
    expect(ics!).toContain("SEQUENCE:3");
    expect(ics!).toContain("METHOD:REQUEST");
    expect(ics!).toContain("DTSTART:20261027T093000Z");
    expect(ics!).toContain("BEGIN:VALARM");
    expect(ics!).toContain("TRIGGER:-P1DT");
  });
});

describe("E-mails déclenchés par les routes (transport simulé)", () => {
  it("création par le staff : e-mail CONFIRMÉ avec .ics au client", async () => {
    const { start, end } = slot(400);
    const res = await createAppointmentFor(adminToken, start, end, { veterinarianId });
    expect(res.statusCode).toBe(201);
    createdAppointmentIds.push(res.json().appointment.id);

    const mail = sentEmails.find((email) => email.subject === "Votre rendez-vous est confirmé");
    expect(mail).toBeDefined();
    expect(mail!.to).toContain("p2-client-");
    expect(mail!.hasIcs).toBe(true);
    expect(mail!.ics).toContain("METHOD:REQUEST");
    expect(mail!.html).toContain("Ajouter à Google Agenda");
  });

  it("création par le client : e-mail DEMANDÉ sans .ics", async () => {
    const { start, end } = slot(410);
    const res = await createAppointmentFor(clientToken, start, end, { veterinarianId });
    expect(res.statusCode).toBe(201);
    createdAppointmentIds.push(res.json().appointment.id);

    const mail = sentEmails.find((email) => email.subject === "Votre demande de rendez-vous a été enregistrée");
    expect(mail).toBeDefined();
    expect(mail!.hasIcs).toBe(false);
  });

  it("modification par le vétérinaire : e-mail MODIFIÉ avec .ics et ancienne date", async () => {
    const { start, end } = slot(420);
    const created = await createAppointmentFor(adminToken, start, end, { veterinarianId });
    const apptId = created.json().appointment.id;
    createdAppointmentIds.push(apptId);
    clearSentEmails();

    const moved = slot(430);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/appointments/${apptId}`,
      headers: { authorization: `Bearer ${vetToken}` },
      payload: { scheduledStart: moved.start, scheduledEnd: moved.end },
    });
    expect(res.statusCode).toBe(200);

    const mail = sentEmails.find((email) => email.subject === "Votre rendez-vous a été modifié par la clinique");
    expect(mail).toBeDefined();
    expect(mail!.hasIcs).toBe(true);
    expect(mail!.text).toContain("Ancienne date :");
  });

  it("annulation par statut : e-mail ANNULÉ avec METHOD:CANCEL", async () => {
    const { start, end } = slot(440);
    const created = await createAppointmentFor(adminToken, start, end, { veterinarianId });
    const apptId = created.json().appointment.id;
    createdAppointmentIds.push(apptId);
    clearSentEmails();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/appointments/${apptId}/status`,
      headers: { authorization: `Bearer ${vetToken}` },
      payload: { status: "CANCELLED" },
    });
    expect(res.statusCode).toBe(200);

    const mail = sentEmails.find((email) => email.subject === "Votre rendez-vous a été annulé");
    expect(mail).toBeDefined();
    expect(mail!.ics).toContain("METHOD:CANCEL");
  });
});

describe("Rappel J-1 (cron idempotent)", () => {
  it("envoie un rappel puis ne le renvoie pas (reminderSentAt)", async () => {
    const { start, end } = slot(12); // dans la fenêtre de 24 h
    const created = await createAppointmentFor(adminToken, start, end, { veterinarianId });
    const apptId = created.json().appointment.id;
    createdAppointmentIds.push(apptId);
    clearSentEmails();

    const first = await runAppointmentReminders(app);
    expect(first.sent).toBeGreaterThanOrEqual(1);

    const mail = sentEmails.find(
      (email) => email.subject === "Rappel : votre rendez-vous est demain" && email.to.includes("p2-client-")
    );
    expect(mail).toBeDefined();

    const afterFirst = await prisma.appointment.findUnique({ where: { id: apptId }, select: { reminderSentAt: true } });
    expect(afterFirst!.reminderSentAt).not.toBeNull();

    clearSentEmails();
    const second = await runAppointmentReminders(app);
    expect(second.sent).toBe(0);

    const reminderMail = sentEmails.find((email) => email.subject === "Rappel : votre rendez-vous est demain");
    expect(reminderMail).toBeUndefined();
  });

  it("ignore les rendez-vous annulés", async () => {
    const { start, end } = slot(15);
    const created = await createAppointmentFor(adminToken, start, end, { veterinarianId });
    const apptId = created.json().appointment.id;
    createdAppointmentIds.push(apptId);

    await prisma.appointment.update({ where: { id: apptId }, data: { status: "CANCELLED" } });
    clearSentEmails();

    const result = await runAppointmentReminders(app);
    const mail = sentEmails.find((email) => email.subject === "Rappel : votre rendez-vous est demain");
    expect(mail).toBeUndefined();
    expect(result.sent).toBe(0);
  });
});

describe("Réinitialisation de reminderSentAt après modification d'horaire", () => {
  it("une modification directe remet reminderSentAt à nul", async () => {
    const { start, end } = slot(450);
    const created = await createAppointmentFor(adminToken, start, end, { veterinarianId });
    const apptId = created.json().appointment.id;
    createdAppointmentIds.push(apptId);

    await prisma.appointment.update({ where: { id: apptId }, data: { reminderSentAt: new Date() } });

    const moved = slot(460);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/appointments/${apptId}`,
      headers: { authorization: `Bearer ${vetToken}` },
      payload: { scheduledStart: moved.start, scheduledEnd: moved.end },
    });
    expect(res.statusCode).toBe(200);

    const after = await prisma.appointment.findUnique({ where: { id: apptId }, select: { reminderSentAt: true } });
    expect(after!.reminderSentAt).toBeNull();
  });
});
