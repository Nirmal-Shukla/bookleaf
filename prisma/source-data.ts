import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Expected a valid YYYY-MM-DD calendar date");

const moneySchema = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (value) => Number.isInteger(value * 100),
    "Money values may contain at most two decimal places",
  );

const bookSchema = z
  .object({
    book_id: z.string().min(1),
    title: z.string().min(1),
    isbn: z.string().min(1),
    genre: z.string().min(1),
    publication_date: dateOnlySchema.nullable(),
    status: z.string().min(1),
    mrp: moneySchema.nullable(),
    author_royalty_per_copy: moneySchema.nullable(),
    total_copies_sold: z.number().int().nonnegative(),
    total_royalty_earned: moneySchema,
    royalty_paid: moneySchema,
    royalty_pending: moneySchema,
    last_royalty_payout_date: dateOnlySchema.nullable(),
    print_partner: z.string().min(1).nullable(),
    available_on: z.array(z.string().min(1)),
  })
  .strict();

const authorSchema = z
  .object({
    author_id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    city: z.string().min(1),
    joined_date: dateOnlySchema,
    books: z.array(bookSchema),
  })
  .strict();

const sourceDataSchema = z
  .object({
    authors: z.array(authorSchema),
  })
  .strict()
  .superRefine((data, context) => {
    const authorIds = data.authors.map((author) => author.author_id);
    const authorEmails = data.authors.map((author) =>
      author.email.toLowerCase(),
    );
    const books = data.authors.flatMap((author) => author.books);
    const bookIds = books.map((book) => book.book_id);

    const checks: Array<[string, unknown[], number]> = [
      ["author IDs", authorIds, authorIds.length],
      ["author emails", authorEmails, authorEmails.length],
      ["book IDs", bookIds, bookIds.length],
    ];

    for (const [label, values, expected] of checks) {
      if (new Set(values).size !== expected) {
        context.addIssue({
          code: "custom",
          message: `Source data contains duplicate ${label}`,
        });
      }
    }

    if (data.authors.length !== 10) {
      context.addIssue({
        code: "custom",
        message: `Expected exactly 10 authors, found ${data.authors.length}`,
      });
    }

    if (books.length !== 18) {
      context.addIssue({
        code: "custom",
        message: `Expected exactly 18 books, found ${books.length}`,
      });
    }
  });

export type SourceData = z.infer<typeof sourceDataSchema>;
export type SourceAuthor = SourceData["authors"][number];
export type SourceBook = SourceAuthor["books"][number];

const defaultSourcePath = path.join(
  process.cwd(),
  "prisma",
  "data",
  "bookleaf_sample_data.json",
);

export async function loadSourceData(): Promise<SourceData> {
  const sourcePath = process.env.BOOKLEAF_SEED_DATA_PATH ?? defaultSourcePath;
  const fileContents = await readFile(sourcePath, "utf8");

  return sourceDataSchema.parse(JSON.parse(fileContents));
}

export function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
