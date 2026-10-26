-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('AUTHOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('Open', 'In Progress', 'Resolved', 'Closed');

-- CreateEnum
CREATE TYPE "ticket_category" AS ENUM ('Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality', 'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry');

-- CreateEnum
CREATE TYPE "ticket_priority" AS ENUM ('Critical', 'High', 'Medium', 'Low');

-- CreateEnum
CREATE TYPE "classification_state" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "classification_source" AS ENUM ('AI', 'ADMIN');

-- CreateEnum
CREATE TYPE "ai_task_type" AS ENUM ('CLASSIFICATION', 'RESPONSE_DRAFT');

-- CreateEnum
CREATE TYPE "ai_processing_status" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ai_draft_status" AS ENUM ('GENERATED', 'EDITED', 'SENT', 'DISCARDED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalized_email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_profiles" (
    "author_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "joined_date" DATE NOT NULL,

    CONSTRAINT "author_profiles_pkey" PRIMARY KEY ("author_id")
);

-- CreateTable
CREATE TABLE "books" (
    "book_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "publication_date" DATE,
    "status" TEXT NOT NULL,
    "mrp" DECIMAL(12,2),
    "author_royalty_per_copy" DECIMAL(12,2),
    "total_copies_sold" INTEGER NOT NULL,
    "total_royalty_earned" DECIMAL(14,2) NOT NULL,
    "royalty_paid" DECIMAL(14,2) NOT NULL,
    "royalty_pending" DECIMAL(14,2) NOT NULL,
    "last_royalty_payout_date" DATE,
    "print_partner" TEXT,
    "available_on" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "books_pkey" PRIMARY KEY ("book_id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "author_id" TEXT NOT NULL,
    "book_id" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'Open',
    "category" "ticket_category",
    "priority" "ticket_priority",
    "classification_state" "classification_state" NOT NULL DEFAULT 'PENDING',
    "classification_revision" INTEGER NOT NULL DEFAULT 0,
    "classification_state_updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category_source" "classification_source",
    "category_updated_at" TIMESTAMPTZ(3),
    "category_updated_by_user_id" UUID,
    "priority_source" "classification_source",
    "priority_updated_at" TIMESTAMPTZ(3),
    "priority_updated_by_user_id" UUID,
    "assigned_admin_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_responses" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "sent_by_user_id" UUID NOT NULL,
    "ai_draft_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_notes" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_processing_runs" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "task_type" "ai_task_type" NOT NULL,
    "status" "ai_processing_status" NOT NULL DEFAULT 'PENDING',
    "classification_revision_at_start" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "input_hash" TEXT,
    "provider_request_id" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "result" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_processing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_drafts" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "processing_run_id" UUID,
    "generated_body" TEXT NOT NULL,
    "current_body" TEXT NOT NULL,
    "status" "ai_draft_status" NOT NULL DEFAULT 'GENERATED',
    "edited_by_user_id" UUID,
    "edited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_status_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "from_status" "ticket_status",
    "to_status" "ticket_status" NOT NULL,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "auth_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_revoked_at_idx" ON "auth_sessions"("expires_at", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "author_profiles_user_id_key" ON "author_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "author_profiles_email_key" ON "author_profiles"("email");

-- CreateIndex
CREATE INDEX "author_profiles_joined_date_idx" ON "author_profiles"("joined_date");

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_author_id_status_idx" ON "books"("author_id", "status");

-- CreateIndex
CREATE INDEX "books_publication_date_idx" ON "books"("publication_date");

-- CreateIndex
CREATE UNIQUE INDEX "books_book_id_author_id_key" ON "books"("book_id", "author_id");

-- CreateIndex
CREATE INDEX "tickets_author_id_created_at_idx" ON "tickets"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "tickets_book_id_idx" ON "tickets"("book_id");

-- CreateIndex
CREATE INDEX "tickets_status_priority_created_at_idx" ON "tickets"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "tickets_category_status_created_at_idx" ON "tickets"("category", "status", "created_at");

-- CreateIndex
CREATE INDEX "tickets_classification_state_created_at_idx" ON "tickets"("classification_state", "created_at");

-- CreateIndex
CREATE INDEX "tickets_assigned_admin_id_status_idx" ON "tickets"("assigned_admin_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_responses_ai_draft_id_key" ON "ticket_responses"("ai_draft_id");

-- CreateIndex
CREATE INDEX "ticket_responses_ticket_id_created_at_idx" ON "ticket_responses"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "internal_notes_ticket_id_created_at_idx" ON "internal_notes"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_processing_runs_ticket_id_task_type_created_at_idx" ON "ai_processing_runs"("ticket_id", "task_type", "created_at");

-- CreateIndex
CREATE INDEX "ai_processing_runs_status_created_at_idx" ON "ai_processing_runs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_drafts_processing_run_id_key" ON "ai_drafts"("processing_run_id");

-- CreateIndex
CREATE INDEX "ai_drafts_ticket_id_status_created_at_idx" ON "ai_drafts"("ticket_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ticket_status_events_ticket_id_created_at_idx" ON "ticket_status_events"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "author_profiles" ADD CONSTRAINT "author_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "author_profiles"("author_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "author_profiles"("author_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_book_id_author_id_fkey" FOREIGN KEY ("book_id", "author_id") REFERENCES "books"("book_id", "author_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_updated_by_user_id_fkey" FOREIGN KEY ("category_updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priority_updated_by_user_id_fkey" FOREIGN KEY ("priority_updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_responses" ADD CONSTRAINT "ticket_responses_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_responses" ADD CONSTRAINT "ticket_responses_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_responses" ADD CONSTRAINT "ticket_responses_ai_draft_id_fkey" FOREIGN KEY ("ai_draft_id") REFERENCES "ai_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_processing_runs" ADD CONSTRAINT "ai_processing_runs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_processing_run_id_fkey" FOREIGN KEY ("processing_run_id") REFERENCES "ai_processing_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_edited_by_user_id_fkey" FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_status_events" ADD CONSTRAINT "ticket_status_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_status_events" ADD CONSTRAINT "ticket_status_events_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain integrity constraints not represented by Prisma's schema syntax.
ALTER TABLE "books"
  ALTER COLUMN "available_on" SET NOT NULL,
  ADD CONSTRAINT "books_total_copies_sold_nonnegative" CHECK ("total_copies_sold" >= 0),
  ADD CONSTRAINT "books_mrp_nonnegative" CHECK ("mrp" IS NULL OR "mrp" >= 0),
  ADD CONSTRAINT "books_author_royalty_per_copy_nonnegative" CHECK ("author_royalty_per_copy" IS NULL OR "author_royalty_per_copy" >= 0),
  ADD CONSTRAINT "books_total_royalty_earned_nonnegative" CHECK ("total_royalty_earned" >= 0),
  ADD CONSTRAINT "books_royalty_paid_nonnegative" CHECK ("royalty_paid" >= 0),
  ADD CONSTRAINT "books_royalty_pending_nonnegative" CHECK ("royalty_pending" >= 0);

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_classification_revision_nonnegative" CHECK ("classification_revision" >= 0);

ALTER TABLE "ai_processing_runs"
  ADD CONSTRAINT "ai_processing_runs_input_tokens_nonnegative" CHECK ("input_tokens" IS NULL OR "input_tokens" >= 0),
  ADD CONSTRAINT "ai_processing_runs_output_tokens_nonnegative" CHECK ("output_tokens" IS NULL OR "output_tokens" >= 0),
  ADD CONSTRAINT "ai_processing_runs_latency_ms_nonnegative" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0);
