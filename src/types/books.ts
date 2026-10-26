export type AuthorBook = {
  bookId: string;
  title: string;
  isbn: string;
  genre: string;
  publicationDate: string | null;
  status: string;
  mrp: string | null;
  authorRoyaltyPerCopy: string | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: string;
  royaltyPaid: string;
  royaltyPending: string;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
};

export type AuthorBooksData = {
  books: AuthorBook[];
  currency: "INR";
  currencyBasis: string;
};

export type AuthorBookData = {
  book: AuthorBook;
  currency: "INR";
  currencyBasis: string;
};
