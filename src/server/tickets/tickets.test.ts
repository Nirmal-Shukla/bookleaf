import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { GET as getAuthorTicket } from "@/app/api/author/tickets/[ticketId]/route";
import {
  GET as listAuthorTickets,
  POST as createAuthorTicket,
} from "@/app/api/author/tickets/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import {
  AiTaskType,
  TicketStatus,
  UserRole,
} from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";
import type { ApiErrorBody, ApiSuccessBody } from "@/server/http/api-response";
import type {
  AuthorTicketData,
  AuthorTicketsData,
} from "@/types/tickets";

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const testMarker = `[ticket-api-${randomUUID()}]`;
const originalLlmProvider = process.env.LLM_PROVIDER;

// This suite verifies the unavailable-provider fallback. Never let a developer's
// private credential turn it into an accidental real-provider smoke test.
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
  assert.ok(value, "login must set a session cookie");
  return value.split(";", 1)[0];
}

async function loginAsAuthor(email: string) {
  const password = process.env.SEED_AUTHOR_PASSWORD;
  assert.ok(password, "SEED_AUTHOR_PASSWORD is required for ticket tests");
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

function createTicketRequest(
  cookie: string,
  body: Record<string, unknown>,
) {
  return createAuthorTicket(
    request("/api/author/tickets", {
      method: "POST",
      headers: mutationHeaders(cookie),
      body: JSON.stringify({ idempotencyKey: randomUUID(), ...body }),
    }),
  );
}

function ticketDetailRequest(cookie: string, ticketId: string) {
  return getAuthorTicket(
    request(`/api/author/tickets/${ticketId}`, { headers: { cookie } }),
    { params: Promise.resolve({ ticketId }) },
  );
}

async function logoutSession(cookie: string) {
  const response = await logout(
    request("/api/auth/logout", {
      method: "POST",
      headers: mutationHeaders(cookie),
    }),
  );
  assert.equal(response.status, 200);
}

after(async () => {
  await prisma.ticket.deleteMany({
    where: { subject: { startsWith: testMarker } },
  });
  await prisma.authRateLimit.deleteMany();
  await prisma.$disconnect();
  if (originalLlmProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = originalLlmProvider;
});

test("author ticket REST flow enforces validation, ownership, and public mapping", async (t) => {
  await prisma.ticket.deleteMany({
    where: { subject: { startsWith: testMarker } },
  });
  await prisma.authRateLimit.deleteMany();

  const sneha = await prisma.authorProfile.findUniqueOrThrow({
    where: { authorId: "AUTH007" },
  });
  const kavita = await prisma.authorProfile.findUniqueOrThrow({
    where: { authorId: "AUTH009" },
  });
  const snehaCookie = await loginAsAuthor(sneha.email);
  const kavitaCookie = await loginAsAuthor(kavita.email);
  let ownedTicketId = "";
  let generalTicketId = "";

  await t.test("unauthenticated requests are rejected", async () => {
    const listResponse = await listAuthorTickets(request("/api/author/tickets"));
    assert.equal(listResponse.status, 401);

    const createResponse = await createAuthorTicket(
      request("/api/author/tickets", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({
          bookId: null,
          subject: `${testMarker} unauthenticated`,
          description: "This request must not be created.",
        }),
      }),
    );
    assert.equal(createResponse.status, 401);
  });

  await t.test("an owned-book ticket stays usable when AI is unavailable", async () => {
    const response = await createTicketRequest(snehaCookie, {
      bookId: "BK011",
      subject: `${testMarker} royalty question`,
      description: "Please explain the latest royalty entry for this title.",
    });
    assert.equal(response.status, 201);

    const body = (await response.json()) as ApiSuccessBody<AuthorTicketData>;
    ownedTicketId = body.data.ticket.id;
    assert.equal(body.data.ticket.status, "Open");
    assert.deepEqual(body.data.ticket.book, {
      bookId: "BK011",
      title: "The Algorithm of Love",
    });
    assert.deepEqual(body.data.ticket.responses, []);

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: ownedTicketId },
      include: { aiRuns: true, statusEvents: true },
    });
    assert.equal(stored.authorId, "AUTH007");
    assert.equal(stored.status, TicketStatus.OPEN);
    assert.equal(stored.classificationState, "FAILED");
    assert.equal(stored.category, null);
    assert.equal(stored.priority, null);
    assert.equal(stored.aiRuns.length, 1);
    assert.equal(stored.aiRuns[0]?.status, "FAILED");
    assert.equal(stored.aiRuns[0]?.errorCode, "UNAVAILABLE");
    assert.equal(stored.statusEvents.length, 1);
    assert.equal(stored.statusEvents[0]?.toStatus, TicketStatus.OPEN);
  });

  await t.test("General / Account Level is stored with a null book", async () => {
    const response = await createTicketRequest(snehaCookie, {
      bookId: null,
      subject: `${testMarker} account question`,
      description: "Please help me confirm the details on my author account.",
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as ApiSuccessBody<AuthorTicketData>;
    generalTicketId = body.data.ticket.id;
    assert.equal(body.data.ticket.book, null);

    const stored = await prisma.ticket.findUniqueOrThrow({
      where: { id: generalTicketId },
      select: { bookId: true },
    });
    assert.equal(stored.bookId, null);
  });

  await t.test("creation retries are idempotent and conflicting reuse is rejected", async () => {
    const idempotencyKey = randomUUID();
    const requestBody = {
      idempotencyKey,
      bookId: null,
      subject: `${testMarker} idempotent creation`,
      description: "This exact request may be retried without another ticket.",
    };
    const first = await createTicketRequest(snehaCookie, requestBody);
    const second = await createTicketRequest(snehaCookie, requestBody);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstBody = (await first.json()) as ApiSuccessBody<AuthorTicketData>;
    const secondBody = (await second.json()) as ApiSuccessBody<AuthorTicketData>;
    assert.equal(firstBody.data.ticket.id, secondBody.data.ticket.id);
    assert.equal(
      await prisma.ticket.count({ where: { creationIdempotencyKey: idempotencyKey } }),
      1,
    );

    const conflict = await createTicketRequest(snehaCookie, {
      ...requestBody,
      description: "Different content must not reuse a creation key.",
    });
    assert.equal(conflict.status, 409);
    const conflictBody = (await conflict.json()) as ApiErrorBody;
    assert.equal(conflictBody.error.code, "IDEMPOTENCY_CONFLICT");
  });

  await t.test("field lengths, identifiers, and pagination are validated", async () => {
    const response = await createTicketRequest(snehaCookie, {
      bookId: null,
      subject: "x",
      description: "short",
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as ApiErrorBody;
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.details);

    const paginationResponse = await listAuthorTickets(
      request("/api/author/tickets?page=0&pageSize=500", {
        headers: { cookie: snehaCookie },
      }),
    );
    assert.equal(paginationResponse.status, 400);

    const identifierResponse = await ticketDetailRequest(
      snehaCookie,
      "not-a-ticket-id",
    );
    assert.equal(identifierResponse.status, 400);
  });

  await t.test("a foreign book cannot be attached to a new ticket", async () => {
    const before = await prisma.ticket.count({ where: { authorId: "AUTH007" } });
    const response = await createTicketRequest(snehaCookie, {
      bookId: "BK015",
      subject: `${testMarker} foreign book`,
      description: "This title belongs to a different author account.",
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "The selected book was not found.",
      },
    });
    const afterCount = await prisma.ticket.count({ where: { authorId: "AUTH007" } });
    assert.equal(afterCount, before);
  });

  await t.test("lists are author-scoped, paginated, and deterministically sorted", async () => {
    const kavitaTicket = await createTicketRequest(kavitaCookie, {
      bookId: "BK015",
      subject: `${testMarker} Kavita only`,
      description: "This request must stay within Kavita's author account.",
    });
    assert.equal(kavitaTicket.status, 201);

    const response = await listAuthorTickets(
      request("/api/author/tickets?page=1&pageSize=1", {
        headers: { cookie: snehaCookie },
      }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as ApiSuccessBody<AuthorTicketsData>;
    assert.equal(body.data.tickets.length, 1);
    assert.ok(body.data.pagination.totalItems >= 2);
    assert.equal(body.data.pagination.page, 1);
    assert.equal(body.data.pagination.pageSize, 1);
    assert.doesNotMatch(JSON.stringify(body), /Kavita only/);

    const expected = await prisma.ticket.findFirstOrThrow({
      where: { authorId: "AUTH007" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    assert.equal(body.data.tickets[0]?.id, expected.id);
  });

  await t.test("foreign and missing ticket details use the same generic response", async () => {
    const foreignResponse = await ticketDetailRequest(kavitaCookie, ownedTicketId);
    const missingResponse = await ticketDetailRequest(kavitaCookie, randomUUID());
    assert.equal(foreignResponse.status, 404);
    assert.equal(missingResponse.status, 404);
    const foreignBody = (await foreignResponse.json()) as ApiErrorBody;
    const missingBody = (await missingResponse.json()) as ApiErrorBody;
    assert.deepEqual(foreignBody, missingBody);
    assert.deepEqual(foreignBody, {
      error: {
        code: "NOT_FOUND",
        message: "The requested ticket was not found.",
      },
    });
    assert.doesNotMatch(JSON.stringify(foreignBody), new RegExp(ownedTicketId));
  });

  await t.test("detail responses include public replies and exclude private fields", async () => {
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: UserRole.ADMIN },
    });
    const privateNote = `${testMarker} private internal note`;
    const privateDraft = `${testMarker} unsent AI draft`;
    const publicReply = `${testMarker} public support response`;

    await prisma.ticket.update({
      where: { id: generalTicketId },
      data: { assignedAdminId: admin.id },
    });
    await prisma.internalNote.create({
      data: { ticketId: generalTicketId, adminUserId: admin.id, body: privateNote },
    });
    await prisma.aiProcessingRun.create({
      data: {
        ticketId: generalTicketId,
        taskType: AiTaskType.CLASSIFICATION,
        provider: `${testMarker} private provider`,
      },
    });
    await prisma.aiDraft.create({
      data: {
        ticketId: generalTicketId,
        generatedBody: privateDraft,
        currentBody: privateDraft,
      },
    });
    await prisma.ticketResponse.create({
      data: {
        ticketId: generalTicketId,
        sentByUserId: admin.id,
        body: publicReply,
      },
    });

    const response = await ticketDetailRequest(snehaCookie, generalTicketId);
    assert.equal(response.status, 200);
    const body = (await response.json()) as ApiSuccessBody<AuthorTicketData>;
    assert.equal(body.data.ticket.responses.length, 1);
    assert.equal(body.data.ticket.responses[0]?.body, publicReply);
    assert.deepEqual(Object.keys(body.data.ticket).sort(), [
      "book",
      "createdAt",
      "description",
      "id",
      "responses",
      "status",
      "subject",
    ]);
    assert.deepEqual(Object.keys(body.data.ticket.responses[0] ?? {}).sort(), [
      "body",
      "createdAt",
      "id",
    ]);

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes(privateNote), false);
    assert.equal(serialized.includes(privateDraft), false);
    assert.doesNotMatch(serialized, /private provider/);
    assert.doesNotMatch(serialized, /internalNotes|aiDrafts|aiRuns|assignedAdmin/);
  });

  await logoutSession(snehaCookie);
  await logoutSession(kavitaCookie);
});

