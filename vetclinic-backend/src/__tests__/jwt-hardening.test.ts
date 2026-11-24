import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { clearSentEmails, sentEmails } from "../services/mailer";
import { deleteTestEntities, prisma } from "./helper";

const PASSWORD = "JwtHardening1!";
const NEW_PASSWORD = "JwtHardening2!";

let app: FastifyInstance;
let createdEmails: string[] = [];
let ipCounter = 0;

function newEmail(): string {
  const email = `jwt-test-${randomUUID().slice(0, 8)}@test.local`;
  createdEmails.push(email);
  return email;
}

function nextIp(): string {
  ipCounter += 1;
  return `192.0.2.${(ipCounter % 250) + 1}`;
}

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

async function register(email: string): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    remoteAddress: nextIp(),
    payload: {
      email,
      password: PASSWORD,
      firstName: "Jwt",
      lastName: "Test",
      privacyConsent: true,
    },
  });
  expect(res.statusCode).toBe(201);
}

async function login(email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    remoteAddress: nextIp(),
    payload: { email, password },
  });
}

beforeEach(async () => {
  createdEmails = [];
  ipCounter = 0;
  clearSentEmails();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await deleteTestEntities({ userEmails: createdEmails });
  await app.close();
});

describe("JWT - expiration et revocation", () => {
  it("le token émis contient exp et tokenVersion et authentifie une route protégée", async () => {
    const email = newEmail();
    await register(email);

    const res = await login(email, PASSWORD);
    expect(res.statusCode).toBe(200);
    const token = res.json().token as string;

    const payload = decodePayload(token);
    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) * 1000).toBeGreaterThan(Date.now());
    expect(payload.tokenVersion).toBe(0);

    const protectedRes = await app.inject({
      method: "GET",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(protectedRes.statusCode).toBe(200);
  });

  it("un token émis avant reset devient 401 après reset ; un nouveau token fonctionne", async () => {
    const email = newEmail();
    await register(email);

    const beforeReset = await login(email, PASSWORD);
    expect(beforeReset.statusCode).toBe(200);
    const oldToken = beforeReset.json().token as string;

    const stillValid = await app.inject({
      method: "GET",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${oldToken}` },
    });
    expect(stillValid.statusCode).toBe(200);

    clearSentEmails();
    const forgot = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      remoteAddress: nextIp(),
      payload: { email },
    });
    expect(forgot.statusCode).toBe(200);

    const mail = sentEmails.find(
      (m) => m.to === email && m.subject.toLowerCase().includes("initialisation")
    );
    expect(mail).toBeDefined();
    const code = mail!.text.match(/\b\d{6}\b/)![0];

    const reset = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      remoteAddress: nextIp(),
      payload: { email, code, newPassword: NEW_PASSWORD },
    });
    expect(reset.statusCode).toBe(200);

    const revoked = await app.inject({
      method: "GET",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${oldToken}` },
    });
    expect(revoked.statusCode).toBe(401);

    const afterReset = await login(email, NEW_PASSWORD);
    expect(afterReset.statusCode).toBe(200);
    const newToken = afterReset.json().token as string;
    expect(decodePayload(newToken).tokenVersion).toBe(1);

    const worksAgain = await app.inject({
      method: "GET",
      url: "/api/v1/pets",
      headers: { authorization: `Bearer ${newToken}` },
    });
    expect(worksAgain.statusCode).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.tokenVersion).toBe(1);
  });
});
