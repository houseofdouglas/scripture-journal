interface Props {
  text: string;
  createdAt: string;
}

/**
 * Display a single persisted annotation below its block.
 * Rendered in sans-serif per the spec (FR-45).
 */
export function SavedAnnotationDisplay({ text, createdAt }: Props) {
  const time = new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mt-2 border-l-2 border-blue-300 pl-3 font-sans dark:border-blue-600">
      <p className="text-sm text-gray-800 dark:text-gray-200">{text}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{time}</p>
    </div>
  );
}
