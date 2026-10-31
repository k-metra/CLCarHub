import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PickerMode = "date" | "datetime";
export type BookedDateRange = { pickup_at: string; return_at: string };
export type DateRangeTimeValue = {
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
};

type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  mode?: PickerMode;
  minDate?: string;
  bookedDates?: BookedDateRange[];
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

function isValidTime(value: string): boolean {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match !== null;
}

function displayDate(value: string): string {
  const date = parseDate(value);
  return date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
}

const commonTimePresets = ["06:00", "07:00", "08:00", "09:00", "09:30", "09:45", "09:50", "09:55", "10:00", "10:30", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
const formatDuration = (minutes: number) => {
  const units = [
    { value: Math.floor(minutes / (30 * 1440)), label: "month" },
    { value: Math.floor(minutes % (30 * 1440) / 1440), label: "day" },
    { value: Math.floor(minutes % 1440 / 60), label: "hour" },
    { value: minutes % 60, label: "minute" },
  ];
  return units.filter(unit => unit.value > 0).map(unit => `${unit.value} ${unit.label}${unit.value === 1 ? "" : "s"}`).join(" ");
};

function CalendarMonth({ month, onChangeMonth, value, minDate, bookedDates, onSelectDate }: {
  month: Date;
  onChangeMonth?: (month: Date) => void;
  value: string;
  minDate?: string;
  bookedDates: BookedDateRange[];
  onSelectDate: (date: Date) => void;
}) {
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
  const minimumDateValue = minDate ? datePart(minDate) : null;
  const monthValue = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
  const minimumMonthValue = minimumDateValue?.slice(0, 7);
  return <section>
    <div className="flex items-center justify-between gap-2">
      <button type="button" disabled={!onChangeMonth || Boolean(minimumMonthValue && monthValue <= minimumMonthValue)} className="calendar-nav flex h-10 w-10 shrink-0 items-center justify-center rounded text-lg hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Previous month" onClick={() => onChangeMonth?.(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
      <strong className="text-sm">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</strong>
      <button type="button" disabled={!onChangeMonth} className="calendar-nav flex h-10 w-10 shrink-0 items-center justify-center rounded text-lg hover:bg-black/5 disabled:opacity-30" aria-label="Next month" onClick={() => onChangeMonth?.(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
    </div>
    <div className="mt-3 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wider text-[#888]">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="py-1">{day}</span>)}
      {days.map(day => {
        const dayValue = formatDate(day);
        const active = datePart(value) === dayValue;
        const inMonth = day.getMonth() === month.getMonth();
        const beforeMinimum = Boolean(minimumDateValue && dayValue < minimumDateValue);
        const booked = bookedDates.some(range => dayValue >= datePart(range.pickup_at) && dayValue <= datePart(range.return_at));
        const unavailable = beforeMinimum || booked;
        return <button type="button" disabled={unavailable} title={booked ? `Booked for ${displayDate(dayValue)}` : undefined} aria-label={`${displayDate(dayValue)}${booked ? " — booked" : ""}`} key={dayValue} onClick={() => onSelectDate(day)} className={`calendar-day min-h-10 rounded py-1 text-sm ${booked ? "cursor-not-allowed font-semibold text-red-700" : beforeMinimum ? "cursor-not-allowed text-[#ddd]" : active ? "bg-[#ff641f] font-bold text-white" : inMonth ? "hover:bg-orange-50" : "text-[#bbb]"}`}>
          <span className="flex flex-col items-center justify-center gap-0.5"><span>{day.getDate()}</span>{booked && <span className="-rotate-6 rounded-sm border border-red-500 px-0.5 text-[7px] font-black leading-3 tracking-tight">BOOKED</span>}</span>
        </button>;
      })}
    </div>
  </section>;
}

function RangeCalendar({ month, onChangeMonth, pickupDate, returnDate, minDate, bookedDates, onSelectDate }: {
  month: Date;
  onChangeMonth: (month: Date) => void;
  pickupDate: string;
  returnDate: string;
  minDate?: string;
  bookedDates: BookedDateRange[];
  onSelectDate: (date: Date) => void;
}) {
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
  const minimumDateValue = minDate ? datePart(minDate) : null;
  const monthValue = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
  const minimumMonthValue = minimumDateValue?.slice(0, 7);
  return <section>
    <div className="flex items-center justify-between gap-2">
      <button type="button" disabled={Boolean(minimumMonthValue && monthValue <= minimumMonthValue)} className="flex h-9 w-9 items-center justify-center text-xl text-[#777] hover:bg-[#2a211d] disabled:opacity-30" onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
      <strong className="text-sm">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</strong>
      <button type="button" className="flex h-9 w-9 items-center justify-center text-xl text-[#777] hover:bg-[#2a211d]" onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
    </div>
    <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wider text-[#777]">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span className="py-2" key={day}>{day}</span>)}</div>
    <div className="grid grid-cols-7 gap-y-1 text-center">
      {days.map(day => {
        const value = formatDate(day);
        const beforeMinimum = Boolean(minimumDateValue && value < minimumDateValue);
        const booked = bookedDates.some(range => value >= datePart(range.pickup_at) && value <= datePart(range.return_at));
        const disabled = beforeMinimum || booked;
        const pickup = value === pickupDate;
        const returned = value === returnDate;
        const inRange = pickupDate && returnDate && value > pickupDate && value < returnDate;
        return <button type="button" key={value} disabled={disabled} title={booked ? `Booked for ${displayDate(value)}` : undefined} onClick={() => onSelectDate(day)} className={`relative mx-auto flex min-h-9 w-9 items-center justify-center rounded-full text-sm ${disabled ? "cursor-not-allowed text-[#555]" : pickup || returned ? "bg-[#ff641f] font-bold text-white" : inRange ? "rounded-none bg-[#3a2419] text-[#ffb18e]" : day.getMonth() === month.getMonth() ? "text-[#f4f3f0] hover:bg-[#2a211d]" : "text-[#666]"}`} aria-label={`${displayDate(value)}${booked ? " — booked" : ""}`}><span className="flex flex-col items-center justify-center gap-0.5"><span>{day.getDate()}</span>{booked && <span className="rounded-sm border border-red-400 px-0.5 text-[6px] font-black leading-3 tracking-tight text-red-400">BOOKED</span>}</span></button>;
      })}
    </div>
  </section>;
}

export function DateRangeTimePicker({ value, onChange, minDate, bookedDates = [], className = "", disabled = false, placeholder = "Choose dates", openRequest = 0 }: {
  value: DateRangeTimeValue;
  onChange: (value: DateRangeTimeValue) => void;
  minDate?: string;
  bookedDates?: BookedDateRange[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  openRequest?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timePopoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [openTime, setOpenTime] = useState<"pickup" | "return" | null>(null);
  const [month, setMonth] = useState(() => parseDate(value.pickupDate) ?? new Date());
  const [draft, setDraft] = useState(value);
  const minimumDateValue = minDate ? datePart(minDate) : null;
  const display = value.pickupDate && value.returnDate
    ? `${displayDate(value.pickupDate)}, ${formatTime(value.pickupTime)} – ${displayDate(value.returnDate)}, ${formatTime(value.returnTime)}`
    : value.pickupDate ? `${displayDate(value.pickupDate)}, ${formatTime(value.pickupTime)} – Choose return date` : "";
  const pickupDateValue = parseDate(value.pickupDate);
  const returnDateValue = parseDate(value.returnDate);
  const durationMinutes = pickupDateValue && returnDateValue && isValidTime(value.pickupTime) && isValidTime(value.returnTime)
    ? (returnDateValue.getTime() - pickupDateValue.getTime()) / 60000 + (Number(value.returnTime.slice(0, 2)) * 60 + Number(value.returnTime.slice(3)) - Number(value.pickupTime.slice(0, 2)) * 60 - Number(value.pickupTime.slice(3)))
    : null;
  const durationLabel = durationMinutes !== null && durationMinutes > 0 ? formatDuration(durationMinutes) : null;

  const lastOpenRequest = useRef(0);
  useEffect(() => {
    if (openRequest !== lastOpenRequest.current) {
      lastOpenRequest.current = openRequest;
      if (!disabled) setOpen(true);
    }
  }, [disabled, openRequest]);
  useEffect(() => { if (!open) return; setDraft(value); setMonth(parseDate(value.pickupDate) ?? new Date()); }, [open, value]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
    const target = event.target as Node;
    if (rootRef.current && !rootRef.current.contains(target) && !popoverRef.current?.contains(target) && !timePopoverRef.current?.contains(target)) {
      setOpen(false);
      setOpenTime(null);
    }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const selectDate = (date: Date) => {
    const next = formatDate(date);
    if ((minimumDateValue && next < minimumDateValue) || bookedDates.some(range => next >= datePart(range.pickup_at) && next <= datePart(range.return_at))) return;
    const nextValue = !draft.pickupDate || draft.returnDate || next < draft.pickupDate
      ? { ...draft, pickupDate: next, returnDate: "" }
      : { ...draft, returnDate: next };
    setDraft(nextValue);
    onChange(nextValue);
    setMonth(date);
  };
  const updateTime = (key: "pickupTime" | "returnTime", time: string) => {
    const next = { ...draft, [key]: time };
    setDraft(next);
    onChange(next);
  };
  return <div className="relative" ref={rootRef}>
    <input type="text" readOnly disabled={disabled} value={display} placeholder={placeholder} aria-label={placeholder} onClick={() => setOpen(current => !current)} className={`${className} cursor-pointer`} />
    {open && !disabled && createPortal(<div ref={popoverRef} className="fixed inset-x-3 bottom-4 top-4 z-[220] mx-auto max-w-3xl overflow-y-auto overscroll-contain border border-[#3b2b24] bg-[#151515] p-4 text-[#f4f3f0] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(94vw,760px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Rental dates</p><h2 className="mt-1 font-['Space_Grotesk'] text-xl font-semibold">{draft.pickupDate && !draft.returnDate ? "Choose your return date" : "Choose your dates"}</h2></div><button type="button" className="text-xl text-[#999] hover:text-white" onClick={() => setOpen(false)} aria-label="Close date picker">×</button></div>
      <div className="mt-5 grid gap-6 md:grid-cols-[1fr_1fr_220px]">
        <RangeCalendar month={month} onChangeMonth={setMonth} pickupDate={draft.pickupDate} returnDate={draft.returnDate} minDate={minDate} bookedDates={bookedDates} onSelectDate={selectDate} />
        <div className="hidden md:block"><RangeCalendar month={new Date(month.getFullYear(), month.getMonth() + 1, 1)} onChangeMonth={next => setMonth(new Date(next.getFullYear(), next.getMonth() - 1, 1))} pickupDate={draft.pickupDate} returnDate={draft.returnDate} minDate={minDate} bookedDates={bookedDates} onSelectDate={selectDate} /></div>
        <div className="border-t border-white/10 pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          {(["pickup", "return"] as const).map(kind => {
            const key = kind === "pickup" ? "pickupTime" : "returnTime";
            const time = draft[key];
            const expanded = openTime === kind;
            return <div className={kind === "return" ? "mt-4" : ""} key={kind}>
              <span className="block text-xs font-semibold text-[#bbb]">{kind === "pickup" ? "Pickup time" : "Return time"}</span>
              <button type="button" className={`mt-2 flex w-full items-center justify-between border bg-[#0b0b0b] px-3 py-2.5 text-left text-sm text-white ${expanded ? "border-[#ff641f]" : "border-white/10 hover:border-white/30"}`} onClick={() => setOpenTime(expanded ? null : kind)} aria-expanded={expanded}>
                <span>{formatTime(time)}</span><span className="text-[#aaa]" aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
              </button>
              {expanded && createPortal(<div ref={timePopoverRef} className="fixed inset-x-4 bottom-4 top-4 z-[240] mx-auto flex max-h-[calc(100vh-2rem)] w-auto max-w-sm flex-col overflow-y-scroll overscroll-contain touch-pan-y border border-[#3b2b24] bg-[#151515] p-4 text-[#f4f3f0] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[80vh] sm:w-80 sm:-translate-x-1/2 sm:-translate-y-1/2">
                <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Rental time</p><h3 className="mt-1 font-['Space_Grotesk'] text-lg font-semibold">{kind === "pickup" ? "Pickup time" : "Return time"}</h3></div><button type="button" className="text-xl text-[#999] hover:text-white" onClick={() => setOpenTime(null)} aria-label="Close time picker">×</button></div>
                <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wide text-[#777]">Type manually<input type="time" value={time} onChange={event => updateTime(key, event.target.value)} className="mt-1 w-full border border-white/10 bg-[#0b0b0b] px-3 py-2 text-sm text-white" /></label>
                <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-3">{commonTimePresets.map(preset => <button type="button" key={`${kind}-${preset}`} onClick={() => { updateTime(key, preset); setOpenTime(null); }} className={`border px-2 py-2 text-[11px] ${time === preset ? "border-[#ff641f] bg-[#ff641f] font-bold text-white" : "border-white/10 text-[#bbb] hover:border-[#ff641f]"}`}>{formatTime(preset)}</button>)}</div>
              </div>, document.body)}
            </div>;
          })}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-sm"><span>{draft.pickupDate ? displayDate(draft.pickupDate) : "Pickup"} <span className="text-[#777]">→</span> {draft.returnDate ? displayDate(draft.returnDate) : "Return"}{durationLabel && <span className="ml-3 font-semibold text-[#ff9b73]">{durationLabel}</span>}</span><span className="text-xs text-[#ff9b73]">{draft.pickupDate && draft.returnDate && !durationLabel ? "Return must be after pickup" : ""}</span><button type="button" className="bg-[#ff641f] px-4 py-2 text-xs font-bold text-white disabled:opacity-40" disabled={!draft.pickupDate || !draft.returnDate || !durationLabel} onClick={() => setOpen(false)}>Done</button></div>
    </div>, document.body)}
  </div>;
}

export function DateTimePicker({
  value,
  onChange,
  mode = "date",
  minDate,
  bookedDates = [],
  className = "",
  required = false,
  disabled = false,
  placeholder = "Choose a date",
}: DateTimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const timeInputId = useId();
  const selected = useMemo(() => parseDate(value), [value]);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const [month, setMonth] = useState(() => selected ?? new Date());
  const currentTime = mode === "datetime" && value.includes("T") ? value.slice(11, 16) : "09:00";
  const [time, setTime] = useState(currentTime);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node) && !popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const input = rootRef.current?.querySelector("input");
      if (!input) return;
      const rect = input.getBoundingClientRect();
      setAnchor({ top: rect.bottom + 8, left: rect.left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    // Prop changes must move the visible calendar to the selected date.
    // This is synchronization with the controlled value, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected) setMonth(selected);
    if (mode === "datetime" && value.includes("T")) setTime(value.slice(11, 16));
  }, [selected, value, mode]);

  const minimumDate = minDate ? parseDate(minDate) : null;
  const minimumDateValue = minimumDate ? formatDate(minimumDate) : null;
  const years = Array.from({ length: 11 }, (_, index) => month.getFullYear() - 5 + index);
  const timeSlots = Array.from({ length: 96 }, (_, index) => `${pad(Math.floor(index / 4))}:${pad((index % 4) * 15)}`);

  const selectDate = (date: Date) => {
    const nextDate = formatDate(date);
    if ((minimumDateValue && nextDate < minimumDateValue) || bookedDates.some(range => nextDate >= datePart(range.pickup_at) && nextDate <= datePart(range.return_at))) return;
    onChange(mode === "datetime" ? `${nextDate}T${time}` : nextDate);
    setMonth(date);
    if (mode === "date") setOpen(false);
  };

  const selectTime = (nextTime: string) => {
    setTime(nextTime);
    if (selected) onChange(`${formatDate(selected)}T${nextTime}`);
  };

  const typeTime = (nextTime: string) => {
    setTime(nextTime);
    if (selected && isValidTime(nextTime)) onChange(`${formatDate(selected)}T${nextTime}`);
  };

  const displayValue = selected ? `${displayDate(value)}${mode === "datetime" && isValidTime(time) ? ` · ${formatTime(time)}` : ""}` : "";

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
      {open && !disabled && createPortal(
        <div ref={popoverRef} style={{ top: anchor.top, left: anchor.left }} className="datetime-picker-popover theme-surface fixed inset-x-3 bottom-4 z-[220] max-h-[calc(100vh-2rem)] overflow-y-auto rounded border border-black/10 bg-white p-3 shadow-2xl overscroll-contain sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(94vw,48rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 gap-1 sm:gap-2">
              <select className="min-w-0 flex-1 border border-black/10 px-1 py-2 text-sm font-semibold sm:px-2 sm:py-1" value={month.getMonth()} onChange={event => setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))}>{Array.from({ length: 12 }, (_, index) => <option value={index} key={index}>{new Date(2000, index, 1).toLocaleDateString([], { month: "long" })}</option>)}</select>
              <select className="w-[5.5rem] shrink-0 border border-black/10 px-1 py-2 text-sm font-semibold sm:px-2 sm:py-1" value={month.getFullYear()} onChange={event => setMonth(new Date(Number(event.target.value), month.getMonth(), 1))}>{years.map(year => <option value={year} key={year}>{year}</option>)}</select>
            </div>
          </div>
          <div className="mt-3 grid gap-6 md:grid-cols-2">
            <CalendarMonth month={month} onChangeMonth={next => setMonth(next)} value={value} minDate={minDate} bookedDates={bookedDates} onSelectDate={selectDate} />
            <div className="hidden md:block"><CalendarMonth month={new Date(month.getFullYear(), month.getMonth() + 1, 1)} value={value} minDate={minDate} bookedDates={bookedDates} onSelectDate={selectDate} /></div>
          </div>
          {bookedDates.length > 0 && <p className="mt-2 text-[11px] text-red-700"><span className="mr-1 inline-block rounded-sm border border-red-500 px-0.5 text-[8px] font-black leading-3" aria-hidden="true">BOOKED</span>Booked dates cannot be selected.</p>}
          {mode === "datetime" && (
            <div className="mt-4 border-t border-black/10 pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-[#555]" htmlFor={timeInputId}>Choose a time</label>
                <input id={timeInputId} type="time" value={time} onChange={event => typeTime(event.target.value)} className="h-10 border border-black/10 px-2 py-1 text-sm" aria-label="Type a time" />
              </div>
              <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto pr-1">
                {timeSlots.map(slot => <button type="button" key={slot} onClick={() => selectTime(slot)} className={`calendar-time rounded border px-2 py-2 text-xs ${time === slot ? "border-[#ff641f] bg-orange-50 font-semibold text-[#d94d10]" : "border-black/10 hover:bg-black/5"}`}>{formatTime(slot)}</button>)}
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-black/10 pt-3">
            <button type="button" className="text-xs font-semibold text-[#ff641f]" onClick={() => { const today = new Date(); selectDate(today); }}>Today</button>
            {mode === "datetime" && <button type="button" className="text-xs text-[#777] hover:text-[#151515]" onClick={() => setOpen(false)}>Done</button>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
