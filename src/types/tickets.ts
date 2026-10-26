export type AuthorTicketStatus =
  | "Open"
  | "In Progress"
  | "Resolved"
  | "Closed";

export type AuthorTicketBook = {
  bookId: string;
  title: string;
};

export type AuthorTicketSummary = {
  id: string;
  subject: string;
  status: AuthorTicketStatus;
  createdAt: string;
  book: AuthorTicketBook | null;
};

export type AuthorTicketResponse = {
  id: string;
  body: string;
  createdAt: string;
};

export type AuthorTicket = AuthorTicketSummary & {
  description: string;
  responses: AuthorTicketResponse[];
};

export type AuthorTicketsData = {
  tickets: AuthorTicketSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type AuthorTicketData = {
  ticket: AuthorTicket;
};

