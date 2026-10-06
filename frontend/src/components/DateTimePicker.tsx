import { useEffect, useMemo, useRef, useState } from "react";

type PickerMode = "date" | "datetime";

type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  mode?: PickerMode;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");
const datePart = (value: string) => value.slice(0, 10);

function parseDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${pad(hours % 12 || 12)}:${pad(minutes)} ${suffix}`;
}

function displayDate(value: string): string {
  const date = parseDate(value);
  return date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
}

export function DateTimePicker({
  value,
  onChange,
  mode = "date",
  className = "",
  required = false,
  disabled = false,
  placeholder = "Choose a date",
}: DateTimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => parseDate(value), [value]);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const currentTime = mode === "datetime" && value.includes("T") ? value.slice(11, 16) : "09:00";
  const [time, setTime] = useState(currentTime);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    // Prop changes must move the visible calendar to the selected date.
    // This is synchronization with the controlled value, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected) setMonth(selected);
    if (mode === "datetime" && value.includes("T")) setTime(value.slice(11, 16));
  }, [selected, value, mode]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  const years = Array.from({ length: 11 }, (_, index) => month.getFullYear() - 5 + index);
  const timeSlots = Array.from({ length: 96 }, (_, index) => `${pad(Math.floor(index / 4))}:${pad((index % 4) * 15)}`);

  const selectDate = (date: Date) => {
    const nextDate = formatDate(date);
    onChange(mode === "datetime" ? `${nextDate}T${time}` : nextDate);
    setMonth(date);
    if (mode === "date") setOpen(false);
  };

  const selectTime = (nextTime: string) => {
    setTime(nextTime);
    if (selected) onChange(`${formatDate(selected)}T${nextTime}`);
  };

  const displayValue = selected ? `${displayDate(value)}${mode === "datetime" ? ` · ${formatTime(time)}` : ""}` : "";

  return (
    <div className="relative" ref={rootRef}>
      <input
        type="text"
        readOnly
        required={required}
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        aria-label={placeholder}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setOpen(current => !current); }}
        className={`${className} cursor-pointer bg-white`}
      />
      {open && !disabled && (
        <div className="absolute z-[130] mt-2 w-[min(22rem,calc(100vw-2rem))] rounded border border-black/10 bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="rounded px-2 py-1 text-lg hover:bg-black/5" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <div className="flex min-w-0 gap-2">
              <select className="min-w-0 border border-black/10 px-2 py-1 text-sm font-semibold" value={month.getMonth()} onChange={event => setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))}>
                {Array.from({ length: 12 }, (_, index) => <option value={index} key={index}>{new Date(2000, index, 1).toLocaleDateString([], { month: "long" })}</option>)}
              </select>
              <select className="border border-black/10 px-2 py-1 text-sm font-semibold" value={month.getFullYear()} onChange={event => setMonth(new Date(Number(event.target.value), month.getMonth(), 1))}>
                {years.map(year => <option value={year} key={year}>{year}</option>)}
              </select>
            </div>
            <button type="button" className="rounded px-2 py-1 text-lg hover:bg-black/5" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="mt-3 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wider text-[#888]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="py-1">{day}</span>)}
            {days.map(day => {
              const active = datePart(value) === formatDate(day);
              const inMonth = day.getMonth() === month.getMonth();
              return <button type="button" key={formatDate(day)} onClick={() => selectDate(day)} className={`rounded py-2 text-sm ${active ? "bg-[#ff641f] font-bold text-white" : inMonth ? "hover:bg-orange-50" : "text-[#bbb]"}`}>{day.getDate()}</button>;
            })}
          </div>
          {mode === "datetime" && (
            <div className="mt-4 border-t border-black/10 pt-3">
              <p className="mb-2 text-xs font-semibold text-[#555]">Choose a time</p>
              <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto pr-1">
                {timeSlots.map(slot => <button type="button" key={slot} onClick={() => selectTime(slot)} className={`rounded border px-2 py-2 text-xs ${time === slot ? "border-[#ff641f] bg-orange-50 font-semibold text-[#d94d10]" : "border-black/10 hover:bg-black/5"}`}>{formatTime(slot)}</button>)}
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-black/10 pt-3">
            <button type="button" className="text-xs font-semibold text-[#ff641f]" onClick={() => { const today = new Date(); selectDate(today); }}>Today</button>
            {mode === "datetime" && <button type="button" className="text-xs text-[#777] hover:text-[#151515]" onClick={() => setOpen(false)}>Done</button>}
          </div>
        </div>
      )}
    </div>
  );
}
