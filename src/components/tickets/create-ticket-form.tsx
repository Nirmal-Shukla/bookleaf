"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import type { ApiErrorBody, ApiSuccessBody } from "@/server/http/api-response";
import type { AuthorBooksData } from "@/types/books";
import type { AuthorTicketData } from "@/types/tickets";

type FieldErrors = Partial<Record<"bookId" | "subject" | "description", string[]>>;

type BooksState =
  | { status: "loading" }
  | { status: "success"; books: AuthorBooksData["books"] }
  | { status: "error" };

function fieldErrorId(field: keyof FieldErrors) {
  return `${field}-error`;
}

export function CreateTicketForm() {
  const router = useRouter();
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [booksState, setBooksState] = useState<BooksState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    const controller = new AbortController();
    async function loadBooks() {
      try {
        const response = await fetch("/api/author/books", {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Books could not be loaded.");
        const body = (await response.json()) as ApiSuccessBody<AuthorBooksData>;
        setBooksState({ status: "success", books: body.data.books });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setBooksState({ status: "error" });
        }
      }
    }
    void loadBooks();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (formError || Object.keys(fieldErrors).length > 0) {
      errorSummaryRef.current?.focus();
    }
  }, [fieldErrors, formError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const form = event.currentTarget;
    const formData = new FormData(form);
    const selectedBook = String(formData.get("bookId") ?? "");
    idempotencyKeyRef.current ??= crypto.randomUUID();

    try {
      const response = await fetch("/api/author/tickets", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          bookId: selectedBook === "" ? null : selectedBook,
          subject: String(formData.get("subject") ?? ""),
          description: String(formData.get("description") ?? ""),
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as ApiErrorBody;
        const details = body.error.details;
        if (details && typeof details === "object") {
          setFieldErrors(details as FieldErrors);
        }
        if (response.status === 404) {
          setFieldErrors({ bookId: ["Choose a book currently linked to your account."] });
        }
        setFormError(
          response.status === 401
            ? "Your session has expired. Sign in again before creating this ticket."
            : body.error.message,
        );
        return;
      }

      const body = (await response.json()) as ApiSuccessBody<AuthorTicketData>;
      idempotencyKeyRef.current = null;
      router.push(`/author/tickets/${body.data.ticket.id}?created=1`);
    } catch {
      setFormError("The ticket could not be created. Check your connection and try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const hasErrors = formError || Object.keys(fieldErrors).length > 0;

  return (
    <form className="mt-9 max-w-3xl" onSubmit={handleSubmit} aria-busy={submitting}>
      {hasErrors ? (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          className="mb-7 border-l-4 border-ink bg-surface px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-leaf"
        >
          <h2 className="font-semibold text-ink">Check the ticket details</h2>
          {formError ? <p className="mt-1 text-sm leading-6 text-muted">{formError}</p> : null}
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            {Object.entries(fieldErrors).flatMap(([field, messages]) =>
              (messages ?? []).map((message) => (
                <li key={`${field}-${message}`}>
                  <a className="underline underline-offset-2" href={`#${field}`}>{message}</a>
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}

      <div className="space-y-7 border-y border-rule bg-surface px-5 py-7 sm:px-8 sm:py-9">
        <div>
          <label className="block text-sm font-semibold text-ink" htmlFor="bookId">
            Book
          </label>
          <p className="mt-1 text-sm leading-6 text-muted" id="book-help">
            Choose a title or use General / Account Level for questions not tied to one book.
          </p>
          <select
            id="bookId"
            name="bookId"
            disabled={booksState.status !== "success" || submitting}
            aria-describedby={`book-help${fieldErrors.bookId ? ` ${fieldErrorId("bookId")}` : ""}`}
            aria-invalid={Boolean(fieldErrors.bookId)}
            className="mt-3 min-h-12 w-full rounded-lg border border-rule bg-white px-3 text-base text-ink outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted"
          >
            <option value="">General / Account Level</option>
            {booksState.status === "success"
              ? booksState.books.map((book) => (
                  <option key={book.bookId} value={book.bookId}>
                    {book.bookId} — {book.title}
                  </option>
                ))
              : null}
          </select>
          {booksState.status === "loading" ? <p className="mt-2 text-sm text-muted">Loading your books…</p> : null}
          {booksState.status === "error" ? <p className="mt-2 text-sm text-ink-soft" role="alert">Your books could not be loaded. Refresh the page before creating a book-specific ticket.</p> : null}
          {fieldErrors.bookId ? <p className="mt-2 text-sm text-ink-soft" id={fieldErrorId("bookId")}>{fieldErrors.bookId[0]}</p> : null}
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink" htmlFor="subject">
            Subject <span aria-hidden="true">*</span>
          </label>
          <input
            id="subject"
            name="subject"
            required
            minLength={3}
            maxLength={160}
            disabled={submitting}
            aria-describedby={`subject-help${fieldErrors.subject ? ` ${fieldErrorId("subject")}` : ""}`}
            aria-invalid={Boolean(fieldErrors.subject)}
            className="mt-3 min-h-12 w-full rounded-lg border border-rule bg-white px-3 text-base text-ink outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20 disabled:cursor-not-allowed disabled:bg-canvas"
          />
          <p className="mt-2 text-sm text-muted" id="subject-help">3–160 characters.</p>
          {fieldErrors.subject ? <p className="mt-2 text-sm text-ink-soft" id={fieldErrorId("subject")}>{fieldErrors.subject[0]}</p> : null}
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink" htmlFor="description">
            Description <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="description"
            name="description"
            required
            minLength={10}
            maxLength={5000}
            rows={8}
            disabled={submitting}
            aria-describedby={`description-help${fieldErrors.description ? ` ${fieldErrorId("description")}` : ""}`}
            aria-invalid={Boolean(fieldErrors.description)}
            className="mt-3 w-full resize-y rounded-lg border border-rule bg-white px-3 py-3 text-base leading-7 text-ink outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20 disabled:cursor-not-allowed disabled:bg-canvas"
          />
          <p className="mt-2 text-sm text-muted" id="description-help">Include the details BookLeaf support will need. 10–5,000 characters.</p>
          {fieldErrors.description ? <p className="mt-2 text-sm text-ink-soft" id={fieldErrorId("description")}>{fieldErrors.description[0]}</p> : null}
        </div>

        <fieldset className="rounded-lg border border-dashed border-rule bg-canvas px-4 py-4">
          <legend className="px-1 text-sm font-semibold text-ink">Attachment (optional)</legend>
          <input className="mt-2 block w-full text-sm text-muted" type="file" disabled aria-describedby="attachment-help" />
          <p className="mt-2 text-sm leading-6 text-muted" id="attachment-help">
            Attachments are unavailable in this version. No file can be uploaded or saved.
          </p>
        </fieldset>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-ink-soft" href="/author/tickets">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting || booksState.status === "loading"}
          className="min-h-11 cursor-pointer rounded-lg bg-leaf px-6 text-sm font-semibold text-white outline-none hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creating ticket…" : "Create ticket"}
        </button>
      </div>
    </form>
  );
}

