-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED');

-- CreateTable
CREATE TABLE "tbl_slot" (
    "id" SERIAL NOT NULL,
    "court_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "held_by" INTEGER,
    "hold_expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tbl_slot_court_id_date_idx" ON "tbl_slot"("court_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_slot_court_id_date_start_time_key" ON "tbl_slot"("court_id", "date", "start_time");

-- AddForeignKey
ALTER TABLE "tbl_slot" ADD CONSTRAINT "tbl_slot_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "tbl_court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_slot" ADD CONSTRAINT "tbl_slot_held_by_fkey" FOREIGN KEY ("held_by") REFERENCES "tbl_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
