/** FR-21 truncation note copy, keyed by block kind. */
export const TRUNCATION_NOTES = {
  table: "Table truncated (showing first 50 rows / 12 columns)",
  list: "List truncated (showing first 200 items)",
  code: "Code truncated (showing first 20,000 characters)",
} as const;

interface Props {
  kind: keyof typeof TRUNCATION_NOTES;
}

/** Small muted note shown beneath a block whose payload was capped at import. */
export function TruncationNote({ kind }: Props) {
  return <p className="mt-2 text-xs italic text-gray-500 dark:text-gray-400">{TRUNCATION_NOTES[kind]}</p>;
}
