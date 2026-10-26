import "server-only";

import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";

import { auth } from "./auth";
import { AuthenticationError, AuthorizationError } from "./errors";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  authorId: string | null;
};

export async function findActiveAuthenticatedUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      role: true,
      authorProfile: {
        select: { authorId: true, name: true },
      },
    },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.authorProfile?.name ?? user.email,
    role: user.role,
    authorId: user.authorProfile?.authorId ?? null,
  } satisfies AuthenticatedUser;
}

export async function getCurrentUser(
  requestHeaders: Headers,
): Promise<AuthenticatedUser | null> {
  const session = await auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });

  if (!session) {
    return null;
  }

  return findActiveAuthenticatedUser(session.user.id);
}

export function assertAuthenticated(
  user: AuthenticatedUser | null,
): asserts user is AuthenticatedUser {
  if (!user) {
    throw new AuthenticationError();
  }
}

export function assertRole(user: AuthenticatedUser, role: UserRole) {
  if (user.role !== role) {
    throw new AuthorizationError();
  }
}

export function assertAuthorOwnership(
  user: AuthenticatedUser,
  resourceAuthorId: string,
) {
  if (user.role === UserRole.ADMIN) {
    return;
  }

  if (!user.authorId || user.authorId !== resourceAuthorId) {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested resource was not found.",
      404,
    );
  }
}

export function scopeAuthorOwnedQuery<T extends object>(
  user: AuthenticatedUser,
  where: T,
): T & { authorId?: string } {
  if (user.role === UserRole.ADMIN) {
    return where;
  }

  if (!user.authorId) {
    throw new AuthorizationError();
  }

  return { ...where, authorId: user.authorId };
}

export async function requireApiUser(request: Request) {
  const user = await getCurrentUser(request.headers);
  assertAuthenticated(user);
  return user;
}

export async function requireApiRole(request: Request, role: UserRole) {
  const user = await requireApiUser(request);
  assertRole(user, role);
  return user;
}

export function landingPathForRole(role: UserRole) {
  return role === UserRole.ADMIN ? "/admin" : "/author";
}
