import "server-only";

import { createHash } from "node:crypto";

import {
  AiProcessingStatus,
  AiTaskType,
  ClassificationSource,
  ClassificationState,
  type Prisma,
  type TicketCategory,
  type TicketPriority,
} from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";

export async function beginClassificationRun(input: {
  ticketId: string;
  provider: string;
  model: string;
  promptVersion: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { id: input.ticketId },
      select: {
        id: true,
        subject: true,
        description: true,
        classificationRevision: true,
        classificationState: true,
      },
    });
    if (!ticket) return { kind: "missing" as const };

    const claimed = await transaction.ticket.updateMany({
      where: {
        id: ticket.id,
        classificationState: {
          in: [ClassificationState.PENDING, ClassificationState.FAILED],
        },
      },
      data: {
        classificationState: ClassificationState.PROCESSING,
        classificationStateUpdatedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return {
        kind: "not_retryable" as const,
        state: ticket.classificationState,
      };
    }

    const run = await transaction.aiProcessingRun.create({
      data: {
        ticketId: ticket.id,
        taskType: AiTaskType.CLASSIFICATION,
        status: AiProcessingStatus.PROCESSING,
        classificationRevisionAtStart: ticket.classificationRevision,
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        inputHash: createHash("sha256")
          .update(
            JSON.stringify({
              subject: ticket.subject,
              description: ticket.description,
            }),
          )
          .digest("hex"),
        startedAt: new Date(),
      },
      select: { id: true },
    });

    return { kind: "started" as const, ticket, runId: run.id };
  });
}

export async function completeClassificationRun(input: {
  ticketId: string;
  runId: string;
  category: TicketCategory;
  priority: TicketPriority;
  providerRequestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}) {
  return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUniqueOrThrow({
      where: { id: input.ticketId },
      select: { categorySource: true, prioritySource: true },
    });
    const now = new Date();
    const applyCategory = ticket.categorySource !== ClassificationSource.ADMIN;
    const applyPriority = ticket.prioritySource !== ClassificationSource.ADMIN;

    await transaction.ticket.update({
      where: { id: input.ticketId },
      data: {
        classificationState: ClassificationState.COMPLETED,
        classificationStateUpdatedAt: now,
        ...(applyCategory
          ? {
              category: input.category,
              categorySource: ClassificationSource.AI,
              categoryUpdatedAt: now,
              categoryUpdatedByUserId: null,
            }
          : {}),
        ...(applyPriority
          ? {
              priority: input.priority,
              prioritySource: ClassificationSource.AI,
              priorityUpdatedAt: now,
              priorityUpdatedByUserId: null,
            }
          : {}),
        ...(applyCategory || applyPriority
          ? { classificationRevision: { increment: 1 } }
          : {}),
      },
    });

    await transaction.aiProcessingRun.update({
      where: { id: input.runId },
      data: {
        status: AiProcessingStatus.SUCCEEDED,
        providerRequestId: input.providerRequestId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        latencyMs: input.latencyMs,
        result: {
          category: input.category,
          priority: input.priority,
        } satisfies Prisma.InputJsonValue,
        errorCode: null,
        errorMessage: null,
        completedAt: now,
      },
    });
  });
}

export async function failClassificationRun(input: {
  ticketId: string;
  runId: string;
  errorCode: string;
  errorMessage: string;
  latencyMs: number;
}) {
  const now = new Date();
  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: input.ticketId },
      data: {
        classificationState: ClassificationState.FAILED,
        classificationStateUpdatedAt: now,
      },
    }),
    prisma.aiProcessingRun.update({
      where: { id: input.runId },
      data: {
        status: AiProcessingStatus.FAILED,
        latencyMs: input.latencyMs,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        completedAt: now,
      },
    }),
  ]);
}
