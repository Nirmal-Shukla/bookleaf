import "server-only";

import {
  ClassificationState,
  AiProcessingStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole,
} from "@/generated/prisma/client";
import {
  assertClassificationRetryable,
  processTicketClassification,
} from "@/server/ai/classification";
import {
  processResponseDraft,
  type DraftRuntimeOptions,
} from "@/server/ai/response-drafts";
import type { AuthenticatedUser } from "@/server/auth/authorization";
import { AuthorizationError } from "@/server/auth/errors";
import {
  type AdminTicketDetailRecord,
  type AdminTicketSummaryRecord,
  createAdminInternalNote,
  createIdempotentPublicResponse,
  findAdminTicket,
  findAdminTickets,
  updateAdminTicket,
} from "@/server/repositories/admin-tickets";
import { editResponseDraft } from "@/server/repositories/response-drafts";
import type {
  AdminTicket,
  AdminTicketCategory,
  AdminTicketData,
  AdminTicketPriority,
  AdminTicketSummary,
  AdminTicketsData,
} from "@/types/admin-tickets";
import type { AuthorTicketStatus } from "@/types/tickets";

export const ADMIN_DATE_BOUNDARY_DESCRIPTION =
  "Creation dates are UTC calendar dates. The start date begins at 00:00:00 UTC; the end date includes the full selected day and ends immediately before 00:00:00 UTC on the following day.";

export const ADMIN_TICKET_SORT_DESCRIPTION =
  "Open and In Progress tickets appear before Resolved and Closed tickets. Within each status, classified priorities use the explicit severity rank Critical, High, Medium, Low; unclassified priority follows, then oldest creation time and ticket ID.";

const statusLabels = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.IN_PROGRESS]: "In Progress",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
} satisfies Record<TicketStatus, AuthorTicketStatus>;

const categoryLabels = {
  [TicketCategory.ROYALTY_PAYMENTS]: "Royalty & Payments",
  [TicketCategory.ISBN_METADATA_ISSUES]: "ISBN & Metadata Issues",
  [TicketCategory.PRINTING_QUALITY]: "Printing & Quality",
  [TicketCategory.DISTRIBUTION_AVAILABILITY]: "Distribution & Availability",
  [TicketCategory.BOOK_STATUS_PRODUCTION_UPDATES]:
    "Book Status & Production Updates",
  [TicketCategory.GENERAL_INQUIRY]: "General Inquiry",
} satisfies Record<TicketCategory, AdminTicketCategory>;

const priorityLabels = {
  [TicketPriority.CRITICAL]: "Critical",
  [TicketPriority.HIGH]: "High",
  [TicketPriority.MEDIUM]: "Medium",
  [TicketPriority.LOW]: "Low",
} satisfies Record<TicketPriority, AdminTicketPriority>;

const classificationStateLabels = {
  [ClassificationState.PENDING]: "Pending",
  [ClassificationState.PROCESSING]: "Processing",
  [ClassificationState.COMPLETED]: "Completed",
  [ClassificationState.FAILED]: "Failed",
} as const;

const processingStatusLabels = {
  [AiProcessingStatus.PENDING]: "Pending",
  [AiProcessingStatus.PROCESSING]: "Processing",
  [AiProcessingStatus.SUCCEEDED]: "Succeeded",
  [AiProcessingStatus.FAILED]: "Failed",
} as const;

export class IdempotencyConflictError extends Error {
  readonly status = 409;
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("This response key was already used for different content.");
    this.name = "IdempotencyConflictError";
  }
}

export class DraftConflictError extends Error {
  readonly status = 409;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DraftConflictError";
    this.code = code;
  }
}

function assertAdmin(user: AuthenticatedUser) {
  if (user.role !== UserRole.ADMIN) throw new AuthorizationError();
}

function actor(value: { id: string; email: string } | null) {
  return value ? { id: value.id, email: value.email } : null;
}

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function serializeAdminTicketSummary(
  ticket: AdminTicketSummaryRecord,
): AdminTicketSummary {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: statusLabels[ticket.status],
    category: ticket.category ? categoryLabels[ticket.category] : null,
    priority: ticket.priority ? priorityLabels[ticket.priority] : null,
    classificationState: classificationStateLabels[ticket.classificationState],
    classificationStateUpdatedAt:
      ticket.classificationStateUpdatedAt.toISOString(),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    author: ticket.author,
    book: ticket.book,
    assignedAdmin: actor(ticket.assignedAdmin),
    assignedAt: ticket.assignedAt?.toISOString() ?? null,
    publicResponseCount: ticket._count.responses,
    internalNoteCount: ticket._count.internalNotes,
  };
}

