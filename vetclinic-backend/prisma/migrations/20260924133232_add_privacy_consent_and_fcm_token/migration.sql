-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fcm_token" TEXT,
ADD COLUMN     "privacy_consent_at" TIMESTAMP(3);
