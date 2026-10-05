import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { Skeleton, useToast } from "../components/Ui";
import api from "../lib/api";
import type { BookingRecord, Paginated, VehicleRecord } from "../types";

const activeStatuses = ["pending", "upcoming", "ongoing"];
const receivableStatuses = ["upcoming", "ongoing", "complete"];
const pageSize = 5;
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });
const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");

function localDateValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], options);
}

function bookingDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function bookingTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function vehicleLabel(vehicle?: VehicleRecord) {
  if (!vehicle) return "Vehicle unavailable";
  return vehicle.name || `${vehicle.brand} ${vehicle.model}`;
}

function vehicleImage(vehicle?: VehicleRecord) {
  const value = vehicle?.images?.[0]?.url;
  if (!value) return null;
  return value.startsWith("http") ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, "").replace(/^storage\//, "")}`;
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateValue(date);
}

function sameDay(value: string, day: string) {
  return localDateValue(new Date(value)) === day;
}

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border border-black/10 bg-white shadow-sm ${className}`}>{children}</section>;
}

function BookingList({ title, description, bookings, emptyMessage }: { title: string; description: string; bookings: BookingRecord[]; emptyMessage: string }) {
  return (
    <SectionCard className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-black/10 p-5">
        <div>
          <h2 className="font-['Space_Grotesk'] text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[#777]">{description}</p>
        </div>
        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-[#d94f12]">{bookings.length}</span>
      </div>
      {bookings.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
          <span className="text-3xl text-[#ff641f]" aria-hidden="true">↗</span>
          <p className="mt-3 font-semibold">{emptyMessage}</p>
          <p className="mt-1 text-sm text-[#777]">Nothing is scheduled for this date.</p>
        </div>
      ) : (
        <div className="divide-y divide-black/[.06]">
          {bookings.map(booking => (
            <Link className="flex items-center gap-3 p-4 transition hover:bg-orange-50 sm:gap-4" to={`/admin/bookings?booking=${booking.id}`} key={booking.id}>
              <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-[#f4f3f0]">
                {vehicleImage(booking.vehicle) ? <img className="h-full w-full object-cover" src={vehicleImage(booking.vehicle) ?? undefined} alt="" /> : <span className="text-lg text-[#999]" aria-hidden="true">▱</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{booking.customer?.name ?? "Customer"}</p>
                <p className="truncate text-xs text-[#777]">{vehicleLabel(booking.vehicle)} · {booking.reference}</p>
                <p className="mt-1 text-xs text-[#555]">{bookingDate(booking.pickup_at)} · {bookingTime(booking.pickup_at)}</p>
              </div>
              <span className="text-lg text-[#999]" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default function RentalOperationsPage() {
  const { showToast } = useToast();
  const today = localDateValue();
  const [selectedDate, setSelectedDate] = useState(today);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bookingResult, vehicleResult] = await Promise.all([
        api.get<Paginated<BookingRecord>>("/bookings?per_page=100&sort=oldest"),
        api.get<Paginated<VehicleRecord>>("/vehicles?per_page=100"),
      ]);
      setBookings(bookingResult.data.data);
      setVehicles(vehicleResult.data.data.filter(vehicle => vehicle.status !== "archived"));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load rental operations", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);
  const setOperationsDate = (value: string) => {
    setSelectedDate(value);
    setPage(1);
  };

  const operationalBookings = useMemo(() => bookings.filter(booking => activeStatuses.includes(booking.status)), [bookings]);
  const releases = useMemo(() => operationalBookings.filter(booking => sameDay(booking.pickup_at, selectedDate)), [operationalBookings, selectedDate]);
  const returns = useMemo(() => operationalBookings.filter(booking => sameDay(booking.return_at, selectedDate)), [operationalBookings, selectedDate]);
  const receivables = useMemo(() => bookings.filter(booking => receivableStatuses.includes(booking.status) && Number(booking.balance ?? 0) > 0), [bookings]);
  const outstandingTotal = receivables.reduce((sum, booking) => sum + Number(booking.balance ?? 0), 0);
  const currentBookings = useMemo(() => operationalBookings.filter(booking => {
    const now = new Date();
    return new Date(booking.pickup_at) <= now && new Date(booking.return_at) > now;
  }), [operationalBookings]);
  const unavailableIds = new Set(currentBookings.map(booking => booking.vehicle?.id).filter((id): id is number => Boolean(id)));
  const unavailableVehicles = vehicles.filter(vehicle => vehicle.status !== "available" || unavailableIds.has(vehicle.id));
  const availableCount = Math.max(0, vehicles.length - unavailableVehicles.length);
  const totalPages = Math.max(1, Math.ceil(receivables.length / pageSize));
  const visibleReceivables = receivables.slice((page - 1) * pageSize, page * pageSize);
  const isTodaySelected = selectedDate === today;

  return (
    <AdminShell title="Rental Operations">
      <div className="mt-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[#777]">{isTodaySelected ? "Today" : "Selected date"}</p>
            <p className="font-['Space_Grotesk'] text-xl font-semibold">{dateLabel(selectedDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="h-11 w-11 border border-black/10 bg-white text-lg text-[#555] transition hover:border-[#ff641f] hover:text-[#ff641f]" onClick={() => setOperationsDate(addDays(selectedDate, -1))} aria-label="Previous day">‹</button>
            <label className="relative">
              <span className="sr-only">Select operations date</span>
              <input type="date" className="h-11 border border-black/10 bg-white px-3 text-sm font-semibold outline-none focus:border-[#ff641f] focus:ring-1 focus:ring-[#ff641f]" value={selectedDate} onChange={event => setOperationsDate(event.target.value)} />
            </label>
            <button type="button" className="h-11 w-11 border border-black/10 bg-white text-lg text-[#555] transition hover:border-[#ff641f] hover:text-[#ff641f]" onClick={() => setOperationsDate(addDays(selectedDate, 1))} aria-label="Next day">›</button>
            {!isTodaySelected && <button type="button" className="h-11 border border-[#ff641f] px-4 text-sm font-semibold text-[#d94f12] transition hover:bg-orange-50" onClick={() => setOperationsDate(today)}>Today</button>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Releases", releases.length, "Scheduled for selected date", "↗"],
            ["Returns", returns.length, "Expected on selected date", "↙"],
            ["Receivables", peso.format(outstandingTotal), `${receivables.length} outstanding booking${receivables.length === 1 ? "" : "s"}`, "₱"],
            ["Available now", `${availableCount} of ${vehicles.length}`, "Vehicles currently available", "▱"],
          ].map(([label, value, note, icon]) => (
            <div className="border border-black/10 bg-white p-5 shadow-sm" key={label}>
              <div className="flex items-start justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#777]">{label}</p><span className="text-lg text-[#ff641f]" aria-hidden="true">{icon}</span></div>
              <p className="mt-3 font-['Space_Grotesk'] text-3xl font-semibold tracking-tight">{loading ? <Skeleton className="h-9 w-24" /> : value}</p>
              <p className="mt-2 text-xs text-[#777]">{note}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <BookingList title="Scheduled Releases" description="Vehicles scheduled to go out." bookings={releases} emptyMessage="No scheduled releases" />
          <BookingList title="Scheduled Returns" description="Vehicles expected back." bookings={returns} emptyMessage="No scheduled returns" />
        </div>

        <SectionCard className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 p-5">
            <div><h2 className="font-['Space_Grotesk'] text-xl font-semibold">Fleet Status</h2><p className="mt-1 text-sm text-[#777]">Current vehicle availability across your fleet.</p></div>
            <span className="flex items-center gap-2 text-xs text-[#777]"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live availability</span>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            {[["Total fleet", vehicles.length, "text-[#151515]"], ["Available", availableCount, "text-emerald-600"], ["Unavailable", unavailableVehicles.length, "text-[#151515]"]].map(([label, value, color]) => <div className="border border-black/10 bg-[#f8f7f5] p-4" key={label}><p className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#777]">{label}</p><p className={`mt-2 font-['Space_Grotesk'] text-3xl font-semibold ${color}`}>{loading ? <Skeleton className="h-9 w-16" /> : value}</p></div>)}
          </div>
          {unavailableVehicles.length === 0 ? <div className="mx-5 mb-5 border border-dashed border-emerald-300 bg-emerald-50 p-6 text-center text-sm font-semibold text-emerald-700">✓ All vehicles are currently available</div> : <div className="mx-5 mb-5 divide-y divide-black/[.06] border border-black/10">{unavailableVehicles.map(vehicle => { const booking = currentBookings.find(item => item.vehicle?.id === vehicle.id); return <Link className="flex items-center justify-between gap-4 p-4 transition hover:bg-orange-50" to={booking ? `/admin/bookings?booking=${booking.id}` : `/admin/vehicles`} key={vehicle.id}><div><p className="text-sm font-semibold">{vehicleLabel(vehicle)}</p><p className="mt-1 text-xs text-[#777]">{vehicle.plate_number} · {booking ? `Booked by ${booking.customer?.name ?? "customer"}` : "Unavailable in fleet settings"}</p></div><span className="text-[#ff641f]" aria-hidden="true">↗</span></Link> })}</div>}
        </SectionCard>

        <SectionCard className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 p-5"><div><h2 className="font-['Space_Grotesk'] text-xl font-semibold">Outstanding Balances</h2><p className="mt-1 text-sm text-[#777]">Approved bookings with remaining receivables.</p></div><div className="text-right"><p className="text-xs text-[#777]">Total outstanding</p><p className="mt-1 font-['Space_Grotesk'] text-xl font-semibold text-[#d99400]">{peso.format(outstandingTotal)}</p></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-black/10 bg-[#f8f7f5] text-[10px] uppercase tracking-widest text-[#777]"><tr><th className="px-5 py-3">Vehicle</th><th className="px-5 py-3">Renter</th><th className="px-5 py-3">Rental period</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{loading ? <tr><td className="p-5" colSpan={5}><Skeleton className="h-8 w-full" /></td></tr> : visibleReceivables.length === 0 ? <tr><td className="p-8 text-center text-sm text-[#777]" colSpan={5}>No outstanding balances.</td></tr> : visibleReceivables.map(booking => <tr className="border-b border-black/[.06] last:border-0 hover:bg-orange-50" key={booking.id}><td className="px-5 py-4 font-semibold">{vehicleLabel(booking.vehicle)}<span className="mt-1 block text-xs font-normal text-[#777]">{booking.vehicle?.plate_number ?? "—"}</span></td><td className="px-5 py-4">{booking.customer?.name ?? "Customer"}</td><td className="px-5 py-4 text-xs text-[#555]"><span className="block">{bookingDate(booking.pickup_at)} – {bookingDate(booking.return_at)}</span><span className="mt-1 block text-[#999]">{booking.reference}</span></td><td className="px-5 py-4 font-semibold text-[#d99400]">{peso.format(Number(booking.balance ?? 0))}</td><td className="px-5 py-4 text-right"><Link className="inline-flex h-9 items-center border border-black/10 px-3 text-xs font-semibold text-[#555] transition hover:border-[#ff641f] hover:text-[#d94f12]" to={`/admin/bookings?edit=${booking.id}`}>Edit booking</Link></td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 p-4 text-xs text-[#777]"><span>Showing {receivables.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, receivables.length)} of {receivables.length} results</span><div className="flex items-center gap-1"><button type="button" className="h-8 w-8 border border-black/10 disabled:opacity-40" disabled={page === 1} onClick={() => setPage(value => value - 1)} aria-label="Previous balances page">‹</button><span className="px-2 font-semibold text-[#555]">{page} / {totalPages}</span><button type="button" className="h-8 w-8 border border-black/10 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} aria-label="Next balances page">›</button></div></div>
        </SectionCard>
      </div>
    </AdminShell>
  );
}
