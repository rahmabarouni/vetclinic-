import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";

const ORIGINAL_TRUSTED_PROXY = process.env.TRUSTED_PROXY;
const apps: FastifyInstance[] = [];

async function newApp(): Promise<FastifyInstance> {
  const instance = await buildApp();
  await instance.ready();
  apps.push(instance);
  return instance;
}

async function loginAttempt(app: FastifyInstance, ip?: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    ...(ip ? { headers: { "x-forwarded-for": ip } } : {}),
    payload: { email: "absent-proxy-test@test.local", password: "NoSuchUser1!" },
  });
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  if (ORIGINAL_TRUSTED_PROXY === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = ORIGINAL_TRUSTED_PROXY;
});

describe("TRUSTED_PROXY", () => {
  it("avec TRUSTED_PROXY=true, le quota suit X-Forwarded-For", async () => {
    process.env.TRUSTED_PROXY = "true";
    const app = await newApp();
    const ip = "198.51.100.10";

    for (let i = 0; i < 5; i += 1) {
      expect((await loginAttempt(app, ip)).statusCode).toBe(401);
    }
    expect((await loginAttempt(app, ip)).statusCode).toBe(429);
    expect((await loginAttempt(app, "198.51.100.11")).statusCode).toBe(401);
  });

  it("sans TRUSTED_PROXY, X-Forwarded-For est ignoré", async () => {
    process.env.TRUSTED_PROXY = "false";
    const app = await newApp();

    for (let i = 0; i < 5; i += 1) {
      expect((await loginAttempt(app, `198.51.100.${20 + i}`)).statusCode).toBe(401);
    }
    expect((await loginAttempt(app, "198.51.100.99")).statusCode).toBe(429);
  });
});