export function serializeAdminTicket(ticket: AdminTicketDetailRecord): AdminTicket {
  const classificationAttempt = ticket.latestClassificationAttempt;
  const draftAttempt = ticket.latestDraftAttempt;
  return {
    ...serializeAdminTicketSummary(ticket),
    description: ticket.description,
    book: ticket.book
      ? {
          bookId: ticket.book.bookId,
          title: ticket.book.title,
          isbn: ticket.book.isbn,
          status: ticket.book.status,
          publicationDate: dateOnly(ticket.book.publicationDate),
        }
      : null,
    categoryUpdatedAt: ticket.categoryUpdatedAt?.toISOString() ?? null,
    categoryUpdatedBy: actor(ticket.categoryUpdatedBy),
    priorityUpdatedAt: ticket.priorityUpdatedAt?.toISOString() ?? null,
    priorityUpdatedBy: actor(ticket.priorityUpdatedBy),
    responses: ticket.responses.map((response) => ({
      id: response.id,
      body: response.body,
      createdAt: response.createdAt.toISOString(),
      sentBy: actor(response.sentBy)!,
    })),
    internalNotes: ticket.internalNotes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      admin: actor(note.admin)!,
    })),
    statusEvents: ticket.statusEvents.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus ? statusLabels[event.fromStatus] : null,
      toStatus: statusLabels[event.toStatus],
      createdAt: event.createdAt.toISOString(),
      changedBy: actor(event.changedBy),
    })),
    latestClassificationAttempt: classificationAttempt
      ? {
          id: classificationAttempt.id,
          status: processingStatusLabels[classificationAttempt.status],
          provider: classificationAttempt.provider,
          model: classificationAttempt.model,
          promptVersion: classificationAttempt.promptVersion,
          errorCode: classificationAttempt.errorCode,
          errorMessage: classificationAttempt.errorMessage,
          startedAt: classificationAttempt.startedAt?.toISOString() ?? null,
          completedAt: classificationAttempt.completedAt?.toISOString() ?? null,
          createdAt: classificationAttempt.createdAt.toISOString(),
        }
      : null,
    responseDraft: ticket.activeDraft
      ? {
          id: ticket.activeDraft.id,
          body: ticket.activeDraft.currentBody,
          status: ticket.activeDraft.status === "EDITED" ? "Edited" : "Generated",
          editedAt: ticket.activeDraft.editedAt?.toISOString() ?? null,
          editedBy: actor(ticket.activeDraft.editedBy),
          createdAt: ticket.activeDraft.createdAt.toISOString(),
          updatedAt: ticket.activeDraft.updatedAt.toISOString(),
        }
      : null,
    latestDraftAttempt: draftAttempt
      ? {
          id: draftAttempt.id,
          status: processingStatusLabels[draftAttempt.status],
          provider: draftAttempt.provider,
          model: draftAttempt.model,
          promptVersion: draftAttempt.promptVersion,
          knowledgeBaseVersion: draftAttempt.knowledgeBaseVersion,
          inputTokens: draftAttempt.inputTokens,
          outputTokens: draftAttempt.outputTokens,
          latencyMs: draftAttempt.latencyMs,
          errorCode: draftAttempt.errorCode,
          errorMessage: draftAttempt.errorMessage,
          startedAt: draftAttempt.startedAt?.toISOString() ?? null,
          completedAt: draftAttempt.completedAt?.toISOString() ?? null,
          createdAt: draftAttempt.createdAt.toISOString(),
        }
      : null,
    shouldInitiateDraft:
      !ticket.activeDraft && !ticket.hasDraftHistory && !draftAttempt,
  };
}

