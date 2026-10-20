import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, deleteTestEntities } from "./helper";

let app: any;
let adminToken: string;
let clientToken: string;
let clientId: string;
let petId: string;
let conversationId: string;
let veterinarianId: string;
const createdEmails: string[] = [];
const createdPetIds: string[] = [];
const createdConversationIds: string[] = [];
const createdVeterinarianIds: string[] = [];

beforeAll(async () => {
  app = await getApp();

  const adminLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.248",
    payload: { email: "admin@vetclinic.test", password: "REDACTED_DEMO_PASSWORD" },
  });
  expect(adminLogin.statusCode).toBe(200);
  adminToken = adminLogin.json().token;

  const clientEmail = `clients-test-${Date.now()}@test.com`;
  createdEmails.push(clientEmail);
  const registerRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: "127.0.0.248",
    payload: { email: clientEmail, password: "TestPass123!", firstName: "Client", lastName: "Liste", privacyConsent: true },
  });
  expect(registerRes.statusCode).toBe(201);
  clientId = registerRes.json().user.id;

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: "127.0.0.248",
    payload: { email: clientEmail, password: "TestPass123!" },
  });
  expect(login.statusCode).toBe(200);
  clientToken = login.json().token;

  const petRes = await app.inject({
    method: "POST",
    url: "/api/v1/pets",
    headers: { authorization: `Bearer ${clientToken}` },
    payload: { name: "ListePet", species: "DOG" },
  });
  expect(petRes.statusCode).toBe(201);
  petId = petRes.json().pet.id;
  createdPetIds.push(petId);

  const vetEmail = `clients-vet-${Date.now()}@test.com`;
  createdEmails.push(vetEmail);
  const vetRes = await app.inject({
    method: "POST",
    url: "/api/v1/veterinarians",
    headers: { authorization: `Bearer ${adminToken}` },
    remoteAddress: "127.0.0.248",
    payload: {
      email: vetEmail,
      password: "TestPass123!",
      firstName: "Clients",
      lastName: "Vet",
      privacyConsent: true,
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
    conversationIds: createdConversationIds,
    veterinarianIds: createdVeterinarianIds,
  });
  await closeApp();
});

describe("Clients (dashboard)", () => {
  it("GET /api/v1/clients — liste réservée au staff (403 pour un CLIENT)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/clients",
      headers: { authorization: `Bearer ${clientToken}` },
      remoteAddress: "127.0.0.248",
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/clients — recherche par email", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clients?search=clients-test-`,
      headers: { authorization: `Bearer ${adminToken}` },
      remoteAddress: "127.0.0.248",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    const found = body.data.find((c: any) => c.id === clientId);
    expect(found).toBeTruthy();
    expect(found.petsCount).toBe(1);
    expect(typeof found.appointmentsCount).toBe("number");
  });

  it("GET /api/v1/clients/:id — détail avec pets, RDV et audit", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clients/${clientId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      remoteAddress: "127.0.0.248",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.client.id).toBe(clientId);
    expect(body.client.pets.length).toBe(1);
    expect(body.client.pets[0].id).toBe(petId);
    expect(Array.isArray(body.appointments)).toBe(true);
  });

  it("GET /api/v1/clients/:id — 404 pour un utilisateur non CLIENT", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clients/${clientId}`.replace(clientId, "00000000-0000-0000-0000-000000000000"),
      headers: { authorization: `Bearer ${adminToken}` },
      remoteAddress: "127.0.0.248",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("Mark conversation as read", () => {
  it("PATCH /api/v1/conversations/:id/read — marque les messages reçus comme lus", async () => {
    const convRes = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: { authorization: `Bearer ${clientToken}` },
      remoteAddress: "127.0.0.248",
      payload: { veterinarianId },
    });
    expect(convRes.statusCode).toBe(201);
    conversationId = convRes.json().conversation.id;
    createdConversationIds.push(conversationId);

    const vetLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      remoteAddress: "127.0.0.248",
      payload: { email: "admin@vetclinic.test", password: "REDACTED_DEMO_PASSWORD" },
    });
    const vetToken = vetLogin.json().token;

    const msg = await app.inject({
      method: "POST",
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${vetToken}` },
      remoteAddress: "127.0.0.248",
      payload: { content: "Bonjour, message du staff" },
    });
    expect(msg.statusCode).toBe(201);

    const read = await app.inject({
      method: "PATCH",
      url: `/api/v1/conversations/${conversationId}/read`,
      headers: { authorization: `Bearer ${clientToken}` },
      remoteAddress: "127.0.0.248",
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().updated).toBeGreaterThanOrEqual(1);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${clientToken}` },
      remoteAddress: "127.0.0.248",
    });
    const received = list.json().data.filter((m: any) => m.senderId !== clientId);
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received.every((m: any) => m.isRead === true)).toBe(true);
  });
});
