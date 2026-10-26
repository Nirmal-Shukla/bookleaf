import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AuthorBook } from "@/types/books";

import { BookCard } from "./book-card";

test("production book cards render null labels and actual zero values", () => {
  const productionBook: AuthorBook = {
    bookId: "BK013",
    title: "Midnight in Mysore",
    isbn: "978-93-5XXXX-13-4",
    genre: "Thriller",
    publicationDate: null,
    status: "In Production - Cover Design",
    mrp: null,
    authorRoyaltyPerCopy: null,
    totalCopiesSold: 0,
    totalRoyaltyEarned: "0.00",
    royaltyPaid: "0.00",
    royaltyPending: "0.00",
    lastRoyaltyPayoutDate: null,
    printPartner: null,
    availableOn: [],
  };

  const markup = renderToStaticMarkup(
    createElement(BookCard, { book: productionBook }),
  );

  assert.match(markup, /Midnight in Mysore/);
  assert.match(markup, /Not published yet/);
  assert.match(markup, /Not available/);
  assert.match(markup, /No payout date supplied/);
  assert.match(markup, /₹0\.00/);
  assert.match(markup, /No platforms are listed yet/);
});
