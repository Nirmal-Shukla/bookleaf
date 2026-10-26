import { BooksLoadingState } from "@/components/books/books-dashboard-states";

export default function LoadingAuthorBooks() {
  return (
    <section className="max-w-6xl">
      <div className="h-4 w-20 animate-pulse rounded bg-rule" />
      <div className="mt-4 h-12 max-w-3xl animate-pulse rounded bg-rule" />
      <div className="mt-5 h-6 max-w-2xl animate-pulse rounded bg-rule" />
      <BooksLoadingState />
    </section>
  );
}
