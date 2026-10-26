import { z } from "zod";

import {
  Prisma,
  UserRole,
} from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { createPrismaClient } from "../src/server/database/prisma";
import {
  loadSourceData,
  type SourceAuthor,
  type SourceBook,
  toDatabaseDate,
} from "./source-data";
import { validateSeededData } from "./seed-validation";

const seedEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  SEED_AUTHOR_PASSWORD: z.string().min(12).max(1024),
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_PASSWORD: z.string().min(12).max(1024),
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function decimal(value: number) {
  return new Prisma.Decimal(value.toString());
}

function nullableDecimal(value: number | null) {
  return value === null ? null : decimal(value);
}

function authorValues(author: SourceAuthor) {
  return {
    name: author.name,
    email: author.email,
    phone: author.phone,
    city: author.city,
    joinedDate: toDatabaseDate(author.joined_date),
  };
}

function bookValues(authorId: string, book: SourceBook) {
  return {
    authorId,
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    publicationDate:
      book.publication_date === null
        ? null
        : toDatabaseDate(book.publication_date),
    status: book.status,
    mrp: nullableDecimal(book.mrp),
    authorRoyaltyPerCopy: nullableDecimal(book.author_royalty_per_copy),
    totalCopiesSold: book.total_copies_sold,
    totalRoyaltyEarned: decimal(book.total_royalty_earned),
    royaltyPaid: decimal(book.royalty_paid),
    royaltyPending: decimal(book.royalty_pending),
    lastRoyaltyPayoutDate:
      book.last_royalty_payout_date === null
        ? null
        : toDatabaseDate(book.last_royalty_payout_date),
    printPartner: book.print_partner,
    availableOn: book.available_on,
  };
}

async function main() {
  const environment = seedEnvironmentSchema.parse(process.env);
  const sourceData = await loadSourceData();
  const prisma = createPrismaClient(environment.DATABASE_URL);
  const normalizedAuthorEmails = sourceData.authors.map((author) =>
    normalizeEmail(author.email),
  );
  const normalizedAdminEmail = normalizeEmail(environment.SEED_ADMIN_EMAIL);

  try {
    const existingUsers = await prisma.user.findMany({
      where: {
        normalizedEmail: {
          in: [...normalizedAuthorEmails, normalizedAdminEmail],
        },
      },
      select: {
        normalizedEmail: true,
        accounts: {
          where: { providerId: "credential" },
          select: { id: true },
        },
      },
    });
    const emailsWithCredentials = new Set(
      existingUsers
        .filter((user) => user.accounts.length > 0)
        .map((user) => user.normalizedEmail),
    );
    const passwordHashes = new Map<string, string>();

    for (const normalizedEmail of normalizedAuthorEmails) {
      if (!emailsWithCredentials.has(normalizedEmail)) {
        passwordHashes.set(
          normalizedEmail,
          await hashPassword(environment.SEED_AUTHOR_PASSWORD),
        );
      }
    }

    if (!emailsWithCredentials.has(normalizedAdminEmail)) {
      passwordHashes.set(
        normalizedAdminEmail,
        await hashPassword(environment.SEED_ADMIN_PASSWORD),
      );
    }

    const summary = await prisma.$transaction(
      async (transaction) => {
        for (const author of sourceData.authors) {
          const normalizedEmail = normalizeEmail(author.email);
          let user = await transaction.user.findUnique({
            where: { normalizedEmail },
            include: { authorProfile: true },
          });

          if (user && user.role !== UserRole.AUTHOR) {
            throw new Error(
              `Cannot seed ${author.author_id}: its login email belongs to a non-author user.`,
            );
          }

          if (
            user?.authorProfile &&
            user.authorProfile.authorId !== author.author_id
          ) {
            throw new Error(
              `Cannot seed ${author.author_id}: its login is linked to another author profile.`,
            );
          }

          if (!user) {
            const passwordHash = passwordHashes.get(normalizedEmail);
            if (!passwordHash) {
              throw new Error(
                `No password hash prepared for new author ${author.author_id}.`,
              );
            }

            user = await transaction.user.create({
              data: {
                email: author.email,
                normalizedEmail,
                role: UserRole.AUTHOR,
              },
              include: { authorProfile: true },
            });
          }

          const credentialAccount = await transaction.authAccount.findUnique({
            where: {
              providerId_accountId: {
                providerId: "credential",
                accountId: user.id,
              },
            },
          });

          if (!credentialAccount) {
            const passwordHash = passwordHashes.get(normalizedEmail);
            if (!passwordHash) {
              throw new Error(
                `No password hash prepared for author ${author.author_id}.`,
              );
            }

            await transaction.authAccount.create({
              data: {
                accountId: user.id,
                providerId: "credential",
                userId: user.id,
                password: passwordHash,
              },
            });
          }

          const profileById = await transaction.authorProfile.findUnique({
            where: { authorId: author.author_id },
          });

          if (profileById && profileById.userId !== user.id) {
            throw new Error(
              `Cannot seed ${author.author_id}: the profile is linked to another login.`,
            );
          }

          await transaction.authorProfile.upsert({
            where: { authorId: author.author_id },
            create: {
              authorId: author.author_id,
              userId: user.id,
              ...authorValues(author),
            },
            update: authorValues(author),
          });

          for (const book of author.books) {
            const values = bookValues(author.author_id, book);

            await transaction.book.upsert({
              where: { bookId: book.book_id },
              create: {
                bookId: book.book_id,
                ...values,
              },
              update: values,
            });
          }
        }

        const existingAdmin = await transaction.user.findUnique({
          where: { normalizedEmail: normalizedAdminEmail },
        });

        if (existingAdmin && existingAdmin.role !== UserRole.ADMIN) {
          throw new Error(
            "SEED_ADMIN_EMAIL belongs to an existing non-admin user.",
          );
        }

        const admin = existingAdmin ??
          (await transaction.user.create({
            data: {
              email: environment.SEED_ADMIN_EMAIL.trim(),
              normalizedEmail: normalizedAdminEmail,
              role: UserRole.ADMIN,
            },
          }));

        const adminCredential = await transaction.authAccount.findUnique({
          where: {
            providerId_accountId: {
              providerId: "credential",
              accountId: admin.id,
            },
          },
        });

        if (!adminCredential) {
          const passwordHash = passwordHashes.get(normalizedAdminEmail);
          if (!passwordHash) {
            throw new Error("No password hash prepared for the admin.");
          }

          await transaction.authAccount.create({
            data: {
              accountId: admin.id,
              providerId: "credential",
              userId: admin.id,
              password: passwordHash,
            },
          });
        }

        return validateSeededData(transaction, sourceData);
      },
      {
        timeout: 60_000,
      },
    );

    console.log(
      JSON.stringify(
        {
          message: "BookLeaf core seed completed and validated.",
          ...summary,
          passwords: "created only for missing users; existing hashes preserved",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Unknown database seed error",
  );
  process.exitCode = 1;
});
