import Link from "next/link";

export const metadata = { title: "Author workspace" };

export default function AuthorHomePage() {
  return (
    <section className="max-w-3xl">
      <p className="text-sm font-semibold text-leaf">Author workspace</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
        Your publishing workspace.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
        Review the publishing status, availability, sales, and supplied royalty
        totals for every book linked to your account.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/author/books"
          className="inline-flex min-h-11 items-center rounded-lg bg-leaf px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
        >
          View my books
        </Link>
        <Link
          href="/author/tickets"
          className="inline-flex min-h-11 items-center rounded-lg border border-rule bg-surface px-5 text-sm font-semibold text-ink-soft outline-none transition-colors hover:border-leaf hover:text-leaf focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
        >
          View my tickets
        </Link>
      </div>
    </section>
  );
}
