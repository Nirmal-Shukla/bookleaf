import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import {
  GET as getAdminTicket,
  PATCH as updateAdminTicket,
} from "@/app/api/admin/tickets/[ticketId]/route";
import { POST as addInternalNote } from "@/app/api/admin/tickets/[ticketId]/notes/route";
import { POST as sendPublicResponse } from "@/app/api/admin/tickets/[ticketId]/responses/route";
import { POST as retryClassification } from "@/app/api/admin/tickets/[ticketId]/classification/route";
import { POST as generateResponseDraft } from "@/app/api/admin/tickets/[ticketId]/drafts/route";
import { PATCH as editResponseDraftRoute } from "@/app/api/admin/tickets/[ticketId]/drafts/[draftId]/route";
import { GET as listAdminTickets } from "@/app/api/admin/tickets/route";
import { GET as getAuthorTicket } from "@/app/api/author/tickets/[ticketId]/route";
import { POST as createAuthorTicket } from "@/app/api/author/tickets/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";
import type { ApiErrorBody, ApiSuccessBody } from "@/server/http/api-response";
import type { AdminTicketData, AdminTicketsData } from "@/types/admin-tickets";
import type { AuthorTicketData } from "@/types/tickets";

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const marker = `[admin-flow-${randomUUID()}]`;
const originalLlmProvider = process.env.LLM_PROVIDER;

// Manual-workflow assertions depend on the explicit unavailable-AI branch and
// must not spend quota when the local environment happens to contain a key.
process.env.LLM_PROVIDER = "";

function request(path: string, init?: RequestInit) {
  return new Request(new URL(path, origin), init);
}

function mutationHeaders(cookie?: string) {
  return {
    "content-type": "application/json",
    origin,
    "sec-fetch-site": "same-origin",
    ...(cookie ? { cookie } : {}),
  };
}

function sessionCookie(response: Response) {
  const values = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const value = values.find((candidate) => candidate.includes("session_token="));
  assert.ok(value);
  return value.split(";", 1)[0];
}

async function loginAs(email: string, password: string) {
  const response = await login(
    request("/api/auth/login", {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify({ email, password }),
    }),
  );
  assert.equal(response.status, 200);
  return sessionCookie(response);
}

async function createTicket(cookie: string, suffix: string) {
  const response = await createAuthorTicket(
    request("/api/author/tickets", {
      method: "POST",
      headers: mutationHeaders(cookie),
      body: JSON.stringify({
        idempotencyKey: randomUUID(),
        bookId: "BK011",
        subject: `${marker} ${suffix}`,
        description: `Manual workflow integration request for ${suffix}.`,
      }),
    }),
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as ApiSuccessBody<AuthorTicketData>;
  return body.data.ticket.id;
}

function detailContext(ticketId: string) {
  return { params: Promise.resolve({ ticketId }) };
}

function adminMutation(
  handler: typeof updateAdminTicket | typeof addInternalNote | typeof sendPublicResponse,
  path: string,
  cookie: string,
  ticketId: string,
  method: "PATCH" | "POST",
  body: unknown,
) {
  return handler(
    request(path, {
      method,
      headers: mutationHeaders(cookie),
      body: JSON.stringify(body),
    }),
    detailContext(ticketId),
  );
}

after(async () => {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: marker } } });
  await prisma.authRateLimit.deleteMany();
  await prisma.$disconnect();
  if (originalLlmProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = originalLlmProvider;
});

