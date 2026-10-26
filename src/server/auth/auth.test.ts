import "dotenv/config";

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { GET as adminSessionCheck } from "@/app/api/admin/session-check/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as currentUser } from "@/app/api/auth/me/route";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

import {
  type AuthenticatedUser,
  assertAuthorOwnership,
  assertAuthenticated,
  assertRole,
  scopeAuthorOwnedQuery,
} from "./authorization";
import { AuthenticationError, AuthorizationError } from "./errors";

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function request(
  path: string,
  init?: RequestInit,
) {
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

async function loginAs(email: string, password: string) {
  return login(
    request("/api/auth/login", {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify({ email, password, rememberMe: true }),
    }),
  );
}

after(async () => {
  await prisma.$disconnect();
});

test("authorization policies reject missing, wrong-role, and foreign-owner access", () => {
  assert.throws(() => assertAuthenticated(null), AuthenticationError);

  const author: AuthenticatedUser = {
    id: "user-author",
    email: "author@example.com",
    name: "Author",
    role: UserRole.AUTHOR,
    authorId: "AUTH001",
  };
  const admin: AuthenticatedUser = {
    id: "user-admin",
    email: "admin@example.com",
    name: "Admin",
    role: UserRole.ADMIN,
    authorId: null,
  };

  assert.throws(
    () => assertRole(author, UserRole.ADMIN),
    (error: unknown) =>
      error instanceof AuthorizationError && error.status === 403,
  );
  assert.doesNotThrow(() => assertRole(admin, UserRole.ADMIN));
  assert.doesNotThrow(() => assertAuthorOwnership(author, "AUTH001"));
  assert.throws(
    () => assertAuthorOwnership(author, "AUTH002"),
    (error: unknown) =>
      error instanceof AuthorizationError && error.status === 404,
  );
  assert.deepEqual(scopeAuthorOwnedQuery(author, { bookId: "BK001" }), {
    bookId: "BK001",
    authorId: "AUTH001",
  });
  assert.deepEqual(scopeAuthorOwnedQuery(admin, { bookId: "BK001" }), {
    bookId: "BK001",
  });
});

test("proxy redirects missing cookies and lets cookie-bearing requests continue", () => {
  const anonymousResponse = proxy(new NextRequest(`${origin}/author`));
  assert.equal(anonymousResponse.status, 307);
  assert.equal(anonymousResponse.headers.get("location"), `${origin}/login`);

  const cookieResponse = proxy(
    new NextRequest(`${origin}/admin`, {
      headers: { cookie: "better-auth.session_token=optimistic-only" },
    }),
  );
  assert.equal(cookieResponse.status, 200);
  assert.equal(cookieResponse.headers.get("x-middleware-next"), "1");
});

test("database-backed authentication and authorization flow", async (t) => {
  await prisma.authRateLimit.deleteMany();
  const author = await prisma.authorProfile.findFirstOrThrow({
    orderBy: { authorId: "asc" },
    include: { user: true },
  });
  const authorPassword = process.env.SEED_AUTHOR_PASSWORD;
  const adminEmail = process.env.SEED_ADMIN_EMAIL;

  assert.ok(authorPassword, "SEED_AUTHOR_PASSWORD is required for auth tests");
  assert.ok(adminEmail, "SEED_ADMIN_EMAIL is required for auth tests");

  await t.test("unauthenticated current-user requests return 401", async () => {
    const response = await currentUser(request("/api/auth/me"));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
  });

  await t.test("invalid credentials use one generic 401 response", async () => {
    const response = await loginAs(adminEmail, "definitely-not-the-password");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      },
    });
  });

  await t.test("cross-site login mutations are rejected", async () => {
    const response = await login(
      request("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({
          email: author.email,
          password: authorPassword,
        }),
      }),
    );
    assert.equal(response.status, 403);
  });

  await t.test("an author session cannot call an admin endpoint", async () => {
    const loginResponse = await loginAs(author.email, authorPassword);
    assert.equal(loginResponse.status, 200);
    assert.match(loginResponse.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.match(loginResponse.headers.get("set-cookie") ?? "", /SameSite=Lax/i);
    const cookie = sessionCookie(loginResponse);

    const meResponse = await currentUser(
      request("/api/auth/me", { headers: { cookie } }),
    );
    assert.equal(meResponse.status, 200);
    const meBody = (await meResponse.json()) as {
      data: { user: AuthenticatedUser };
    };
    assert.equal(meBody.data.user.role, UserRole.AUTHOR);
    assert.equal(meBody.data.user.authorId, author.authorId);

    const response = await adminSessionCheck(
      request("/api/admin/session-check", { headers: { cookie } }),
    );
    assert.equal(response.status, 403);

    const logoutResponse = await logout(
      request("/api/auth/logout", {
        method: "POST",
        headers: mutationHeaders(cookie),
      }),
    );
    assert.equal(logoutResponse.status, 200);

    const afterLogout = await currentUser(
      request("/api/auth/me", { headers: { cookie } }),
    );
    assert.equal(afterLogout.status, 401);
  });

  await t.test("an expired server session is rejected", async () => {
    const loginResponse = await loginAs(author.email, authorPassword);
    assert.equal(loginResponse.status, 200);
    const cookie = sessionCookie(loginResponse);

    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId: author.userId },
      orderBy: { createdAt: "desc" },
    });
    await prisma.authSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const response = await currentUser(
      request("/api/auth/me", { headers: { cookie } }),
    );
    assert.equal(response.status, 401);

    await prisma.authSession.deleteMany({ where: { id: session.id } });
  });

  await prisma.authRateLimit.deleteMany();
});
