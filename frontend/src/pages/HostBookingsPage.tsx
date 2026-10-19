import { useEffect, useState } from "react";
import { HostShell } from "../components/HostShell";
import api from "../lib/api";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");

function resolveImageUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.pathname.startsWith("/storage/")) return `${apiOrigin}${parsed.pathname}${parsed.search}`;
    return parsed.toString();
  } catch {
    return `${apiOrigin}/${value.replace(/^\/+/, "")}`;
  }
}

type HostBooking = {
  id: number;
  reference: string;
  status: string;
  pickup_at: string;
  return_at: string;
  vehicle: {
    id: number;
    name?: string | null;
    brand: string;
    model: string;
    plate_number: string;
    image_url?: string | null;
  };
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusClass(status: string): string {
  if (["complete", "for_completion"].includes(status)) return "bg-emerald-100 text-emerald-700";
  if (["cancelled", "rejected"].includes(status)) return "bg-red-100 text-red-700";
  if (status === "ongoing") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

export default function HostBookingsPage() {
  const [bookings, setBookings] = useState<HostBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    api.get<HostBooking[]>("/host/bookings")
      .then(response => setBookings(response.data))
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : "Unable to load bookings"))
      .finally(() => setLoading(false));
  }, []);
  const filteredBookings = bookings.filter(booking => {
    const haystack = `${booking.reference} ${booking.vehicle.name ?? ""} ${booking.vehicle.brand} ${booking.vehicle.model} ${booking.vehicle.plate_number}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (status === "all" || booking.status === status);
  });

  return (
    <HostShell title="Bookings for your units">
      <section className="mt-8 border border-black/10 bg-white p-6">
        <p className="text-sm text-[#777]">Booking references, schedules, unit details, and statuses are shown here. Customer and payment information is not shared in the host portal.</p>
        <div className="mt-6 flex flex-wrap gap-3"><input className="min-w-60 flex-1 border border-black/15 p-3 text-sm" placeholder="Search booking, vehicle, make, model, or plate" value={search} onChange={event => setSearch(event.target.value)} /><select className="border border-black/15 bg-white p-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="upcoming">Upcoming</option><option value="ongoing">Ongoing</option><option value="for_completion">For completion</option><option value="complete">Complete</option><option value="cancelled">Cancelled</option><option value="rejected">Rejected</option></select></div>
        {loading && <p className="mt-6 text-sm text-[#777]">Loading bookings...</p>}
        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
        {!loading && !error && bookings.length === 0 && <p className="mt-6 text-sm text-[#777]">No bookings have been assigned to your units.</p>}
        {!loading && !error && bookings.length > 0 && <div className="mt-6 divide-y divide-black/10 border-t border-black/10">
          {filteredBookings.map(booking => <article className="flex flex-wrap items-center justify-between gap-4 py-4" key={booking.id}>
            <div className="flex min-w-0 items-center gap-3">
              {resolveImageUrl(booking.vehicle.image_url) ? <img className="h-12 w-16 shrink-0 rounded object-cover" src={resolveImageUrl(booking.vehicle.image_url) ?? undefined} alt="" /> : <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-[#f4f3f0] text-lg text-[#999]" aria-hidden="true">▱</div>}
              <div className="min-w-0">
                <p className="font-semibold">{booking.reference}</p>
                <p className="text-sm">{booking.vehicle.name || `${booking.vehicle.brand} ${booking.vehicle.model}`}</p>
                <p className="text-xs text-[#777]">{booking.vehicle.brand} {booking.vehicle.model} · {booking.vehicle.plate_number}</p>
              </div>
            </div>
            <div className="text-sm sm:text-right">
              <span className={`inline-block rounded px-2 py-1 text-xs font-semibold uppercase ${statusClass(booking.status)}`}>{booking.status.replaceAll("_", " ")}</span>
              <p className="mt-2 text-[#777]">{formatDate(booking.pickup_at)} – {formatDate(booking.return_at)}</p>
            </div>
          </article>)}
        </div>}
        {!loading && !error && bookings.length > 0 && filteredBookings.length === 0 && <p className="mt-6 text-sm text-[#777]">No bookings match your search or filter.</p>}
      </section>
    </HostShell>
  );
}
