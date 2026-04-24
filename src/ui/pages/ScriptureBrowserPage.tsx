import { Link, useParams, useNavigate } from "react-router-dom";
import { useManifest } from "../lib/queries/scripture";
import type { ManifestWork, ManifestBook } from "../../types";

/** Entry point — renders the correct level based on URL params. */
export function ScriptureBrowserPage() {
  const { work: workSlug, book: bookSlug } = useParams<{
    work?: string;
    book?: string;
  }>();
  const { data: manifest, isLoading, isError } = useManifest();

  if (isLoading) return <LoadingSpinner />;
  if (isError || !manifest) return <div className="text-red-600">Failed to load scripture library.</div>;

  // Level 1: work selection
  if (!workSlug) {
    return <WorkSelection works={manifest.works} />;
  }

  const work = manifest.works.find((w) => w.slug === workSlug);
  if (!work) {
    return (
      <div>
        <p className="text-gray-600">Work not found.</p>
        <Link to="/scripture" className="text-blue-600 hover:underline">
          ← Browse Scripture
        </Link>
      </div>
    );
  }

  // D&C: skip book level — go straight to section grid
  if (work.slug === "doctrine-and-covenants") {
    const dcBook = work.books[0]!;
    return (
      <div>
        <Breadcrumb items={[{ label: "Scripture", to: "/scripture" }, { label: work.title }]} />
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">{work.title}</h1>
        <ChapterGrid work={work} book={dcBook} />
      </div>
    );
  }

  // Level 2: book selection
  if (!bookSlug) {
    return <BookSelection work={work} />;
  }

  const book = work.books.find((b) => b.slug === bookSlug);
  if (!book) {
    return (
      <div>
        <p className="text-gray-600">Book not found.</p>
        <Link to={`/scripture/${workSlug}`} className="text-blue-600 hover:underline">
          ← {work.title}
        </Link>
      </div>
    );
  }

  // Single-chapter books: navigate directly
  if (book.chapterCount === 1) {
    return <RedirectToChapter work={work} book={book} />;
  }

  // Level 3: chapter grid
  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Scripture", to: "/scripture" },
          { label: work.title, to: `/scripture/${work.slug}` },
          { label: book.title },
        ]}
      />
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">{book.title}</h1>
      <ChapterGrid work={work} book={book} />
    </div>
  );
}

// ── Level components ──────────────────────────────────────────────────────────

function WorkSelection({ works }: { works: ManifestWork[] }) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Browse Scripture</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {works.map((work) => (
          <Link
            key={work.slug}
            to={`/scripture/${work.slug}`}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow"
          >
            <h2 className="text-lg font-medium text-gray-900">{work.title}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {work.books.reduce((s, b) => s + b.chapterCount, 0)} chapters
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function BookSelection({ work }: { work: ManifestWork }) {
  const hasBibleGroups = work.books.some((b) => b.group);

  const otBooks = work.books.filter((b) => b.group === "old-testament");
  const ntBooks = work.books.filter((b) => b.group === "new-testament");
  const ungrouped = work.books.filter((b) => !b.group);

  return (
    <div>
      <Breadcrumb items={[{ label: "Scripture", to: "/scripture" }, { label: work.title }]} />
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">{work.title}</h1>

      {hasBibleGroups ? (
        <>
          <BookGroup title="Old Testament" books={otBooks} work={work} />
          <BookGroup title="New Testament" books={ntBooks} work={work} />
        </>
      ) : (
        <BookList books={ungrouped} work={work} />
      )}
    </div>
  );
}

function BookGroup({
  title,
  books,
  work,
}: {
  title: string;
  books: ManifestBook[];
  work: ManifestWork;
}) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <BookList books={books} work={work} />
    </div>
  );
}

function BookList({ books, work }: { books: ManifestBook[]; work: ManifestWork }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {books.map((book) => {
        // Single-chapter books link straight to chapter 1
        const to =
          book.chapterCount === 1
            ? `/scripture/${work.slug}/${book.slug}/1`
            : `/scripture/${work.slug}/${book.slug}`;

        return (
          <Link
            key={book.slug}
            to={to}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm hover:border-blue-400"
          >
            <span className="font-medium text-gray-900">{book.title}</span>
            {book.chapterCount > 1 && (
              <span className="ml-2 text-gray-400">{book.chapterCount}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function ChapterGrid({ work, book }: { work: ManifestWork; book: ManifestBook }) {
  const numbers = Array.from({ length: book.chapterCount }, (_, i) => i + 1);
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
      {numbers.map((n) => (
        <Link
          key={n}
          to={`/scripture/${work.slug}/${book.slug}/${n}`}
          className="flex h-10 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600"
        >
          {n}
        </Link>
      ))}
    </div>
  );
}

function RedirectToChapter({ work, book }: { work: ManifestWork; book: ManifestBook }) {
  const navigate = useNavigate();
  // Immediate redirect for single-chapter books
  navigate(`/scripture/${work.slug}/${book.slug}/1`, { replace: true });
  return null;
}

// ── Shared components ─────────────────────────────────────────────────────────

function Breadcrumb({
  items,
}: {
  items: Array<{ label: string; to?: string }>;
}) {
  return (
    <nav className="mb-4 flex items-center gap-1 text-sm text-gray-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-300">›</span>}
          {item.to ? (
            <Link to={item.to} className="hover:text-gray-900 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex h-32 items-center justify-center text-gray-400">
      Loading…
    </div>
  );
}
