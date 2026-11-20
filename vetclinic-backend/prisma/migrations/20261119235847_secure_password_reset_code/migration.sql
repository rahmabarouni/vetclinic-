-- Les anciens tokens (texte clair, durée de vie 1 h) ne sont pas compatibles
-- avec le nouveau format : code à 6 chiffres stocké sous forme de hash SHA-256.
DELETE FROM "password_reset_tokens";

-- DropIndex
DROP INDEX "password_reset_tokens_token_key";

-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;
