import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, deleteTestEntities, prisma } from "./helper";

let app: any;
let clientToken: string;
let clientId: string;
const createdEmails: string[] = [];
const createdPetIds: string[] = [];
const createdNotificationIds: string[] = [];

async function registerClient(remoteAddress: string) {
  const email = `empty-body-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  createdEmails.push(email);
  const registerRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress,
    payload: { email, password: "TestPass123!", firstName: "Empty", lastName: "Body", privacyConsent: true },
  });
  expect(registerRes.statusCode).toBe(201);
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress,
    payload: { email, password: "TestPass123!" },
  });
  expect(login.statusCode).toBe(200);
  return { id: registerRes.json().user.id, token: login.json().token };
}

beforeAll(async () => {
  app = await getApp();
  const client = await registerClient("127.0.0.247");
  clientId = client.id;
  clientToken = client.token;
});

afterAll(async () => {
  if (createdNotificationIds.length > 0) {
    await prisma.notification.deleteMany({ where: { id: { in: createdNotificationIds } } });
  }
  await deleteTestEntities({ userEmails: createdEmails, petIds: createdPetIds });
  await closeApp();
});

describe("Corps JSON vide (parser tolérant)", () => {
  it("DELETE /api/v1/pets/:id sans corps et Content-Type JSON — accepté (suppression logique)", async () => {
    const petRes = await app.inject({
      method: "POST",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${clientToken}` },
      remoteAddress: "127.0.0.247",
      payload: { name: "EmptyBodyPet", species: "DOG" },
    });
    expect(petRes.statusCode).toBe(201);
    const petId = petRes.json().pet.id;
    createdPetIds.push(petId);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/pets/${petId}`,
      headers: { authorization: `Bearer ${clientToken}`, "content-type": "application/json" },
      remoteAddress: "127.0.0.247",
      payload: "",
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().message).toBe("Animal supprimé.");

    const check = await prisma.pet.findUnique({ where: { id: petId }, select: { isActive: true } });
    expect(check?.isActive).toBe(false);
  });

  it("PATCH /api/v1/notifications/:id/read sans corps — accepté", async () => {
    const notification = await prisma.notification.create({
      data: { recipientId: clientId, type: "SYSTEM", title: "Test vide", message: "corps vide" },
    });
    createdNotificationIds.push(notification.id);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/notifications/${notification.id}/read`,
      headers: { authorization: `Bearer ${clientToken}`, "content-type": "application/json" },
      remoteAddress: "127.0.0.247",
      payload: "",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().notification.isRead).toBe(true);
  });

  it("PATCH /api/v1/notifications/read-all sans corps — accepté", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/notifications/read-all",
      headers: { authorization: `Bearer ${clientToken}`, "content-type": "application/json" },
      remoteAddress: "127.0.0.247",
      payload: "",
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().updated).toBe("number");
  });

  it("PATCH /api/v1/notifications/mark-read sans corps — toujours 400 (validation de route non affaiblie)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/notifications/mark-read",
      headers: { authorization: `Bearer ${clientToken}`, "content-type": "application/json" },
      remoteAddress: "127.0.0.247",
      payload: "",
    });
    expect(res.statusCode).toBe(400);
  });

  it("JSON invalide — toujours 400 (le parser reste strict sur le contenu)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/notifications/mark-read",
      headers: { authorization: `Bearer ${clientToken}`, "content-type": "application/json" },
      remoteAddress: "127.0.0.247",
      payload: "{ not json",
    });
    expect(res.statusCode).toBe(400);
  });

  it("corps JSON valide toujours désérialisé", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/notifications/mark-read",
      headers: { authorization: `Bearer ${clientToken}`, "content-type": "application/json" },
      remoteAddress: "127.0.0.247",
      payload: JSON.stringify({ ids: ["00000000-0000-0000-0000-000000000000"] }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(0);
  });
});
