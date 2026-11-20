import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { clearSentEmails, getTransport, sentEmails } from "../services/mailer";
import { deleteTestEntities, prisma } from "./helper";

const OLD_PASSWORD = "ResetFlowOld1!";
const NEW_PASSWORD = "ResetFlowNew2!";
const GENERIC_MESSAGE = "Si cet email existe, un code de réinitialisation a été envoyé.";
const INVALID_MESSAGE = "Code invalide ou expiré.";
const FLOOR_MS = 400;
const FLOOR_TOLERANCE_MS = 10;

let app: FastifyInstance;
let createdEmails: string[] = [];
let ipCounter = 0;

function newEmail(label: string): string {
  const email = `reset-test-${label}-${randomUUID().slice(0, 8)}@test.local`;
  createdEmails.push(email);
  return email;
}

async function newApp(): Promise<FastifyInstance> {
  const instance = await buildApp();
  await instance.ready();
  return instance;
}

async function register(email: string, instance: FastifyInstance = app): Promise<void> {
  const res = await instance.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email,
      password: OLD_PASSWORD,
      firstName: "Reset",
      lastName: "Test",
      privacyConsent: true,
    },
  });
  expect(res.statusCode).toBe(201);
}

/** IP source unique par appel : évite de déclencher la limite 3/min par erreur. */
function nextIp(): string {
  ipCounter += 1;
  return `192.0.2.${(ipCounter % 250) + 1}`;
}

async function postForgot(
  email: string,
  instance: FastifyInstance = app,
  fixedIp?: string
) {
  return instance.inject({
    method: "POST",
    url: "/api/v1/auth/forgot-password",
    payload: { email },
    remoteAddress: fixedIp ?? nextIp(),
  } as any);
}

async function postReset(
  payload: { email: string; code: string; newPassword: string },
  instance: FastifyInstance = app,
  fixedIp?: string
) {
  return instance.inject({
    method: "POST",
    url: "/api/v1/auth/reset-password",
    payload,
    remoteAddress: fixedIp ?? nextIp(),
  } as any);
}

async function login(email: string, password: string, instance: FastifyInstance = app) {
  return instance.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
    remoteAddress: nextIp(),
  } as any);
}

function resetMailsFor(email: string) {
  return sentEmails.filter(
    (mail) => mail.to === email && mail.subject.toLowerCase().includes("initialisation")
  );
}

function codeFrom(mail: (typeof sentEmails)[number]): string {
  const match = mail.text.match(/\b\d{6}\b/);
  expect(match).not.toBeNull();
  return match![0];
}

async function activeToken(userId: string) {
  const rows = await prisma.passwordResetToken.findMany({ where: { userId } });
  expect(rows).toHaveLength(1);
  return rows[0];
}

beforeEach(async () => {
  createdEmails = [];
  ipCounter = 0;
  clearSentEmails();
  app = await newApp();
});

afterEach(async () => {
  await deleteTestEntities({ userEmails: createdEmails });
  await app.close();
  vi.restoreAllMocks();
});

