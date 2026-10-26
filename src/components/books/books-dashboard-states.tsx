export function BooksLoadingState() {
  return (
    <div aria-busy="true" aria-label="Loading books" className="mt-10">
      <p className="sr-only">Loading your books…</p>
      <div className="animate-pulse border-y border-rule bg-surface px-5 sm:px-7">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="grid gap-8 border-t border-rule py-8 first:border-t-0 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.6fr)] xl:gap-12"
          >
            <div>
              <div className="h-4 w-16 rounded bg-rule" />
              <div className="mt-4 h-8 max-w-sm rounded bg-rule" />
              <div className="mt-3 h-4 w-32 rounded bg-rule" />
              <div className="mt-6 h-8 w-44 rounded-full bg-rule" />
            </div>
            <div>
              <div className="h-6 w-44 rounded bg-rule" />
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((metric) => (
                  <div key={metric} className="h-20 rounded bg-canvas" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BooksEmptyState() {
  return (
    <div className="mt-10 border-y border-rule bg-surface px-5 py-12 text-center sm:px-8">
      <h2 className="font-serif text-2xl font-semibold text-ink">
        No books are linked to this account.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
        When BookLeaf adds a title to your author profile, its production and
        royalty details will appear here.
      </p>
    </div>
  );
}
