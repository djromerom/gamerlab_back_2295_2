ALTER TABLE "evaluacion"
ADD COLUMN "content_hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "idempotency_key" TEXT;

CREATE TABLE "evaluation_idempotency" (
    "id" SERIAL NOT NULL,
    "juror_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    CONSTRAINT "evaluation_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluation_idempotency_juror_id_key_key"
ON "evaluation_idempotency"("juror_id", "key");
