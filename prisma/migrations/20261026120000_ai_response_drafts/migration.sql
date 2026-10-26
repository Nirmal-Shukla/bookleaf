ALTER TABLE "ai_processing_runs"
ADD COLUMN "knowledge_base_version" TEXT;

-- A ticket may have only one draft generation request in flight. This closes
-- the race between two admin tabs before either request reaches the provider.
CREATE UNIQUE INDEX "ai_processing_runs_one_active_response_draft_per_ticket"
ON "ai_processing_runs" ("ticket_id")
WHERE "task_type" = 'RESPONSE_DRAFT'
  AND "status" IN ('PENDING', 'PROCESSING');

-- Sent and discarded drafts remain as audit history, while exactly one draft
-- can be available for editing at a time.
CREATE UNIQUE INDEX "ai_drafts_one_active_per_ticket"
ON "ai_drafts" ("ticket_id")
WHERE "status" IN ('GENERATED', 'EDITED');