describe("mot de passe oublie - flux complet", () => {
  it("1. forgot avec un email existant : 200, email au bon destinataire, hash 64 hex sans code en clair", async () => {
    const email = newEmail("existing");
    await register(email);
    clearSentEmails();

    const started = Date.now();
    const res = await postForgot(email);
    const elapsed = Date.now() - started;

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: GENERIC_MESSAGE });
    expect(elapsed).toBeGreaterThanOrEqual(FLOOR_MS - FLOOR_TOLERANCE_MS);

    const mails = resetMailsFor(email);
    expect(mails).toHaveLength(1);
    const code = codeFrom(mails[0]);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    const token = await activeToken(user!.id);
    expect(token.token).toMatch(/^[0-9a-f]{64}$/);
    expect(token.token).not.toBe(code);
    expect(token.attempts).toBe(0);
  });

  it("2. forgot avec un email inexistant : memes reponse et delai, aucun email, aucune ligne", async () => {
    const email = newEmail("absent");
    clearSentEmails();

    const started = Date.now();
    const res = await postForgot(email);
    const elapsed = Date.now() - started;

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: GENERIC_MESSAGE });
    expect(elapsed).toBeGreaterThanOrEqual(FLOOR_MS - FLOOR_TOLERANCE_MS);
    expect(resetMailsFor(email)).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("3. forgot deux fois : un seul code actif, l'ancien ne fonctionne plus", async () => {
    const email = newEmail("twice");
    await register(email);
    clearSentEmails();

    await postForgot(email);
    const firstCode = codeFrom(resetMailsFor(email)[0]);
    await postForgot(email);
    const mails = resetMailsFor(email);
    expect(mails).toHaveLength(2);
    const secondCode = codeFrom(mails[1]);

    const user = await prisma.user.findUnique({ where: { email } });
    const token = await activeToken(user!.id);
    expect(token.token).not.toBe(firstCode);

    const oldAttempt = await postReset({ email, code: firstCode, newPassword: NEW_PASSWORD });
    expect(oldAttempt.statusCode).toBe(400);
    expect(oldAttempt.json()).toEqual({ error: INVALID_MESSAGE });

    const freshAttempt = await postReset({ email, code: secondCode, newPassword: NEW_PASSWORD });
    expect(freshAttempt.statusCode).toBe(200);
  });

  it("4. reset nominal : login ancien 401 / nouveau 200, code supprime, email de notification", async () => {
    const email = newEmail("nominal");
    await register(email);
    clearSentEmails();
    await postForgot(email);
    const code = codeFrom(resetMailsFor(email)[0]);

    const res = await postReset({ email, code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: "Mot de passe réinitialisé avec succès." });

    expect((await login(email, OLD_PASSWORD)).statusCode).toBe(401);
    expect((await login(email, NEW_PASSWORD)).statusCode).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(await prisma.passwordResetToken.count({ where: { userId: user!.id } })).toBe(0);
    expect(sentEmails.some((mail) => mail.to === email && mail.subject.includes("modifié"))).toBe(true);
  });

  it("5. mauvais code x5 : message uniforme, attempts=5, puis le bon code est refuse", async () => {
    const email = newEmail("wrong");
    await register(email);
    clearSentEmails();
    await postForgot(email);
    const code = codeFrom(resetMailsFor(email)[0]);
    const wrongCode = ((Number(code) + 1) % 1_000_000).toString().padStart(6, "0");

    for (let i = 0; i < 5; i++) {
      const res = await postReset({ email, code: wrongCode, newPassword: NEW_PASSWORD });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: INVALID_MESSAGE });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    expect((await activeToken(user!.id)).attempts).toBe(5);

    const correctAfterFive = await postReset({ email, code, newPassword: NEW_PASSWORD });
    expect(correctAfterFive.statusCode).toBe(400);
    expect(correctAfterFive.json()).toEqual({ error: INVALID_MESSAGE });
  });

  it("6. code expire via Prisma : 400 avec le message uniforme", async () => {
    const email = newEmail("expired");
    await register(email);
    clearSentEmails();
    await postForgot(email);
    const code = codeFrom(resetMailsFor(email)[0]);

    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.passwordResetToken.updateMany({
      where: { userId: user!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await postReset({ email, code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: INVALID_MESSAGE });
  });

  it("7. code reutilise : 400 avec le message uniforme", async () => {
    const email = newEmail("reuse");
    await register(email);
    clearSentEmails();
    await postForgot(email);
    const code = codeFrom(resetMailsFor(email)[0]);

    expect((await postReset({ email, code, newPassword: NEW_PASSWORD })).statusCode).toBe(200);
    const again = await postReset({ email, code, newPassword: NEW_PASSWORD });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ error: INVALID_MESSAGE });
  });

  it("8. mot de passe faible : 400 de validation, le code reste consommable", async () => {
    const email = newEmail("weak");
    await register(email);
    clearSentEmails();
    await postForgot(email);
    const code = codeFrom(resetMailsFor(email)[0]);

    const weak = await postReset({ email, code, newPassword: "court" });
    expect(weak.statusCode).toBe(400);

    const user = await prisma.user.findUnique({ where: { email } });
    const token = await activeToken(user!.id);
    expect(token.attempts).toBe(0);

    const strong = await postReset({ email, code, newPassword: NEW_PASSWORD });
    expect(strong.statusCode).toBe(200);
  });

  it("9. CONCURRENCE : 20 mauvais codes puis 10 bons codes simultanes", async () => {
    const wrongEmail = newEmail("concurrent-wrong");
    await register(wrongEmail);
    clearSentEmails();
    await postForgot(wrongEmail);
    const wrongRealCode = codeFrom(resetMailsFor(wrongEmail)[0]);
    const wrongCode = ((Number(wrongRealCode) + 1) % 1_000_000).toString().padStart(6, "0");

    const wrongResults = await Promise.all(
      Array.from({ length: 20 }, () =>
        postReset({ email: wrongEmail, code: wrongCode, newPassword: NEW_PASSWORD })
      )
    );
    const wrongStatuses = wrongResults.map((res) => res.statusCode);
    console.log(`[concurrence] mauvais code - statuts: ${JSON.stringify(wrongStatuses)}`);
    expect(wrongStatuses.every((status) => status === 400)).toBe(true);
    expect(wrongResults.every((res) => res.json().error === INVALID_MESSAGE)).toBe(true);

    const wrongUser = await prisma.user.findUnique({ where: { email: wrongEmail } });
    const wrongRows = await prisma.passwordResetToken.findMany({ where: { userId: wrongUser!.id } });
    const finalAttempts = wrongRows[0]?.attempts ?? 0;
    console.log(`[concurrence] attempts final: ${finalAttempts}`);
    expect(finalAttempts).toBe(5);

    const goodEmail = newEmail("concurrent-good");
    await register(goodEmail);
    clearSentEmails();
    await postForgot(goodEmail);
    const goodCode = codeFrom(resetMailsFor(goodEmail)[0]);

    const goodResults = await Promise.all(
      Array.from({ length: 10 }, () =>
        postReset({ email: goodEmail, code: goodCode, newPassword: NEW_PASSWORD })
      )
    );
    const goodStatuses = goodResults.map((res) => res.statusCode);
    console.log(`[concurrence] bon code - statuts: ${JSON.stringify(goodStatuses)}`);
    expect(goodStatuses.filter((status) => status === 200)).toHaveLength(1);
    expect(goodStatuses.filter((status) => status === 400)).toHaveLength(9);
    expect(
      goodResults.filter((res) => res.statusCode === 400).every((res) => res.json().error === INVALID_MESSAGE)
    ).toBe(true);
    const winnerMails = sentEmails.filter(
      (mail) => mail.to === goodEmail && mail.subject.includes("modifié")
    );
    console.log(`[concurrence] emails "mot de passe modifie": ${winnerMails.length}`);
    expect(winnerMails).toHaveLength(1);

    expect((await login(goodEmail, OLD_PASSWORD)).statusCode).toBe(401);
    expect((await login(goodEmail, NEW_PASSWORD)).statusCode).toBe(200);
    const goodUser = await prisma.user.findUnique({ where: { email: goodEmail } });
    expect(await prisma.passwordResetToken.count({ where: { userId: goodUser!.id } })).toBe(0);
  });

  it("10. limites de debit : 4e forgot et 6e reset => 429 (app dediee)", async () => {
    const limited = await newApp();
    try {
      const sameIp = "198.51.100.7";
      for (let i = 1; i <= 4; i++) {
        const email = newEmail(`rate-${i}`);
        const res = await postForgot(email, limited, sameIp);
        expect(res.statusCode).toBe(i === 4 ? 429 : 200);
      }
      for (let i = 1; i <= 6; i++) {
        const res = await postReset(
          { email: "reset-test-inconnu@test.local", code: "000000", newPassword: NEW_PASSWORD },
          limited,
          sameIp
        );
        expect(res.statusCode).toBe(i === 6 ? 429 : 400);
      }
    } finally {
      await limited.close();
    }
  });

  it("11. erreur du mailer : 200 generique, log sans code ni email complet", async () => {
    const email = newEmail("mailer-error");
    await register(email);
    clearSentEmails();

    const transport = getTransport();
    vi.spyOn(transport, "sendMail").mockRejectedValueOnce(new Error("echec simule"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await postForgot(email);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: GENERIC_MESSAGE });

    const code = codeFrom(resetMailsFor(email)[0]);
    const logs = errorSpy.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
    expect(logs).not.toContain(code);
    expect(logs).not.toContain(email);
  });

  it("12. aucun code dans les logs pendant le flux complet", async () => {
    const email = newEmail("no-log");
    await register(email);
    clearSentEmails();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await postForgot(email);
    const code = codeFrom(resetMailsFor(email)[0]);
    await postReset({ email, code, newPassword: NEW_PASSWORD });

    const logs = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((args) => args.map(String).join(" "))
      .join("\n");
    expect(logs).not.toContain(code);
  });

  it("13. outbox de dev : 404 hors development+dry-run, demarrage refuse en production+dry-run", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalMailMode = process.env.MAIL_MODE;

    async function withEnv<T>(
      nodeEnv: string,
      mailMode: string | undefined,
      fn: () => Promise<T>
    ): Promise<T> {
      process.env.NODE_ENV = nodeEnv;
      if (mailMode === undefined) delete process.env.MAIL_MODE;
      else process.env.MAIL_MODE = mailMode;
      try {
        return await fn();
      } finally {
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
        if (originalMailMode === undefined) delete process.env.MAIL_MODE;
        else process.env.MAIL_MODE = originalMailMode;
      }
    }

    await withEnv("development", "dry-run", async () => {
      const devApp = await newApp();
      try {
        const local = await devApp.inject({
          method: "GET",
          url: "/api/v1/dev/mail-outbox",
          remoteAddress: "127.0.0.1",
        } as any);
        expect(local.statusCode).toBe(200);
        const remote = await devApp.inject({
          method: "GET",
          url: "/api/v1/dev/mail-outbox",
          remoteAddress: "203.0.113.10",
        } as any);
        expect(remote.statusCode).toBe(403);
      } finally {
        await devApp.close();
      }
    });

    await withEnv("development", "smtp", async () => {
      const smtpApp = await newApp();
      try {
        const res = await smtpApp.inject({
          method: "GET",
          url: "/api/v1/dev/mail-outbox",
          remoteAddress: "127.0.0.1",
        } as any);
        expect(res.statusCode).toBe(404);
      } finally {
        await smtpApp.close();
      }
    });

    await withEnv("production", "smtp", async () => {
      const prodApp = await newApp();
      try {
        const res = await prodApp.inject({
          method: "GET",
          url: "/api/v1/dev/mail-outbox",
          remoteAddress: "127.0.0.1",
        } as any);
        expect(res.statusCode).toBe(404);
      } finally {
        await prodApp.close();
      }
    });

    await withEnv("production", "dry-run", async () => {
      await expect(buildApp()).rejects.toThrow("MAIL_MODE=dry-run est interdit en production.");
    });
  });

  it("14. echec force de user.update : transaction annulee, code non consomme", async () => {
    const email = newEmail("tx-fail");
    await register(email);
    clearSentEmails();
    await postForgot(email);
    const code = codeFrom(resetMailsFor(email)[0]);
    const before = await prisma.user.findUnique({ where: { email } });
    expect(before).not.toBeNull();

    // Middleware Prisma : intercepte aussi les requetes executees dans $transaction.
    app.prisma.$use((params, next) => {
      if (params.model === "User" && params.action === "update") {
        return Promise.reject(new Error("echec simule user.update"));
      }
      return next(params);
    });

    const res = await postReset({ email, code, newPassword: NEW_PASSWORD });
    console.log(`[transaction] user.update force en echec - statut HTTP: ${res.statusCode}`);
    expect(res.statusCode).not.toBe(200);

    const after = await prisma.user.findUnique({ where: { email } });
    expect(after!.passwordHash).toBe(before!.passwordHash);
    const token = await activeToken(before!.id);
    expect(token.usedAt).toBeNull();
    expect(token.attempts).toBe(0);
    expect((await login(email, OLD_PASSWORD)).statusCode).toBe(200);
    expect((await login(email, NEW_PASSWORD)).statusCode).toBe(401);
    expect(sentEmails.some((mail) => mail.to === email && mail.subject.includes("modifié"))).toBe(false);
  });

  it("15. 5 echecs simultanes puis bon code : 400 uniforme", async () => {
    const email = newEmail("exhausted-race");
    await register(email);
    clearSentEmails();
    await postForgot(email);
    const code = codeFrom(resetMailsFor(email)[0]);
    const bad = ((Number(code) + 1) % 1_000_000).toString().padStart(6, "0");

    const failures = await Promise.all(
      Array.from({ length: 5 }, () => postReset({ email, code: bad, newPassword: NEW_PASSWORD }))
    );
    expect(failures.every((res) => res.statusCode === 400)).toBe(true);
    const user = await prisma.user.findUnique({ where: { email } });
    expect((await activeToken(user!.id)).attempts).toBe(5);

    const good = await postReset({ email, code, newPassword: NEW_PASSWORD });
    expect(good.statusCode).toBe(400);
    expect(good.json()).toEqual({ error: INVALID_MESSAGE });
    expect((await login(email, OLD_PASSWORD)).statusCode).toBe(200);
  });

  it("16. anti-enumeration : ecart de duree email inconnu / code faux / code epuise", async () => {
    const unknown = newEmail("unknown-timing");
    const wrongEmail = newEmail("wrong-timing");
    const exhaustedEmail = newEmail("exhausted-timing");
    await register(wrongEmail);
    await register(exhaustedEmail);
    clearSentEmails();
    await postForgot(wrongEmail);
    await postForgot(exhaustedEmail);
    const wrongReal = codeFrom(resetMailsFor(wrongEmail)[0]);
    const exhaustedReal = codeFrom(resetMailsFor(exhaustedEmail)[0]);
    const bad = ((Number(wrongReal) + 1) % 1_000_000).toString().padStart(6, "0");

    for (let i = 0; i < 5; i++) {
      await postReset({ email: exhaustedEmail, code: bad, newPassword: NEW_PASSWORD });
    }

    async function measure(label: string, payload: { email: string; code: string; newPassword: string }) {
      const started = Date.now();
      const res = await postReset(payload);
      return { label, ms: Date.now() - started, status: res.statusCode };
    }

    const samples = [
      await measure("email inconnu", { email: unknown, code: bad, newPassword: NEW_PASSWORD }),
      await measure("code faux", { email: wrongEmail, code: bad, newPassword: NEW_PASSWORD }),
      await measure("code epuise", { email: exhaustedEmail, code: exhaustedReal, newPassword: NEW_PASSWORD }),
    ];
    const spread = Math.max(...samples.map((s) => s.ms)) - Math.min(...samples.map((s) => s.ms));
    console.log(
      `[anti-enumeration] ${samples.map((s) => `${s.label}=${s.ms}ms`).join(" | ")} | ecart=${spread}ms`
    );
    expect(samples.every((s) => s.status === 400)).toBe(true);
    expect(spread).toBeLessThan(100);
  });
});
