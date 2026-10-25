-- CreateEnum
CREATE TYPE "TricityCity" AS ENUM ('CHANDIGARH', 'MOHALI', 'PANCHKULA', 'ZIRAKPUR');

-- CreateEnum
CREATE TYPE "CourtSurface" AS ENUM ('ACRYLIC_HARD', 'CUSHIONED_ACRYLIC', 'SYNTHETIC_TURF', 'WOODEN', 'CONCRETE');

-- CreateEnum
CREATE TYPE "CourtType" AS ENUM ('INDOOR', 'OUTDOOR', 'COVERED_ROOFTOP');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "tbl_venue" (
    "id" SERIAL NOT NULL,
    "host_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "city" "TricityCity" NOT NULL,
    "area" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "google_maps_url" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "has_lighting" BOOLEAN NOT NULL DEFAULT true,
    "has_equipment_rental" BOOLEAN NOT NULL DEFAULT false,
    "has_parking" BOOLEAN NOT NULL DEFAULT true,
    "has_washroom" BOOLEAN NOT NULL DEFAULT true,
    "has_drinking_water" BOOLEAN NOT NULL DEFAULT true,
    "cancellation_cutoff_hours" INTEGER NOT NULL DEFAULT 6,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_venue_image" (
    "id" SERIAL NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_venue_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_court" (
    "id" SERIAL NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "surface" "CourtSurface" NOT NULL DEFAULT 'CUSHIONED_ACRYLIC',
    "type" "CourtType" NOT NULL DEFAULT 'OUTDOOR',
    "base_price_per_hour" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_schedule" (
    "id" SERIAL NOT NULL,
    "court_id" INTEGER NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "slot_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "price_override" INTEGER,

    CONSTRAINT "tbl_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_venue_slug_key" ON "tbl_venue"("slug");

-- CreateIndex
CREATE INDEX "tbl_venue_city_area_idx" ON "tbl_venue"("city", "area");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_schedule_court_id_day_of_week_key" ON "tbl_schedule"("court_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "tbl_venue" ADD CONSTRAINT "tbl_venue_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "tbl_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_venue_image" ADD CONSTRAINT "tbl_venue_image_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tbl_venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_court" ADD CONSTRAINT "tbl_court_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "tbl_venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_schedule" ADD CONSTRAINT "tbl_schedule_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "tbl_court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
