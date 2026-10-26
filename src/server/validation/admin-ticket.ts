import { z } from "zod";

import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/generated/prisma/client";

export const ADMIN_TICKET_PAGE_SIZE = 20;
export const MAX_ADMIN_TICKET_PAGE_SIZE = 100;
export const TICKET_MESSAGE_MAX_LENGTH = 5_000;

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
  }, "Enter a real calendar date in YYYY-MM-DD format.");

export const adminTicketFiltersSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_ADMIN_TICKET_PAGE_SIZE)
      .default(ADMIN_TICKET_PAGE_SIZE),
    status: z.enum(TicketStatus).optional(),
    category: z.union([z.enum(TicketCategory), z.literal("UNCLASSIFIED")]).optional(),
    priority: z.union([z.enum(TicketPriority), z.literal("UNCLASSIFIED")]).optional(),
    createdFrom: dateOnlySchema.optional(),
    createdTo: dateOnlySchema.optional(),
  })
  .refine(
    (value) =>
      !value.createdFrom ||
      !value.createdTo ||
      value.createdFrom <= value.createdTo,
    {
      path: ["createdTo"],
      message: "The end date must be on or after the start date.",
    },
  );

export const adminTicketUpdateSchema = z
  .object({
    category: z.enum(TicketCategory).nullable().optional(),
    priority: z.enum(TicketPriority).nullable().optional(),
    status: z.enum(TicketStatus).optional(),
    assignToSelf: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one ticket change.",
  });

export const createInternalNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(TICKET_MESSAGE_MAX_LENGTH),
  })
  .strict();

export const createPublicResponseSchema = z
  .object({
    body: z.string().trim().min(1).max(TICKET_MESSAGE_MAX_LENGTH),
    idempotencyKey: z.uuid(),
    aiDraftId: z.uuid().optional(),
  })
  .strict();

export const generateResponseDraftSchema = z
  .object({ mode: z.enum(["initial", "regenerate"]) })
  .strict();

export const editResponseDraftSchema = z
  .object({
    body: z.string().trim().min(1).max(TICKET_MESSAGE_MAX_LENGTH),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const draftIdParamSchema = z.uuid();

