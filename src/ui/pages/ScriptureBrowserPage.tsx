import { Link, useParams, useNavigate } from "react-router-dom";
import { useManifest } from "../lib/queries/scripture";
import type { ManifestWork, ManifestBook } from "../../types";

export function ScriptureBrowserPage() {
  const { work: workSlug, book: bookSlug } = useParams<{
    work?: string;
    book?: string;
  }>();
  const { data: manifest, isLoading, isError } = useManifest();

  if (isLoading) return <LoadingSpinner />;
  if (isError || !manifest) return <div className="text-red-600 dark:text-red-400">Failed to load scripture library.</div>;

  if (!workSlug) {
    return <WorkSelection works={manifest.works} />;
  }

  const work = manifest.works.find((w) => w.slug === workSlug);
  if (!work) {
    return (
      <div>
        <p className="text-gray-600 dark:text-gray-400">Work not found.</p>
        <Link to="/scripture" className="text-blue-600 hover:underline dark:text-blue-400">← Browse Scripture</Link>
      </div>
    );
  }

  if (work.slug === "doctrine-and-covenants") {
    const dcBook = work.books[0]!;
    return (
      <div>
        <Breadcrumb items={[{ label: "Scripture", to: "/scripture" }, { label: work.title }]} />
        <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">{work.title}</h1>
        <ChapterGrid work={work} book={dcBook} />
      </div>
    );
  }

  if (!bookSlug) {
    return <BookSelection work={work} />;
  }

  const book = work.books.find((b) => b.slug === bookSlug);
  if (!book) {
    return (
      <div>
        <p className="text-gray-600 dark:text-gray-400">Book not found.</p>
        <Link to={`/scripture/${workSlug}`} className="text-blue-600 hover:underline dark:text-blue-400">← {work.title}</Link>
      </div>
    );
  }

  if (book.chapterCount === 1) {
    return <RedirectToChapter work={work} book={book} />;
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Scripture", to: "/scripture" },
          { label: work.title, to: `/scripture/${work.slug}` },
          { label: book.title },
        ]}
      />
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">{book.title}</h1>
      <ChapterGrid work={work} book={book} />
    </div>
  );
}

function WorkSelection({ works }: { works: ManifestWork[] }) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">Browse Scripture</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {works.map((work) => (
          <Link
            key={work.slug}
            to={`/scripture/${work.slug}`}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500"
          >
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">{work.title}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-gray-100">{work.title}</h1>

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

function BookGroup({ title, books, work }: { title: string; books: ManifestBook[]; work: ManifestWork }) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
        const to =
          book.chapterCount === 1
            ? `/scripture/${work.slug}/${book.slug}/1`
            : `/scripture/${work.slug}/${book.slug}`;

        return (
          <Link
            key={book.slug}
            to={to}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500"
          >
            <span className="font-medium text-gray-900 dark:text-gray-100">{book.title}</span>
            {book.chapterCount > 1 && (
              <span className="ml-2 text-gray-400 dark:text-gray-500">{book.chapterCount}</span>
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
          className="flex h-10 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
        >
          {n}
        </Link>
      ))}
    </div>
  );
}

function RedirectToChapter({ work, book }: { work: ManifestWork; book: ManifestBook }) {
  const navigate = useNavigate();
  navigate(`/scripture/${work.slug}/${book.slug}/1`, { replace: true });
  return null;
}

function Breadcrumb({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="mb-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-300 dark:text-gray-600">›</span>}
          {item.to ? (
            <Link to={item.to} className="hover:text-gray-900 hover:underline dark:hover:text-gray-100">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex h-32 items-center justify-center text-gray-400 dark:text-gray-500">
      Loading…
    </div>
  );
}
