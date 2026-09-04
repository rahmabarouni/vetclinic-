const isProduction = process.env.NODE_ENV === "production";

const requiredInProduction = [
  { name: "JWT_SECRET", value: process.env.JWT_SECRET },
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
    console.warn(`⚠️  [DEV] ${s.name} non défini — fallback utilisé. Ne pas déployer en production sans cette variable.`);
  }
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || "REDACTED_DEV_SECRET";
}

export function getMinioUser(): string {
  return process.env.MINIO_ROOT_USER || "REDACTED_MINIO_USER";
}

export function getMinioPassword(): string {
  return process.env.MINIO_ROOT_PASSWORD || "REDACTED_MINIO_PASSWORD";
}
