import { describe, expect, it } from "vitest";
import { registerSchema } from "../routes/auth";

describe("validation register - compatibilite Zod 4", () => {
  it("conserve exactement le message de validation produit avant la correction", () => {
    const parsed = registerSchema.safeParse({
      email: "validation@test.local",
      password: "ValidPass1!",
      firstName: "Validation",
      lastName: "Test",
      privacyConsent: false,
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(parsed.error.flatten().fieldErrors.privacyConsent).toEqual([
      "Invalid input: expected true",
    ]);
  });

  it("accepte un consentement explicite", () => {
    const parsed = registerSchema.safeParse({
      email: "validation@test.local",
      password: "ValidPass1!",
      firstName: "Validation",
      lastName: "Test",
      privacyConsent: true,
    });

    expect(parsed.success).toBe(true);
  });
});
