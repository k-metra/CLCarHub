import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HostShell } from "../components/HostShell";
import { DateTimePicker } from "../components/DateTimePicker";
import { useAuth } from "../lib/AuthContext";
import api from "../lib/api";
import type { Paginated, VehicleRecord } from "../types";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");

const vehicleGroups = [
  { label: "Cars", types: ["sedan", "auv", "crossover", "mpv", "pickup", "suv", "hatchback"] },
  { label: "Motorcycles & big bikes", types: ["motorcycle"] },
  { label: "Vans & other vehicles", types: ["van"] },
];

function vehicleImage(vehicle: VehicleRecord): string | null {
  const image = vehicle.images?.find(item => item.image_type === "thumbnail") ?? vehicle.images?.[0];
  if (!image?.url) return null;
  if (image.url.startsWith("http")) return image.url;
  return `${apiOrigin}/storage/${image.url.replace(/^\/+/, "").replace(/^storage\//, "")}`;
}

function vehicleTitle(vehicle: VehicleRecord) {
  return vehicle.name || `${vehicle.brand} ${vehicle.model}`;
}

export default function HostMarketplacePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [bookingError, setBookingError] = useState("");

  useEffect(() => {
    api.get<Paginated<VehicleRecord>>("/vehicles?per_page=100")
      .then(response => setVehicles(response.data.data.filter(vehicle => vehicle.status === "available")))
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : "Unable to load vehicles"))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => vehicleGroups
    .map(group => ({ ...group, vehicles: vehicles.filter(vehicle => group.types.includes(vehicle.type)) }))
    .filter(group => group.vehicles.length > 0), [vehicles]);
  const selectedVehicle = vehicles.find(vehicle => String(vehicle.id) === searchParams.get("vehicle_id"));

  const submitBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVehicle || !user?.customer?.id || !pickupAt || !returnAt) return;
    setSaving(true);
    setBookingError("");
    try {
      await api.post("/bookings", {
        customer_id: user.customer.id,
        vehicle_id: selectedVehicle.id,
        pickup_at: pickupAt,
        return_at: returnAt,
        payment_method: "cash_on_pickup",
        status: "upcoming",
      });
      setSearchParams({});
    } catch (requestError) {
      setBookingError(requestError instanceof Error ? requestError.message : "Unable to submit rental");
    } finally {
      setSaving(false);
    }
  };

  return (
    <HostShell title="Rent a vehicle">
      <div className="mt-8">
        <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">MARKETPLACE</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-['Space_Grotesk'] text-3xl font-semibold tracking-[-1.5px] sm:text-4xl">Find your next ride</h2>
            <p className="mt-2 text-sm text-[#777]">Browse the available fleet by category and choose a vehicle to rent.</p>
          </div>
          <Link to="/host" className="text-sm font-semibold text-[#ff641f] hover:underline">Back to overview</Link>
        </div>
        {loading && <p className="mt-8 text-sm text-[#777]">Loading vehicles...</p>}
        {error && <p className="mt-8 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {!loading && !error && groups.length === 0 && <p className="mt-8 border border-black/10 bg-white p-6 text-sm text-[#777]">No vehicles are currently available.</p>}
        {selectedVehicle && <section className="mt-8 border border-black/10 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Rent this vehicle</p>
              <h3 className="mt-2 text-2xl font-semibold">{vehicleTitle(selectedVehicle)}</h3>
              <p className="mt-1 text-sm text-[#777]">{money.format(Number(selectedVehicle.daily_rate))} / day</p>
            </div>
            <button type="button" className="text-sm text-[#777] hover:text-[#151515]" onClick={() => setSearchParams({})}>Back to marketplace</button>
          </div>
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submitBooking}>
            <label className="text-sm font-semibold">Pickup<DateTimePicker required mode="datetime" minDate={new Date().toISOString().slice(0, 10)} value={pickupAt} onChange={setPickupAt} className="mt-2 w-full border border-black/10 px-3 py-3" /></label>
            <label className="text-sm font-semibold">Return<DateTimePicker required mode="datetime" minDate={new Date().toISOString().slice(0, 10)} value={returnAt} onChange={setReturnAt} className="mt-2 w-full border border-black/10 px-3 py-3" /></label>
            {bookingError && <p className="sm:col-span-2 text-sm text-red-600">{bookingError}</p>}
            <button type="submit" disabled={saving} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{saving ? "Submitting..." : "Submit rental request"}</button>
          </form>
        </section>}
        {!selectedVehicle && <div className="mt-8 space-y-10">
          {groups.map(group => (
            <section key={group.label}>
              <h3 className="text-xl font-bold">{group.label}</h3>
              <div className="mt-4 flex gap-5 overflow-x-auto pb-3">
                {group.vehicles.map(vehicle => {
                  const image = vehicleImage(vehicle);
                  const title = vehicleTitle(vehicle);
                  return (
                    <article key={vehicle.id} className="w-56 shrink-0">
                      <Link to={`/vehicles/${vehicle.id}`} aria-label={`View ${title}`} className="group block">
                        <div className="h-36 overflow-hidden rounded-2xl bg-[#e8e7e3]">
                          {image ? <img src={image} alt={title} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="h-full w-full" />}
                        </div>
                        <h4 className="mt-3 truncate text-base font-bold">{title}</h4>
                        <p className="mt-1 text-sm text-[#5f6870]">{money.format(Number(vehicle.daily_rate))} <span className="text-[#899198]">/ day</span></p>
                        <span className="mt-3 inline-block text-sm font-semibold text-[#ff641f] group-hover:underline">View vehicle →</span>
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>}
      </div>
    </HostShell>
  );
}
