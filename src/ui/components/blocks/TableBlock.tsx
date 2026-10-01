import type { TablePayload } from "../../../types";
import { TruncationNote } from "./TruncationNote";

interface Props {
  table: TablePayload;
}

const CELL = "border border-gray-200 px-3 py-2 align-top dark:border-gray-700";

/**
 * Renders a table block (FR-20) inside a bordered container that scrolls horizontally,
 * so wide tables never widen the page. Cells are plain text.
 */
export function TableBlock({ table }: Props) {
  return (
    <div>
      <div data-testid="table-scroll" className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
        <table className="min-w-full border-collapse text-left text-sm">
          {table.headers.length > 0 && (
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i} scope="col" className={`${CELL} font-semibold`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={CELL}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.truncated === true && <TruncationNote kind="table" />}
    </div>
  );
}
