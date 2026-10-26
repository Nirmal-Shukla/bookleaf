import type {
  AuthorTicketBook,
  AuthorTicketResponse,
  AuthorTicketStatus,
} from "./tickets";

export type AdminTicketCategory =
  | "Royalty & Payments"
  | "ISBN & Metadata Issues"
  | "Printing & Quality"
  | "Distribution & Availability"
  | "Book Status & Production Updates"
  | "General Inquiry";

export type AdminTicketPriority = "Critical" | "High" | "Medium" | "Low";
export type AdminClassificationState =
  | "Pending"
  | "Processing"
  | "Completed"
  | "Failed";

export type AdminActor = {
  id: string;
  email: string;
};

export type AdminTicketAuthor = {
  authorId: string;
  name: string;
  email: string;
};

export type AdminTicketSummary = {
  id: string;
  subject: string;
  status: AuthorTicketStatus;
  category: AdminTicketCategory | null;
  priority: AdminTicketPriority | null;
  classificationState: AdminClassificationState;
  classificationStateUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  author: AdminTicketAuthor;
  book: AuthorTicketBook | null;
  assignedAdmin: AdminActor | null;
  assignedAt: string | null;
  publicResponseCount: number;
  internalNoteCount: number;
};

export type AdminTicketBook = AuthorTicketBook & {
  isbn: string;
  status: string;
  publicationDate: string | null;
};

export type AdminTicketInternalNote = {
  id: string;
  body: string;
  createdAt: string;
  admin: AdminActor;
};

export type AdminTicketStatusEvent = {
  id: string;
  fromStatus: AuthorTicketStatus | null;
  toStatus: AuthorTicketStatus;
  createdAt: string;
  changedBy: AdminActor | null;
};

export type AdminPublicResponse = AuthorTicketResponse & {
  sentBy: AdminActor;
};

export type AdminClassificationAttempt = {
  id: string;
  status: "Pending" | "Processing" | "Succeeded" | "Failed";
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type AdminDraftAttempt = AdminClassificationAttempt & {
  knowledgeBaseVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
};

export type AdminResponseDraft = {
  id: string;
  body: string;
  status: "Generated" | "Edited";
  editedAt: string | null;
  editedBy: AdminActor | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminTicket = Omit<AdminTicketSummary, "book"> & {
  description: string;
  book: AdminTicketBook | null;
  categoryUpdatedAt: string | null;
  categoryUpdatedBy: AdminActor | null;
  priorityUpdatedAt: string | null;
  priorityUpdatedBy: AdminActor | null;
  responses: AdminPublicResponse[];
  internalNotes: AdminTicketInternalNote[];
  statusEvents: AdminTicketStatusEvent[];
  latestClassificationAttempt: AdminClassificationAttempt | null;
  responseDraft: AdminResponseDraft | null;
  latestDraftAttempt: AdminDraftAttempt | null;
  shouldInitiateDraft: boolean;
};

export type AdminTicketsData = {
  tickets: AdminTicketSummary[];
  oldestUnresolved: {
    id: string;
    subject: string;
    createdAt: string;
    priority: AdminTicketPriority | null;
  } | null;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  filters: {
    status: string | null;
    category: string | null;
    priority: string | null;
    createdFrom: string | null;
    createdTo: string | null;
  };
  sort: {
    description: string;
  };
  dateBoundary: {
    timezone: "UTC";
    description: string;
  };
};

export type AdminTicketData = {
  ticket: AdminTicket;
};

