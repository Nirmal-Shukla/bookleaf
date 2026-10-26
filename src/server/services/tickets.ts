import "server-only";

import { TicketStatus, UserRole } from "@/generated/prisma/client";
import { processTicketClassification } from "@/server/ai/classification";
import type { AuthenticatedUser } from "@/server/auth/authorization";
import { AuthorizationError } from "@/server/auth/errors";
import { findBookByAuthorId } from "@/server/repositories/books";
import {
  type AuthorTicketDetailRecord,
  type AuthorTicketSummaryRecord,
  createTicketForAuthor,
  findTicketByAuthorId,
  findTicketsByAuthorId,
} from "@/server/repositories/tickets";
import type {
  AuthorTicket,
  AuthorTicketData,
  AuthorTicketStatus,
  AuthorTicketSummary,
  AuthorTicketsData,
} from "@/types/tickets";

const ticketStatusLabels = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.IN_PROGRESS]: "In Progress",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
} satisfies Record<TicketStatus, AuthorTicketStatus>;

export class TicketCreationIdempotencyConflictError extends Error {
  readonly status = 409;
  readonly code = "IDEMPOTENCY_CONFLICT";

  constructor() {
    super("This ticket request key was already used for different content.");
    this.name = "TicketCreationIdempotencyConflictError";
  }
}

function requireAuthorId(user: AuthenticatedUser) {
  if (user.role !== UserRole.AUTHOR || !user.authorId) {
    throw new AuthorizationError();
  }

  return user.authorId;
}

export function serializeAuthorTicketSummary(
  ticket: AuthorTicketSummaryRecord,
): AuthorTicketSummary {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticketStatusLabels[ticket.status],
    createdAt: ticket.createdAt.toISOString(),
    book: ticket.book
      ? { bookId: ticket.book.bookId, title: ticket.book.title }
      : null,
  };
}

export function serializeAuthorTicket(
  ticket: AuthorTicketDetailRecord,
): AuthorTicket {
  return {
    ...serializeAuthorTicketSummary(ticket),
    description: ticket.description,
    responses: ticket.responses.map((response) => ({
      id: response.id,
      body: response.body,
      createdAt: response.createdAt.toISOString(),
    })),
  };
}

export async function listTicketsForAuthor(
  user: AuthenticatedUser,
  page: number,
  pageSize: number,
): Promise<AuthorTicketsData> {
  const authorId = requireAuthorId(user);
  const result = await findTicketsByAuthorId(authorId, page, pageSize);

  return {
    tickets: result.tickets.map(serializeAuthorTicketSummary),
    pagination: {
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / pageSize),
    },
  };
}

export async function getTicketForAuthor(
  user: AuthenticatedUser,
  ticketId: string,
): Promise<AuthorTicketData> {
  const authorId = requireAuthorId(user);
  const ticket = await findTicketByAuthorId(authorId, ticketId);

  if (!ticket) {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested ticket was not found.",
      404,
    );
  }

  return { ticket: serializeAuthorTicket(ticket) };
}

export async function submitTicketForAuthor(
  user: AuthenticatedUser,
  input: {
    idempotencyKey: string;
    bookId: string | null;
    subject: string;
    description: string;
  },
): Promise<AuthorTicketData> {
  const authorId = requireAuthorId(user);

  if (input.bookId !== null) {
    const book = await findBookByAuthorId(authorId, input.bookId);
    if (!book) {
      throw new AuthorizationError(
        "NOT_FOUND",
        "The selected book was not found.",
        404,
      );
    }
  }

  const creation = await createTicketForAuthor({
    authorId,
    authorUserId: user.id,
    ...input,
  });
  if (creation.kind === "conflict") {
    throw new TicketCreationIdempotencyConflictError();
  }

  if (creation.kind === "created") {
    await processTicketClassification(creation.ticket.id);
  }

  const ticket = await findTicketByAuthorId(authorId, creation.ticket.id);
  if (!ticket) {
    throw new Error("The saved ticket could not be loaded.");
  }

  return { ticket: serializeAuthorTicket(ticket) };
}

