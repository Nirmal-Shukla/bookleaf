-- Preserve assignment time independently from unrelated ticket updates.
ALTER TABLE "tickets"
ADD COLUMN "assigned_at" TIMESTAMPTZ(3);

-- A client-generated UUID makes public response retries idempotent. Existing
-- rows remain valid because PostgreSQL unique indexes allow multiple NULLs.
ALTER TABLE "ticket_responses"
ADD COLUMN "idempotency_key" UUID;

CREATE UNIQUE INDEX "ticket_responses_idempotency_key_key"
ON "ticket_responses"("idempotency_key");
