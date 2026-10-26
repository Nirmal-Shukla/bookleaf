import { BooksDashboard } from "@/components/books/books-dashboard";

export const metadata = { title: "My books" };

export default function AuthorBooksPage() {
  return (
    <section className="max-w-6xl">
      <p className="text-sm font-semibold text-leaf">My books</p>
      <h1 className="mt-3 max-w-4xl font-serif text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
        Publishing and royalty details, title by title.
      </h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted">
        Review the source details BookLeaf holds for every title, including
        books that are still moving through production.
      </p>
      <BooksDashboard />
    </section>
  );
}
