import assert from "node:assert/strict";

import type { PrismaClient } from "../src/generated/prisma/client";

import {
  type SourceBook,
  type SourceData,
  toDateOnly,
} from "./source-data";

function decimalValue(value: { toFixed(decimalPlaces: number): string }): string {
  return value.toFixed(2);
}

function sourceMoney(value: number): string {
  return value.toFixed(2);
}

function nullableMoney(
  value: { toFixed(decimalPlaces: number): string } | null,
): string | null {
  return value === null ? null : decimalValue(value);
}

function nullableSourceMoney(value: number | null): string | null {
  return value === null ? null : sourceMoney(value);
}

function nullableDate(value: Date | null): string | null {
  return value === null ? null : toDateOnly(value);
}

function validateSpecialBook(sourceBook: SourceBook, expectedBookId: string) {
  assert.equal(sourceBook.book_id, expectedBookId);

  if (expectedBookId === "BK013") {
    assert.deepEqual(sourceBook, {
      book_id: "BK013",
      title: "Midnight in Mysore",
      isbn: "978-93-5XXXX-13-4",
      genre: "Thriller",
      publication_date: null,
      status: "In Production - Cover Design",
      mrp: null,
      author_royalty_per_copy: null,
      total_copies_sold: 0,
      total_royalty_earned: 0,
      royalty_paid: 0,
      royalty_pending: 0,
      last_royalty_payout_date: null,
      print_partner: null,
      available_on: [],
    });
  }

  if (expectedBookId === "BK015") {
    assert.deepEqual(sourceBook, {
      book_id: "BK015",
      title: "Raising Roots",
      isbn: "978-93-5XXXX-15-8",
      genre: "Parenting / Non-Fiction",
      publication_date: null,
      status: "In Production - Typesetting",
      mrp: null,
      author_royalty_per_copy: null,
      total_copies_sold: 0,
      total_royalty_earned: 0,
      royalty_paid: 0,
      royalty_pending: 0,
      last_royalty_payout_date: null,
      print_partner: null,
      available_on: [],
    });
  }

  if (expectedBookId === "BK016") {
    assert.deepEqual(sourceBook, {
      book_id: "BK016",
      title: "The Nagpur Notebooks",
      isbn: "978-93-5XXXX-16-5",
      genre: "Essays / Memoir",
      publication_date: "2024-11-05",
      status: "Published & Live",
      mrp: 299,
      author_royalty_per_copy: 25,
      total_copies_sold: 34,
      total_royalty_earned: 850,
      royalty_paid: 0,
      royalty_pending: 850,
      last_royalty_payout_date: null,
      print_partner: "In-House",
      available_on: ["Amazon India", "BookLeaf Store"],
    });
  }
}

