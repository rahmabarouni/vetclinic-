import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, deleteTestEntities } from "./helper";

let app: any;
let clientAToken: string;
let clientBToken: string;
let petAId: string;
const createdEmails: string[] = [];
const createdPetIds: string[] = [];

beforeAll(async () => {
  app = await getApp();

  // Create client A
  const emailA = `owner-a-${Date.now()}@test.com`;
  createdEmails.push(emailA);
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: emailA, password: "TestPass123!", firstName: "Owner", lastName: "A", privacyConsent: true },
  });
  const loginA = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: emailA, password: "TestPass123!" },
  });
  clientAToken = loginA.json().token;

  // Create client B
  const emailB = `owner-b-${Date.now()}@test.com`;
  createdEmails.push(emailB);
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: emailB, password: "TestPass123!", firstName: "Owner", lastName: "B", privacyConsent: true },
  });
  const loginB = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: emailB, password: "TestPass123!" },
  });
  clientBToken = loginB.json().token;

  // Create a pet for client A
  const petRes = await app.inject({
    method: "POST",
    url: "/api/v1/pets",
    headers: { authorization: `Bearer ${clientAToken}` },
    payload: { name: "Rex", species: "DOG", breed: "Berger" },
  });
  petAId = petRes.json().pet.id;
  createdPetIds.push(petAId);
});

afterAll(async () => {
  await deleteTestEntities({ userEmails: createdEmails, petIds: createdPetIds });
  await closeApp();
});

describe("Ownership", () => {
  it("GET /api/v1/pets/{id} — CLIENT ne voit pas le pet d'un autre CLIENT", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/pets/${petAId}`,
      headers: { authorization: `Bearer ${clientBToken}` },
    });

    // Should be 403 or 404 (not 200)
    expect([403, 404]).toContain(res.statusCode);
  });

  it("PATCH /api/v1/pets/{id} — CLIENT ne modifie pas le pet d'un autre", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/pets/${petAId}`,
      headers: { authorization: `Bearer ${clientBToken}` },
      payload: { name: "Hacked" },
    });

    expect([403, 404]).toContain(res.statusCode);
  });

  it("DELETE /api/v1/pets/{id} — CLIENT ne supprime pas le pet d'un autre", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/pets/${petAId}`,
      headers: { authorization: `Bearer ${clientBToken}` },
    });

    expect([403, 404]).toContain(res.statusCode);
  });

  it("GET /api/v1/pets/{id}/medical-records — CLIENT ne voit pas les dossiers d'un autre", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/pets/${petAId}/medical-records`,
      headers: { authorization: `Bearer ${clientBToken}` },
    });

    expect([403, 404]).toContain(res.statusCode);
  });

  it("GET /api/v1/pets — CLIENT ne voit que ses propres pets", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${clientBToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Client B should have 0 pets (only created by client A)
    expect(body.data.length).toBe(0);
  });
});
