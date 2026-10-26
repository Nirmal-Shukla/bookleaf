import "server-only";

import { z } from "zod";

export const responseDraftOutputSchema = z.string().trim().min(1).max(5_000);

export type DraftProviderResult = {
  body: string;
  providerRequestId?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export interface DraftProvider {
  readonly name: string;
  readonly model: string;
  generate(
    input: { systemInstruction: string; context: string },
    signal: AbortSignal,
  ): Promise<DraftProviderResult>;
}

export class DraftProviderError extends Error {
  constructor(
    readonly code:
      | "UNAVAILABLE"
      | "TIMEOUT"
      | "RATE_LIMITED"
      | "PROVIDER_UNAVAILABLE"
      | "MALFORMED_RESPONSE"
      | "PROVIDER_ERROR",
    readonly transient: boolean,
  ) {
    super(code);
    this.name = "DraftProviderError";
  }
}

const environmentSchema = z.object({
  LLM_PROVIDER: z.string().trim().default(""),
  LLM_MODEL: z.string().trim().default(""),
  LLM_API_KEY: z.string().trim().default(""),
  GEMINI_API_KEY: z.string().trim().default(""),
  OPENAI_API_KEY: z.string().trim().default(""),
});

const openAiResponseSchema = z.object({
  id: z.string().optional(),
  output_text: z.string().optional(),
  output: z.array(z.unknown()).optional(),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const geminiResponseSchema = z.object({
  id: z.string().optional(),
  status: z.string().optional(),
  output_text: z.string().optional(),
  steps: z.array(z.unknown()).optional(),
  usage: z
    .object({
      total_input_tokens: z.number().int().nonnegative().optional(),
      total_output_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

function openAiOutputText(body: z.infer<typeof openAiResponseSchema>) {
  if (body.output_text) return body.output_text;
  for (const item of body.output ?? []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function geminiOutputText(body: z.infer<typeof geminiResponseSchema>) {
  if (body.output_text) return body.output_text;
  for (const step of body.steps ?? []) {
    if (
      !step ||
      typeof step !== "object" ||
      (step as { type?: unknown }).type !== "model_output"
    ) {
      continue;
    }
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function providerHttpError(status: number): DraftProviderError | null {
  if (status === 429) return new DraftProviderError("RATE_LIMITED", true);
  if (status === 408 || status >= 500) {
    return new DraftProviderError("PROVIDER_UNAVAILABLE", true);
  }
  if (status >= 400) return new DraftProviderError("PROVIDER_ERROR", false);
  return null;
}

class UnavailableDraftProvider implements DraftProvider {
  readonly name = "unavailable";
  readonly model = "unavailable";

  async generate(): Promise<never> {
    throw new DraftProviderError("UNAVAILABLE", false);
  }
}

class OpenAiDraftProvider implements DraftProvider {
  readonly name = "openai";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async generate(
    input: { systemInstruction: string; context: string },
    signal: AbortSignal,
  ): Promise<DraftProviderResult> {
    let response: Response;
    try {
      response = await this.fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        signal,
        body: JSON.stringify({
          model: this.model,
          store: false,
          reasoning: { effort: "none" },
          max_output_tokens: 600,
          input: [
            { role: "developer", content: input.systemInstruction },
            { role: "user", content: input.context },
          ],
        }),
      });
    } catch (error) {
      if (isAbortError(error)) throw new DraftProviderError("TIMEOUT", true);
      throw new DraftProviderError("PROVIDER_UNAVAILABLE", true);
    }
    const responseError = providerHttpError(response.status);
    if (responseError) throw responseError;
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new DraftProviderError("MALFORMED_RESPONSE", false);
    }
    const parsed = openAiResponseSchema.safeParse(raw);
    if (!parsed.success) throw new DraftProviderError("MALFORMED_RESPONSE", false);
    const body = responseDraftOutputSchema.safeParse(openAiOutputText(parsed.data));
    if (!body.success) throw new DraftProviderError("MALFORMED_RESPONSE", false);
    return {
      body: body.data,
      providerRequestId: parsed.data.id,
      inputTokens: parsed.data.usage?.input_tokens,
      outputTokens: parsed.data.usage?.output_tokens,
    };
  }
}

class GeminiDraftProvider implements DraftProvider {
  readonly name = "gemini";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async generate(
    input: { systemInstruction: string; context: string },
    signal: AbortSignal,
  ): Promise<DraftProviderResult> {
    let response: Response;
    try {
      response = await this.fetcher(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          signal,
          body: JSON.stringify({
            model: this.model,
            store: false,
            system_instruction: input.systemInstruction,
            input: input.context,
            generation_config: { max_output_tokens: 600 },
          }),
        },
      );
    } catch (error) {
      if (isAbortError(error)) throw new DraftProviderError("TIMEOUT", true);
      throw new DraftProviderError("PROVIDER_UNAVAILABLE", true);
    }
    const responseError = providerHttpError(response.status);
    if (responseError) throw responseError;
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new DraftProviderError("MALFORMED_RESPONSE", false);
    }
    const parsed = geminiResponseSchema.safeParse(raw);
    if (!parsed.success || (parsed.data.status && parsed.data.status !== "completed")) {
      throw new DraftProviderError("MALFORMED_RESPONSE", false);
    }
    const body = responseDraftOutputSchema.safeParse(geminiOutputText(parsed.data));
    if (!body.success) throw new DraftProviderError("MALFORMED_RESPONSE", false);
    return {
      body: body.data,
      providerRequestId: parsed.data.id,
      inputTokens: parsed.data.usage?.total_input_tokens,
      outputTokens: parsed.data.usage?.total_output_tokens,
    };
  }
}

export function createGeminiDraftProvider(
  model: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): DraftProvider {
  return new GeminiDraftProvider(model, apiKey, fetcher);
}

export function createConfiguredDraftProvider(): DraftProvider {
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) return new UnavailableDraftProvider();
  const environment = parsed.data;
  const provider = environment.LLM_PROVIDER.toLowerCase();
  if (provider === "gemini") {
    const apiKey = environment.LLM_API_KEY || environment.GEMINI_API_KEY;
    return apiKey
      ? createGeminiDraftProvider(
          environment.LLM_MODEL || "gemini-3.5-flash-lite",
          apiKey,
        )
      : new UnavailableDraftProvider();
  }
  if (provider === "openai") {
    const apiKey = environment.LLM_API_KEY || environment.OPENAI_API_KEY;
    return apiKey
      ? new OpenAiDraftProvider(
          environment.LLM_MODEL || "gpt-6-luna",
          apiKey,
        )
      : new UnavailableDraftProvider();
  }
  return new UnavailableDraftProvider();
}
