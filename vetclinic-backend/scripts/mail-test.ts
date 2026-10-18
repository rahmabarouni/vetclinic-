import "dotenv/config";
import {
  describeMailConfig,
  sendEmail,
} from "../src/services/mailer";

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage: npm run mail:test -- adresse@example.com");
    process.exit(1);
  }

  console.log("=== Configuration SMTP (le mot de passe n'est jamais affiche) ===");
  console.log(describeMailConfig());
  console.log("");

  const result = await sendEmail({
    to,
    subject: "Test SMTP VetClinic",
    text: "Ceci est un email de test envoye par le backend VetClinic.",
    html: "<p>Ceci est un <strong>email de test</strong> envoye par le backend VetClinic.</p>",
  });

  console.log("");
  if (result.mode === "dry-run") {
    console.log("MODE DRY-RUN : aucun email n'a ete envoye.");
    console.log("Renseignez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et SMTP_FROM");
    console.log("dans vetclinic-backend/.env puis relancez la meme commande.");
  } else if (result.mode === "test") {
    console.log("MODE TEST : transport simule (jsonTransport), aucun acces reseau.");
  } else if (result.ok) {
    console.log(`Email envoye via SMTP (messageId: ${result.messageId ?? "n/a"}).`);
  } else {
    console.log("Echec de l'envoi SMTP (voir le log [MAIL][ERROR] ci-dessus).");
  }

  process.exit(result.ok ? 0 : 1);
}

void main();
