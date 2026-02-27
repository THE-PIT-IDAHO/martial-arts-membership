"use client";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(month: number, year: number): number {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

interface DateOfBirthPickerProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
  required?: boolean;
}

export function DateOfBirthPicker({ value, onChange, required }: DateOfBirthPickerProps) {
  const parts = value ? value.split("-") : ["", "", ""];
  const year = parts[0] || "";
  const month = parts[1] ? String(parseInt(parts[1], 10)) : "";
  const day = parts[2] ? String(parseInt(parts[2], 10)) : "";

  const currentYear = new Date().getFullYear();
  const daysInMonth = getDaysInMonth(month ? parseInt(month, 10) : 0, year ? parseInt(year, 10) : currentYear);

  function update(newMonth: string, newDay: string, newYear: string) {
    if (newMonth && newDay && newYear) {
      const m = newMonth.padStart(2, "0");
      const d = newDay.padStart(2, "0");
      onChange(`${newYear}-${m}-${d}`);
    } else if (!newMonth && !newDay && !newYear) {
      onChange("");
    } else {
      // Partial — store what we have so far so the user can complete it
      const m = newMonth ? newMonth.padStart(2, "0") : "01";
      const d = newDay ? newDay.padStart(2, "0") : "01";
      const y = newYear || String(currentYear);
      onChange(`${y}-${m}-${d}`);
    }
  }

  const selectClass =
    "rounded-md border border-gray-300 px-2 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white";

  return (
    <div className="flex gap-2">
      <select
        value={month}
        onChange={(e) => update(e.target.value, day, year)}
        required={required}
        className={`${selectClass} flex-[3]`}
        aria-label="Month"
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={i + 1} value={String(i + 1)}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={day}
        onChange={(e) => update(month, e.target.value, year)}
        required={required}
        className={`${selectClass} flex-[1.5]`}
        aria-label="Day"
      >
        <option value="">Day</option>
        {Array.from({ length: daysInMonth }, (_, i) => (
          <option key={i + 1} value={String(i + 1)}>
            {i + 1}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => update(month, day, e.target.value)}
        required={required}
        className={`${selectClass} flex-[2]`}
        aria-label="Year"
      >
        <option value="">Year</option>
        {Array.from({ length: currentYear - 1929 }, (_, i) => {
          const y = currentYear - i;
          return (
            <option key={y} value={String(y)}>
              {y}
            </option>
          );
        })}
      </select>
    </div>
  );
}
