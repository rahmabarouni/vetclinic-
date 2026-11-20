import fs from "node:fs";
import path from "node:path";
import type { SentEmailRecord } from "./mailer";

/**
 * Outbox de développement : les mails en mode `dry-run` sont écrits dans un
 * fichier ignoré par git. Le code de réinitialisation n'est jamais imprimé
 * dans la console : il est lu depuis ce fichier (ou l'endpoint de dev).
 */
export const DEV_OUTBOX_FILENAME = "dev-outbox.jsonl";
export const DEV_OUTBOX_PATH = path.resolve(process.cwd(), DEV_OUTBOX_FILENAME);

export function appendToOutbox(record: SentEmailRecord): void {
  try {
    fs.appendFileSync(DEV_OUTBOX_PATH, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // L'outbox de dev ne doit jamais faire échouer un envoi ni révéler son contenu.
    console.error("[MAIL][OUTBOX] ecriture impossible (outbox de dev uniquement)");
  }
}

export function readOutbox(limit = 100): SentEmailRecord[] {
  try {
    if (!fs.existsSync(DEV_OUTBOX_PATH)) return [];
    const lines = fs
      .readFileSync(DEV_OUTBOX_PATH, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    const records: SentEmailRecord[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        records.push(JSON.parse(line) as SentEmailRecord);
      } catch {
        // Ligne partielle : ignorée sans journaliser son contenu.
      }
    }
    return records;
  } catch {
    return [];
  }
}
