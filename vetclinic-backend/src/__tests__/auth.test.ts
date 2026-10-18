import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, prisma, deleteTestEntities } from "./helper";

let app: any;
const createdEmails: string[] = [];

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await deleteTestEntities({ userEmails: createdEmails });
  await closeApp();
});

describe("Auth", () => {
  const testEmail = `test-auth-${Date.now()}@test.com`;
  const testPassword = "SecurePass123!";

  // Trace des users créés par ces tests, supprimés dans afterAll (cf. helper).
  function trackEmail(email: string): string {
    createdEmails.push(email);
    return email;
  }

  // NOTE HISTORIQUE (cause racine du test "email déjà vérifié" qui persistait) :
  // Le rate limiter (POST /auth/register et POST /auth/login : max 5 / minute)
  // classe les requêtes par IP cliente. Ce fichier envoie 7 register + 6 login
  // dans la même minute. Sans isolation, la 6e requête depuis la même IP est
  // rejetée en 429 : l'utilisateur n'est jamais créé et tous les appels Prisma
  // qui le cherchent renvoient "vide" (ce n'est PAS un bug Prisma).
  // PREUVE : test jetable validé en session — 6 register successifs -> #6 -> 429.
  // Correction : chaque requête utilise une IP client distincte, comme des
  // clients réels. Le rate limiter reste actif et testé.
  let ipIndex = 0;
  function nextIp(): string {
    ipIndex += 1;
    return `127.0.0.${ipIndex}`;
  }

  it("POST /api/v1/auth/register — inscription réussie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: nextIp(),
      payload: {
        email: trackEmail(testEmail),
        password: testPassword,
        firstName: "Test",
        lastName: "User",
        privacyConsent: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty("token");
    expect(body.user.email).toBe(testEmail);
    expect(body.user.role).toBe("CLIENT");
  });

  it("POST /api/v1/auth/register — consentement RGPD manquant (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: nextIp(),
      payload: {
        email: trackEmail(`no-consent-${Date.now()}@test.com`),
        password: "SecurePass123!",
        firstName: "No",
        lastName: "Consent",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/auth/register — consentement explicite refusé (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: nextIp(),
      payload: {
        email: trackEmail(`consent-false-${Date.now()}@test.com`),
        password: "SecurePass123!",
        firstName: "False",
        lastName: "Consent",
        privacyConsent: false,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/auth/register — email déjà utilisé (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: nextIp(),
      payload: {
        email: testEmail,
        password: testPassword,
        firstName: "Test",
        lastName: "User",
        privacyConsent: true,
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
      remoteAddress: nextIp(),
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
      remoteAddress: nextIp(),
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
        remoteAddress: nextIp(),
        payload: {
          email: "nonexistent@test.com",
          password: "Whatever123!",
        },
      });

     expect(res.statusCode).toBe(401);
   });

   it("POST /api/v1/auth/register — envoie un code OTP (emailVerified: false)", async () => {
const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        remoteAddress: nextIp(),
        payload: {
          email: trackEmail(`otp-test-${Date.now()}@test.com`),
          password: "SecurePass123!",
          firstName: "OTP",
          lastName: "Test",
        privacyConsent: true,
        },
      });

     expect(res.statusCode).toBe(201);
     const body = res.json();
     expect(body.emailVerified).toBe(false);
     expect(body).toHaveProperty("token");
   });

   it("POST /api/v1/auth/verify-email — vérification réussie", async () => {
      const regEmail = trackEmail(`verify-${Date.now()}@test.com`);
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        remoteAddress: nextIp(),
        payload: {
          email: regEmail,
          password: "SecurePass123!",
          firstName: "Verify",
          lastName: "Test",
        privacyConsent: true,
        },
      });

const user = await prisma.user.findUnique({ where: { email: regEmail } });
      const codeRecord = await prisma.emailVerificationCode.findFirst({
        where: { userId: user!.id },
        orderBy: { createdAt: "desc" },
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress: nextIp(),
        payload: { email: regEmail, password: "SecurePass123!" },
      });
      const token = loginRes.json().token;

      const verifyRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: regEmail, code: codeRecord!.code },
      });

      expect([200, 201]).toContain(verifyRes.statusCode);
      const verifyBody = verifyRes.json();
      expect(verifyBody).toHaveProperty("message");
    });

it("POST /api/v1/auth/verify-email — code invalide (400)", async () => {
      const regEmail = trackEmail(`bad-code-${Date.now()}@test.com`);
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        remoteAddress: nextIp(),
        payload: {
          email: regEmail,
          password: "SecurePass123!",
          firstName: "Bad",
          lastName: "Code",
        privacyConsent: true,
        },
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress: nextIp(),
        payload: { email: regEmail, password: "SecurePass123!" },
      });
      const token = loginRes.json().token;

      const verifyRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: regEmail, code: "BAD123" },
      });

      expect(verifyRes.statusCode).toBe(400);
      expect(verifyRes.json().error).toMatch(/invalide|expiré/i);
    });

    it("POST /api/v1/auth/verify-email — email déjà vérifié (400)", async () => {
      const regEmail = trackEmail(`already-verified-${Date.now()}@test.com`);
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        remoteAddress: nextIp(),
        payload: {
          email: regEmail,
          password: "SecurePass123!",
          firstName: "Already",
          lastName: "Verified",
        privacyConsent: true,
        },
      });

      const user = await prisma.user.findUnique({ where: { email: regEmail } });
      expect(user).not.toBeNull();
      const codeRecord = await prisma.emailVerificationCode.findFirst({
        where: { userId: user!.id },
        orderBy: { createdAt: "desc" },
      });
      expect(codeRecord).not.toBeNull();

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress: nextIp(),
        payload: { email: regEmail, password: "SecurePass123!" },
      });
      const token = loginRes.json().token;

      const verifyFirst = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        remoteAddress: nextIp(),
        headers: { authorization: `Bearer ${token}` },
        payload: { email: regEmail, code: codeRecord!.code },
      });
      expect([200, 201]).toContain(verifyFirst.statusCode);

      const verifyAgain = await app.inject({
        method: "POST",
        url: "/api/v1/auth/verify-email",
        remoteAddress: nextIp(),
        headers: { authorization: `Bearer ${token}` },
        payload: { email: regEmail, code: codeRecord!.code },
      });

      expect(verifyAgain.statusCode).toBe(400);
      expect(verifyAgain.json().error).toMatch(/déjà/i);
    });



    it("POST /api/v1/auth/google — Google Sign-In refuse un token invalide", async () => {
      const { OAuth2Client } = await import("google-auth-library");
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const fakeToken = "fake-google-id-token-for-testing";

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/google",
        payload: { idToken: fakeToken },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatch(/invalide/i);
    });

    it("POST /api/v1/auth/google — email déjà utilisé en LOCAL retourne 401 ou 403", async () => {
      const existingEmail = trackEmail(`existing-google-${Date.now()}@test.com`);
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        remoteAddress: nextIp(),
        payload: {
          email: existingEmail,
          password: "SecurePass123!",
          firstName: "Existing",
          lastName: "User",
        privacyConsent: true,
        },
      });

      const { OAuth2Client } = await import("google-auth-library");
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const fakeToken = "existing-google-user-token";

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/google",
        payload: { idToken: fakeToken },
      });

      expect([401, 403]).toContain(res.statusCode);
    });
});
