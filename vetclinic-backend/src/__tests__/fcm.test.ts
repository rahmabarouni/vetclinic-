import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, prisma, deleteTestEntities } from "./helper";

let app: any;
const email = `fcm-${Date.now()}@test.com`;
const createdEmails: string[] = [email];

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await deleteTestEntities({ userEmails: createdEmails });
  await closeApp();
});

describe("FCM tokens", () => {
  let token: string;

  it("POST /api/v1/fcm-token — enregistre le token (authentifié)", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: "127.0.10.1",
      payload: {
        email,
        password: "SecurePass123!",
        firstName: "Fcm",
        lastName: "Test",
        privacyConsent: true,
      },
    });
    expect(reg.statusCode).toBe(201);
    token = reg.json().token;

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/fcm-token",
      headers: { authorization: `Bearer ${token}` },
      payload: { token: "device-token-abc123" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toMatch(/enregistr/i);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.fcmToken).toBe("device-token-abc123");
  });

  it("PUT /api/v1/fcm-token — refuse sans authentification (401)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/fcm-token",
      payload: { token: "x" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("DELETE /api/v1/fcm-token — supprime le token", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/fcm-token",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.fcmToken).toBeNull();
  });
});