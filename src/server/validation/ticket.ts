import { z } from "zod";

export const TICKET_SUBJECT_MIN_LENGTH = 3;
export const TICKET_SUBJECT_MAX_LENGTH = 160;
export const TICKET_DESCRIPTION_MIN_LENGTH = 10;
export const TICKET_DESCRIPTION_MAX_LENGTH = 5_000;
export const DEFAULT_TICKET_PAGE_SIZE = 10;
export const MAX_TICKET_PAGE_SIZE = 50;

export const createTicketInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    bookId: z.string().trim().min(1).max(64).nullable().optional(),
    subject: z
      .string()
      .trim()
      .min(TICKET_SUBJECT_MIN_LENGTH)
      .max(TICKET_SUBJECT_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .min(TICKET_DESCRIPTION_MIN_LENGTH)
      .max(TICKET_DESCRIPTION_MAX_LENGTH),
  })
  .strict()
  .transform((value) => ({ ...value, bookId: value.bookId ?? null }));

export const ticketIdParamSchema = z.uuid();

export const ticketPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TICKET_PAGE_SIZE)
    .default(DEFAULT_TICKET_PAGE_SIZE),
});

