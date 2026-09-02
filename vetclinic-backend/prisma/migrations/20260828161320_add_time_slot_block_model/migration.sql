-- CreateTable
CREATE TABLE "time_slot_blocks" (
    "id" TEXT NOT NULL,
    "veterinarian_id" TEXT NOT NULL,
    "start_datetime" TIMESTAMP(3) NOT NULL,
    "end_datetime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_slot_blocks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "time_slot_blocks" ADD CONSTRAINT "time_slot_blocks_veterinarian_id_fkey" FOREIGN KEY ("veterinarian_id") REFERENCES "veterinarians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