test("complete manual admin support workflow", async (t) => {
  await prisma.ticket.deleteMany({ where: { subject: { startsWith: marker } } });
  await prisma.authRateLimit.deleteMany();

  const author = await prisma.authorProfile.findUniqueOrThrow({
    where: { authorId: "AUTH007" },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: UserRole.ADMIN } });
  const authorPassword = process.env.SEED_AUTHOR_PASSWORD;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  assert.ok(authorPassword);
  assert.ok(adminPassword);
  const authorCookie = await loginAs(author.email, authorPassword);
  const adminCookie = await loginAs(admin.email, adminPassword);

  const mainTicketId = await createTicket(authorCookie, "main request");
  const highTicketId = await createTicket(authorCookie, "high request");
  const mediumTicketId = await createTicket(authorCookie, "medium request");
  const lowTicketId = await createTicket(authorCookie, "low request");
  const unclassifiedTicketId = await createTicket(authorCookie, "unclassified request");
  const draftTicketId = await createTicket(authorCookie, "draft review request");

  await t.test("authors cannot call admin reads or mutations", async () => {
    const listResponse = await listAdminTickets(
      request("/api/admin/tickets", { headers: { cookie: authorCookie } }),
    );
    assert.equal(listResponse.status, 403);

    const patchResponse = await adminMutation(
      updateAdminTicket,
      `/api/admin/tickets/${mainTicketId}`,
      authorCookie,
      mainTicketId,
      "PATCH",
      { assignToSelf: true },
    );
    assert.equal(patchResponse.status, 403);

    const noteResponse = await adminMutation(
      addInternalNote,
      `/api/admin/tickets/${mainTicketId}/notes`,
      authorCookie,
      mainTicketId,
      "POST",
      { body: "Author must not create private notes." },
    );
    assert.equal(noteResponse.status, 403);

    const responseAttempt = await adminMutation(
      sendPublicResponse,
      `/api/admin/tickets/${mainTicketId}/responses`,
      authorCookie,
      mainTicketId,
      "POST",
      { body: "Author must not use admin response route.", idempotencyKey: randomUUID() },
    );
    assert.equal(responseAttempt.status, 403);

    const retryAttempt = await retryClassification(
      request(`/api/admin/tickets/${mainTicketId}/classification`, {
        method: "POST",
        headers: mutationHeaders(authorCookie),
      }),
      detailContext(mainTicketId),
    );
    assert.equal(retryAttempt.status, 403);

    const draftAttempt = await generateResponseDraft(
      request(`/api/admin/tickets/${mainTicketId}/drafts`, {
        method: "POST",
        headers: mutationHeaders(authorCookie),
        body: JSON.stringify({ mode: "regenerate" }),
      }),
      detailContext(mainTicketId),
    );
    assert.equal(draftAttempt.status, 403);
  });

  await t.test("admin assigns, classifies, prioritizes, and changes status with audit data", async () => {
    const response = await adminMutation(
      updateAdminTicket,
      `/api/admin/tickets/${mainTicketId}`,
      adminCookie,
      mainTicketId,
      "PATCH",
      {
        assignToSelf: true,
        category: "GENERAL_INQUIRY",
        priority: "CRITICAL",
        status: "IN_PROGRESS",
      },
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as ApiSuccessBody<AdminTicketData>;
    assert.equal(body.data.ticket.category, "General Inquiry");
    assert.equal(body.data.ticket.priority, "Critical");
    assert.equal(body.data.ticket.status, "In Progress");
    assert.equal(body.data.ticket.assignedAdmin?.id, admin.id);
    assert.ok(body.data.ticket.assignedAt);

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: mainTicketId },
      include: { statusEvents: true },
    });
    assert.equal(stored.categorySource, "ADMIN");
    assert.equal(stored.categoryUpdatedByUserId, admin.id);
    assert.ok(stored.categoryUpdatedAt);
    assert.equal(stored.prioritySource, "ADMIN");
    assert.equal(stored.priorityUpdatedByUserId, admin.id);
    assert.ok(stored.priorityUpdatedAt);
    assert.equal(stored.classificationState, "FAILED");
    assert.equal(stored.assignedAdminId, admin.id);
    assert.ok(stored.assignedAt);
    assert.ok(
      stored.statusEvents.some(
        (event) =>
          event.fromStatus === "OPEN" &&
          event.toStatus === "IN_PROGRESS" &&
          event.changedByUserId === admin.id,
      ),
    );
  });

  await t.test("admin retry records a safe failed attempt when AI is unavailable", async () => {
    const before = await prisma.aiProcessingRun.count({
      where: { ticketId: mainTicketId, taskType: "CLASSIFICATION" },
    });
    const response = await retryClassification(
      request(`/api/admin/tickets/${mainTicketId}/classification`, {
        method: "POST",
        headers: mutationHeaders(adminCookie),
      }),
      detailContext(mainTicketId),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as ApiSuccessBody<AdminTicketData>;
    assert.equal(body.data.ticket.classificationState, "Failed");
    assert.equal(
      body.data.ticket.latestClassificationAttempt?.errorCode,
      "UNAVAILABLE",
    );
    assert.doesNotMatch(
      JSON.stringify(body),
      /LLM_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|x-goog-api-key|Bearer /,
    );
    assert.equal(
      await prisma.aiProcessingRun.count({
        where: { ticketId: mainTicketId, taskType: "CLASSIFICATION" },
      }),
      before + 1,
    );
  });

  await t.test("queue filters dates and sorts priority by explicit severity", async () => {
    const priorities = [
      [highTicketId, "HIGH"],
      [mediumTicketId, "MEDIUM"],
      [lowTicketId, "LOW"],
    ] as const;
    for (const [ticketId, priority] of priorities) {
      const response = await adminMutation(
        updateAdminTicket,
        `/api/admin/tickets/${ticketId}`,
        adminCookie,
        ticketId,
        "PATCH",
        { priority },
      );
      assert.equal(response.status, 200);
    }

    const queueResponse = await listAdminTickets(
      request("/api/admin/tickets?status=OPEN&page=1&pageSize=100", {
        headers: { cookie: adminCookie },
      }),
    );
    assert.equal(queueResponse.status, 200);
    const queue = (await queueResponse.json()) as ApiSuccessBody<AdminTicketsData>;
    const ids = queue.data.tickets.map((ticket) => ticket.id);
    assert.ok(ids.indexOf(highTicketId) < ids.indexOf(mediumTicketId));
    assert.ok(ids.indexOf(mediumTicketId) < ids.indexOf(lowTicketId));
    assert.ok(ids.indexOf(lowTicketId) < ids.indexOf(unclassifiedTicketId));
    assert.match(queue.data.sort.description, /Critical, High, Medium, Low/);
    assert.equal(queue.data.dateBoundary.timezone, "UTC");

    const createdDate = queue.data.tickets
      .find((ticket) => ticket.id === highTicketId)!
      .createdAt.slice(0, 10);
    const dateResponse = await listAdminTickets(
      request(
        `/api/admin/tickets?createdFrom=${createdDate}&createdTo=${createdDate}&pageSize=100`,
        { headers: { cookie: adminCookie } },
      ),
    );
    const dateBody = (await dateResponse.json()) as ApiSuccessBody<AdminTicketsData>;
    assert.ok(dateBody.data.tickets.some((ticket) => ticket.id === highTicketId));

    const invalidRange = await listAdminTickets(
      request("/api/admin/tickets?createdFrom=2026-10-26&createdTo=2026-10-25", {
        headers: { cookie: adminCookie },
      }),
    );
    assert.equal(invalidRange.status, 400);
  });

  await t.test("unclassified and General Inquiry remain distinct", async () => {
    const general = await listAdminTickets(
      request("/api/admin/tickets?category=GENERAL_INQUIRY&pageSize=100", {
        headers: { cookie: adminCookie },
      }),
    );
    const unclassified = await listAdminTickets(
      request("/api/admin/tickets?category=UNCLASSIFIED&pageSize=100", {
        headers: { cookie: adminCookie },
      }),
    );
    const generalBody = (await general.json()) as ApiSuccessBody<AdminTicketsData>;
    const unclassifiedBody = (await unclassified.json()) as ApiSuccessBody<AdminTicketsData>;
    assert.ok(generalBody.data.tickets.some((ticket) => ticket.id === mainTicketId));
    assert.ok(!generalBody.data.tickets.some((ticket) => ticket.id === unclassifiedTicketId));
    assert.ok(unclassifiedBody.data.tickets.some((ticket) => ticket.id === unclassifiedTicketId));
  });

  const privateNote = `${marker} private note`;
  const publicReply = `${marker} public reply`;

  await t.test("private notes remain separate while public responses reach authors", async () => {
    const noteResponse = await adminMutation(
      addInternalNote,
      `/api/admin/tickets/${mainTicketId}/notes`,
      adminCookie,
      mainTicketId,
      "POST",
      { body: privateNote },
    );
    assert.equal(noteResponse.status, 201);

    const idempotencyKey = randomUUID();
    const send = () =>
      adminMutation(
        sendPublicResponse,
        `/api/admin/tickets/${mainTicketId}/responses`,
        adminCookie,
        mainTicketId,
        "POST",
        { body: publicReply, idempotencyKey },
      );
    const firstResponse = await send();
    const retryResponse = await send();
    assert.equal(firstResponse.status, 201);
    assert.equal(retryResponse.status, 201);
    assert.equal(
      await prisma.ticketResponse.count({ where: { idempotencyKey } }),
      1,
    );

    const conflict = await adminMutation(
      sendPublicResponse,
      `/api/admin/tickets/${mainTicketId}/responses`,
      adminCookie,
      mainTicketId,
      "POST",
      { body: "Different body with the same key.", idempotencyKey },
    );
    assert.equal(conflict.status, 409);

    const adminDetail = await getAdminTicket(
      request(`/api/admin/tickets/${mainTicketId}`, {
        headers: { cookie: adminCookie },
      }),
      detailContext(mainTicketId),
    );
    const adminBody = (await adminDetail.json()) as ApiSuccessBody<AdminTicketData>;
    assert.ok(adminBody.data.ticket.internalNotes.some((note) => note.body === privateNote));
    assert.ok(adminBody.data.ticket.responses.some((response) => response.body === publicReply));

    const authorDetail = await getAuthorTicket(
      request(`/api/author/tickets/${mainTicketId}`, {
        headers: { cookie: authorCookie },
      }),
      detailContext(mainTicketId),
    );
    const authorBody = (await authorDetail.json()) as ApiSuccessBody<AuthorTicketData>;
    assert.equal(authorBody.data.ticket.status, "In Progress");
    assert.ok(authorBody.data.ticket.responses.some((response) => response.body === publicReply));
    assert.equal(JSON.stringify(authorBody).includes(privateNote), false);
    assert.doesNotMatch(JSON.stringify(authorBody), /internalNotes|assignedAdmin/);
  });

  await t.test("GET is side-effect free and draft edit-review-send is explicit", async () => {
    const runsBefore = await prisma.aiProcessingRun.count({
      where: { ticketId: draftTicketId, taskType: "RESPONSE_DRAFT" },
    });
    const firstGet = await getAdminTicket(
      request(`/api/admin/tickets/${draftTicketId}`, {
        headers: { cookie: adminCookie },
      }),
      detailContext(draftTicketId),
    );
    assert.equal(firstGet.status, 200);
    assert.equal(
      await prisma.aiProcessingRun.count({
        where: { ticketId: draftTicketId, taskType: "RESPONSE_DRAFT" },
      }),
      runsBefore,
    );

    const run = await prisma.aiProcessingRun.create({
      data: {
        ticketId: draftTicketId,
        taskType: "RESPONSE_DRAFT",
        status: "SUCCEEDED",
        provider: "mock",
        model: "mock-drafter-v1",
        promptVersion: "bookleaf-response-draft-v1",
        knowledgeBaseVersion: "bookleaf-kb-v1",
        inputTokens: 200,
        outputTokens: 50,
        completedAt: new Date(),
      },
    });
    const draft = await prisma.aiDraft.create({
      data: {
        ticketId: draftTicketId,
        processingRunId: run.id,
        generatedBody: "AI text requiring admin review.",
        currentBody: "AI text requiring admin review.",
      },
    });

    const authorEdit = await editResponseDraftRoute(
      request(`/api/admin/tickets/${draftTicketId}/drafts/${draft.id}`, {
        method: "PATCH",
        headers: mutationHeaders(authorCookie),
        body: JSON.stringify({
          body: "Author must not edit this.",
          expectedUpdatedAt: draft.updatedAt.toISOString(),
        }),
      }),
      { params: Promise.resolve({ ticketId: draftTicketId, draftId: draft.id }) },
    );
    assert.equal(authorEdit.status, 403);

    const reviewedText = "Thank you for raising this. I reviewed the available record, and the next step is for our support team to verify the remaining details before making a commitment.";
    const edit = await editResponseDraftRoute(
      request(`/api/admin/tickets/${draftTicketId}/drafts/${draft.id}`, {
        method: "PATCH",
        headers: mutationHeaders(adminCookie),
        body: JSON.stringify({
          body: reviewedText,
          expectedUpdatedAt: draft.updatedAt.toISOString(),
        }),
      }),
      { params: Promise.resolve({ ticketId: draftTicketId, draftId: draft.id }) },
    );
    assert.equal(edit.status, 200);
    const editBody = (await edit.json()) as ApiSuccessBody<AdminTicketData>;
    assert.equal(editBody.data.ticket.responseDraft?.body, reviewedText);
    assert.equal(editBody.data.ticket.responseDraft?.status, "Edited");
    assert.equal(editBody.data.ticket.latestDraftAttempt?.knowledgeBaseVersion, "bookleaf-kb-v1");
    assert.equal(editBody.data.ticket.latestDraftAttempt?.inputTokens, 200);

    const sendKey = randomUUID();
    const sendDraft = () =>
      adminMutation(
        sendPublicResponse,
        `/api/admin/tickets/${draftTicketId}/responses`,
        adminCookie,
        draftTicketId,
        "POST",
        { body: reviewedText, idempotencyKey: sendKey, aiDraftId: draft.id },
      );
    assert.equal((await sendDraft()).status, 201);
    assert.equal((await sendDraft()).status, 201);
    assert.equal(
      await prisma.ticketResponse.count({ where: { idempotencyKey: sendKey } }),
      1,
    );
    const storedDraft = await prisma.aiDraft.findUniqueOrThrow({
      where: { id: draft.id },
    });
    assert.equal(storedDraft.status, "SENT");

    const authorDetail = await getAuthorTicket(
      request(`/api/author/tickets/${draftTicketId}`, {
        headers: { cookie: authorCookie },
      }),
      detailContext(draftTicketId),
    );
    const authorBody = (await authorDetail.json()) as ApiSuccessBody<AuthorTicketData>;
    assert.ok(authorBody.data.ticket.responses.some((item) => item.body === reviewedText));
    assert.doesNotMatch(JSON.stringify(authorBody), /AI text requiring admin review|responseDraft|latestDraftAttempt/);
  });

  await t.test("admin mutation inputs are validated", async () => {
    const emptyPatch = await adminMutation(
      updateAdminTicket,
      `/api/admin/tickets/${mainTicketId}`,
      adminCookie,
      mainTicketId,
      "PATCH",
      {},
    );
    assert.equal(emptyPatch.status, 400);
    const invalidResponse = await adminMutation(
      sendPublicResponse,
      `/api/admin/tickets/${mainTicketId}/responses`,
      adminCookie,
      mainTicketId,
      "POST",
      { body: "", idempotencyKey: "invalid" },
    );
    assert.equal(invalidResponse.status, 400);
    const body = (await invalidResponse.json()) as ApiErrorBody;
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  for (const [cookie] of [[authorCookie], [adminCookie]]) {
    const response = await logout(
      request("/api/auth/logout", {
        method: "POST",
        headers: mutationHeaders(cookie),
      }),
    );
    assert.equal(response.status, 200);
  }
});

