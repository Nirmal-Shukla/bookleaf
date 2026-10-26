import "server-only";

import type {
  Prisma,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";

const actorSelect = { id: true, email: true } satisfies Prisma.UserSelect;

export const adminTicketSummarySelect = {
  id: true,
  subject: true,
  status: true,
  category: true,
  priority: true,
  classificationState: true,
  classificationStateUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedAt: true,
  author: {
    select: { authorId: true, name: true, email: true },
  },
  book: {
    select: { bookId: true, title: true },
  },
  assignedAdmin: { select: actorSelect },
  _count: { select: { responses: true, internalNotes: true } },
} satisfies Prisma.TicketSelect;

export const adminTicketDetailSelect = {
  ...adminTicketSummarySelect,
  description: true,
  book: {
    select: {
      bookId: true,
      title: true,
      isbn: true,
      status: true,
      publicationDate: true,
    },
  },
  categoryUpdatedAt: true,
  categoryUpdatedBy: { select: actorSelect },
  priorityUpdatedAt: true,
  priorityUpdatedBy: { select: actorSelect },
  responses: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      sentBy: { select: actorSelect },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  internalNotes: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      admin: { select: actorSelect },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  statusEvents: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      createdAt: true,
      changedBy: { select: actorSelect },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.TicketSelect;

const adminAiRunSelect = {
  id: true,
  status: true,
  provider: true,
  model: true,
  promptVersion: true,
  knowledgeBaseVersion: true,
  inputTokens: true,
  outputTokens: true,
  latencyMs: true,
  errorCode: true,
  errorMessage: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
} satisfies Prisma.AiProcessingRunSelect;

const adminDraftSelect = {
  id: true,
  currentBody: true,
  status: true,
  editedAt: true,
  createdAt: true,
  updatedAt: true,
  editedBy: { select: actorSelect },
} satisfies Prisma.AiDraftSelect;

export type AdminTicketSummaryRecord = Prisma.TicketGetPayload<{
  select: typeof adminTicketSummarySelect;
}>;

export type AdminTicketDetailRecord = Prisma.TicketGetPayload<{
  select: typeof adminTicketDetailSelect;
}> & {
  latestClassificationAttempt: Prisma.AiProcessingRunGetPayload<{
    select: typeof adminAiRunSelect;
  }> | null;
  latestDraftAttempt: Prisma.AiProcessingRunGetPayload<{
    select: typeof adminAiRunSelect;
  }> | null;
  activeDraft: Prisma.AiDraftGetPayload<{
    select: typeof adminDraftSelect;
  }> | null;
  hasDraftHistory: boolean;
};

export type AdminTicketFilters = {
  status?: TicketStatus;
  category?: TicketCategory | "UNCLASSIFIED";
  priority?: TicketPriority | "UNCLASSIFIED";
  createdFrom?: Date;
  createdToExclusive?: Date;
};

function ticketWhere(filters: AdminTicketFilters): Prisma.TicketWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.category === "UNCLASSIFIED"
      ? { category: null }
      : filters.category
        ? { category: filters.category }
        : {}),
    ...(filters.priority === "UNCLASSIFIED"
      ? { priority: null }
      : filters.priority
        ? { priority: filters.priority }
        : {}),
    ...(filters.createdFrom || filters.createdToExclusive
      ? {
          createdAt: {
            ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
            ...(filters.createdToExclusive ? { lt: filters.createdToExclusive } : {}),
          },
        }
      : {}),
  };
}

