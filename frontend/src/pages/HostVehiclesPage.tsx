import { useRef, useState, useEffect } from "react";
import { HostShell } from "../components/HostShell";
import L from "../lib/leaflet";
import { useHostDashboard, type HostVehicle } from "../lib/hostPortal";
import api from "../lib/api";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
function resolveImageUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.pathname.startsWith("/storage/") ? `${apiOrigin}${parsed.pathname}${parsed.search}` : parsed.toString();
  } catch {
    return `${apiOrigin}/${value.replace(/^\/+/, "")}`;
  }
}
type VehicleLocation = { latitude: number; longitude: number; speed?: number | null; is_stopped?: boolean };

export default function HostVehiclesPage() {
  const { data, error, loading } = useHostDashboard();
  const [search, setSearch] = useState("");
  const [contractFilter, setContractFilter] = useState("all");
  const [selectedVehicle, setSelectedVehicle] = useState<HostVehicle | null>(null);
  const [location, setLocation] = useState<VehicleLocation | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState<number | null>(null);
  const [statusError, setStatusError] = useState("");
  const [vehicleStatuses, setVehicleStatuses] = useState<Record<number, HostVehicle["status"]>>({});
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const vehicles = data?.partner.vehicles.filter(vehicle => {
    const haystack = `${vehicle.name ?? ""} ${vehicle.brand} ${vehicle.model} ${vehicle.plate_number}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (contractFilter === "all" || (vehicle.partner_contracts[0]?.status ?? "none") === contractFilter);
  }) ?? [];
  const showLocation = async (vehicle: HostVehicle) => {
    setSelectedVehicle(vehicle);
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
  const updateStatus = async (vehicle: HostVehicle, status: "available" | "unavailable" | "maintenance") => {
    setStatusSaving(vehicle.id);
    setStatusError("");
    try {
      await api.patch(`/host/vehicles/${vehicle.id}/status`, { status });
      setVehicleStatuses(current => ({ ...current, [vehicle.id]: status }));
    } catch (requestError) {
      setStatusError(requestError instanceof Error ? requestError.message : "Unable to update vehicle status");
    } finally {
      setStatusSaving(null);
    }
  };
  useEffect(() => {
    if (!location || !mapRef.current || !selectedVehicle) return;
    mapInstance.current?.remove();
    const map = L.map(mapRef.current).setView([location.latitude, location.longitude], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    L.marker([location.latitude, location.longitude]).addTo(map).bindPopup(`${selectedVehicle.name || `${selectedVehicle.brand} ${selectedVehicle.model}`}<br>${location.is_stopped ? "In place" : "Moving"} · ${location.speed ?? 0} km/h`).openPopup();
    mapInstance.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapInstance.current = null; };
  }, [location, selectedVehicle]);
  return <HostShell title="Authorized vehicles">
    {loading && <p className="mt-8 text-sm text-[#777]">Loading vehicles...</p>}
    {error && <p className="mt-8 text-sm text-red-600">{error}</p>}
    {data && <section className="mt-8 border border-black/10 bg-white p-6">
      <div className="flex flex-wrap gap-3"><input className="min-w-60 flex-1 border border-black/15 p-3 text-sm" placeholder="Search name, make, model, or plate" value={search} onChange={event => setSearch(event.target.value)} /><select className="border border-black/15 bg-white p-3 text-sm" value={contractFilter} onChange={event => setContractFilter(event.target.value)}><option value="all">All contract statuses</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="draft">Draft</option><option value="suspended">Suspended</option><option value="expired">Expired</option><option value="none">No contract</option></select></div>
      {statusError && <p className="mt-4 text-sm text-red-600" role="alert">{statusError}</p>}
      <div className="mt-6 divide-y divide-black/10 border-t border-black/10">{vehicles.map(vehicle => {
        const imageUrl = resolveImageUrl(vehicle.images?.find(image => image.is_primary)?.url ?? vehicle.images?.[0]?.url);
        const status = vehicleStatuses[vehicle.id] ?? vehicle.status;
        return <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm" key={vehicle.id}><div className="flex items-center gap-3">{imageUrl ? <img className="h-12 w-16 rounded object-cover" src={imageUrl} alt="" /> : <div className="flex h-12 w-16 items-center justify-center rounded bg-[#f4f3f0] text-lg text-[#999]">▱</div>}<span><span className="block font-semibold">{vehicle.name || `${vehicle.brand} ${vehicle.model}`}</span><span className="text-[#777]">{vehicle.brand} {vehicle.model} · {vehicle.plate_number}</span></span></div><div className="flex flex-wrap items-center justify-end gap-3"><label className="text-xs text-[#777]">Status<select className="ml-2 border border-black/15 bg-white px-2 py-2 text-xs font-semibold text-[#151515]" value={status} disabled={statusSaving === vehicle.id} onChange={event => void updateStatus(vehicle, event.target.value as "available" | "unavailable" | "maintenance")}><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="maintenance">In Maintenance</option></select></label><span className="text-[#777]">{vehicle.partner_contracts[0]?.status ?? "No contract"}</span>{vehicle.aika_device_id && <button type="button" className="border border-black/15 px-3 py-2 text-xs font-semibold hover:border-[#ff641f]" onClick={() => void showLocation(vehicle)}>{selectedVehicle?.id === vehicle.id && locationLoading ? "Loading..." : "View GPS"}</button>}</div></div>;
      })}</div>
      {vehicles.length === 0 && <p className="mt-6 text-sm text-[#777]">No vehicles match your search or filter.</p>}
      {selectedVehicle && <div className="mt-5 border-t border-black/10 pt-5"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Aika GPS</p><p className="mt-1 font-semibold">{selectedVehicle.name || `${selectedVehicle.brand} ${selectedVehicle.model}`}</p></div><button type="button" className="text-sm text-[#777]" onClick={() => { setSelectedVehicle(null); setLocation(null); }}>Close</button></div>{locationError && <p className="mt-3 text-sm text-red-600">{locationError}</p>}{location && <div ref={mapRef} className="mt-4 h-72 w-full" />}</div>}
    </section>}
  </HostShell>;
}