function startOfUtcDate(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function endOfUtcDateExclusive(value: string | undefined) {
  if (!value) return undefined;
  const result = new Date(`${value}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

export async function listTicketsForAdmin(
  user: AuthenticatedUser,
  input: {
    page: number;
    pageSize: number;
    status?: TicketStatus;
    category?: TicketCategory | "UNCLASSIFIED";
    priority?: TicketPriority | "UNCLASSIFIED";
    createdFrom?: string;
    createdTo?: string;
  },
): Promise<AdminTicketsData> {
  assertAdmin(user);
  const result = await findAdminTickets(
    {
      status: input.status,
      category: input.category,
      priority: input.priority,
      createdFrom: startOfUtcDate(input.createdFrom),
      createdToExclusive: endOfUtcDateExclusive(input.createdTo),
    },
    input.page,
    input.pageSize,
  );

  return {
    tickets: result.tickets.map(serializeAdminTicketSummary),
    oldestUnresolved: result.oldestUnresolved
      ? {
          id: result.oldestUnresolved.id,
          subject: result.oldestUnresolved.subject,
          createdAt: result.oldestUnresolved.createdAt.toISOString(),
          priority: result.oldestUnresolved.priority
            ? priorityLabels[result.oldestUnresolved.priority]
            : null,
        }
      : null,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / input.pageSize),
    },
    filters: {
      status: input.status ?? null,
      category: input.category ?? null,
      priority: input.priority ?? null,
      createdFrom: input.createdFrom ?? null,
      createdTo: input.createdTo ?? null,
    },
    sort: { description: ADMIN_TICKET_SORT_DESCRIPTION },
    dateBoundary: {
      timezone: "UTC",
      description: ADMIN_DATE_BOUNDARY_DESCRIPTION,
    },
  };
}

export async function getTicketForAdmin(
  user: AuthenticatedUser,
  ticketId: string,
): Promise<AdminTicketData> {
  assertAdmin(user);
  const ticket = await findAdminTicket(ticketId);
  if (!ticket) {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested ticket was not found.",
      404,
    );
  }
  return { ticket: serializeAdminTicket(ticket) };
}

export async function changeTicketAsAdmin(
  user: AuthenticatedUser,
  ticketId: string,
  changes: {
    category?: TicketCategory | null;
    priority?: TicketPriority | null;
    status?: TicketStatus;
    assignToSelf?: true;
  },
): Promise<AdminTicketData> {
  assertAdmin(user);
  const ticket = await updateAdminTicket({
    ticketId,
    adminUserId: user.id,
    ...changes,
  });
  if (!ticket) {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested ticket was not found.",
      404,
    );
  }
  return { ticket: serializeAdminTicket(ticket) };
}

export async function addInternalNoteAsAdmin(
  user: AuthenticatedUser,
  ticketId: string,
  body: string,
): Promise<AdminTicketData> {
  assertAdmin(user);
  const ticket = await createAdminInternalNote({
    ticketId,
    adminUserId: user.id,
    body,
  });
  if (!ticket) {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested ticket was not found.",
      404,
    );
  }
  return { ticket: serializeAdminTicket(ticket) };
}

export async function sendPublicResponseAsAdmin(
  user: AuthenticatedUser,
  ticketId: string,
  input: { body: string; idempotencyKey: string; aiDraftId?: string },
): Promise<AdminTicketData> {
  assertAdmin(user);
  const result = await createIdempotentPublicResponse({
    ticketId,
    adminUserId: user.id,
    ...input,
  });
  if (result.kind === "missing") {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested ticket was not found.",
      404,
    );
  }
  if (result.kind === "draft_conflict") {
    throw new DraftConflictError(
      "DRAFT_NOT_SENDABLE",
      "This draft is no longer available to send. Refresh the ticket before trying again.",
    );
  }
  if (result.kind === "conflict") throw new IdempotencyConflictError();
  if (!result.ticket) throw new Error("Ticket response could not be loaded.");
  return { ticket: serializeAdminTicket(result.ticket) };
}

export async function generateResponseDraftAsAdmin(
  user: AuthenticatedUser,
  ticketId: string,
  mode: "initial" | "regenerate",
  options: DraftRuntimeOptions = {},
): Promise<AdminTicketData> {
  assertAdmin(user);
  const result = await processResponseDraft(ticketId, mode, options);
  if (result.kind === "missing") {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested ticket was not found.",
      404,
    );
  }
  if (result.kind === "processing") {
    throw new DraftConflictError(
      "DRAFT_GENERATION_IN_PROGRESS",
      "A response draft is already being generated for this ticket.",
    );
  }
  if (result.kind === "initial_already_attempted") {
    throw new DraftConflictError(
      "DRAFT_ALREADY_ATTEMPTED",
      "Initial drafting was already attempted. Use Regenerate to try again.",
    );
  }
  return getTicketForAdmin(user, ticketId);
}

export async function editResponseDraftAsAdmin(
  user: AuthenticatedUser,
  ticketId: string,
  input: { draftId: string; body: string; expectedUpdatedAt: string },
): Promise<AdminTicketData> {
  assertAdmin(user);
  const result = await editResponseDraft({
    ticketId,
    draftId: input.draftId,
    adminUserId: user.id,
    body: input.body,
    expectedUpdatedAt: new Date(input.expectedUpdatedAt),
  });
  if (result.kind === "missing") {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested draft was not found.",
      404,
    );
  }
  if (result.kind === "conflict") {
    throw new DraftConflictError(
      "DRAFT_CHANGED",
      "This draft changed in another request. Refresh before saving your edits.",
    );
  }
  return getTicketForAdmin(user, ticketId);
}

export async function retryClassificationAsAdmin(
  user: AuthenticatedUser,
  ticketId: string,
): Promise<AdminTicketData> {
  assertAdmin(user);
  const existing = await findAdminTicket(ticketId);
  if (!existing) {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested ticket was not found.",
      404,
    );
  }
  assertClassificationRetryable(await processTicketClassification(ticketId));
  return getTicketForAdmin(user, ticketId);
}

