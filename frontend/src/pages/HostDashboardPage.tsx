import { useEffect, useRef, useState } from "react";
import { HostShell } from "../components/HostShell";
import api from "../lib/api";
import L from "../lib/leaflet";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");

function resolveImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.pathname.startsWith("/storage/")) return `${apiOrigin}${parsed.pathname}${parsed.search}`;
    return parsed.toString();
  } catch {
    return `${apiOrigin}/${value.replace(/^\/+/, "")}`;
  }
}

type Dashboard = {
  partner: {
    name: string;
    email: string;
    vehicles: Array<{ id: number; name?: string; brand: string; model: string; plate_number: string; aika_device_id?: string | null; images?: Array<{ url?: string; image_type?: string | null; is_primary?: boolean }> ; partner_contracts: Array<{ status: string }> }>;
    earnings: Array<{ id: number; net_amount: string; earned_at: string; created_at?: string; vehicle?: { name?: string; brand: string; model: string } }>;
    payouts: Array<{ id: number; amount: string; status: string; paid_at?: string | null; created_at?: string; payment_reference?: string | null; notes?: string | null }>;
  };
  summary: { gross_earnings: number; net_earnings: number; paid_out: number; outstanding: number };
};

type VehicleLocation = {
  latitude: number;
  longitude: number;
  speed?: number | null;
  position_time?: string | null;
  is_stopped?: boolean;
  fetched_at?: string;
};

function formatBusinessDate(value?: string | null, timeValue?: string | null): string {
  if (!value) return "Date unavailable";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  const formattedDate = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
  if (!timeValue) return formattedDate;

  const timestamp = new Date(timeValue);
  if (Number.isNaN(timestamp.getTime())) return formattedDate;

  return `${formattedDate}, ${new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)}`;
}

