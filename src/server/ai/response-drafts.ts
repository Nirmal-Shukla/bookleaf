import "server-only";

import {
  beginResponseDraftRun,
  completeResponseDraftRun,
  failResponseDraftRun,
} from "@/server/repositories/response-drafts";

import {
  DraftProviderError,
  createConfiguredDraftProvider,
  responseDraftOutputSchema,
  type DraftProvider,
  type DraftProviderResult,
} from "./draft-provider";
import {
  buildResponseDraftPrompt,
  RESPONSE_DRAFT_PROMPT_VERSION,
} from "./draft-prompt";
import { BOOKLEAF_KNOWLEDGE_BASE_VERSION } from "./knowledge-base/bookleaf-v1";

export type DraftRuntimeOptions = {
  provider?: DraftProvider;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
};

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(raw);
  return Number.isInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function runtimeOptions(options: DraftRuntimeOptions) {
  return {
    provider: options.provider ?? createConfiguredDraftProvider(),
    timeoutMs:
      options.timeoutMs ??
      boundedInteger(process.env.LLM_TIMEOUT_MS, 8_000, 250, 15_000),
    maxRetries:
      options.maxRetries ??
      boundedInteger(process.env.LLM_MAX_RETRIES, 1, 0, 2),
    retryDelayMs: options.retryDelayMs ?? 150,
  };
}

function safeFailure(error: unknown) {
  const code =
    error instanceof DraftProviderError ? error.code : "PROVIDER_ERROR";
  const messages: Record<string, string> = {
    UNAVAILABLE:
      "AI drafting is not configured. You can still write and send a response manually.",
    TIMEOUT:
      "AI drafting timed out. You can retry or write the response manually.",
    RATE_LIMITED:
      "AI drafting was rate-limited. Try again later or write the response manually.",
    PROVIDER_UNAVAILABLE:
      "AI drafting is temporarily unavailable. Try again later or write the response manually.",
    MALFORMED_RESPONSE:
      "AI drafting returned an invalid response. Retry or write the response manually.",
    PROVIDER_ERROR:
      "AI drafting could not be completed. Retry or write the response manually.",
  };
  return { code, message: messages[code] ?? messages.PROVIDER_ERROR };
}

async function generateWithTimeout(
  provider: DraftProvider,
  input: { systemInstruction: string; context: string },
  timeoutMs: number,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DraftProviderError("TIMEOUT", true));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      provider.generate(input, controller.signal),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestDraft(
  provider: DraftProvider,
  input: { systemInstruction: string; context: string },
  timeoutMs: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<DraftProviderResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await generateWithTimeout(provider, input, timeoutMs);
    } catch (error) {
      lastError = error;
      const transient = error instanceof DraftProviderError && error.transient;
      if (!transient || attempt === maxRetries) break;
      if (retryDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * (attempt + 1)),
        );
      }
    }
  }
  throw lastError;
}

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

export async function processResponseDraft(
  ticketId: string,
  mode: "initial" | "regenerate",
  options: DraftRuntimeOptions = {},
) {
  const runtime = runtimeOptions(options);
  const startedAt = Date.now();
  const claim = await beginResponseDraftRun({
    ticketId,
    mode,
    provider: runtime.provider.name,
    model: runtime.provider.model,
    promptVersion: RESPONSE_DRAFT_PROMPT_VERSION,
    knowledgeBaseVersion: BOOKLEAF_KNOWLEDGE_BASE_VERSION,
  });
  if (claim.kind !== "started") return claim;

  const ticket = claim.ticket;
  const prompt = buildResponseDraftPrompt({
    ticket: {
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
    },
    author: ticket.author,
    book: ticket.book
      ? {
          bookId: ticket.book.bookId,
          title: ticket.book.title,
          isbn: ticket.book.isbn,
          status: ticket.book.status,
          publicationDate: dateOnly(ticket.book.publicationDate),
          mrp: ticket.book.mrp?.toFixed(2) ?? null,
          authorRoyaltyPerCopy:
            ticket.book.authorRoyaltyPerCopy?.toFixed(2) ?? null,
          totalCopiesSold: ticket.book.totalCopiesSold,
          totalRoyaltyEarned: ticket.book.totalRoyaltyEarned.toFixed(2),
          royaltyPaid: ticket.book.royaltyPaid.toFixed(2),
          royaltyPending: ticket.book.royaltyPending.toFixed(2),
          lastRoyaltyPayoutDate: dateOnly(ticket.book.lastRoyaltyPayoutDate),
          printPartner: ticket.book.printPartner,
          availableOn: ticket.book.availableOn,
        }
      : null,
    recentPublicConversation: ticket.responses
      .toReversed()
      .map((response) => ({
        body: response.body,
        createdAt: response.createdAt.toISOString(),
      })),
  });

  try {
    const providerResult = await requestDraft(
      runtime.provider,
      {
        systemInstruction: prompt.systemInstruction,
        context: prompt.input,
      },
      runtime.timeoutMs,
      runtime.maxRetries,
      runtime.retryDelayMs,
    );
    const body = responseDraftOutputSchema.safeParse(providerResult.body);
    if (!body.success) {
      throw new DraftProviderError("MALFORMED_RESPONSE", false);
    }
    const application = await completeResponseDraftRun({
      ticketId,
      runId: claim.runId,
      body: body.data,
      targetDraft: claim.targetDraft,
      providerRequestId: providerResult.providerRequestId,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      latencyMs: Date.now() - startedAt,
    });
    return { kind: "completed" as const, ...application };
  } catch (error) {
    const failure = safeFailure(error);
    await failResponseDraftRun({
      runId: claim.runId,
      errorCode: failure.code,
      errorMessage: failure.message,
      latencyMs: Date.now() - startedAt,
    });
    return { kind: "failed" as const, errorCode: failure.code };
  }
}
