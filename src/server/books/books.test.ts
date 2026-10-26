import "dotenv/config";

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { GET as getAuthorBook } from "@/app/api/author/books/[bookId]/route";
import { GET as listAuthorBooks } from "@/app/api/author/books/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { prisma } from "@/server/database/prisma";
import type { ApiErrorBody, ApiSuccessBody } from "@/server/http/api-response";
import type { AuthorBookData, AuthorBooksData } from "@/types/books";

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

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
  assert.ok(password, "SEED_AUTHOR_PASSWORD is required for books tests");

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

async function bookDetailRequest(cookie: string, bookId: string) {
  return getAuthorBook(
    request(`/api/author/books/${bookId}`, { headers: { cookie } }),
    { params: Promise.resolve({ bookId }) },
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
  await prisma.$disconnect();
});

test("author book endpoints enforce ownership and preserve source values", async (t) => {
  await prisma.authRateLimit.deleteMany();

  await t.test("unauthenticated list requests return 401", async () => {
    const response = await listAuthorBooks(request("/api/author/books"));
    assert.equal(response.status, 401);
  });

  await t.test("Sneha sees exactly BK011, BK012, and BK013", async () => {
    const sneha = await prisma.authorProfile.findUniqueOrThrow({
      where: { authorId: "AUTH007" },
    });
    const cookie = await loginAsAuthor(sneha.email);

    const response = await listAuthorBooks(
      request("/api/author/books", { headers: { cookie } }),
    );
    assert.equal(response.status, 200);

    const body = (await response.json()) as ApiSuccessBody<AuthorBooksData>;
    assert.equal(body.data.currency, "INR");
    assert.match(body.data.currencyBasis, /does not include a currency field/i);
    assert.deepEqual(
      body.data.books.map((book) => book.bookId),
      ["BK011", "BK012", "BK013"],
    );

    const productionBook = body.data.books.find(
      (book) => book.bookId === "BK013",
    );
    assert.ok(productionBook);
    assert.equal(productionBook.publicationDate, null);
    assert.equal(productionBook.mrp, null);
    assert.equal(productionBook.authorRoyaltyPerCopy, null);
    assert.equal(productionBook.totalCopiesSold, 0);
    assert.equal(productionBook.totalRoyaltyEarned, "0.00");
    assert.equal(productionBook.royaltyPaid, "0.00");
    assert.equal(productionBook.royaltyPending, "0.00");
    assert.equal(productionBook.lastRoyaltyPayoutDate, null);
    assert.equal(productionBook.printPartner, null);
    assert.deepEqual(productionBook.availableOn, []);

    const ownBookResponse = await bookDetailRequest(cookie, "BK011");
    assert.equal(ownBookResponse.status, 200);
    const ownBookBody =
      (await ownBookResponse.json()) as ApiSuccessBody<AuthorBookData>;
    assert.equal(ownBookBody.data.book.bookId, "BK011");

    const foreignBookResponse = await bookDetailRequest(cookie, "BK015");
    const missingBookResponse = await bookDetailRequest(cookie, "BK999");
    assert.equal(foreignBookResponse.status, 404);
    assert.equal(missingBookResponse.status, 404);

    const foreignBody = (await foreignBookResponse.json()) as ApiErrorBody;
    const missingBody = (await missingBookResponse.json()) as ApiErrorBody;
    assert.deepEqual(foreignBody, missingBody);
    assert.deepEqual(foreignBody, {
      error: {
        code: "NOT_FOUND",
        message: "The requested book was not found.",
      },
    });
    assert.doesNotMatch(JSON.stringify(foreignBody), /BK015|Raising Roots/i);

    await logoutSession(cookie);
  });

  await t.test("Kavita sees BK015 and BK016 with null and zero distinct", async () => {
    const kavita = await prisma.authorProfile.findUniqueOrThrow({
      where: { authorId: "AUTH009" },
    });
    const cookie = await loginAsAuthor(kavita.email);

    const response = await listAuthorBooks(
      request("/api/author/books", { headers: { cookie } }),
    );
    assert.equal(response.status, 200);

    const body = (await response.json()) as ApiSuccessBody<AuthorBooksData>;
    assert.deepEqual(
      body.data.books.map((book) => book.bookId),
      ["BK015", "BK016"],
    );

    const productionBook = body.data.books[0];
    const publishedBook = body.data.books[1];
    assert.equal(productionBook?.publicationDate, null);
    assert.equal(productionBook?.mrp, null);
    assert.equal(productionBook?.totalRoyaltyEarned, "0.00");
    assert.equal(publishedBook?.mrp, "299.00");
    assert.equal(publishedBook?.royaltyPaid, "0.00");
    assert.equal(publishedBook?.royaltyPending, "850.00");
    assert.equal(publishedBook?.lastRoyaltyPayoutDate, null);
    assert.deepEqual(publishedBook?.availableOn, [
      "Amazon India",
      "BookLeaf Store",
    ]);

    await logoutSession(cookie);
  });

  await prisma.authRateLimit.deleteMany();
});
