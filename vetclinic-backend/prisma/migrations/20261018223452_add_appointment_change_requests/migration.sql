-- CreateEnum
CREATE TYPE "AppointmentChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "appointment_change_requests" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "proposed_start" TIMESTAMP(3) NOT NULL,
    "proposed_end" TIMESTAMP(3) NOT NULL,
    "proposed_type" "AppointmentType" NOT NULL,
    "proposed_reason" TEXT,
    "status" "AppointmentChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "response_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_change_requests_appointment_id_idx" ON "appointment_change_requests"("appointment_id");

-- CreateIndex
CREATE INDEX "appointment_change_requests_status_idx" ON "appointment_change_requests"("status");

-- CreateIndex
CREATE INDEX "appointment_change_requests_requested_by_id_idx" ON "appointment_change_requests"("requested_by_id");

-- AddForeignKey
ALTER TABLE "appointment_change_requests" ADD CONSTRAINT "appointment_change_requests_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_change_requests" ADD CONSTRAINT "appointment_change_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_change_requests" ADD CONSTRAINT "appointment_change_requests_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
