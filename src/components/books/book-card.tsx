import type { ReactNode } from "react";

import type { AuthorBook } from "@/types/books";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatMoney(value: string | null) {
  return value === null ? "Not available" : currencyFormatter.format(Number(value));
}

function formatDate(value: string | null, fallback = "Not available") {
  return value === null
    ? fallback
    : dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-rule pt-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-6 text-ink-soft">
        {children}
      </dd>
    </div>
  );
}

function FinancialMetric({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="text-sm leading-5 text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-xl font-semibold tabular-nums text-ink sm:text-2xl">
        {formatMoney(value)}
      </dd>
    </div>
  );
}

function BookStatus({ status }: { status: string }) {
  const isPublished = status === "Published & Live";

  return (
    <span
      className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${
        isPublished
          ? "border-leaf/25 bg-leaf-pale text-leaf"
          : "border-rule bg-canvas text-ink-soft"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${isPublished ? "bg-leaf" : "bg-muted"}`}
      />
      {status}
    </span>
  );
}

export function BookCard({ book }: { book: AuthorBook }) {
  const publicationLabel =
    book.publicationDate === null && book.status !== "Published & Live"
      ? "Not published yet"
      : "Not available";

  return (
    <article className="grid gap-8 border-t border-rule py-8 first:border-t-0 sm:py-10 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.6fr)] xl:gap-12">
      <header>
        <p className="text-sm font-semibold text-leaf">{book.bookId}</p>
        <h2 className="mt-2 max-w-xl font-serif text-3xl font-semibold leading-tight tracking-[-0.025em] text-ink">
          {book.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">{book.genre}</p>
        <div className="mt-5">
          <BookStatus status={book.status} />
        </div>

        <dl className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Detail label="ISBN">{book.isbn}</Detail>
          <Detail label="Publication date">
            {formatDate(book.publicationDate, publicationLabel)}
          </Detail>
          <Detail label="Print partner">
            {book.printPartner ?? "Not available"}
          </Detail>
          <Detail label="Last royalty payout">
            {formatDate(book.lastRoyaltyPayoutDate, "No payout date supplied")}
          </Detail>
        </dl>
      </header>

      <div className="min-w-0">
        <section aria-labelledby={`${book.bookId}-royalties`}>
          <div className="flex items-end justify-between gap-4 border-b border-rule pb-3">
            <h3
              id={`${book.bookId}-royalties`}
              className="font-serif text-xl font-semibold text-ink"
            >
              Sales and royalties
            </h3>
            <p className="text-xs font-semibold text-muted">INR</p>
          </div>

          <dl className="grid gap-x-6 gap-y-6 bg-canvas px-4 py-5 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
            <FinancialMetric label="MRP" value={book.mrp} />
            <div>
              <dt className="text-sm leading-5 text-muted">Copies sold</dt>
              <dd className="mt-1 font-serif text-xl font-semibold tabular-nums text-ink sm:text-2xl">
                {book.totalCopiesSold.toLocaleString("en-IN")}
              </dd>
            </div>
            <FinancialMetric
              label="Royalty per copy"
              value={book.authorRoyaltyPerCopy}
            />
            <FinancialMetric
              label="Total royalty earned"
              value={book.totalRoyaltyEarned}
            />
            <FinancialMetric label="Royalty paid" value={book.royaltyPaid} />
            <FinancialMetric
              label="Royalty pending"
              value={book.royaltyPending}
            />
          </dl>
        </section>

        <section className="mt-7" aria-labelledby={`${book.bookId}-availability`}>
          <h3
            id={`${book.bookId}-availability`}
            className="text-sm font-semibold text-ink-soft"
          >
            Available platforms
          </h3>
          {book.availableOn.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-muted">
              No platforms are listed yet.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Available on">
              {book.availableOn.map((platform) => (
                <li
                  key={platform}
                  className="rounded-md border border-rule bg-surface px-3 py-2 text-sm font-medium text-ink-soft"
                >
                  {platform}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
