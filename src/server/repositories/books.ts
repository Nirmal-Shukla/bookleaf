import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/database/prisma";

export const authorBookSelect = {
  bookId: true,
  title: true,
  isbn: true,
  genre: true,
  publicationDate: true,
  status: true,
  mrp: true,
  authorRoyaltyPerCopy: true,
  totalCopiesSold: true,
  totalRoyaltyEarned: true,
  royaltyPaid: true,
  royaltyPending: true,
  lastRoyaltyPayoutDate: true,
  printPartner: true,
  availableOn: true,
} satisfies Prisma.BookSelect;

export type AuthorBookRecord = Prisma.BookGetPayload<{
  select: typeof authorBookSelect;
}>;

export function findBooksByAuthorId(authorId: string) {
  return prisma.book.findMany({
    where: { authorId },
    select: authorBookSelect,
    orderBy: { bookId: "asc" },
  });
}

export function findBookByAuthorId(authorId: string, bookId: string) {
  return prisma.book.findFirst({
    where: { authorId, bookId },
    select: authorBookSelect,
  });
}
