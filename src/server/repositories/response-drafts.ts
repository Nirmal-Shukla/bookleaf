import "server-only";

import { createHash } from "node:crypto";

import {
  AiDraftStatus,
  AiProcessingStatus,
  AiTaskType,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";

const activeDraftStatuses = [
  AiDraftStatus.GENERATED,
  AiDraftStatus.EDITED,
];

const draftContextSelect = {
  id: true,
  subject: true,
  description: true,
  category: true,
  author: { select: { authorId: true, name: true } },
  book: {
    select: {
      bookId: true,
      title: true,
      isbn: true,
      status: true,
      publicationDate: true,
      mrp: true,
      authorRoyaltyPerCopy: true,
      totalCopiesSold: true,
      totalRoyaltyEarned: true,
      royaltyPaid: true,
      royaltyPending: true,
      lastRoyaltyPayoutDate: true,
      printPartner: true,
      availableOn: true,
    },
  },
  responses: {
    select: { body: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
  },
} satisfies Prisma.TicketSelect;

function inputHash(ticket: Prisma.TicketGetPayload<{ select: typeof draftContextSelect }>) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        authorId: ticket.author.authorId,
        book: ticket.book,
        responses: ticket.responses,
      }),
    )
    .digest("hex");
}

export async function beginResponseDraftRun(input: {
  ticketId: string;
  mode: "initial" | "regenerate";
  provider: string;
  model: string;
  promptVersion: string;
  knowledgeBaseVersion: string;
}) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findUnique({
        where: { id: input.ticketId },
        select: draftContextSelect,
      });
      if (!ticket) return { kind: "missing" as const };

      const activeDraft = await transaction.aiDraft.findFirst({
        where: { ticketId: input.ticketId, status: { in: activeDraftStatuses } },
        select: { id: true, updatedAt: true, status: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      if (input.mode === "initial" && activeDraft) {
        return { kind: "reused" as const };
      }
      if (input.mode === "initial") {
        const priorWork = await transaction.aiProcessingRun.findFirst({
          where: { ticketId: input.ticketId, taskType: AiTaskType.RESPONSE_DRAFT },
          select: { id: true },
        });
        if (priorWork) return { kind: "initial_already_attempted" as const };
      }

      const inFlight = await transaction.aiProcessingRun.findFirst({
        where: {
          ticketId: input.ticketId,
          taskType: AiTaskType.RESPONSE_DRAFT,
          status: {
            in: [AiProcessingStatus.PENDING, AiProcessingStatus.PROCESSING],
          },
        },
        select: { id: true },
      });
      if (inFlight) return { kind: "processing" as const };

      const run = await transaction.aiProcessingRun.create({
        data: {
          ticketId: input.ticketId,
          taskType: AiTaskType.RESPONSE_DRAFT,
          status: AiProcessingStatus.PROCESSING,
          provider: input.provider,
          model: input.model,
          promptVersion: input.promptVersion,
          knowledgeBaseVersion: input.knowledgeBaseVersion,
          inputHash: inputHash(ticket),
          startedAt: new Date(),
        },
        select: { id: true },
      });

      return {
        kind: "started" as const,
        runId: run.id,
        ticket,
        targetDraft: activeDraft,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { kind: "processing" as const };
    }
    throw error;
  }
}

export async function completeResponseDraftRun(input: {
  ticketId: string;
  runId: string;
  body: string;
  targetDraft: { id: string; updatedAt: Date; status: AiDraftStatus } | null;
  providerRequestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}) {
  return prisma.$transaction(async (transaction) => {
    const now = new Date();
    let applied = false;
    let reason: "created" | "regenerated" | "draft_changed" = "draft_changed";

    if (input.targetDraft) {
      const updated = await transaction.aiDraft.updateMany({
        where: {
          id: input.targetDraft.id,
          ticketId: input.ticketId,
          status: input.targetDraft.status,
          updatedAt: input.targetDraft.updatedAt,
        },
        data: {
          processingRunId: input.runId,
          generatedBody: input.body,
          currentBody: input.body,
          status: AiDraftStatus.GENERATED,
          editedByUserId: null,
          editedAt: null,
        },
      });
      applied = updated.count === 1;
      if (applied) reason = "regenerated";
    } else {
      const activeDraft = await transaction.aiDraft.findFirst({
        where: {
          ticketId: input.ticketId,
          status: { in: activeDraftStatuses },
        },
        select: { id: true },
      });
      if (!activeDraft) {
        await transaction.aiDraft.create({
          data: {
            ticketId: input.ticketId,
            processingRunId: input.runId,
            generatedBody: input.body,
            currentBody: input.body,
          },
        });
        applied = true;
        reason = "created";
      }
    }

    await transaction.aiProcessingRun.update({
      where: { id: input.runId },
      data: {
        status: AiProcessingStatus.SUCCEEDED,
        providerRequestId: input.providerRequestId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        latencyMs: input.latencyMs,
        result: { applied, reason } satisfies Prisma.InputJsonValue,
        errorCode: null,
        errorMessage: null,
        completedAt: now,
      },
    });
    return { applied, reason };
  });
}

export async function failResponseDraftRun(input: {
  runId: string;
  errorCode: string;
  errorMessage: string;
  latencyMs: number;
}) {
  await prisma.aiProcessingRun.update({
    where: { id: input.runId },
    data: {
      status: AiProcessingStatus.FAILED,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      latencyMs: input.latencyMs,
      completedAt: new Date(),
    },
  });
}

export async function editResponseDraft(input: {
  ticketId: string;
  draftId: string;
  adminUserId: string;
  body: string;
  expectedUpdatedAt: Date;
}) {
  const result = await prisma.aiDraft.updateMany({
    where: {
      id: input.draftId,
      ticketId: input.ticketId,
      status: { in: activeDraftStatuses },
      updatedAt: input.expectedUpdatedAt,
    },
    data: {
      currentBody: input.body,
      status: AiDraftStatus.EDITED,
      editedByUserId: input.adminUserId,
      editedAt: new Date(),
    },
  });
  if (result.count === 1) return { kind: "success" as const };
  const existing = await prisma.aiDraft.findFirst({
    where: { id: input.draftId, ticketId: input.ticketId },
    select: { id: true },
  });
  return existing
    ? { kind: "conflict" as const }
    : { kind: "missing" as const };
}
