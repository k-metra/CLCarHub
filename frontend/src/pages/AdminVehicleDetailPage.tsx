import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { DateRangeTimePicker, type DateRangeTimeValue } from "../components/DateTimePicker";
import api from "../lib/api";
import type { BookingRecord, Paginated, VehicleRecord } from "../types";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const imageUrl = (value?: string | null) => value ? (value.startsWith("http") ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, "").replace(/^storage\//, "")}`) : null;
const titleFor = (vehicle: VehicleRecord) => vehicle.name || `${vehicle.brand} ${vehicle.model}`;
const statusClass = (status: string) => ["cancelled", "rejected"].includes(status) ? "bg-red-100 text-red-700" : status === "complete" ? "bg-slate-100 text-slate-700" : "bg-emerald-100 text-emerald-700";
type AvailabilityConflict = { pickup_at: string; return_at: string };
const formatDateTime = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export default function AdminVehicleDetailPage() {
  const { vehicleId } = useParams();
  const [vehicle, setVehicle] = useState<VehicleRecord | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [month, setMonth] = useState(() => new Date());
  const [range, setRange] = useState<DateRangeTimeValue>(() => {
    const pickup = new Date();
    const returned = new Date(pickup.getTime() + 24 * 60 * 60 * 1000);
    const time = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return { pickupDate: localDate(pickup), returnDate: localDate(returned), pickupTime: time(pickup), returnTime: time(returned) };
  });
  const [availability, setAvailability] = useState<boolean | null>(null);
  const [availabilityConflicts, setAvailabilityConflicts] = useState<AvailabilityConflict[]>([]);
  const [availabilityError, setAvailabilityError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!vehicleId) return;
    Promise.all([
      api.get<VehicleRecord>(`/vehicles/${vehicleId}`),
      api.get<Paginated<BookingRecord>>(`/bookings?vehicle_id=${vehicleId}&per_page=100&sort=oldest`),
    ]).then(([vehicleResponse, bookingResponse]) => {
      setVehicle(vehicleResponse.data);
      setBookings(bookingResponse.data.data);
    }).catch(requestError => setError(requestError instanceof Error ? requestError.message : "Unable to load vehicle profile."))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  const filteredBookings = useMemo(() => bookings.filter(booking => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [booking.reference, booking.customer?.name, booking.status].some(value => value?.toLowerCase().includes(query));
    return matchesSearch && (filter === "all" || booking.status === filter);
  }), [bookings, filter, search]);
  const outstanding = bookings.reduce((sum, booking) => sum + Math.max(0, Number(booking.balance ?? 0)), 0);
  const days = useMemo(() => calendarDays(month), [month]);
  const bookingsOnDay = (day: Date) => bookings.filter(booking => {
    if (["cancelled", "rejected"].includes(booking.status)) return false;
    const start = new Date(booking.pickup_at);
    const end = new Date(booking.return_at);
    const value = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    return value >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) && value <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
  });
  const checkAvailability = async () => {
    if (!vehicleId || !range.pickupDate || !range.returnDate) return;
    setAvailabilityError("");
    setAvailability(null);
    setAvailabilityConflicts([]);
    try {
      const response = await api.get<{ available: boolean; conflicts: AvailabilityConflict[] }>(`/vehicles/${vehicleId}/availability`, {
        params: {
          pickup_at: `${range.pickupDate}T${range.pickupTime}:00`,
          return_at: `${range.returnDate}T${range.returnTime}:00`,
        },
      });
      setAvailability(response.data.available);
      setAvailabilityConflicts(response.data.conflicts ?? []);
    } catch (requestError) {
      setAvailabilityError(requestError instanceof Error ? requestError.message : "Unable to check vehicle availability.");
    }
  };

  if (loading) return <AdminShell title="Vehicle profile"><p className="mt-8 text-sm text-[#777]">Loading vehicle profile...</p></AdminShell>;
  if (error || !vehicle) return <AdminShell title="Vehicle profile"><p className="mt-8 text-sm text-red-600">{error || "Vehicle not found."}</p></AdminShell>;
  const image = imageUrl(vehicle.images?.find(item => item.image_type === "thumbnail")?.url ?? vehicle.images?.[0]?.url);

  return <AdminShell title="Vehicle profile">
    <div className="mt-8 space-y-6">
      <Link to="/admin/vehicles" className="text-sm font-semibold text-[#ff641f] hover:underline">← Back to vehicles</Link>
      <section className="grid gap-6 border border-black/10 bg-white p-5 md:grid-cols-[16rem_1fr] md:p-6">
        <div className="flex min-h-48 items-center justify-center bg-[#f8f7f5] p-3">{image ? <img src={image} alt={titleFor(vehicle)} className="max-h-56 w-full object-contain" /> : <span className="text-sm text-[#888]">No vehicle image</span>}</div>
        <div><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Vehicle profile</p><h1 className="mt-1 text-3xl font-semibold">{titleFor(vehicle)}</h1><p className="mt-1 text-sm text-[#777]">{vehicle.brand} {vehicle.model} · {vehicle.year} · {vehicle.plate_number}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(vehicle.status)}`}>{vehicle.status}</span></div><div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><Info label="Type" value={vehicle.type} /><Info label="Daily rate" value={money.format(Number(vehicle.daily_rate))} /><Info label="Seats" value={String(vehicle.seats)} /><Info label="Outstanding" value={money.format(outstanding)} /></div>{vehicle.description && <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-[#555]">{vehicle.description}</p>}</div>
      </section>

      <section className="border border-black/10 bg-white p-5 md:p-6">
        <h2 className="text-xl font-semibold">Availability</h2><p className="mt-1 text-sm text-[#777]">Check whether this unit is free for a specific pickup and return range.</p>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end"><label className="flex-1 text-xs font-semibold text-[#555]">Pickup and return<DateRangeTimePicker value={range} onChange={setRange} className="mt-2 w-full border border-black/10 px-3 py-3 text-sm" placeholder="Choose pickup and return" /></label><button type="button" onClick={() => void checkAvailability()} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white">Check availability</button></div>
        {availability !== null && <div className={`mt-4 text-sm ${availability ? "text-emerald-700" : "text-red-700"}`}>{availability ? <p className="font-semibold">Available for the selected range.</p> : <><p className="font-semibold">Not available for the selected range.</p>{availabilityConflicts.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{availabilityConflicts.map(conflict => <li key={`${conflict.pickup_at}-${conflict.return_at}`}>Booked from {formatDateTime(conflict.pickup_at)} to {formatDateTime(conflict.return_at)}.</li>)}</ul>}</>}</div>}{availabilityError && <p className="mt-3 text-sm text-red-600">{availabilityError}</p>}
      </section>

      <section className="border border-black/10 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Vehicle calendar</h2><p className="mt-1 text-sm text-[#777]">Bookings scheduled for this unit.</p></div><div className="flex items-center gap-2"><button type="button" className="border border-black/10 px-3 py-2" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button><strong className="min-w-36 text-center">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</strong><button type="button" className="border border-black/10 px-3 py-2" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button></div></div>
        <div className="mt-5 grid grid-cols-7 border-l border-t border-black/10">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div key={day} className="border-b border-r border-black/10 bg-[#f8f7f5] p-2 text-center text-[10px] font-bold uppercase text-[#888]">{day.slice(0, 3)}</div>)}{days.map(day => <div key={day.toISOString()} className={`min-h-24 border-b border-r border-black/10 p-1 ${day.getMonth() !== month.getMonth() ? "bg-[#fafafa]" : ""}`}><span className="text-xs font-semibold">{day.getDate()}</span><div className="mt-1 space-y-1">{bookingsOnDay(day).map(booking => <Link key={booking.id} to={`/admin/bookings?edit=${booking.id}`} className="block truncate bg-[#fff1e9] px-1 py-1 text-[10px] text-[#9a3e12]" title={booking.reference}>{booking.reference}</Link>)}</div></div>)}</div>
      </section>

      <section className="border border-black/10 bg-white p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row"><input className="flex-1 border border-black/10 bg-[#f8f7f5] px-3 py-3 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search reference, customer, or status..." /><select className="border border-black/10 bg-[#f8f7f5] px-3 py-3 text-sm" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option>{["pending", "upcoming", "ongoing", "for_completion", "complete", "cancelled", "rejected"].map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
        <div className="mt-5 flex items-center justify-between"><h2 className="text-xl font-semibold">Bookings</h2><p className="text-sm text-[#777]">{filteredBookings.length} shown · {money.format(outstanding)} outstanding</p></div>
        <div className="mt-4 space-y-3">{filteredBookings.length ? filteredBookings.map(booking => <Link key={booking.id} to={`/admin/bookings?edit=${booking.id}`} className="block border border-black/10 p-4 transition hover:border-[#ff641f]"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{booking.reference}</p><p className="mt-1 text-sm text-[#555]">{booking.customer?.name ?? "Customer"} · {new Date(booking.pickup_at).toLocaleString()} – {new Date(booking.return_at).toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(booking.status)}`}>{booking.status.replaceAll("_", " ")}</span></div><div className="mt-3 flex flex-wrap gap-4 text-sm text-[#555]"><span>Total: {money.format(Number(booking.total_amount || 0))}</span><span className={Number(booking.balance ?? 0) > 0 ? "font-semibold text-red-700" : "text-emerald-700"}>{Number(booking.balance ?? 0) > 0 ? `Outstanding: ${money.format(Number(booking.balance))}` : "Paid in full"}</span></div></Link>) : <p className="py-8 text-sm text-[#777]">No bookings match these filters.</p>}</div>
      </section>
    </div>
  </AdminShell>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-wide text-[#888]">{label}</p><p className="mt-1 font-semibold capitalize">{value}</p></div>;
}
