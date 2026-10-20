import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, deleteTestEntities, prisma } from "./helper";

let app: any;
let clientToken: string;
let otherClientToken: string;
let vetToken: string;
let adminToken: string;
let clientId: string;
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
  const res = await app.inject({
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
  return res;
}

beforeAll(async () => {
  app = await getApp();

  const clientEmail = `cr-client-${Date.now()}@test.com`;
  createdEmails.push(clientEmail);
  const registerRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: "127.0.0.201",
    payload: { email: clientEmail, password: "TestPass123!", firstName: "Change", lastName: "Requester", privacyConsent: true },
  });
  expect(registerRes.statusCode).toBe(201);
  clientId = registerRes.json().user?.id ?? registerRes.json().userId;

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.201",
    payload: { email: clientEmail, password: "TestPass123!" },
  });
  expect(login.statusCode).toBe(200);
  clientToken = login.json().token;
  clientId = login.json().user?.id ?? clientId;

  const otherEmail = `cr-other-${Date.now()}@test.com`;
  createdEmails.push(otherEmail);
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: "127.0.0.204",
    payload: { email: otherEmail, password: "TestPass123!", firstName: "Other", lastName: "Client", privacyConsent: true },
  });
  const otherLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.204",
    payload: { email: otherEmail, password: "TestPass123!" },
  });
  otherClientToken = otherLogin.json().token;

  const petRes = await app.inject({
    method: "POST",
    url: "/api/v1/pets",
    headers: { authorization: `Bearer ${clientToken}` },
    payload: { name: "CrPet", species: "DOG" },
  });
  expect(petRes.statusCode).toBe(201);
  petId = petRes.json().pet.id;
  createdPetIds.push(petId);

  const adminLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.202",
    payload: { email: "admin@vetclinic.test", password: "REDACTED_DEMO_PASSWORD" },
  });
  expect(adminLogin.statusCode).toBe(200);
  adminToken = adminLogin.json().token;

  const vetEmail = `cr-vet-${Date.now()}@test.com`;
  createdEmails.push(vetEmail);
  const vetRes = await app.inject({
    method: "POST",
    url: "/api/v1/veterinarians",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      email: vetEmail,
      password: "TestPass123!",
      firstName: "Cr",
      lastName: "Vet",
      privacyConsent: true,
      specialty: "GENERALIST",
    },
  });
  expect(vetRes.statusCode).toBe(201);
  veterinarianId = vetRes.json().veterinarian.id;
  createdVeterinarianIds.push(veterinarianId);

  const profile = await prisma.veterinarian.findUnique({
    where: { id: veterinarianId },
    select: { userId: true },
  });
  vetUserId = profile!.userId;

  const vetLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.203",
    payload: { email: vetEmail, password: "TestPass123!" },
  });
  expect(vetLogin.statusCode).toBe(200);
  vetToken = vetLogin.json().token;
});

afterAll(async () => {
  await deleteTestEntities({
    userEmails: createdEmails,
    petIds: createdPetIds,
    veterinarianIds: createdVeterinarianIds,
    appointmentIds: createdAppointmentIds,
  });
  await closeApp();
});

