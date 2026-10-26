"use client";

export default function AuthorBooksError({ reset }: { reset: () => void }) {
  return (
    <section className="max-w-3xl" role="alert">
      <p className="text-sm font-semibold text-leaf">My books</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
        This page could not be opened.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
        Try loading the page again. Your book records have not been changed.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-7 min-h-11 cursor-pointer rounded-lg bg-leaf px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </section>
  );
}
