import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSentEmails,
  describeMailConfig,
  getMailFrom,
  getMailMode,
  getTransport,
  resetTransportCache,
  sendEmail,
  sentEmails,
} from "../services/mailer";

const ENV_KEYS = [
  "NODE_ENV",
  "VITEST",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) out[key] = process.env[key];
  return out;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = snap[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("mailer", () => {
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    env = snapshotEnv();
    clearSentEmails();
    resetTransportCache();
  });

  afterEach(() => {
    restoreEnv(env);
    resetTransportCache();
    clearSentEmails();
    vi.restoreAllMocks();
  });

  it("utilise un transport JSON simule en mode test (aucun acces reseau)", () => {
    expect(getMailMode()).toBe("test");
    expect(getTransport().transporter.name).toBe("JSONTransport");
  });

  it("enregistre l'email envoye en mode test", async () => {
    const result = await sendEmail({
      to: "client@test.local",
      subject: "Sujet de test",
      text: "Corps texte",
      html: "<p>Corps HTML</p>",
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("test");
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      mode: "test",
      to: "client@test.local",
      subject: "Sujet de test",
      text: "Corps texte",
      html: "<p>Corps HTML</p>",
      hasIcs: false,
    });
  });

  it("signale la presence d'une piece jointe .ics", async () => {
    await sendEmail({
      to: "client@test.local",
      subject: "RDV confirme",
      text: "Votre RDV est confirme.",
      ics: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n",
      icsFilename: "rdv.ics",
    });

    expect(sentEmails[0].hasIcs).toBe(true);
    expect(sentEmails[0].ics).toContain("BEGIN:VCALENDAR");
  });

  it("ignore totalement la config SMTP en mode test (host injoignable)", async () => {
    process.env.SMTP_HOST = "192.0.2.1";
    process.env.SMTP_PASS = "secret-pour-le-test";
    resetTransportCache();

    const started = Date.now();
    const result = await sendEmail({
      to: "client@test.local",
      subject: "Sans reseau",
      text: "Corps",
    });

    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("test");
    expect(getTransport().transporter.name).toBe("JSONTransport");
  });

  it("n'expose jamais le mot de passe dans la description de config", () => {
    process.env.SMTP_PASS = "mot-de-passe-ultra-secret";
    const described = describeMailConfig();

    expect(described).not.toContain("mot-de-passe-ultra-secret");
    expect(described).toContain("(renseigne)");
  });

  it("choisit l'expediteur : SMTP_FROM prioritaire, sinon SMTP_USER, sinon defaut", () => {
    process.env.SMTP_FROM = "VetClinic <rdv@vetclinic.test>";
    process.env.SMTP_USER = "apikey";
    expect(getMailFrom()).toBe("VetClinic <rdv@vetclinic.test>");

    delete process.env.SMTP_FROM;
    expect(getMailFrom()).toBe("VetClinic <apikey>");

    delete process.env.SMTP_USER;
    expect(getMailFrom()).toBe("VetClinic <no-reply@vetclinic.local>");
  });

  it("passe en dry-run sans SMTP_PASS : resume journalise, aucun contenu sensible, sans echec", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    delete process.env.SMTP_PASS;
    process.env.SMTP_FROM = "VetClinic <rdv@vetclinic.test>";
    resetTransportCache();

    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });

    const result = await sendEmail({
      to: "client@test.local",
      subject: "Code de verification",
      text: "Votre code est ABC123",
      html: "<p>Votre code est <strong>ABC123</strong></p>",
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("dry-run");
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].mode).toBe("dry-run");

    const summary = logged.join("\n");
    expect(summary).toContain("[MAIL][DRY-RUN]");
    expect(summary).toContain("to=client@test.local");
    expect(summary).toContain('subject="Code de verification"');
    expect(summary).toContain("ics=non");
    expect(summary).not.toContain("ABC123");
  });

  it("n'echoue jamais la requete appelante (erreur de transport)", async () => {
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.SMTP_PASS = "nimporte";
    resetTransportCache();

    const transport = getTransport();
    expect(getMailMode()).toBe("smtp");
    expect(transport.transporter.name).toBe("SMTP");

    vi.spyOn(transport, "sendMail").mockRejectedValue(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendEmail({
      to: "client@test.local",
      subject: "Echec simule",
      text: "Corps",
    });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe("smtp");
    expect(errSpy).toHaveBeenCalled();
    expect(sentEmails).toHaveLength(0);
  });
});
