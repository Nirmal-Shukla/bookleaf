import "server-only";

import {
  TicketCategory,
  TicketPriority,
} from "@/generated/prisma/client";
import {
  beginClassificationRun,
  completeClassificationRun,
  failClassificationRun,
} from "@/server/repositories/classification";

import {
  ClassificationProviderError,
  classificationOutputSchema,
  createConfiguredClassificationProvider,
  type ClassificationOutput,
  type ClassificationProvider,
  type ClassificationProviderResult,
} from "./classification-provider";

export const CLASSIFICATION_PROMPT_VERSION = "bookleaf-classification-v2";

export type ClassificationRuntimeOptions = {
  provider?: ClassificationProvider;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
};

export class ClassificationNotRetryableError extends Error {
  readonly status = 409;
  readonly code = "CLASSIFICATION_NOT_RETRYABLE";

  constructor() {
    super("Classification is already processing or has already completed.");
    this.name = "ClassificationNotRetryableError";
  }
}

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

function runtimeOptions(options: ClassificationRuntimeOptions) {
  return {
    provider: options.provider ?? createConfiguredClassificationProvider(),
    timeoutMs:
      options.timeoutMs ??
      boundedInteger(process.env.LLM_TIMEOUT_MS, 5_000, 250, 15_000),
    maxRetries:
      options.maxRetries ??
      boundedInteger(process.env.LLM_MAX_RETRIES, 1, 0, 2),
    retryDelayMs: options.retryDelayMs ?? 150,
  };
}

function safeFailure(error: unknown) {
  const code =
    error instanceof ClassificationProviderError
      ? error.code
      : "PROVIDER_ERROR";
  const messages: Record<string, string> = {
    UNAVAILABLE: "AI classification is not configured.",
    TIMEOUT: "AI classification timed out. The ticket remains usable.",
    RATE_LIMITED: "AI classification was rate-limited. Try again later.",
    PROVIDER_UNAVAILABLE:
      "AI classification is temporarily unavailable. Try again later.",
    MALFORMED_RESPONSE:
      "AI classification returned an invalid result. Try again.",
    PROVIDER_ERROR: "AI classification could not be completed. Try again.",
  };
  return { code, message: messages[code] ?? messages.PROVIDER_ERROR };
}

function enforceBookLeafPriorityPolicy(
  input: { subject: string; description: string },
  output: ClassificationOutput,
): ClassificationOutput {
  const content = `${input.subject}\n${input.description}`.toLowerCase();
  const isIsbnIntegrityReport =
    /\bisbn\b/.test(content) &&
    /\b(duplicate|duplicated|mismatch|mismatched|incorrect|wrong|mapping|mapped|linked)\b/.test(
      content,
    );
  if (
    isIsbnIntegrityReport &&
    (output.priority === TicketPriority.LOW ||
      output.priority === TicketPriority.MEDIUM)
  ) {
    return { ...output, priority: TicketPriority.HIGH };
  }
  return output;
}

async function classifyWithTimeout(
  provider: ClassificationProvider,
  input: { subject: string; description: string },
  timeoutMs: number,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ClassificationProviderError("TIMEOUT", true));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      provider.classify(input, controller.signal),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestClassification(
  provider: ClassificationProvider,
  input: { subject: string; description: string },
  timeoutMs: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<ClassificationProviderResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await classifyWithTimeout(provider, input, timeoutMs);
    } catch (error) {
      lastError = error;
      const transient =
        error instanceof ClassificationProviderError && error.transient;
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

export async function processTicketClassification(
  ticketId: string,
  options: ClassificationRuntimeOptions = {},
) {
  const runtime = runtimeOptions(options);
  const startedAt = Date.now();
  const claim = await beginClassificationRun({
    ticketId,
    provider: runtime.provider.name,
    model: runtime.provider.model,
    promptVersion: CLASSIFICATION_PROMPT_VERSION,
  });
  if (claim.kind === "missing") return { kind: "missing" as const };
  if (claim.kind === "not_retryable") {
    return { kind: "not_retryable" as const, state: claim.state };
  }

  try {
    const providerResult = await requestClassification(
      runtime.provider,
      {
        subject: claim.ticket.subject,
        description: claim.ticket.description,
      },
      runtime.timeoutMs,
      runtime.maxRetries,
      runtime.retryDelayMs,
    );
    const parsed = classificationOutputSchema.safeParse(providerResult.output);
    if (!parsed.success) {
      throw new ClassificationProviderError("MALFORMED_RESPONSE", false);
    }
    const output = enforceBookLeafPriorityPolicy(claim.ticket, parsed.data);
    await completeClassificationRun({
      ticketId,
      runId: claim.runId,
      category: output.category as TicketCategory,
      priority: output.priority as TicketPriority,
      providerRequestId: providerResult.providerRequestId,
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      latencyMs: Date.now() - startedAt,
    });
    return { kind: "completed" as const, output };
  } catch (error) {
    const failure = safeFailure(error);
    await failClassificationRun({
      ticketId,
      runId: claim.runId,
      errorCode: failure.code,
      errorMessage: failure.message,
      latencyMs: Date.now() - startedAt,
    });
    return { kind: "failed" as const, errorCode: failure.code };
  }
}

export function assertClassificationRetryable(
  result: Awaited<ReturnType<typeof processTicketClassification>>,
) {
  if (result.kind === "not_retryable") {
    throw new ClassificationNotRetryableError();
  }
  return result;
}
