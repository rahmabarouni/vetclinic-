import { randomBytes } from "node:crypto";

const isProduction = process.env.NODE_ENV === "production";

const requiredInProduction = [
  { name: "JWT_SECRET", value: process.env.JWT_SECRET },
  { name: "JWT_EXPIRES_IN", value: process.env.JWT_EXPIRES_IN },
  { name: "MINIO_ROOT_USER", value: process.env.MINIO_ROOT_USER },
  { name: "MINIO_ROOT_PASSWORD", value: process.env.MINIO_ROOT_PASSWORD },
];

const missing = requiredInProduction.filter((s) => !s.value || s.value.trim() === "");

if (isProduction && missing.length > 0) {
  const names = missing.map((s) => s.name).join(", ");
  console.error(`\n❌ DÉMARRAGE REFUSÉ — Variables manquantes en production: ${names}`);
  console.error("   Définissez ces variables d'environnement avant de relancer.\n");
  process.exit(1);
}

if (!isProduction && missing.length > 0) {
  for (const s of missing) {
    console.warn(`⚠️  [DEV] ${s.name} non défini — valeur éphémère utilisée. Ne pas déployer en production sans cette variable.`);
  }
}

/**
 * Valeurs éphémères générées en dev/test lorsque la variable est absente.
 * Aucun identifiant n'est codé en dur dans le dépôt.
 */
const ephemeralValues = new Map<string, string>();

function readSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }

  if (isProduction) {
    throw new Error(`${name} est requis en production.`);
  }

  let generated = ephemeralValues.get(name);
  if (!generated) {
    generated = randomBytes(24).toString("hex");
    ephemeralValues.set(name, generated);
  }
  return generated;
}

export function getJwtSecret(): string {
  return readSecret("JWT_SECRET");
}

/** Durée de validité d'un JWT, lue depuis JWT_EXPIRES_IN (défaut 7d hors prod). */
export function getJwtExpiresIn(): string {
  const value = process.env.JWT_EXPIRES_IN?.trim();
  if (value) return value;
  if (isProduction) {
    throw new Error("JWT_EXPIRES_IN est requis en production.");
  }
  return "7d";
}

export function getMinioUser(): string {
  return readSecret("MINIO_ROOT_USER");
}

export function getMinioPassword(): string {
  return readSecret("MINIO_ROOT_PASSWORD");
}
