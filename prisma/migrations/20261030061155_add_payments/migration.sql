-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'CAPTURED', 'REFUND_PENDING', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'RAZORPAY');

-- CreateTable
CREATE TABLE "tbl_payment" (
    "id" SERIAL NOT NULL,
    "payment_reference" TEXT NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MOCK',
    "order_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "signature" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "refund_id" TEXT,
    "refund_reason" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_webhook_event" (
    "id" SERIAL NOT NULL,
    "event_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MOCK',
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_payment_payment_reference_key" ON "tbl_payment"("payment_reference");

-- CreateIndex
CREATE INDEX "tbl_payment_booking_id_idx" ON "tbl_payment"("booking_id");

-- CreateIndex
CREATE INDEX "tbl_payment_user_id_idx" ON "tbl_payment"("user_id");

-- CreateIndex
CREATE INDEX "tbl_payment_order_id_idx" ON "tbl_payment"("order_id");

-- CreateIndex
CREATE INDEX "tbl_payment_status_idx" ON "tbl_payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_webhook_event_event_id_key" ON "tbl_webhook_event"("event_id");

-- AddForeignKey
ALTER TABLE "tbl_payment" ADD CONSTRAINT "tbl_payment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "tbl_booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_payment" ADD CONSTRAINT "tbl_payment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
