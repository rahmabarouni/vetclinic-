import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, prisma, deleteTestEntities } from "./helper";
import { UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

let app: any;
let clientToken: string;
let adminToken: string;
let veterinarianId: string;
const createdEmails: string[] = [];
const createdConversationIds: string[] = [];

beforeAll(async () => {
  app = await getApp();

  const passwordHash = await bcrypt.hash("SecurePass123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: `admin-vc-${Date.now()}@test.com` },
    update: {},
    create: {
      email: `admin-vc-${Date.now()}@test.com`,
      passwordHash,
      firstName: "Admin",
      lastName: "Test",
      role: UserRole.ADMIN,
    },
  });
  createdEmails.push(admin.email);
  const adminLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: admin.email, password: "SecurePass123!" },
  });
  adminToken = adminLogin.json().token;

  const vetUser = await prisma.user.upsert({
    where: { email: `vet-vc-${Date.now()}@test.com` },
    update: {},
    create: {
      email: `vet-vc-${Date.now()}@test.com`,
      passwordHash,
      firstName: "Dr",
      lastName: "Test",
      role: UserRole.VETERINARIAN,
    },
  });
  createdEmails.push(vetUser.email);
  await prisma.veterinarian.upsert({
    where: { userId: vetUser.id },
    update: {},
    create: {
      userId: vetUser.id,
      specialty: "Généraliste",
      bio: "Test bio",
      isAvailableForBooking: true,
    },
  });
  const vetLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: vetUser.email, password: "SecurePass123!" },
  });
  const vetRecord = await prisma.veterinarian.findFirst({ where: { userId: vetUser.id } });
  if (!vetRecord) throw new Error("Vet not found");
  veterinarianId = vetRecord.id;

  const client = await prisma.user.upsert({
    where: { email: `client-vc-${Date.now()}@test.com` },
    update: {},
    create: {
      email: `client-vc-${Date.now()}@test.com`,
      passwordHash,
      firstName: "Client",
      lastName: "Test",
      role: UserRole.CLIENT,
    },
  });
  createdEmails.push(client.email);
  const clientLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: client.email, password: "SecurePass123!" },
  });
  clientToken = clientLogin.json().token;
});

afterAll(async () => {
  await deleteTestEntities({
    userEmails: createdEmails,
    veterinarianIds: veterinarianId ? [veterinarianId] : [],
    conversationIds: createdConversationIds,
  });
  await closeApp();
});

describe("GET /api/v1/veterinarians", () => {
  it("Doit retourner la liste des vétérinaires disponibles", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/veterinarians?availableOnly=true",
      headers: { authorization: `Bearer ${clientToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const vet = body.data[0];
    expect(vet).toHaveProperty("id");
    expect(vet).toHaveProperty("specialty");
    expect(vet).toHaveProperty("isAvailableForBooking");
    expect(vet.isAvailableForBooking).toBe(true);
  });

  it("Doit retourner tous les vétérinaires sans filtre", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/veterinarians",
      headers: { authorization: `Bearer ${clientToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("Doit refuser l'accès sans token (401)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/veterinarians",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/v1/conversations", () => {
  it("Doit créer une conversation avec veterinarianId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        veterinarianId,
        initialMessage: "Bonjour",
      },
    });

    expect([200, 201]).toContain(res.statusCode);
    const body = res.json();
    expect(body).toHaveProperty("conversation");
    createdConversationIds.push(body.conversation.id);
  });

  it("Doit refuser si veterinarianId est absent (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        initialMessage: "Bonjour sans vétérinaire",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toMatch(/invalide|veterinarianId|Bad Request/i);
  });

  it("Doit refuser si veterinarianId est invalide (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        veterinarianId: "not-a-valid-uuid",
        initialMessage: "Test",
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
