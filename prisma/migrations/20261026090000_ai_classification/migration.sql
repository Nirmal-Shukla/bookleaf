ALTER TABLE "tickets"
ADD COLUMN "creation_idempotency_key" UUID;

CREATE UNIQUE INDEX "tickets_creation_idempotency_key_key"
ON "tickets"("creation_idempotency_key");
