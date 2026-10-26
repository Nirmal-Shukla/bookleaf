import "server-only";

import {
  ClassificationState,
  type Prisma,
  TicketStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";

export const authorTicketSummarySelect = {
  id: true,
  subject: true,
  status: true,
  createdAt: true,
  book: {
    select: {
      bookId: true,
      title: true,
    },
  },
} satisfies Prisma.TicketSelect;

export const authorTicketDetailSelect = {
  ...authorTicketSummarySelect,
  description: true,
  responses: {
    select: {
      id: true,
      body: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.TicketSelect;

export type AuthorTicketSummaryRecord = Prisma.TicketGetPayload<{
  select: typeof authorTicketSummarySelect;
}>;

export type AuthorTicketDetailRecord = Prisma.TicketGetPayload<{
  select: typeof authorTicketDetailSelect;
}>;

export async function findTicketsByAuthorId(
  authorId: string,
  page: number,
  pageSize: number,
) {
  const where = { authorId } satisfies Prisma.TicketWhereInput;
  const [totalItems, tickets] = await prisma.$transaction([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      select: authorTicketSummarySelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { tickets, totalItems };
}

export function findTicketByAuthorId(authorId: string, ticketId: string) {
  return prisma.ticket.findFirst({
    where: { id: ticketId, authorId },
    select: authorTicketDetailSelect,
  });
}

export async function createTicketForAuthor(input: {
  authorId: string;
  authorUserId: string;
  idempotencyKey: string;
  bookId: string | null;
  subject: string;
  description: string;
}) {
  try {
    const ticket = await prisma.ticket.create({
      data: {
        creationIdempotencyKey: input.idempotencyKey,
        authorId: input.authorId,
        bookId: input.bookId,
        subject: input.subject,
        description: input.description,
        status: TicketStatus.OPEN,
        classificationState: ClassificationState.PENDING,
        statusEvents: {
          create: {
            toStatus: TicketStatus.OPEN,
            changedByUserId: input.authorUserId,
          },
        },
      },
      select: authorTicketDetailSelect,
    });
    return { kind: "created" as const, ticket };
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      (error as { code?: unknown }).code !== "P2002"
    ) {
      throw error;
    }

    const existing = await prisma.ticket.findUnique({
      where: { creationIdempotencyKey: input.idempotencyKey },
      select: {
        ...authorTicketDetailSelect,
        authorId: true,
        bookId: true,
      },
    });
    if (
      !existing ||
      existing.authorId !== input.authorId ||
      existing.bookId !== input.bookId ||
      existing.subject !== input.subject ||
      existing.description !== input.description
    ) {
      return { kind: "conflict" as const };
    }
    return { kind: "replayed" as const, ticket: existing };
  }
}

