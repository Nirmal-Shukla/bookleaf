import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DraftProviderError,
  createGeminiDraftProvider,
} from "@/server/ai/draft-provider";

function geminiResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({
      id: "draft-interaction-1",
      status: "completed",
      usage: { total_input_tokens: 250, total_output_tokens: 72 },
      steps: [{ type: "model_output", content: [{ type: "text", text }] }],
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

test("Gemini response drafting is server-only, bounded, and safely parsed", async (t) => {
  await t.test("sends grounded context and records available usage", async () => {
    let requestInit: RequestInit | undefined;
    const provider = createGeminiDraftProvider(
      "gemini-3.5-flash-lite",
      "private-test-key",
      async (_input, init) => {
        requestInit = init;
        return geminiResponse("Thank you for raising this. We will review it before confirming next steps.");
      },
    );
    const result = await provider.generate(
      { systemInstruction: "Trusted policy", context: "Untrusted ticket data" },
      new AbortController().signal,
    );
    const headers = new Headers(requestInit?.headers);
    assert.equal(headers.get("x-goog-api-key"), "private-test-key");
    assert.equal(headers.get("authorization"), null);
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    assert.equal(body.store, false);
    assert.deepEqual(body.generation_config, { max_output_tokens: 600 });
    assert.equal(body.system_instruction, "Trusted policy");
    assert.equal(body.input, "Untrusted ticket data");
    assert.equal(result.providerRequestId, "draft-interaction-1");
    assert.equal(result.inputTokens, 250);
    assert.equal(result.outputTokens, 72);
  });

  await t.test("rejects empty output without exposing provider content", async () => {
    const provider = createGeminiDraftProvider(
      "gemini-3.5-flash-lite",
      "private-test-key",
      async () => geminiResponse("   "),
    );
    await assert.rejects(
      provider.generate(
        { systemInstruction: "policy", context: "ticket" },
        new AbortController().signal,
      ),
      (error: unknown) => {
        assert.ok(error instanceof DraftProviderError);
        assert.equal(error.code, "MALFORMED_RESPONSE");
        return true;
      },
    );
  });

  await t.test("maps rate limiting to a transient safe error", async () => {
    const provider = createGeminiDraftProvider(
      "gemini-3.5-flash-lite",
      "private-test-key",
      async () => new Response(null, { status: 429 }),
    );
    await assert.rejects(
      provider.generate(
        { systemInstruction: "policy", context: "ticket" },
        new AbortController().signal,
      ),
      (error: unknown) => {
        assert.ok(error instanceof DraftProviderError);
        assert.equal(error.code, "RATE_LIMITED");
        assert.equal(error.transient, true);
        return true;
      },
    );
  });
});
