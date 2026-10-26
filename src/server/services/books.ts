import "server-only";

import { UserRole } from "@/generated/prisma/client";
import type { AuthenticatedUser } from "@/server/auth/authorization";
import { AuthorizationError } from "@/server/auth/errors";
import {
  type AuthorBookRecord,
  findBookByAuthorId,
  findBooksByAuthorId,
} from "@/server/repositories/books";
import type {
  AuthorBook,
  AuthorBookData,
  AuthorBooksData,
} from "@/types/books";

export const BOOK_CURRENCY = "INR" as const;
export const BOOK_CURRENCY_BASIS =
  "The supplied dataset does not include a currency field; BookLeaf treats its monetary values as INR.";

function dateOnly(value: Date | null) {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function money(value: { toFixed(decimalPlaces: number): string } | null) {
  return value === null ? null : value.toFixed(2);
}

export function serializeAuthorBook(book: AuthorBookRecord): AuthorBook {
  return {
    bookId: book.bookId,
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    publicationDate: dateOnly(book.publicationDate),
    status: book.status,
    mrp: money(book.mrp),
    authorRoyaltyPerCopy: money(book.authorRoyaltyPerCopy),
    totalCopiesSold: book.totalCopiesSold,
    totalRoyaltyEarned: book.totalRoyaltyEarned.toFixed(2),
    royaltyPaid: book.royaltyPaid.toFixed(2),
    royaltyPending: book.royaltyPending.toFixed(2),
    lastRoyaltyPayoutDate: dateOnly(book.lastRoyaltyPayoutDate),
    printPartner: book.printPartner,
    availableOn: book.availableOn,
  };
}

function requireAuthorId(user: AuthenticatedUser) {
  if (user.role !== UserRole.AUTHOR || !user.authorId) {
    throw new AuthorizationError();
  }

  return user.authorId;
}

export async function listBooksForAuthor(
  user: AuthenticatedUser,
): Promise<AuthorBooksData> {
  const authorId = requireAuthorId(user);
  const books = await findBooksByAuthorId(authorId);

  return {
    books: books.map(serializeAuthorBook),
    currency: BOOK_CURRENCY,
    currencyBasis: BOOK_CURRENCY_BASIS,
  };
}

export async function getBookForAuthor(
  user: AuthenticatedUser,
  bookId: string,
): Promise<AuthorBookData> {
  const authorId = requireAuthorId(user);
  const book = await findBookByAuthorId(authorId, bookId);

  if (!book) {
    throw new AuthorizationError(
      "NOT_FOUND",
      "The requested book was not found.",
      404,
    );
  }

  return {
    book: serializeAuthorBook(book),
    currency: BOOK_CURRENCY,
    currencyBasis: BOOK_CURRENCY_BASIS,
  };
}
