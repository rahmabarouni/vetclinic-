import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp } from "./helper";

let app: any;
let clientToken: string;
let adminToken: string;

beforeAll(async () => {
  app = await getApp();

  // Register a fresh client
  const email = `rbac-client-${Date.now()}@test.com`;
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: "TestPass123!", firstName: "RBAC", lastName: "Client", privacyConsent: true },
  });
  const clientLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password: "TestPass123!" },
  });
  clientToken = clientLogin.json().token;

  // Login as admin
  const adminLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "admin@vetclinic.test", password: "REDACTED_DEMO_PASSWORD" },
  });
  adminToken = adminLogin.json().token;
});

afterAll(async () => {
  await closeApp();
});

describe("RBAC", () => {
  it("GET /api/v1/dashboard/stats — CLIENT reçoit 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
      headers: { authorization: `Bearer ${clientToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it("GET /api/v1/dashboard/stats — ADMIN accède (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/stats",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("stats");
  });

  it("POST /api/v1/veterinarians — CLIENT reçoit 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/veterinarians",
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        email: `vet-test-${Date.now()}@test.com`,
        password: "VetPass123!",
        firstName: "Vet",
        lastName: "Test", privacyConsent: true,
        specialty: "Test",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /api/v1/veterinarians — sans token reçoit 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/veterinarians",
      payload: {
        email: `vet-test-${Date.now()}@test.com`,
        password: "VetPass123!",
        firstName: "Vet",
        lastName: "Test", privacyConsent: true,
        specialty: "Test",
      },
    });

    expect(res.statusCode).toBe(401);
  });
});
