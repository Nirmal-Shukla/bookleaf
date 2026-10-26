import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import {
  DraftProviderError,
  type DraftProvider,
} from "@/server/ai/draft-provider";
import { processResponseDraft } from "@/server/ai/response-drafts";
import { prisma } from "@/server/database/prisma";
import { editResponseDraft } from "@/server/repositories/response-drafts";

const marker = `[response-draft-mock-${randomUUID()}]`;

function provider(generate: DraftProvider["generate"]): DraftProvider {
  return { name: "mock", model: "mock-drafter-v1", generate };
}

async function createTicket(subject: string, bookId: string | null = "BK016") {
  return prisma.ticket.create({
    data: {
      creationIdempotencyKey: randomUUID(),
      authorId: "AUTH009",
      bookId,
      subject: `${marker} ${subject}`,
      description: "Please provide a grounded response without inventing missing facts.",
      category: bookId === "BK016" ? "ROYALTY_PAYMENTS" : "GENERAL_INQUIRY",
    },
    select: { id: true },
  });
}

after(async () => {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: marker } } });
  await prisma.$disconnect();
});

test("mocked response drafting is reusable, race-safe, and failure-tolerant", async (t) => {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: marker } } });

  await t.test("success stores one reviewable draft and audit metadata", async () => {
    const ticket = await createTicket("royalty threshold");
    let calls = 0;
    const result = await processResponseDraft(ticket.id, "initial", {
      provider: provider(async (input) => {
        calls += 1;
        assert.match(input.systemInstruction, /80% share is of net profit/i);
        assert.match(input.context, /"royaltyPendingInr":"850.00"/);
        return {
          body: "I understand your concern. This book has ₹850 pending. The ₹1,000 threshold may apply depending on your account-wide accumulated royalties, which are not available in this record. Please review the dashboard totals before confirming the next payout step.",
          providerRequestId: "mock-draft-success",
          inputTokens: 320,
          outputTokens: 61,
        };
      }),
      timeoutMs: 100,
      maxRetries: 0,
    });
    assert.equal(result.kind, "completed");
    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { aiDrafts: true, aiRuns: true },
    });
    assert.equal(stored.aiDrafts.length, 1);
    assert.equal(stored.aiDrafts[0]?.status, "GENERATED");
    assert.equal(stored.aiRuns[0]?.status, "SUCCEEDED");
    assert.equal(stored.aiRuns[0]?.knowledgeBaseVersion, "bookleaf-kb-v1");
    assert.equal(stored.aiRuns[0]?.promptVersion, "bookleaf-response-draft-v1");
    assert.equal(stored.aiRuns[0]?.inputTokens, 320);
    assert.equal(stored.aiRuns[0]?.outputTokens, 61);

    const reused = await processResponseDraft(ticket.id, "initial", {
      provider: provider(async () => {
        calls += 1;
        return { body: "This must never be called." };
      }),
    });
    assert.equal(reused.kind, "reused");
    assert.equal(calls, 1);
  });

  await t.test("a second concurrent generation is rejected before provider use", async () => {
    const ticket = await createTicket("concurrent request", null);
    let release!: () => void;
    let started!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = processResponseDraft(ticket.id, "initial", {
      provider: provider(async () => {
        started();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { body: "Thank you. An admin should review the next step before sending." };
      }),
      timeoutMs: 1_000,
      maxRetries: 0,
    });
    await providerStarted;
    let secondProviderCalls = 0;
    const second = await processResponseDraft(ticket.id, "regenerate", {
      provider: provider(async () => {
        secondProviderCalls += 1;
        return { body: "Duplicate" };
      }),
    });
    assert.equal(second.kind, "processing");
    assert.equal(secondProviderCalls, 0);
    release();
    assert.equal((await pending).kind, "completed");
  });

  await t.test("late regeneration never replaces an admin edit", async () => {
    const ticket = await createTicket("edit race", null);
    await processResponseDraft(ticket.id, "initial", {
      provider: provider(async () => ({ body: "Original AI draft." })),
      maxRetries: 0,
    });
    const original = await prisma.aiDraft.findFirstOrThrow({
      where: { ticketId: ticket.id, status: "GENERATED" },
    });
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    let release!: () => void;
    let started!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = processResponseDraft(ticket.id, "regenerate", {
      provider: provider(async () => {
        started();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { body: "Late AI result that must not overwrite the edit." };
      }),
      timeoutMs: 1_000,
      maxRetries: 0,
    });
    await providerStarted;
    assert.equal(
      (
        await editResponseDraft({
          ticketId: ticket.id,
          draftId: original.id,
          adminUserId: admin.id,
          body: "Admin-reviewed wording.",
          expectedUpdatedAt: original.updatedAt,
        })
      ).kind,
      "success",
    );
    release();
    const result = await pending;
    assert.equal(result.kind, "completed");
    if (result.kind === "completed") assert.equal(result.applied, false);
    const saved = await prisma.aiDraft.findUniqueOrThrow({ where: { id: original.id } });
    assert.equal(saved.currentBody, "Admin-reviewed wording.");
    assert.equal(saved.status, "EDITED");
  });

  await t.test("timeout, rate limiting, and malformed output keep the ticket usable", async () => {
    const failures = [
      {
        name: "timeout",
        expected: "TIMEOUT",
        provider: provider(async () => new Promise(() => undefined)),
        timeoutMs: 15,
      },
      {
        name: "rate limit",
        expected: "RATE_LIMITED",
        provider: provider(async () => {
          throw new DraftProviderError("RATE_LIMITED", true);
        }),
        timeoutMs: 100,
      },
      {
        name: "malformed",
        expected: "MALFORMED_RESPONSE",
        provider: provider(async () => ({ body: "x".repeat(5_001) })),
        timeoutMs: 100,
      },
    ];
    for (const failure of failures) {
      const ticket = await createTicket(failure.name, null);
      const result = await processResponseDraft(ticket.id, "initial", {
        provider: failure.provider,
        timeoutMs: failure.timeoutMs,
        maxRetries: 0,
      });
      assert.equal(result.kind, "failed");
      const stored = await prisma.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
        include: { aiRuns: true, aiDrafts: true },
      });
      assert.equal(stored.aiDrafts.length, 0);
      assert.equal(stored.aiRuns[0]?.errorCode, failure.expected);
      assert.ok(stored.subject.startsWith(marker));
      assert.doesNotMatch(stored.aiRuns[0]?.errorMessage ?? "", /private-test-key|Bearer/);
    }
  });
});