export async function validateSeededData(
  prisma: Pick<PrismaClient, "authorProfile" | "book" | "ticket">,
  sourceData: SourceData,
) {
  const sourceBooks = sourceData.authors.flatMap((author) =>
    author.books.map((book) => ({ ...book, author_id: author.author_id })),
  );
  const [authors, books, ticketCount] = await Promise.all([
    prisma.authorProfile.findMany({
      include: {
        user: {
          select: {
            role: true,
            accounts: {
              where: { providerId: "credential" },
              select: { password: true },
            },
          },
        },
      },
      orderBy: { authorId: "asc" },
    }),
    prisma.book.findMany({ orderBy: { bookId: "asc" } }),
    prisma.ticket.count(),
  ]);

  assert.equal(authors.length, 10, "Database must contain exactly 10 authors");
  assert.equal(books.length, 18, "Database must contain exactly 18 books");

  const authorsById = new Map(
    authors.map((author) => [author.authorId, author]),
  );
  const booksById = new Map(books.map((book) => [book.bookId, book]));

  for (const sourceAuthor of sourceData.authors) {
    const author = authorsById.get(sourceAuthor.author_id);
    assert.ok(author, `Missing author ${sourceAuthor.author_id}`);
    assert.equal(author.name, sourceAuthor.name);
    assert.equal(author.email, sourceAuthor.email);
    assert.equal(author.phone, sourceAuthor.phone);
    assert.equal(author.city, sourceAuthor.city);
    assert.equal(toDateOnly(author.joinedDate), sourceAuthor.joined_date);
    assert.equal(author.user.role, "AUTHOR");
    assert.equal(author.user.accounts.length, 1);
    assert.match(
      author.user.accounts[0]?.password ?? "",
      /^scrypt\$\d+\$\d+\$\d+\$/,
    );
  }

  for (const sourceBook of sourceBooks) {
    const book = booksById.get(sourceBook.book_id);
    assert.ok(book, `Missing book ${sourceBook.book_id}`);
    assert.equal(book.authorId, sourceBook.author_id);
    assert.equal(book.title, sourceBook.title);
    assert.equal(book.isbn, sourceBook.isbn);
    assert.equal(book.genre, sourceBook.genre);
    assert.equal(nullableDate(book.publicationDate), sourceBook.publication_date);
    assert.equal(book.status, sourceBook.status);
    assert.equal(nullableMoney(book.mrp), nullableSourceMoney(sourceBook.mrp));
    assert.equal(
      nullableMoney(book.authorRoyaltyPerCopy),
      nullableSourceMoney(sourceBook.author_royalty_per_copy),
    );
    assert.equal(book.totalCopiesSold, sourceBook.total_copies_sold);
    assert.equal(
      decimalValue(book.totalRoyaltyEarned),
      sourceMoney(sourceBook.total_royalty_earned),
    );
    assert.equal(
      decimalValue(book.royaltyPaid),
      sourceMoney(sourceBook.royalty_paid),
    );
    assert.equal(
      decimalValue(book.royaltyPending),
      sourceMoney(sourceBook.royalty_pending),
    );
    assert.equal(
      nullableDate(book.lastRoyaltyPayoutDate),
      sourceBook.last_royalty_payout_date,
    );
    assert.equal(book.printPartner, sourceBook.print_partner);
    assert.deepEqual(book.availableOn, sourceBook.available_on);
    assert.equal(
      sourceBook.total_royalty_earned,
      sourceBook.royalty_paid + sourceBook.royalty_pending,
      `${sourceBook.book_id} royalty totals do not reconcile`,
    );
  }

  const nullCounts = {
    publicationDate: books.filter((book) => book.publicationDate === null)
      .length,
    mrp: books.filter((book) => book.mrp === null).length,
    authorRoyaltyPerCopy: books.filter(
      (book) => book.authorRoyaltyPerCopy === null,
    ).length,
    lastRoyaltyPayoutDate: books.filter(
      (book) => book.lastRoyaltyPayoutDate === null,
    ).length,
    printPartner: books.filter((book) => book.printPartner === null).length,
    emptyAvailableOn: books.filter((book) => book.availableOn.length === 0)
      .length,
  };

  assert.deepEqual(nullCounts, {
    publicationDate: 2,
    mrp: 2,
    authorRoyaltyPerCopy: 2,
    lastRoyaltyPayoutDate: 6,
    printPartner: 2,
    emptyAvailableOn: 2,
  });

  for (const bookId of ["BK013", "BK015", "BK016"]) {
    const sourceBook = sourceData.authors
      .flatMap((author) => author.books)
      .find((book) => book.book_id === bookId);
    assert.ok(sourceBook, `Missing source fixture ${bookId}`);
    validateSpecialBook(sourceBook, bookId);
    assert.ok(booksById.has(bookId), `Missing seeded fixture ${bookId}`);
  }

  return {
    authorCount: authors.length,
    bookCount: books.length,
    ticketCount,
    nullCounts,
    verifiedBooks: ["BK013", "BK015", "BK016"],
  };
}
