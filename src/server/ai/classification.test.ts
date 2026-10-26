import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import {
  ClassificationProviderError,
  type ClassificationProvider,
} from "@/server/ai/classification-provider";
import { processTicketClassification } from "@/server/ai/classification";
import { prisma } from "@/server/database/prisma";
import { updateAdminTicket } from "@/server/repositories/admin-tickets";

const marker = `[classification-mock-${randomUUID()}]`;

function provider(
  classify: ClassificationProvider["classify"],
): ClassificationProvider {
  return { name: "mock", model: "mock-classifier-v1", classify };
}

async function createPendingTicket(subject: string, description: string) {
  const author = await prisma.authorProfile.findUniqueOrThrow({
    where: { authorId: "AUTH007" },
    select: { authorId: true },
  });
  return prisma.ticket.create({
    data: {
      creationIdempotencyKey: randomUUID(),
      authorId: author.authorId,
      subject: `${marker} ${subject}`,
      description,
    },
    select: { id: true },
  });
}

after(async () => {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: marker } } });
  await prisma.$disconnect();
});

test("mocked AI classification is durable and fails gracefully", async (t) => {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: marker } } });

  await t.test("mock success validates structured output and enforces ISBN priority", async () => {
    const ticket = await createPendingTicket(
      "duplicate ISBN mapped to the wrong book",
      "The ISBN on my dashboard belongs to another title.",
    );
    const result = await processTicketClassification(ticket.id, {
      provider: provider(async (input) => {
        assert.deepEqual(Object.keys(input).sort(), ["description", "subject"]);
        return {
          output: { category: "ISBN_METADATA_ISSUES", priority: "LOW" },
          providerRequestId: "mock-request-success",
          inputTokens: 31,
          outputTokens: 8,
        };
      }),
      timeoutMs: 50,
      maxRetries: 0,
    });
    assert.equal(result.kind, "completed");

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { aiRuns: true },
    });
    assert.equal(stored.classificationState, "COMPLETED");
    assert.equal(stored.category, "ISBN_METADATA_ISSUES");
    assert.equal(stored.priority, "HIGH");
    assert.equal(stored.categorySource, "AI");
    assert.equal(stored.prioritySource, "AI");
    assert.equal(stored.aiRuns[0]?.status, "SUCCEEDED");
    assert.equal(stored.aiRuns[0]?.providerRequestId, "mock-request-success");
    assert.equal(stored.aiRuns[0]?.inputTokens, 31);
    assert.equal(stored.aiRuns[0]?.outputTokens, 8);
  });

  await t.test("mock malformed output marks failure without losing the ticket", async () => {
    const ticket = await createPendingTicket(
      "malformed response case",
      "The mock will return an invalid category.",
    );
    const result = await processTicketClassification(ticket.id, {
      provider: provider(async () => ({
        output: { category: "NOT_ALLOWED", priority: "HIGH" },
      })),
      timeoutMs: 50,
      maxRetries: 0,
    });
    assert.equal(result.kind, "failed");
    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { aiRuns: true },
    });
    assert.equal(stored.classificationState, "FAILED");
    assert.equal(stored.category, null);
    assert.equal(stored.priority, null);
    assert.equal(stored.aiRuns[0]?.errorCode, "MALFORMED_RESPONSE");
    assert.doesNotMatch(stored.aiRuns[0]?.errorMessage ?? "", /NOT_ALLOWED/);
  });

  await t.test("mock timeout is bounded and leaves a retryable failed state", async () => {
    const ticket = await createPendingTicket(
      "timeout case",
      "The mock intentionally never resolves.",
    );
    const startedAt = Date.now();
    const result = await processTicketClassification(ticket.id, {
      provider: provider(async () => new Promise(() => undefined)),
      timeoutMs: 15,
      maxRetries: 0,
    });
    assert.equal(result.kind, "failed");
    assert.ok(Date.now() - startedAt < 500);
    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { aiRuns: true },
    });
    assert.equal(stored.classificationState, "FAILED");
    assert.equal(stored.aiRuns[0]?.errorCode, "TIMEOUT");
  });

  await t.test("mock rate limiting uses only the configured retry budget", async () => {
    const ticket = await createPendingTicket(
      "rate limit case",
      "The mock returns rate limiting for every attempt.",
    );
    let calls = 0;
    const result = await processTicketClassification(ticket.id, {
      provider: provider(async () => {
        calls += 1;
        throw new ClassificationProviderError("RATE_LIMITED", true);
      }),
      timeoutMs: 50,
      maxRetries: 1,
      retryDelayMs: 0,
    });
    assert.equal(result.kind, "failed");
    assert.equal(calls, 2);
    const run = await prisma.aiProcessingRun.findFirstOrThrow({
      where: { ticketId: ticket.id },
    });
    assert.equal(run.errorCode, "RATE_LIMITED");
  });

  await t.test("mock completion preserves independent admin override races", async () => {
    const ticket = await createPendingTicket(
      "override race",
      "An admin changes only the category while the mock is processing.",
    );
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    let release!: (value: {
      output: { category: string; priority: string };
    }) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const pending = processTicketClassification(ticket.id, {
      provider: provider(async () => {
        markStarted();
        return new Promise((resolve) => {
          release = resolve;
        });
      }),
      timeoutMs: 500,
      maxRetries: 0,
    });
    await started;
    await updateAdminTicket({
      ticketId: ticket.id,
      adminUserId: admin.id,
      category: "GENERAL_INQUIRY",
    });
    release({
      output: { category: "ROYALTY_PAYMENTS", priority: "MEDIUM" },
    });
    const result = await pending;
    assert.equal(result.kind, "completed");

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    assert.equal(stored.category, "GENERAL_INQUIRY");
    assert.equal(stored.categorySource, "ADMIN");
    assert.equal(stored.priority, "MEDIUM");
    assert.equal(stored.prioritySource, "AI");
    assert.equal(stored.classificationState, "COMPLETED");
  });

  await t.test("a failed mocked run can be retried successfully", async () => {
    const ticket = await createPendingTicket(
      "retry case",
      "The first mock fails and the second succeeds.",
    );
    await processTicketClassification(ticket.id, {
      provider: provider(async () => {
        throw new ClassificationProviderError("PROVIDER_UNAVAILABLE", true);
      }),
      timeoutMs: 50,
      maxRetries: 0,
    });
    const retry = await processTicketClassification(ticket.id, {
      provider: provider(async () => ({
        output: { category: "GENERAL_INQUIRY", priority: "LOW" },
      })),
      timeoutMs: 50,
      maxRetries: 0,
    });
    assert.equal(retry.kind, "completed");
    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { aiRuns: { orderBy: { createdAt: "asc" } } },
    });
    assert.equal(stored.aiRuns.length, 2);
    assert.equal(stored.aiRuns[0]?.status, "FAILED");
    assert.equal(stored.aiRuns[1]?.status, "SUCCEEDED");
  });
});
