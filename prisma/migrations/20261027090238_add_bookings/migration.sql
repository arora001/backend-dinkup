-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "tbl_booking" (
    "id" SERIAL NOT NULL,
    "booking_reference" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "court_id" INTEGER NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "total_price" INTEGER NOT NULL,
    "cancellation_cutoff" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_booking_booking_reference_key" ON "tbl_booking"("booking_reference");

-- CreateIndex
CREATE INDEX "tbl_booking_user_id_idx" ON "tbl_booking"("user_id");

-- CreateIndex
CREATE INDEX "tbl_booking_slot_id_idx" ON "tbl_booking"("slot_id");

-- CreateIndex
CREATE INDEX "tbl_booking_venue_id_idx" ON "tbl_booking"("venue_id");

-- CreateIndex
CREATE INDEX "tbl_booking_status_idx" ON "tbl_booking"("status");

-- AddForeignKey
ALTER TABLE "tbl_booking" ADD CONSTRAINT "tbl_booking_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_booking" ADD CONSTRAINT "tbl_booking_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "tbl_slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_booking" ADD CONSTRAINT "tbl_booking_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "tbl_court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_booking" ADD CONSTRAINT "tbl_booking_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tbl_venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index ensuring at most one active (PENDING or CONFIRMED) booking per slot
CREATE UNIQUE INDEX IF NOT EXISTS "idx_booking_slot_active" 
ON "tbl_booking" ("slot_id") 
WHERE "status" IN ('PENDING', 'CONFIRMED');
