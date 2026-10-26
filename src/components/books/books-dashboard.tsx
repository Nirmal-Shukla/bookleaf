"use client";

import { useEffect, useState } from "react";

import type { ApiSuccessBody } from "@/server/http/api-response";
import type { AuthorBooksData } from "@/types/books";

import { BookCard } from "./book-card";
import { BooksEmptyState, BooksLoadingState } from "./books-dashboard-states";

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: AuthorBooksData }
  | { status: "error"; sessionExpired: boolean };

function isAuthorBooksData(value: unknown): value is AuthorBooksData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuthorBooksData>;
  return (
    candidate.currency === "INR" &&
    typeof candidate.currencyBasis === "string" &&
    Array.isArray(candidate.books)
  );
}

export function BooksDashboard() {
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadBooks() {
      setState({ status: "loading" });

      try {
        const response = await fetch("/api/author/books", {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          setState({
            status: "error",
            sessionExpired: response.status === 401,
          });
          return;
        }

        const body = (await response.json()) as ApiSuccessBody<unknown>;

        if (!isAuthorBooksData(body.data)) {
          throw new Error("The books response was not in the expected format.");
        }

        setState({ status: "success", data: body.data });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState({ status: "error", sessionExpired: false });
        }
      }
    }

    void loadBooks();
    return () => controller.abort();
  }, [requestVersion]);

  if (state.status === "loading") {
    return <BooksLoadingState />;
  }

  if (state.status === "error") {
    return (
      <div
        className="mt-10 border-y border-rule bg-surface px-5 py-10 sm:px-8"
        role="alert"
      >
        <h2 className="font-serif text-2xl font-semibold text-ink">
          {state.sessionExpired
            ? "Your session has expired."
            : "Your books could not be loaded."}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          {state.sessionExpired
            ? "Sign in again to return to your private author workspace."
            : "Check your connection and try again. Your book records have not been changed."}
        </p>
        {state.sessionExpired ? (
          <a
            href="/login"
            className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-leaf px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
          >
            Sign in again
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setRequestVersion((version) => version + 1)}
            className="mt-6 min-h-11 cursor-pointer rounded-lg bg-leaf px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (state.data.books.length === 0) {
    return <BooksEmptyState />;
  }

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-3 border-b border-rule pb-5 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
          {state.data.books.length.toLocaleString("en-IN")} {state.data.books.length === 1 ? "book" : "books"}
        </p>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          Amounts are shown in INR. The supplied dataset does not include a
          currency field.
        </p>
      </div>
      <div className="bg-surface px-5 sm:px-7 lg:px-8">
        {state.data.books.map((book) => (
          <BookCard key={book.bookId} book={book} />
        ))}
      </div>
    </div>
  );
}
