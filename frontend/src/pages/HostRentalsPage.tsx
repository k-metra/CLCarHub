import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HostShell } from "../components/HostShell";
import api from "../lib/api";
import type { BookingRecord } from "../types";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function statusClass(status: string): string {
  if (["complete", "for_completion"].includes(status)) return "bg-emerald-100 text-emerald-700";
  if (["cancelled", "rejected"].includes(status)) return "bg-red-100 text-red-700";
  if (status === "ongoing") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

export default function HostRentalsPage() {
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<BookingRecord[]>("/host/rentals")
      .then(response => setBookings(response.data))
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : "Unable to load your rentals"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const bookingId = searchParams.get("booking");
    if (!bookingId || loading) return;
    window.setTimeout(() => document.getElementById(`host-rental-${bookingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }, [loading, searchParams]);

  return (
    <HostShell title="My rentals">
      <section className="mt-8 border border-black/10 bg-white p-6">
        <p className="text-sm text-[#777]">Bookings you made as a renter are shown here separately from bookings for your vehicles.</p>
        {loading && <p className="mt-6 text-sm text-[#777]">Loading your rentals...</p>}
        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
        {!loading && !error && bookings.length === 0 && <p className="mt-6 text-sm text-[#777]">You have not rented a vehicle yet.</p>}
        {!loading && !error && <div className="mt-6 divide-y divide-black/10 border-t border-black/10">
          {bookings.map(booking => {
            const vehicleName = booking.vehicle?.name || `${booking.vehicle?.brand ?? ""} ${booking.vehicle?.model ?? ""}`;
            const highlighted = String(booking.id) === searchParams.get("booking");
            return <article id={`host-rental-${booking.id}`} className={`py-5 ${highlighted ? "rounded border border-[#ff641f]/40 bg-[#fff7f3] px-3" : ""}`} key={booking.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="font-semibold">{booking.reference}</p><h2 className="mt-1 text-lg font-semibold">{vehicleName}</h2><p className="mt-1 text-sm text-[#777]">{new Date(booking.pickup_at).toLocaleString()} – {new Date(booking.return_at).toLocaleString()}</p></div>
                <div className="text-left sm:text-right"><span className={`inline-block rounded px-2 py-1 text-xs font-semibold uppercase ${statusClass(booking.status)}`}>{booking.status.replaceAll("_", " ")}</span><p className="mt-2 font-semibold">{money.format(Number(booking.total_amount || 0))}</p></div>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><p><span className="block text-xs uppercase text-[#888]">Vehicle</span>{booking.vehicle?.brand} {booking.vehicle?.model}</p><p><span className="block text-xs uppercase text-[#888]">Payment status</span>{booking.payment_status?.replaceAll("_", " ") || "Unpaid"}</p><p><span className="block text-xs uppercase text-[#888]">Reference</span>{booking.reference}</p></div>
            </article>;
          })}
        </div>}
      </section>
    </HostShell>
  );
}
