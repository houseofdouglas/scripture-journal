interface Props {
  /** Set of YYYY-MM-DD strings that have journal entries */
  markedDays: Set<string>;
  /** Currently selected filter date, or null */
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

/**
 * Mini calendar for the current month.
 * Days with entries are highlighted; clicking toggles the date filter.
 */
export function JournalCalendar({ markedDays, selectedDate, onSelectDate }: Props) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  const monthLabel = today.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Day of week for the 1st (0=Sunday)
  const startDow = new Date(year, month, 1).getDay();

  const cells: Array<number | null> = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function toDateString(day: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{monthLabel}</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="font-medium">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;

          const dateStr = toDateString(day);
          const isMarked = markedDays.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const isToday = day === today.getDate();

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              disabled={!isMarked}
              className={`rounded-full p-1 text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : isMarked
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : isToday
                  ? "ring-1 ring-gray-300 text-gray-700"
                  : "text-gray-500 disabled:cursor-default"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