export default function HostDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [location, setLocation] = useState<VehicleLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  useEffect(() => {
    api.get<Dashboard>("/host/dashboard").then(response => setData(response.data)).catch(error => setError(error instanceof Error ? error.message : "Unable to load host dashboard"));
  }, []);
  const selectedVehicle = data?.partner.vehicles.find(vehicle => vehicle.id === selectedVehicleId);
  const showLocation = async (vehicle: Dashboard["partner"]["vehicles"][number]) => {
    setSelectedVehicleId(vehicle.id);
    setLocation(null);
    setLocationError("");
    setLocationLoading(true);
    try {
      const response = await api.get<VehicleLocation>(`/host/vehicles/${vehicle.id}/location`);
      setLocation(response.data);
    } catch (requestError) {
      setLocationError(requestError instanceof Error ? requestError.message : "Unable to load vehicle location");
    } finally {
      setLocationLoading(false);
    }
  };
  useEffect(() => {
    if (!location || !mapRef.current) return;
    mapInstanceRef.current?.remove();
    const map = L.map(mapRef.current).setView([location.latitude, location.longitude], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    L.marker([location.latitude, location.longitude]).addTo(map).bindPopup(`${selectedVehicle?.name || `${selectedVehicle?.brand ?? ""} ${selectedVehicle?.model ?? ""}`}<br>${location.is_stopped ? "In place" : "Moving"} · ${location.speed ?? 0} km/h`).openPopup();
    mapInstanceRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [location, selectedVehicle]);
  return (
    <HostShell title="Host Dashboard">
      {error && <p className="mt-8 text-sm text-red-600">{error}</p>}
      {data && <div className="mt-8 space-y-8">
        <section id="overview" className="grid gap-4 md:grid-cols-4">
          {Object.entries(data.summary).map(([label, value]) => <div className="border border-black/10 bg-white p-5" key={label}><p className="text-xs uppercase tracking-widest text-[#777]">{label.replaceAll("_", " ")}</p><p className="mt-3 text-2xl font-semibold">₱{value.toLocaleString()}</p></div>)}
        </section>
        <section id="vehicles" className="border border-black/10 bg-white p-6">
          <h2 className="text-xl font-semibold">{data.partner.name}</h2>
          <p className="mt-1 text-sm text-[#777]">{data.partner.email}</p>
          <h3 className="mt-6 text-xs font-bold uppercase tracking-widest text-[#777]">Authorized vehicles</h3>
          <div className="mt-3 divide-y divide-black/10">{data.partner.vehicles.map(vehicle => {
            const image = vehicle.images?.find(item => item.is_primary)?.url ?? vehicle.images?.[0]?.url;
            const imageUrl = resolveImageUrl(image);
            return <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" key={vehicle.id}>
              <div className="flex min-w-0 items-center gap-3">
                {imageUrl ? <img className="h-12 w-16 shrink-0 rounded object-cover" src={imageUrl} alt="" /> : <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-[#f4f3f0] text-lg text-[#999]" aria-hidden="true">▱</div>}
                <span><span className="block font-semibold">{vehicle.name || `${vehicle.brand} ${vehicle.model}`}</span><span className="text-[#777]">{vehicle.brand} {vehicle.model} · {vehicle.plate_number}</span></span>
              </div>
              <div className="flex items-center gap-3"><span className="text-[#777]">{vehicle.partner_contracts[0]?.status ?? "No contract"}</span>{vehicle.aika_device_id && <button type="button" className="border border-black/15 px-3 py-2 text-xs font-semibold hover:border-[#ff641f]" onClick={() => void showLocation(vehicle)}>{selectedVehicleId === vehicle.id && locationLoading ? "Loading..." : "View GPS"}</button>}</div>
            </div>;
          })}</div>
          {selectedVehicle && <div className="mt-5 border-t border-black/10 pt-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Aika GPS</p><p className="mt-1 font-semibold">{selectedVehicle.name || `${selectedVehicle.brand} ${selectedVehicle.model}`}</p><p className="text-sm text-[#777]">{location ? `${location.is_stopped ? "In place" : "Moving"} · ${location.speed ?? 0} km/h` : "Location unavailable"}</p></div><button type="button" className="text-sm text-[#777] hover:text-[#151515]" onClick={() => { setSelectedVehicleId(null); setLocation(null); setLocationError(""); }}>Close</button></div>{locationError && <p className="mt-3 text-sm text-red-600">{locationError}</p>}{location && <div ref={mapRef} className="mt-4 h-72 w-full" />}</div>}
        </section>
        <section id="earnings" className="border border-black/10 bg-white p-6">
          <h2 className="text-xl font-semibold">Earnings and payouts</h2>
          <div className="mt-4 divide-y divide-black/10">{data.partner.earnings.map(earning => <div className="flex justify-between gap-4 py-3 text-sm" key={earning.id}><span>{earning.vehicle?.name || `${earning.vehicle?.brand ?? ""} ${earning.vehicle?.model ?? ""}`} · <span className="text-[#777]">{formatBusinessDate(earning.earned_at, earning.created_at)}</span></span><span className="shrink-0">₱{Number(earning.net_amount).toLocaleString()}</span></div>)}</div>
          <div className="mt-6 border-t border-black/10 pt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[#777]">Payout history</p>
            <div className="mt-2 divide-y divide-black/10">{data.partner.payouts.map(payout => <div className="flex flex-wrap justify-between gap-4 py-3 text-sm" key={payout.id}><div><p><span className="capitalize">{payout.status}</span> · <span className="text-[#777]">{formatBusinessDate(payout.paid_at, payout.created_at)}</span></p>{payout.payment_reference && <p className="mt-1 text-[#777]">Payment reference: {payout.payment_reference}</p>}{payout.notes && <p className="mt-1 text-[#777]">Notes: {payout.notes}</p>}</div><span className="shrink-0">₱{Number(payout.amount).toLocaleString()}</span></div>)}</div>
            <p className="mt-3 text-sm text-[#777]">Payouts recorded: {data.partner.payouts.length}</p>
          </div>
        </section>
      </div>}
    </HostShell>
  );
}