describe("Création de RDV par le personnel", () => {
  it("POST /api/v1/appointments — le staff crée un RDV pour un client avec statut CONFIRMED", async () => {
    const { start, end } = slot(40);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        petId,
        clientId,
        veterinarianId,
        appointmentType: "VACCINATION",
        scheduledStart: start,
        scheduledEnd: end,
        reason: "RDV créé par le staff",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().appointment.status).toBe("CONFIRMED");
    expect(res.json().appointment.clientId).toBe(clientId);
    createdAppointmentIds.push(res.json().appointment.id);

    const notification = await prisma.notification.findFirst({
      where: { recipientId: clientId, title: "Nouveau rendez-vous confirmé" },
      select: { id: true },
    });
    expect(notification).not.toBeNull();
  });

  it("POST /api/v1/appointments — clientId manquant pour le staff (400)", async () => {
    const { start, end } = slot(41);
    const res = await createAppointmentFor(adminToken, start, end, { clientId: undefined });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/clientId/);
  });

  it("POST /api/v1/appointments — le vétérinaire sans veterinarianId prend son propre profil", async () => {
    const otherPetRes = await app.inject({
      method: "POST",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { name: "CrPet2", species: "CAT" },
    });
    const otherPetId = otherPetRes.json().pet.id;
    createdPetIds.push(otherPetId);

    const { start, end } = slot(42);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${vetToken}` },
      payload: {
        petId: otherPetId,
        clientId,
        appointmentType: "CHECKUP",
        scheduledStart: start,
        scheduledEnd: end,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().appointment.status).toBe("CONFIRMED");
    expect(res.json().appointment.veterinarianId).toBe(veterinarianId);
    createdAppointmentIds.push(res.json().appointment.id);
  });
});

describe("Demande de modification par le client", () => {
  let confirmedAppointmentId: string;
  let changeRequestId: string;

  it("POST /api/v1/appointments/:id/change-requests — RDV CONFIRMED → demande en attente", async () => {
    const created = await createAppointmentFor(adminToken, ...Object.values(slot(50)) as [string, string], {
      veterinarianId,
    });
    expect(created.statusCode).toBe(201);
    confirmedAppointmentId = created.json().appointment.id;
    createdAppointmentIds.push(confirmedAppointmentId);

    const proposed = slot(60);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/appointments/${confirmedAppointmentId}/change-requests`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        proposedStart: proposed.start,
        proposedEnd: proposed.end,
        proposedType: "VACCINATION",
        proposedReason: "Créneau plus pratique",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().applied).toBe(false);
    expect(res.json().changeRequest.status).toBe("PENDING");
    changeRequestId = res.json().changeRequest.id;

    const notification = await prisma.notification.findFirst({
      where: { recipientId: vetUserId, title: "Nouvelle demande de modification" },
      select: { id: true },
    });
    expect(notification).not.toBeNull();
  });

  it("POST /change-requests — une seconde demande PENDING est refusée (409)", async () => {
    const proposed = slot(61);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/appointments/${confirmedAppointmentId}/change-requests`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { proposedStart: proposed.start, proposedEnd: proposed.end },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/en attente/);
  });

  it("GET /api/v1/change-requests — filtrage par rôle", async () => {
    const vetRes = await app.inject({
      method: "GET",
      url: "/api/v1/change-requests?status=PENDING",
      headers: { authorization: `Bearer ${vetToken}` },
    });
    expect(vetRes.statusCode).toBe(200);
    expect(vetRes.json().data.some((cr: any) => cr.id === changeRequestId)).toBe(true);

    const clientRes = await app.inject({
      method: "GET",
      url: "/api/v1/change-requests?status=PENDING",
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(clientRes.statusCode).toBe(200);
    expect(clientRes.json().data.some((cr: any) => cr.id === changeRequestId)).toBe(true);

    const otherRes = await app.inject({
      method: "GET",
      url: "/api/v1/change-requests?status=PENDING",
      headers: { authorization: `Bearer ${otherClientToken}` },
    });
    expect(otherRes.statusCode).toBe(200);
    expect(otherRes.json().data.some((cr: any) => cr.id === changeRequestId)).toBe(false);
  });

  it("PATCH /api/v1/change-requests/:id/approve — applique le créneau et notifie le client", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/change-requests/${changeRequestId}/approve`,
      headers: { authorization: `Bearer ${vetToken}` },
      payload: { responseNote: "Créneau validé" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().changeRequest.status).toBe("APPROVED");
    expect(res.json().changeRequest.responseNote).toBe("Créneau validé");
    expect(res.json().appointment.id).toBe(confirmedAppointmentId);
    expect(res.json().appointment.appointmentType).toBe("VACCINATION");

    const notification = await prisma.notification.findFirst({
      where: { recipientId: clientId, title: "Modification de rendez-vous approuvée" },
      select: { id: true },
    });
    expect(notification).not.toBeNull();
  });

  it("PATCH /api/v1/change-requests/:id/approve — une demande déjà traitée renvoie 409", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/change-requests/${changeRequestId}/approve`,
      headers: { authorization: `Bearer ${vetToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/déjà été traitée/);
  });

  it("PATCH /change-requests/:id/reject — refuse sans toucher au rendez-vous", async () => {
    const created = await createAppointmentFor(adminToken, ...Object.values(slot(70)) as [string, string], {
      veterinarianId,
    });
    expect(created.statusCode).toBe(201);
    const appointmentId = created.json().appointment.id;
    createdAppointmentIds.push(appointmentId);

    const proposed = slot(80);
    const crRes = await app.inject({
      method: "POST",
      url: `/api/v1/appointments/${appointmentId}/change-requests`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { proposedStart: proposed.start, proposedEnd: proposed.end },
    });
    expect(crRes.statusCode).toBe(201);
    const crId = crRes.json().changeRequest.id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/change-requests/${crId}/reject`,
      headers: { authorization: `Bearer ${vetToken}` },
      payload: { responseNote: "Indisponible ce jour-là" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().changeRequest.status).toBe("REJECTED");

    const unchanged = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(unchanged!.scheduledStart.toISOString()).toBe(slot(70).start);
  });

  it("PATCH /change-requests/:id/approve — 409 si le créneau est devenu occupé", async () => {
    const created = await createAppointmentFor(adminToken, ...Object.values(slot(90)) as [string, string], {
      veterinarianId,
    });
    const appointmentId = created.json().appointment.id;
    createdAppointmentIds.push(appointmentId);

    const proposed = slot(100);
    const crRes = await app.inject({
      method: "POST",
      url: `/api/v1/appointments/${appointmentId}/change-requests`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { proposedStart: proposed.start, proposedEnd: proposed.end },
    });
    const crId = crRes.json().changeRequest.id;

    const otherPetRes = await app.inject({
      method: "POST",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { name: "CrPet3", species: "BIRD" },
    });
    const otherPetId = otherPetRes.json().pet.id;
    createdPetIds.push(otherPetId);

    const blocking = await createAppointmentFor(adminToken, proposed.start, proposed.end, {
      petId: otherPetId,
      clientId,
      veterinarianId,
    });
    expect(blocking.statusCode).toBe(201);
    createdAppointmentIds.push(blocking.json().appointment.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/change-requests/${crId}/approve`,
      headers: { authorization: `Bearer ${vetToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/plus disponible/);

    const stillPending = await prisma.appointmentChangeRequest.findUnique({ where: { id: crId } });
    expect(stillPending!.status).toBe("PENDING");

    const unchanged = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(unchanged!.scheduledStart.toISOString()).toBe(slot(90).start);
  });

  it("POST /change-requests — RDV PENDING : la modification s'applique directement", async () => {
    const created = await createAppointmentFor(clientToken, ...Object.values(slot(110)) as [string, string], {
      veterinarianId,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().appointment.status).toBe("PENDING");
    const appointmentId = created.json().appointment.id;
    createdAppointmentIds.push(appointmentId);

    const proposed = slot(120);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/appointments/${appointmentId}/change-requests`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { proposedStart: proposed.start, proposedEnd: proposed.end },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().applied).toBe(true);
    expect(res.json().changeRequest.status).toBe("APPROVED");

    const updated = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(updated!.scheduledStart.toISOString()).toBe(proposed.start);

    const notification = await prisma.notification.findFirst({
      where: { recipientId: vetUserId, title: "Rendez-vous modifié par le client" },
      select: { id: true },
    });
    expect(notification).not.toBeNull();
  });

  it("RBAC — un client ne peut pas approuver, un RDV passé ne peut pas être modifié", async () => {
    const forbidden = await app.inject({
      method: "PATCH",
      url: `/api/v1/change-requests/${changeRequestId}/approve`,
      headers: { authorization: `Bearer ${otherClientToken}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const pastStart = new Date(Date.now() - 5 * HOUR);
    const pastEnd = new Date(pastStart.getTime() + HOUR);
    const pastRes = await createAppointmentFor(adminToken, pastStart.toISOString(), pastEnd.toISOString(), {
      veterinarianId,
    });
    expect(pastRes.statusCode).toBe(201);
    createdAppointmentIds.push(pastRes.json().appointment.id);

    const crRes = await app.inject({
      method: "POST",
      url: `/api/v1/appointments/${pastRes.json().appointment.id}/change-requests`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { proposedStart: slot(130).start, proposedEnd: slot(130).end },
    });
    expect(crRes.statusCode).toBe(409);
    expect(crRes.json().error).toMatch(/passé/);
  });
});

describe("Modification directe par le vétérinaire", () => {
  it("PATCH /api/v1/appointments/:id — met à jour le créneau et notifie le client", async () => {
    const created = await createAppointmentFor(adminToken, ...Object.values(slot(150)) as [string, string], {
      veterinarianId,
    });
    expect(created.statusCode).toBe(201);
    const appointmentId = created.json().appointment.id;
    createdAppointmentIds.push(appointmentId);

    const next = slot(160);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/appointments/${appointmentId}`,
      headers: { authorization: `Bearer ${vetToken}` },
      payload: {
        scheduledStart: next.start,
        scheduledEnd: next.end,
        appointmentType: "SURGERY",
        reason: "Modifié par le véto",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().appointment.scheduledStart).toBe(next.start);
    expect(res.json().appointment.appointmentType).toBe("SURGERY");

    const notification = await prisma.notification.findFirst({
      where: { recipientId: clientId, title: "Rendez-vous mis à jour par le vétérinaire" },
      select: { id: true },
    });
    expect(notification).not.toBeNull();
  });

  it("PATCH /api/v1/appointments/:id — 409 sur chevauchement, 404 pour un autre vétérinaire", async () => {
    const created = await createAppointmentFor(adminToken, ...Object.values(slot(170)) as [string, string], {
      veterinarianId,
    });
    const appointmentId = created.json().appointment.id;
    createdAppointmentIds.push(appointmentId);

    const occupied = slot(40);
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/appointments/${appointmentId}`,
      headers: { authorization: `Bearer ${vetToken}` },
      payload: { scheduledStart: occupied.start, scheduledEnd: occupied.end },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/occupé/);

    const vet2Email = `cr-vet2-${Date.now()}@test.com`;
    createdEmails.push(vet2Email);
    const vet2Res = await app.inject({
      method: "POST",
      url: "/api/v1/veterinarians",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        email: vet2Email,
        password: "TestPass123!",
        firstName: "Cr2",
        lastName: "Vet",
        privacyConsent: true,
        specialty: "CARDIOLOGY",
      },
    });
    const vet2Id = vet2Res.json().veterinarian.id;
    createdVeterinarianIds.push(vet2Id);

    const vet2Login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      remoteAddress: "127.0.0.205",
      payload: { email: vet2Email, password: "TestPass123!" },
    });
    const vet2Token = vet2Login.json().token;

    const res2 = await app.inject({
      method: "PATCH",
      url: `/api/v1/appointments/${appointmentId}`,
      headers: { authorization: `Bearer ${vet2Token}` },
      payload: { reason: "Tentative non autorisée" },
    });
    expect(res2.statusCode).toBe(404);
  });

  it("GET /api/v1/appointments — expose pendingChangeRequest", async () => {
    const created = await createAppointmentFor(adminToken, ...Object.values(slot(180)) as [string, string], {
      veterinarianId,
    });
    const appointmentId = created.json().appointment.id;
    createdAppointmentIds.push(appointmentId);

    const before = await app.inject({
      method: "GET",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${clientToken}` },
    });
    const beforeDto = before.json().data.find((a: any) => a.id === appointmentId);
    expect(beforeDto.pendingChangeRequest).toBeNull();

    const proposed = slot(190);
    await app.inject({
      method: "POST",
      url: `/api/v1/appointments/${appointmentId}/change-requests`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { proposedStart: proposed.start, proposedEnd: proposed.end },
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${clientToken}` },
    });
    const afterDto = after.json().data.find((a: any) => a.id === appointmentId);
    expect(afterDto.pendingChangeRequest).not.toBeNull();
    expect(afterDto.pendingChangeRequest.status).toBe("PENDING");
    expect(afterDto.changeRequests).toBeUndefined();
  });
});
