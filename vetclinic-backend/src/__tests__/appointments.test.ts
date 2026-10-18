import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, deleteTestEntities } from "./helper";

let app: any;
let clientToken: string;
let petId: string;
let veterinarianId: string;
const createdEmails: string[] = [];
const createdPetIds: string[] = [];
const createdVeterinarianIds: string[] = [];
const createdAppointmentIds: string[] = [];

beforeAll(async () => {
  app = await getApp();

  const email = `slot-test-${Date.now()}@test.com`;
  createdEmails.push(email);
  const registerRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: "127.0.0.250",
    payload: { email, password: "TestPass123!", firstName: "Slot", lastName: "Test", privacyConsent: true },
  });
  expect(registerRes.statusCode).toBe(201);

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.250",
    payload: { email, password: "TestPass123!" },
  });
  expect(login.statusCode).toBe(200);
  clientToken = login.json().token;

  const petRes = await app.inject({
    method: "POST",
    url: "/api/v1/pets",
    headers: { authorization: `Bearer ${clientToken}` },
    payload: { name: "TestPet", species: "CAT" },
  });
  expect(petRes.statusCode).toBe(201);
  petId = petRes.json().pet.id;
  createdPetIds.push(petId);

  // Un vétérinaire tout neuf, garanti sans RDV résiduels en base (la base
  // est partagée entre tous les fichiers de test : laisser la suite dépendre
  // d'un vétérinaire existant rendrait ce test vulnérable aux données des
  // autres runs).
  const adminLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.250",
    payload: { email: "admin@vetclinic.test", password: "REDACTED_DEMO_PASSWORD" },
  });
  expect(adminLogin.statusCode).toBe(200);
  const adminToken = adminLogin.json().token;

  const vetEmail = `appt-vet-${Date.now()}@test.com`;
  createdEmails.push(vetEmail);
  const vetRes = await app.inject({
    method: "POST",
    url: "/api/v1/veterinarians",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      email: vetEmail,
      password: "TestPass123!",
      firstName: "Appt",
      lastName: "Vet", privacyConsent: true,
      specialty: "GENERALIST",
    },
  });
  expect(vetRes.statusCode).toBe(201);
  veterinarianId = vetRes.json().veterinarian.id;
  createdVeterinarianIds.push(veterinarianId);
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

describe("Appointment slot overlap", () => {
  it("POST /api/v1/appointments — refuse un créneau chevauchant (même vétérinaire)", async () => {
    const now = Date.now();
    const start = new Date(now + 48 * 60 * 60 * 1000);
    const end = new Date(now + 49 * 60 * 60 * 1000);

    // Premier RDV : animal 1 + vétérinaire
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        petId,
        veterinarianId,
        appointmentType: "CHECKUP",
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        reason: "First appointment",
      },
    });
    expect(res1.statusCode).toBe(201);
    createdAppointmentIds.push(res1.json().appointment.id);

    // Second animal du même client, même vétérinaire, créneau identique -> conflit véto
    const pet2Res = await app.inject({
      method: "POST",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { name: "SecondPet", species: "DOG" },
    });
    expect(pet2Res.statusCode).toBe(201);
    const pet2Id = pet2Res.json().pet.id;
    createdPetIds.push(pet2Id);

    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        petId: pet2Id,
        veterinarianId,
        appointmentType: "CHECKUP",
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        reason: "Overlapping appointment same vet",
      },
    });

    expect(res2.statusCode).toBe(409);
    expect(res2.json().error).toMatch(/occupé|chez/i);
  });

  it("POST /api/v1/appointments — sans vétérinaire, pas de vérification de chevauchement", async () => {
    const now = Date.now();
    const start = new Date(now + 72 * 60 * 60 * 1000);
    const end = new Date(now + 73 * 60 * 60 * 1000);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        petId,
        appointmentType: "VACCINATION",
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        reason: "No vet, no overlap",
      },
    });

    expect(res.statusCode).toBe(201);
    createdAppointmentIds.push(res.json().appointment.id);
  });

  it("POST /api/v1/appointments — scheduledEnd <= scheduledStart rejetté (400)", async () => {
    const now = new Date();
    const start = new Date(now.getTime() + 96 * 60 * 60 * 1000);
    start.setHours(14, 0, 0, 0);
    const end = new Date(start);
    end.setHours(13, 0, 0, 0);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        petId,
        appointmentType: "CHECKUP",
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        reason: "Invalid time range",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/appointments — pet d'un autre CLIENT rejeté (403)", async () => {
    const email2 = `slot-test-b-${Date.now()}@test.com`;
    createdEmails.push(email2);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: "127.0.0.249",
      payload: { email: email2, password: "TestPass123!", firstName: "Other", lastName: "Client", privacyConsent: true },
    });
    const login2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      remoteAddress: "127.0.0.249",
      payload: { email: email2, password: "TestPass123!" },
    });
    const otherToken = login2.json().token;

    const now = new Date();
    const start = new Date(now.getTime() + 120 * 60 * 60 * 1000);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(11, 0, 0, 0);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {
        petId,
        appointmentType: "CHECKUP",
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        reason: "Trying to book for another client's pet",
      },
    });

    expect(res.statusCode).toBe(403);
  });
});