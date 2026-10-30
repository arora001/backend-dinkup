-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'OPEN');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('OPEN', 'FULL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GameSeatStatus" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED');

-- CreateTable
CREATE TABLE "tbl_game" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "creator_id" INTEGER NOT NULL,
    "court_id" INTEGER NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "skill_level" "SkillLevel" NOT NULL DEFAULT 'OPEN',
    "seats_total" INTEGER NOT NULL DEFAULT 4,
    "seats_taken" INTEGER NOT NULL DEFAULT 1,
    "price_per_seat" INTEGER NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_game_seat" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "GameSeatStatus" NOT NULL DEFAULT 'HELD',
    "hold_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_game_seat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_game_booking_id_key" ON "tbl_game"("booking_id");

-- CreateIndex
CREATE INDEX "tbl_game_venue_id_idx" ON "tbl_game"("venue_id");

-- CreateIndex
CREATE INDEX "tbl_game_court_id_idx" ON "tbl_game"("court_id");

-- CreateIndex
CREATE INDEX "tbl_game_creator_id_idx" ON "tbl_game"("creator_id");

-- CreateIndex
CREATE INDEX "tbl_game_status_idx" ON "tbl_game"("status");

-- CreateIndex
CREATE INDEX "tbl_game_skill_level_idx" ON "tbl_game"("skill_level");

-- CreateIndex
CREATE INDEX "tbl_game_seat_game_id_idx" ON "tbl_game_seat"("game_id");

-- CreateIndex
CREATE INDEX "tbl_game_seat_user_id_idx" ON "tbl_game_seat"("user_id");

-- CreateIndex
CREATE INDEX "tbl_game_seat_status_idx" ON "tbl_game_seat"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_game_seat_game_id_user_id_key" ON "tbl_game_seat"("game_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_game_seat_game_id_seat_number_key" ON "tbl_game_seat"("game_id", "seat_number");

-- AddForeignKey
ALTER TABLE "tbl_game" ADD CONSTRAINT "tbl_game_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "tbl_booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_game" ADD CONSTRAINT "tbl_game_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "tbl_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_game" ADD CONSTRAINT "tbl_game_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "tbl_court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_game" ADD CONSTRAINT "tbl_game_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tbl_venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_game_seat" ADD CONSTRAINT "tbl_game_seat_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "tbl_game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_game_seat" ADD CONSTRAINT "tbl_game_seat_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
