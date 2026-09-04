import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp } from "./helper";

let app: any;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

describe("Auth", () => {
  const testEmail = `test-auth-${Date.now()}@test.com`;
  const testPassword = "SecurePass123!";

  it("POST /api/v1/auth/register — inscription réussie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: testEmail,
        password: testPassword,
        firstName: "Test",
        lastName: "User",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty("token");
    expect(body.user.email).toBe(testEmail);
    expect(body.user.role).toBe("CLIENT");
  });

  it("POST /api/v1/auth/register — email déjà utilisé (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: testEmail,
        password: testPassword,
        firstName: "Test",
        lastName: "User",
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toMatch(/existe|déjà/i);
  });

  it("POST /api/v1/auth/login — connexion réussie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("token");
    expect(body.user.email).toBe(testEmail);
  });

  it("POST /api/v1/auth/login — mauvais mot de passe (401)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: testEmail,
        password: "WrongPassword999!",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/auth/login — email inexistant (401)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "nonexistent@test.com",
        password: "Whatever123!",
      },
    });

    expect(res.statusCode).toBe(401);
  });
});