export async function findAdminTickets(
  filters: AdminTicketFilters,
  page: number,
  pageSize: number,
) {
  const where = ticketWhere(filters);
  const unresolvedStatuses: TicketStatus[] = ["OPEN", "IN_PROGRESS"];
  const canHaveUnresolved =
    !filters.status || unresolvedStatuses.includes(filters.status);
  const [totalItems, tickets, oldestUnresolved] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      select: adminTicketSummarySelect,
      orderBy: [
        { status: "asc" },
        { priority: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.findFirst({
      where: {
        ...where,
        status: filters.status ?? { in: unresolvedStatuses },
      },
      select: { id: true, subject: true, createdAt: true, priority: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  return {
    totalItems,
    tickets,
    oldestUnresolved: canHaveUnresolved ? oldestUnresolved : null,
  };
}

export async function findAdminTicket(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: adminTicketDetailSelect,
  });
  if (!ticket) return null;
  // The pg adapter currently warns when one client receives concurrent queries.
  // Keep these small detail lookups sequential until that adapter restriction is removed.
  const latestClassificationAttempt = await prisma.aiProcessingRun.findFirst({
    where: { ticketId, taskType: "CLASSIFICATION" },
    select: adminAiRunSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const latestDraftAttempt = await prisma.aiProcessingRun.findFirst({
    where: { ticketId, taskType: "RESPONSE_DRAFT" },
    select: adminAiRunSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const activeDraft = await prisma.aiDraft.findFirst({
    where: { ticketId, status: { in: ["GENERATED", "EDITED"] } },
    select: adminDraftSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  const draftCount = await prisma.aiDraft.count({ where: { ticketId } });
  return {
    ...ticket,
    latestClassificationAttempt,
    latestDraftAttempt,
    activeDraft,
    hasDraftHistory: draftCount > 0,
  };
}

export async function updateAdminTicket(input: {
  ticketId: string;
  adminUserId: string;
  category?: TicketCategory | null;
  priority?: TicketPriority | null;
  status?: TicketStatus;
  assignToSelf?: true;
}) {
  const updated = await prisma.$transaction(async (transaction) => {
    const current = await transaction.ticket.findUnique({
      where: { id: input.ticketId },
      select: { status: true },
    });
    if (!current) return null;

    const now = new Date();
    const categoryWasProvided = Object.hasOwn(input, "category");
    const priorityWasProvided = Object.hasOwn(input, "priority");
    const statusChanged = input.status !== undefined && input.status !== current.status;

    await transaction.ticket.update({
      where: { id: input.ticketId },
      data: {
        ...(categoryWasProvided
          ? {
              category: input.category ?? null,
              categorySource: "ADMIN",
              categoryUpdatedAt: now,
              categoryUpdatedByUserId: input.adminUserId,
            }
          : {}),
        ...(priorityWasProvided
          ? {
              priority: input.priority ?? null,
              prioritySource: "ADMIN",
              priorityUpdatedAt: now,
              priorityUpdatedByUserId: input.adminUserId,
            }
          : {}),
        ...(categoryWasProvided || priorityWasProvided
          ? { classificationRevision: { increment: 1 } }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assignToSelf
          ? { assignedAdminId: input.adminUserId, assignedAt: now }
          : {}),
      },
    });

    if (statusChanged && input.status) {
      await transaction.ticketStatusEvent.create({
        data: {
          ticketId: input.ticketId,
          fromStatus: current.status,
          toStatus: input.status,
          changedByUserId: input.adminUserId,
        },
      });
    }

    return true;
  });

  return updated ? findAdminTicket(input.ticketId) : null;
}

export async function createAdminInternalNote(input: {
  ticketId: string;
  adminUserId: string;
  body: string;
}) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: { id: true },
  });
  if (!ticket) return null;

  await prisma.internalNote.create({
    data: {
      ticketId: input.ticketId,
      adminUserId: input.adminUserId,
      body: input.body,
    },
  });
  return findAdminTicket(input.ticketId);
}

export async function createIdempotentPublicResponse(input: {
  ticketId: string;
  adminUserId: string;
  body: string;
  idempotencyKey: string;
  aiDraftId?: string;
}) {
  const result = await prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { id: input.ticketId },
      select: { id: true },
    });
    if (!ticket) return { kind: "missing" as const };

    const existing = await transaction.ticketResponse.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { ticketId: true, sentByUserId: true, body: true, aiDraftId: true },
    });
    if (existing) {
      return existing.ticketId === input.ticketId &&
        existing.sentByUserId === input.adminUserId &&
        existing.body === input.body &&
        existing.aiDraftId === (input.aiDraftId ?? null)
        ? { kind: "success" as const }
        : { kind: "conflict" as const };
    }

    if (input.aiDraftId) {
      const draft = await transaction.aiDraft.findFirst({
        where: {
          id: input.aiDraftId,
          ticketId: input.ticketId,
          status: { in: ["GENERATED", "EDITED"] },
        },
        select: { id: true, currentBody: true },
      });
      if (!draft) return { kind: "draft_conflict" as const };
      await transaction.ticketResponse.create({
        data: {
          ticketId: input.ticketId,
          sentByUserId: input.adminUserId,
          body: input.body,
          idempotencyKey: input.idempotencyKey,
          aiDraftId: draft.id,
        },
      });
      await transaction.aiDraft.update({
        where: { id: draft.id },
        data: {
          currentBody: input.body,
          status: "SENT",
          ...(draft.currentBody !== input.body
            ? {
                editedByUserId: input.adminUserId,
                editedAt: new Date(),
              }
            : {}),
        },
      });
    } else {
      await transaction.ticketResponse.create({
        data: {
          ticketId: input.ticketId,
          sentByUserId: input.adminUserId,
          body: input.body,
          idempotencyKey: input.idempotencyKey,
        },
      });
    }
    return { kind: "success" as const };
  });

  return result.kind === "success"
    ? { ...result, ticket: await findAdminTicket(input.ticketId) }
    : result;
}

