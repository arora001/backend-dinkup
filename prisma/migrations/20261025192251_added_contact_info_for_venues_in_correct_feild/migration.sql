/*
  Warnings:

  - You are about to drop the column `contact_email` on the `tbl_venue_image` table. All the data in the column will be lost.
  - You are about to drop the column `contact_phone` on the `tbl_venue_image` table. All the data in the column will be lost.
  - You are about to drop the column `whatsapp_number` on the `tbl_venue_image` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tbl_venue" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "whatsapp_number" TEXT;

-- AlterTable
ALTER TABLE "tbl_venue_image" DROP COLUMN "contact_email",
DROP COLUMN "contact_phone",
DROP COLUMN "whatsapp_number";
