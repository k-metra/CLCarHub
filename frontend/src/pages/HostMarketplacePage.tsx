import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HostShell } from "../components/HostShell";
import { DateTimePicker, type BookedDateRange } from "../components/DateTimePicker";
import api from "../lib/api";
import { addonChargeLabel } from "../lib/addons";
import { citiesByProvince, luzonProvinces } from "../lib/philippineLocations";
import type { AddonRecord, FleetSettings, Paginated, VehicleRecord } from "../types";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [pickupAt, setPickupAt] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [bookedDates, setBookedDates] = useState<BookedDateRange[]>([]);
  const [destination, setDestination] = useState("");
  const [destinationProvince, setDestinationProvince] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [notes, setNotes] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [paymentConfirmation, setPaymentConfirmation] = useState<{ bookingId: string; status: "success" | "cancelled"; reference?: string } | null>(null);
  const [addons, setAddons] = useState<AddonRecord[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);
  const [fleetSettings, setFleetSettings] = useState<FleetSettings | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<"reservation" | "full">("reservation");

  useEffect(() => {
    Promise.all([
      api.get<Paginated<VehicleRecord>>("/vehicles?per_page=100"),
      api.get<AddonRecord[]>("/addons?available_only=1"),
      api.get<FleetSettings>("/fleet-settings"),
    ])
      .then(([vehicleResponse, addonResponse, settingsResponse]) => {
        setVehicles(vehicleResponse.data.data.filter(vehicle => vehicle.status === "available"));
        setAddons(addonResponse.data.filter(addon => addon.is_rental && addon.status === "available"));
        setFleetSettings(settingsResponse.data);
      })
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : "Unable to load vehicles"))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => vehicleGroups
    .map(group => ({ ...group, vehicles: vehicles.filter(vehicle => group.types.includes(vehicle.type)) }))
    .filter(group => group.vehicles.length > 0), [vehicles]);
  const selectedVehicle = vehicles.find(vehicle => String(vehicle.id) === searchParams.get("vehicle_id"));
  const selectedVehicleId = selectedVehicle?.id;

  useEffect(() => {
    if (!selectedVehicleId) return;
    const reset = window.setTimeout(() => {
      setStep(1);
      setPickupAt("");
      setReturnAt("");
      setSelectedAddonIds([]);
      setPaymentChoice("reservation");
      setBookingError("");
      setSubmitted(false);
    }, 0);
    api.get<{ booked_dates: BookedDateRange[] }>(`/vehicles/${selectedVehicleId}/booked-dates`)
      .then(response => setBookedDates(response.data.booked_dates))
      .catch(() => setBookedDates([]));
    return () => window.clearTimeout(reset);
  }, [selectedVehicleId]);

  useEffect(() => {
    const payment = searchParams.get("payment");
    const bookingId = searchParams.get("booking");
    if (!bookingId || !payment || !["success", "cancelled"].includes(payment)) return;
    api.get<{ reference?: string }>(`/customer/booking-requests/${bookingId}`)
      .then(response => setPaymentConfirmation({ bookingId, status: payment as "success" | "cancelled", reference: response.data.reference }))
      .catch(() => setPaymentConfirmation({ bookingId, status: payment as "success" | "cancelled" }));
  }, [searchParams]);

  const rentalMinutes = pickupAt && returnAt ? Math.ceil((new Date(returnAt).getTime() - new Date(pickupAt).getTime()) / 60000) : 0;
  const rentalDays = Math.max(1, Math.floor(rentalMinutes / 1440));
  const outsideLaguna = destinationProvince !== "" && destinationProvince !== "Laguna";
  const usesOutsideLagunaRate = outsideLaguna && selectedVehicle?.outside_laguna_rate != null;
  const dailyRate = Number(outsideLaguna ? (selectedVehicle?.outside_laguna_rate ?? selectedVehicle?.daily_rate) : selectedVehicle?.daily_rate ?? 0);
  const rentalAmount = rentalMinutes > 0 && rentalMinutes <= 720
    ? Number(selectedVehicle?.twelve_hour_rate ?? Number(selectedVehicle?.daily_rate ?? 0) * 0.5)
    : rentalDays * dailyRate;
  const eligibleAddons = addons.filter(addon => selectedVehicle && addon.vehicle_types.includes(selectedVehicle.type));
  const addonTotal = eligibleAddons.filter(addon => selectedAddonIds.includes(addon.id)).reduce((total, addon) => total + addon.pricing_tiers.reduce((sum, tier) => {
    const from = Number(tier.from_day);
    const to = tier.to_day == null ? rentalDays : Math.min(rentalDays, Number(tier.to_day));
    const days = Math.max(0, to - from + 1);
    return sum + (tier.billing === "per_day" ? Number(tier.price) * days : days > 0 ? Number(tier.price) : 0);
  }, 0), 0);
  const reservationFee = Number(fleetSettings?.reservation_fee ?? 0);
  const bookingTotal = rentalAmount + addonTotal + (fleetSettings?.reservation_fee_deductible ? 0 : reservationFee);
  const paymentAmount = paymentChoice === "full" ? bookingTotal : Math.min(reservationFee, bookingTotal);

  const checkAvailability = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVehicle || !pickupAt || !returnAt) return;
    setSaving(true);
    setBookingError("");
    try {
      const response = await api.get<{ available: boolean }>(`/vehicles/${selectedVehicle.id}/availability`, { params: { pickup_at: pickupAt, return_at: returnAt } });
      if (!response.data.available) throw new Error("This vehicle is not available for the selected schedule.");
      setStep(2);
    } catch (requestError) {
      setBookingError(requestError instanceof Error ? requestError.message : "Unable to check availability.");
    } finally {
      setSaving(false);
    }
  };

  const submitBooking = async () => {
    if (!selectedVehicle || !pickupAt || !returnAt || !termsAccepted) return;
    setSaving(true);
    setBookingError("");
    try {
      const response = await api.post<{ checkout_url?: string }>("/customer/booking-requests", {
        vehicle_id: selectedVehicle.id,
        pickup_at: pickupAt,
        return_at: returnAt,
        addons: selectedAddonIds,
        destination: destination.trim() || null,
        destination_province: destinationProvince,
        destination_city: destinationCity,
        notes: notes.trim() || null,
        payment_method: "cash_on_pickup",
        payment_amount: paymentAmount,
      });
      if (response.data.checkout_url) window.location.assign(response.data.checkout_url);
      else setSubmitted(true);
    } catch (requestError) {
      setBookingError(requestError instanceof Error ? requestError.message : "Unable to submit rental request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <HostShell title="Rent a vehicle">
      <div className="mt-8">
        {paymentConfirmation && <section className={`mb-8 border p-6 ${paymentConfirmation.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <p className="text-xs font-bold uppercase tracking-widest">{paymentConfirmation.status === "success" ? "Payment received" : "Payment cancelled"}</p>
          <h2 className="mt-2 text-2xl font-semibold">{paymentConfirmation.status === "success" ? "Your booking request is confirmed" : "Your booking request is still pending"}</h2>
          <p className="mt-2 text-sm">{paymentConfirmation.status === "success" ? "Your payment was received and your request has been sent to CLCarHub for review." : "No payment was recorded. You can review the request and try payment again from your bookings."}</p>
          {paymentConfirmation.reference && <p className="mt-3 text-sm font-semibold">Booking reference: {paymentConfirmation.reference}</p>}
          <Link to={`/host/rentals?booking=${paymentConfirmation.bookingId}`} className="mt-5 inline-block bg-[#ff641f] px-5 py-3 text-sm font-bold text-white">View booking →</Link>
        </section>}
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
          {submitted ? <div className="mt-6 border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800"><p className="font-bold">Rental request submitted.</p><p className="mt-1">Our team will review your request and contact you with the next steps.</p><button type="button" className="mt-4 font-semibold underline" onClick={() => setSearchParams({})}>Return to marketplace</button></div> : <><div className="mt-6 grid grid-cols-3 gap-2">{["Vehicle & schedule", "Trip details", "Checkout"].map((label, index) => <div key={label} className={`border-t-4 p-3 text-xs font-bold ${step === index + 1 ? "border-[#ff641f] text-[#ff641f]" : step > index + 1 ? "border-emerald-500 text-emerald-700" : "border-black/10 text-[#999]"}`}><span>0{index + 1}</span><p className="mt-1 hidden sm:block">{label}</p></div>)}</div>
          {step === 1 && <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={checkAvailability}><label className="text-sm font-semibold">Pickup<DateTimePicker required mode="datetime" minDate={new Date().toISOString().slice(0, 10)} bookedDates={bookedDates} value={pickupAt} onChange={setPickupAt} className="mt-2 w-full border border-black/10 px-3 py-3" placeholder="Choose pickup date and time" /></label><label className="text-sm font-semibold">Return<DateTimePicker required mode="datetime" minDate={new Date().toISOString().slice(0, 10)} bookedDates={bookedDates} value={returnAt} onChange={setReturnAt} className="mt-2 w-full border border-black/10 px-3 py-3" placeholder="Choose return date and time" /></label>{bookingError && <p className="sm:col-span-2 text-sm text-red-600">{bookingError}</p>}<button type="submit" disabled={saving} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{saving ? "Checking..." : "Check availability →"}</button></form>}
          {step === 2 && <form className="mt-4 grid gap-4" onSubmit={event => { event.preventDefault(); setStep(3); }}><h4 className="text-sm font-bold">Available add-ons</h4>{eligibleAddons.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{eligibleAddons.map(addon => <label key={addon.id} className={`cursor-pointer border p-3 text-sm ${selectedAddonIds.includes(addon.id) ? "border-[#ff641f] bg-[#fff7f3]" : "border-black/10"}`}><input type="checkbox" checked={selectedAddonIds.includes(addon.id)} onChange={() => setSelectedAddonIds(current => current.includes(addon.id) ? current.filter(id => id !== addon.id) : [...current, addon.id])} /><span className="ml-2 font-semibold">{addon.name}</span><span className="mt-1 block text-xs text-[#777]">{addonChargeLabel(addon.pricing_tiers, rentalDays)}</span></label>)}</div> : <p className="text-sm text-[#777]">No add-ons are available for this vehicle category.</p>}          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Province<select required value={destinationProvince} onChange={event => { setDestinationProvince(event.target.value); setDestinationCity(""); }} className="mt-2 w-full border border-black/10 px-3 py-3"><option value="">Select province</option>          {luzonProvinces.map(province => <option key={province} value={province}>{province}</option>)}</select></label><label className="text-sm font-semibold">City / Municipality<select required value={destinationCity} onChange={event => setDestinationCity(event.target.value)} disabled={!destinationProvince} className="mt-2 w-full border border-black/10 px-3 py-3"><option value="">Select city / municipality</option>{(citiesByProvince[destinationProvince] ?? ["Other city / municipality"]).map(city => <option key={city} value={city}>{city}</option>)}</select></label></div><label className="text-sm font-semibold">Destination details <span className="font-normal text-[#777]">(optional)</span><input value={destination} onChange={event => setDestination(event.target.value)} className="mt-2 w-full border border-black/10 px-3 py-3" placeholder="Barangay, street, building or landmark" /></label><label className="text-sm font-semibold">Notes <span className="font-normal text-[#777]">(optional)</span><textarea value={notes} onChange={event => setNotes(event.target.value)} className="mt-2 min-h-24 w-full border border-black/10 px-3 py-3" /></label><div className="flex gap-3"><button type="button" className="border border-black/10 px-5 py-3 text-sm font-semibold" onClick={() => setStep(1)}>Back</button><button type="submit" className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white">Continue to checkout →</button></div></form>}
          {step === 3 && <div className="mt-4 space-y-4"><div className="grid gap-3 border border-black/10 bg-[#f8f7f5] p-4 text-sm sm:grid-cols-2"><p><span className="block text-xs uppercase text-[#888]">Pickup</span>{new Date(pickupAt).toLocaleString()}</p><p><span className="block text-xs uppercase text-[#888]">Return</span>{new Date(returnAt).toLocaleString()}</p>          <p><span className="block text-xs uppercase text-[#888]">Rental total{usesOutsideLagunaRate ? " · Outside Laguna rate" : ""}</span>{money.format(bookingTotal)}</p><p><span className="block text-xs uppercase text-[#888]">Payment method</span>Payment aggregator</p></div><div className="space-y-2 text-sm"><p className="font-semibold">Choose payment amount</p><label className="block"><input type="radio" checked={paymentChoice === "reservation"} onChange={() => setPaymentChoice("reservation")} /> <span className="ml-1">Reservation fee / minimum downpayment: {money.format(reservationFee)}</span></label><label className="block"><input type="radio" checked={paymentChoice === "full"} onChange={() => setPaymentChoice("full")} /> <span className="ml-1">Pay in full: {money.format(bookingTotal)}</span></label></div><label className="flex gap-3 text-sm"><input type="checkbox" checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} />I agree to the rental terms and understand this request requires confirmation by CLCarHub.</label>{bookingError && <p className="text-sm text-red-600">{bookingError}</p>}<div className="flex gap-3"><button type="button" className="border border-black/10 px-5 py-3 text-sm font-semibold" onClick={() => setStep(2)}>Back</button><button type="button" disabled={!termsAccepted || saving || paymentAmount <= 0} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" onClick={() => void submitBooking()}>{saving ? "Opening payment..." : "Continue to payment →"}</button></div></div>}</>}
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
