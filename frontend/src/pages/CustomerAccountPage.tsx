import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import L from "../lib/leaflet";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { DateTimePicker } from "../components/DateTimePicker";
import { useToast } from "../components/Ui";
import api from "../lib/api";
import { displayName, useAuth, useSignOut } from "../lib/AuthContext";
import type { BookingRecord, CustomerAttachment, FleetSettings, Paginated, VehicleRecord } from "../types";
import { LocationPicker } from "../components/LocationPicker";

type Tab = "overview" | "calendar" | "request";
type PaymentMethod = "cash_on_pickup" | "cash_on_delivery";
type AttachmentCategory = "license" | "secondary_id" | "ltms" | "selfie_license";
type CustomerResult = { id: number; name: string; phone?: string | null; email?: string | null; attachments?: CustomerAttachment[] };
type PlaceResult = { name: string; displayName: string; latitude: number; longitude: number };

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const attachmentRequirements: Array<[AttachmentCategory, string, number]> = [
  ["license", "Physical driver's license (front & back)", 2],
  ["secondary_id", "Secondary ID", 2],
  ["ltms", "LTMS portal photos", 4],
  ["selfie_license", "Selfie with driver's license", 1],
];
const dateTime = (value?: string) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
const monthTitle = (date: Date) => date.toLocaleDateString([], { month: "long", year: "numeric" });
const statusClass = (status: string) => ["upcoming", "ongoing"].includes(status) ? "bg-emerald-50 text-emerald-700" : ["cancelled", "rejected"].includes(status) ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
const calendarDays = (month: Date) => { const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = new Date(first); start.setDate(first.getDate() - first.getDay()); return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; }); };
const emptyForm = { vehicle_id: "", pickup_date: "", pickup_time: "09:00", return_date: "", return_time: "09:00", destination: "", delivery_address: "", return_location_mode: "garage" as "garage" | "location", return_address: "", notes: "", payment_method: "cash_on_pickup" as PaymentMethod };

function DeliveryMap({ center, position, onPin }: { center: [number, number]; position: [number, number] | null; onPin: (latitude: number, longitude: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const initialCenterRef = useRef(center);
  const onPinRef = useRef(onPin);
  useEffect(() => { onPinRef.current = onPin; }, [onPin]);
  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(initialCenterRef.current, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    map.on("click", event => onPinRef.current(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);
  useEffect(() => { mapRef.current?.setView(center, Math.max(mapRef.current.getZoom(), 15)); }, [center]);
  useEffect(() => {
    markerRef.current?.remove();
    markerRef.current = mapRef.current && position ? L.circleMarker(position, { radius: 10, color: "#ff641f", fillColor: "#ff641f", fillOpacity: 0.85 }).addTo(mapRef.current) : null;
  }, [position]);
  return <div ref={containerRef} className="h-64 w-full" />;
}

export default function CustomerAccountPage() {
  const { user, loading } = useAuth(); const signOut = useSignOut(); const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => searchParams.get("tab") === "request" ? "request" : "overview"); const [step, setStep] = useState(1);
  const [bookings, setBookings] = useState<BookingRecord[]>([]); const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [fleetSettings, setFleetSettings] = useState<FleetSettings>({ reservation_fee: "0", reservation_fee_deductible: true, default_hour_extension_rate: "200", full_day_extension_threshold_hours: 12, late_return_grace_period_minutes: 60, default_delivery_rate_per_km: "0", garage_location_name: null, garage_location_address: null, garage_location_latitude: null, garage_location_longitude: null, terms_and_conditions: null, privacy_policy: null });
  const [month, setMonth] = useState(() => new Date()); const [loadingData, setLoadingData] = useState(true); const [submitting, setSubmitting] = useState(false); const [checking, setChecking] = useState(false);
  const [customer, setCustomer] = useState<CustomerResult | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [rentalTermsAccepted, setRentalTermsAccepted] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [deliveryCenter, setDeliveryCenter] = useState<[number, number]>([14.5995, 120.9842]);
  const [deliveryPosition, setDeliveryPosition] = useState<[number, number] | null>(null);
  const [deliveryPlaces, setDeliveryPlaces] = useState<PlaceResult[]>([]);
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliverySearching, setDeliverySearching] = useState(false);
  const [deliveryLocating, setDeliveryLocating] = useState(false);
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null);
  const [returnPosition, setReturnPosition] = useState<[number, number] | null>(null);
  const [files, setFiles] = useState<Record<AttachmentCategory, File[]>>({ license: [], secondary_id: [], ltms: [], selfie_license: [] });
  const filePreviewUrls = useMemo(() => {
    const previews: Record<AttachmentCategory, string[]> = { license: [], secondary_id: [], ltms: [], selfie_license: [] };
    (Object.keys(files) as AttachmentCategory[]).forEach(category => {
      previews[category] = files[category].map(file => URL.createObjectURL(file));
    });
    return previews;
  }, [files]);

  const load = async () => {
    try {
      const requests: [Promise<{ data: Paginated<BookingRecord> }>, Promise<{ data: Paginated<VehicleRecord> }>, Promise<{ data: CustomerResult }>, Promise<{ data: FleetSettings }>] = [
        api.get("/customer/booking-requests?per_page=100"), api.get("/vehicles?per_page=100"), api.get("/customer/profile"), api.get<FleetSettings>("/fleet-settings"),
      ];
      const [bookingResponse, vehicleResponse, customerResponse, settingsResponse] = await Promise.all(requests);
      setBookings(bookingResponse.data.data); setVehicles(vehicleResponse.data.data.filter(vehicle => vehicle.status === "available")); setCustomer(customerResponse.data); setFleetSettings(settingsResponse.data);
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to load your dashboard", "error"); } finally { setLoadingData(false); }
  };
  useEffect(() => {
    if (user?.role !== "customer") return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // load is intentionally scoped to this page and refreshed when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  useEffect(() => {
    const vehicleId = searchParams.get("vehicle_id");
    const pickupAt = searchParams.get("pickup_at");
    const returnAt = searchParams.get("return_at");
    if (!vehicleId && !pickupAt && !returnAt) return;
    const timer = window.setTimeout(() => {
      setForm(current => ({
        ...current,
        ...(vehicleId && vehicles.some(vehicle => String(vehicle.id) === vehicleId) ? { vehicle_id: vehicleId } : {}),
        ...(pickupAt ? { pickup_date: pickupAt.slice(0, 10), pickup_time: pickupAt.slice(11, 16) } : {}),
        ...(returnAt ? { return_date: returnAt.slice(0, 10), return_time: returnAt.slice(11, 16) } : {}),
      }));
      setTab("request");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams, vehicles]);

  const upcoming = bookings.filter(booking => !["complete", "cancelled", "rejected"].includes(booking.status) && new Date(booking.return_at) >= new Date()).sort((a, b) => new Date(a.pickup_at).getTime() - new Date(b.pickup_at).getTime());
  const pending = bookings.filter(booking => booking.status === "pending"); const totalSpent = bookings.reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0); const days = useMemo(() => calendarDays(month), [month]);
  const bookingOnDay = (day: Date) => bookings.filter(booking => { const start = new Date(booking.pickup_at); const end = new Date(booking.return_at); return day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) && day <= new Date(end.getFullYear(), end.getMonth(), end.getDate()); });
  const selectedVehicle = vehicles.find(vehicle => String(vehicle.id) === form.vehicle_id);
  const filteredVehicles = vehicles.filter(vehicle => `${vehicle.name} ${vehicle.brand} ${vehicle.model} ${vehicle.plate_number} ${vehicle.color} ${vehicle.type}`.toLowerCase().includes(vehicleSearch.toLowerCase().trim()));
  const rentalDays = form.pickup_date && form.return_date ? Math.max(1, Math.floor((new Date(`${form.return_date}T${form.return_time}`).getTime() - new Date(`${form.pickup_date}T${form.pickup_time}`).getTime()) / 86400000)) : 0;
  const rentalMinutes = form.pickup_date && form.return_date ? Math.ceil((new Date(`${form.return_date}T${form.return_time}`).getTime() - new Date(`${form.pickup_date}T${form.pickup_time}`).getTime()) / 60000) : 0;
  const extensionHours = Math.ceil(Math.max(0, (rentalMinutes % (24 * 60)) - fleetSettings.late_return_grace_period_minutes) / 60);
  const hourlyRate = Number(selectedVehicle?.hour_extension_rate ?? fleetSettings.default_hour_extension_rate);
  const extensionAmount = extensionHours === 0 ? 0 : extensionHours >= fleetSettings.full_day_extension_threshold_hours ? Number(selectedVehicle?.daily_rate ?? 0) : extensionHours * hourlyRate;
  const rentalAmount = rentalDays * Number(selectedVehicle?.daily_rate ?? 0) + extensionAmount; const reservationFee = Number(fleetSettings.reservation_fee); const existingAttachmentCount = (category: AttachmentCategory) => customer?.attachments?.filter(item => item.category === category).length ?? 0; const requirementComplete = (category: AttachmentCategory) => existingAttachmentCount(category) + files[category].length >= 1;
  const deliveryRate = Number(selectedVehicle?.delivery_rate_per_km ?? fleetSettings.default_delivery_rate_per_km);
  const deliveryFee = deliveryDistance === null ? 0 : Math.round(deliveryDistance * deliveryRate * 100) / 100;

  useEffect(() => {
    if (form.payment_method !== "cash_on_delivery" || !deliveryPosition || fleetSettings.garage_location_latitude === null || fleetSettings.garage_location_longitude === null) {
      return;
    }
    let cancelled = false;
    const [originLat, originLon] = [fleetSettings.garage_location_latitude, fleetSettings.garage_location_longitude];
    const [destinationLat, destinationLon] = deliveryPosition;
    fetch(`https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destinationLon},${destinationLat}?overview=false`)
      .then(response => response.json() as Promise<{ code?: string; routes?: Array<{ distance?: number }> }>)
      .then(data => {
        if (!cancelled) setDeliveryDistance(data.code === "Ok" && data.routes?.[0]?.distance ? Math.round(data.routes[0].distance / 10) / 100 : null);
      })
      .catch(() => { if (!cancelled) setDeliveryDistance(null); })
    return () => { cancelled = true; };
  }, [deliveryPosition, fleetSettings.garage_location_latitude, fleetSettings.garage_location_longitude, form.payment_method]);

  const setField = (key: keyof typeof emptyForm, value: string) => setForm(current => ({ ...current, [key]: value }));
  const pinDeliveryLocation = (latitude: number, longitude: number, name: string, address: string | null) => {
    setDeliveryPosition([latitude, longitude]);
    setDeliveryCenter([latitude, longitude]);
    setDeliveryPlaces([]);
    setField("delivery_address", address ?? name);
  };
  const searchDeliveryLocation = async () => {
    if (!deliverySearch.trim()) return;
    setDeliverySearching(true);
    try {
      const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: deliverySearch.trim(), limit: "8", lang: "en" })}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Location search is temporarily unavailable.");
      const data = await response.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: { name?: string; street?: string; housenumber?: string; city?: string; state?: string; country?: string } }> };
      setDeliveryPlaces((data.features ?? []).flatMap(feature => {
        const coordinates = feature.geometry?.coordinates;
        if (!coordinates) return [];
        const properties = feature.properties ?? {};
        const name = properties.name ?? "Unnamed location";
        const address = [properties.housenumber && properties.street ? `${properties.housenumber} ${properties.street}` : properties.street, properties.city, properties.state, properties.country].filter(Boolean).join(", ");
        return [{ name, displayName: address ? `${name}, ${address}` : name, latitude: coordinates[1], longitude: coordinates[0] }];
      }));
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to search for that location", "error"); } finally { setDeliverySearching(false); }
  };
  const useCurrentDeliveryLocation = () => {
    if (!navigator.geolocation) { showToast("Current location is not supported by this browser.", "error"); return; }
    setDeliveryLocating(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const { latitude, longitude } = coords;
      try {
        const response = await fetch(`https://photon.komoot.io/reverse?${new URLSearchParams({ lat: String(latitude), lon: String(longitude), lang: "en" })}`, { headers: { Accept: "application/json" } });
        const data = await response.json() as { features?: Array<{ properties?: { name?: string; street?: string; housenumber?: string; city?: string; state?: string; country?: string } }> };
        const properties = data.features?.[0]?.properties;
        const name = properties?.name ?? "Current delivery location";
        const address = [properties?.housenumber && properties.street ? `${properties.housenumber} ${properties.street}` : properties?.street, properties?.city, properties?.state, properties?.country].filter(Boolean).join(", ");
        pinDeliveryLocation(latitude, longitude, name, address || null);
      } catch { pinDeliveryLocation(latitude, longitude, "Current delivery location", null); }
      setDeliveryLocating(false);
    }, error => { showToast(error.code === error.PERMISSION_DENIED ? "Location permission was denied." : "Unable to determine your current location.", "error"); setDeliveryLocating(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };
  const openBookingDetails = async (booking: BookingRecord) => {
    setSelectedBooking(booking);
    setBookingDetailLoading(true);
    try {
      const result = await api.get<BookingRecord>(`/customer/booking-requests/${booking.id}`);
      setSelectedBooking(result.data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load booking details", "error");
    } finally {
      setBookingDetailLoading(false);
    }
  };
  const addFiles = (category: AttachmentCategory, selectedFiles: FileList | null, limit: number) => {
    const newFiles = selectedFiles ? Array.from(selectedFiles) : [];
    if (!newFiles.length) return;
    setFiles(current => {
      const remaining = Math.max(0, limit - existingAttachmentCount(category) - current[category].length);
      return { ...current, [category]: [...current[category], ...newFiles.slice(0, remaining)] };
    });
  };
  useEffect(() => () => {
    Object.values(filePreviewUrls).flat().forEach(url => URL.revokeObjectURL(url));
  }, [filePreviewUrls]);
  const schedule = () => ({ pickup_at: `${form.pickup_date}T${form.pickup_time}:00`, return_at: `${form.return_date}T${form.return_time}:00` });
  const checkAvailability = async (event: FormEvent) => {
    event.preventDefault(); if (!selectedVehicle) return;
    setChecking(true);
    try {
      const result = await api.get<{ available: boolean; conflicts?: { pickup_at: string; return_at: string }[] }>(`/vehicles/${selectedVehicle.id}/availability`, { params: schedule() });
      if (!result.data.available) {
        const conflictText = result.data.conflicts?.length
          ? result.data.conflicts.map(conflict => `${dateTime(conflict.pickup_at)} to ${dateTime(conflict.return_at)}`).join("; ")
          : `${dateTime(schedule().pickup_at)} to ${dateTime(schedule().return_at)}`;
        showToast(`Unavailable: ${selectedVehicle.name || `${selectedVehicle.brand} ${selectedVehicle.model}`} is booked during ${conflictText}.`, "error");
        return;
      }
      showToast("Vehicle is available for your selected schedule.", "success"); setStep(2);
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to check availability", "error"); } finally { setChecking(false); }
  };
  const uploadAttachments = async () => {
    if (!customer) throw new Error("We could not find your customer profile. Please contact CLCarHub.");
    if (!customer.phone?.trim()) throw new Error("Please provide your contact phone number before continuing.");
    const payload = new FormData(); payload.append("_method", "PATCH"); payload.append("name", customer.name); payload.append("phone", customer.phone ?? ""); if (customer.email) payload.append("email", customer.email);
    let index = 0; Object.entries(files).forEach(([category, selected]) => selected.forEach(file => { payload.append(`attachments[${index}][category]`, category); payload.append(`attachments[${index}][file]`, file); index += 1; }));
    if (index) { const result = await api.post<CustomerResult>(`/customers/${customer.id}`, payload); setCustomer(result.data); }
  };
  const proceedDetails = async () => {
    if (form.payment_method === "cash_on_delivery" && (!deliveryPosition || deliveryDistance === null)) { showToast("Please select a delivery location and wait for the road distance to be calculated.", "error"); return; }
    const missing = attachmentRequirements.filter(([category]) => existingAttachmentCount(category) + files[category].length < 1);
    if (missing.length) { showToast(`Please provide: ${missing.map(([, label]) => label).join(", ")}.`, "error"); return; }
    try { setSubmitting(true); await uploadAttachments(); setStep(3); } catch (error) { showToast(error instanceof Error ? error.message : "Unable to upload identity attachments", "error"); } finally { setSubmitting(false); }
  };
  const submitRequest = async () => {
    if (!rentalTermsAccepted) {
      showToast("Please agree to the rental terms before submitting your request.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const total = rentalDays * Number(selectedVehicle?.daily_rate ?? 0) + Number(fleetSettings.reservation_fee) + Number(selectedVehicle?.security_deposit_fee ?? 0);
      const payment = Number(fleetSettings.reservation_fee);
      if (!Number.isFinite(payment) || payment < Number(fleetSettings.reservation_fee) || payment > total) throw new Error("Payment must be at least the reservation fee and no more than the booking total.");
      const result = await api.post<{ checkout_url?: string }>("/customer/booking-requests", { vehicle_id: Number(form.vehicle_id), ...schedule(), destination: form.destination || null, delivery_address: form.payment_method === "cash_on_delivery" ? form.delivery_address : null, delivery_latitude: form.payment_method === "cash_on_delivery" ? deliveryPosition?.[0] : null, delivery_longitude: form.payment_method === "cash_on_delivery" ? deliveryPosition?.[1] : null, return_address: form.return_location_mode === "location" ? form.return_address || null : null, return_latitude: form.return_location_mode === "location" ? returnPosition?.[0] ?? null : null, return_longitude: form.return_location_mode === "location" ? returnPosition?.[1] ?? null : null, notes: form.notes || null, payment_method: form.payment_method, payment_amount: payment });
      if (result.data.checkout_url) window.location.assign(result.data.checkout_url); else showToast("Booking request submitted.", "success");
      setForm(emptyForm); setRentalTermsAccepted(false); setDeliveryPosition(null); setReturnPosition(null); setDeliveryDistance(null); setDeliveryPlaces([]); setDeliverySearch(""); setFiles({ license: [], secondary_id: [], ltms: [], selfie_license: [] }); setStep(1); await load(); setTab("overview");
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to submit booking request", "error"); } finally { setSubmitting(false); }
  };

  if (loading) return null; if (!user) return <Navigate to="/admin/login" replace />; if (user.role !== "customer") return <Navigate to="/admin" replace />;
  const input = "mt-2 w-full border border-black/10 px-3 py-3"; const steps = ["Vehicle & schedule", "Trip details", "Checkout"];
  const requestForm = <section className="mt-8"><div className="mb-6 grid grid-cols-3 gap-2">{steps.map((label, index) => <div key={label} className={`border-t-4 p-3 text-xs font-bold ${step === index + 1 ? "border-[#ff641f] text-[#ff641f]" : step > index + 1 ? "border-emerald-500 text-emerald-700" : "border-black/10 text-[#999]"}`}><span>0{index + 1}</span><p className="mt-1 hidden sm:block">{label}</p></div>)}</div>
    {step === 1 && <form onSubmit={checkAvailability} className="border border-black/10 bg-white p-5 sm:p-8"><h2 className="font-['Space_Grotesk'] text-2xl font-semibold">Choose a vehicle and schedule</h2><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]"><div><label className="text-sm font-semibold">Search vehicles<input type="search" className={input} value={vehicleSearch} onChange={event => setVehicleSearch(event.target.value)} placeholder="Search name, model, plate, color..." /></label><p className="mt-4 text-sm font-semibold">Vehicle</p><div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">{filteredVehicles.map(vehicle => { const name = vehicle.name || `${vehicle.brand} ${vehicle.model}`; const selected = form.vehicle_id === String(vehicle.id); return <button type="button" key={vehicle.id} onClick={() => setField("vehicle_id", String(vehicle.id))} className={`flex w-full items-center gap-3 rounded border p-3 text-left transition ${selected ? "border-[#ff641f] bg-[#fff7f3] ring-1 ring-[#ff641f]" : "border-black/10 hover:border-[#ff641f]"}`}><span className="h-16 w-20 shrink-0 overflow-hidden rounded bg-[#e7e5e1]">{vehicle.images?.[0]?.url ? <img src={vehicle.images[0].url} alt="" className="h-full w-full object-cover" /> : null}</span><span className="min-w-0"><span className="block truncate font-semibold">{name}</span><span className="mt-1 block text-xs text-[#777]">{vehicle.brand} {vehicle.model} · {vehicle.year}</span><span className="block text-xs text-[#777]">{vehicle.color} · Plate {vehicle.plate_number} · {vehicle.seats} seats</span><span className="mt-1 block text-sm font-semibold text-[#ff641f]">{money.format(Number(vehicle.daily_rate))}/day</span></span></button>; })}</div>{filteredVehicles.length === 0 && <p className="mt-2 text-sm text-[#777]">No vehicles match your search.</p>}{selectedVehicle && <div className="mt-4 flex gap-4 rounded bg-[#f7f6f3] p-3">{selectedVehicle.images?.[0]?.url ? <img src={selectedVehicle.images[0].url} alt="" className="h-24 w-32 rounded object-cover" /> : <div className="h-24 w-32 rounded bg-[#e7e5e1]" />}<div><p className="font-semibold">{selectedVehicle.name || `${selectedVehicle.brand} ${selectedVehicle.model}`}</p><p className="mt-1 text-xs text-[#777]">{selectedVehicle.year} · {selectedVehicle.transmission} · {selectedVehicle.seats} seats</p><p className="mt-2 font-semibold text-[#ff641f]">{money.format(Number(selectedVehicle.daily_rate))}/day</p></div></div>}</div><fieldset className="grid gap-4 sm:grid-cols-2"><legend className="col-span-full text-sm font-semibold">Pickup and return</legend>    <label className="text-sm">Pickup schedule<DateTimePicker required mode="datetime" value={form.pickup_date ? `${form.pickup_date}T${form.pickup_time}` : ""} onChange={value => { const [date, time] = value.split("T"); setForm(current => ({ ...current, pickup_date: date, pickup_time: time ?? current.pickup_time })); }} className={input} placeholder="Choose pickup date and time" /></label><label className="text-sm">Return schedule<DateTimePicker required mode="datetime" value={form.return_date ? `${form.return_date}T${form.return_time}` : ""} onChange={value => { const [date, time] = value.split("T"); setForm(current => ({ ...current, return_date: date, return_time: time ?? current.return_time })); }} className={input} placeholder="Choose return date and time" /></label></fieldset></div><button disabled={checking} className="mt-6 bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{checking ? "Checking..." : "Check availability →"}</button></form>}
    {step === 2 && <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]"><form className="border border-black/10 bg-white p-5 sm:p-8" onSubmit={event => { event.preventDefault(); void proceedDetails(); }}><h2 className="font-['Space_Grotesk'] text-2xl font-semibold">Trip details</h2><label className="mt-6 block text-sm">Contact phone number<input required className={input} value={customer?.phone ?? ""} onChange={event => setCustomer(current => current ? { ...current, phone: event.target.value } : current)} placeholder="09XX XXX XXXX" /></label><label className="mt-4 block text-sm">Destination<input required className={input} value={form.destination} onChange={event => setField("destination", event.target.value)} placeholder="Where will you travel?" /></label><fieldset className="mt-4"><legend className="text-sm font-semibold">Return location</legend><div className="mt-3 flex gap-3 text-sm"><label><input type="radio" checked={form.return_location_mode === "garage"} onChange={() => setForm(current => ({ ...current, return_location_mode: "garage", return_address: "" }))} /> <span className="ml-1">Return at CL CarHub</span></label><label><input type="radio" checked={form.return_location_mode === "location"} onChange={() => setForm(current => ({ ...current, return_location_mode: "location" }))} /> <span className="ml-1">Choose location</span></label></div></fieldset>{form.return_location_mode === "location" && <LocationPicker label="Return pickup location" value={{ address: form.return_address, latitude: returnPosition?.[0] ?? null, longitude: returnPosition?.[1] ?? null }} onChange={location => { setField("return_address", location.address); setReturnPosition(location.latitude !== null && location.longitude !== null ? [location.latitude, location.longitude] : null); }} />} {form.return_location_mode === "location" && <button type="button" className="mt-3 text-left text-xs font-semibold text-[#ff641f]" onClick={() => { if (deliveryPosition) { setField("return_address", form.delivery_address); setReturnPosition(deliveryPosition); } }}>Use delivery location as return pickup</button>}<fieldset className="mt-6"><legend className="text-sm font-semibold">Vehicle handoff</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="border p-3 text-sm"><input type="radio" checked={form.payment_method === "cash_on_pickup"} onChange={() => setField("payment_method", "cash_on_pickup")} /> <span className="ml-2 font-semibold">Pickup at CLCarHub</span></label><label className="border p-3 text-sm"><input type="radio" checked={form.payment_method === "cash_on_delivery"} onChange={() => setField("payment_method", "cash_on_delivery")} /> <span className="ml-2 font-semibold">Delivery to me</span></label></div></fieldset>{form.payment_method === "cash_on_delivery" && <p className="mt-3 bg-amber-50 p-3 text-xs text-amber-800">Delivery is available in Laguna only. Please provide your exact delivery address.</p>}        {form.payment_method === "cash_on_delivery" && <div className="mt-4 border border-black/10 p-4"><p className="text-sm font-semibold">Delivery location</p><div className="mt-3 flex gap-2"><input className={`${input} mt-0`} value={deliverySearch} onChange={event => setDeliverySearch(event.target.value)} placeholder="Search an address or business" /><button type="button" onClick={() => void searchDeliveryLocation()} disabled={deliverySearching || !deliverySearch.trim()} className="shrink-0 bg-[#151515] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{deliverySearching ? "Searching..." : "Search"}</button></div><button type="button" disabled={deliveryLocating} onClick={useCurrentDeliveryLocation} className="mt-3 border border-black/15 px-3 py-2 text-sm font-semibold disabled:opacity-50">{deliveryLocating ? "Detecting..." : "Use current location"}</button>{deliveryPlaces.length > 0 && <div className="mt-3 divide-y divide-black/10 border border-black/10">{deliveryPlaces.map(place => <button type="button" key={`${place.latitude}:${place.longitude}`} className="block w-full px-3 py-2 text-left text-xs hover:bg-[#f8f7f5]" onClick={() => pinDeliveryLocation(place.latitude, place.longitude, place.name, place.displayName)}>{place.displayName}</button>)}</div>}    <label className="mt-3 block text-sm">Delivery address label (optional)<input className={input} value={form.delivery_address} onChange={event => setField("delivery_address", event.target.value)} placeholder="Enter a landmark or address label" /></label><div className="garage-map mt-3 overflow-hidden border border-black/10"><DeliveryMap center={deliveryCenter} position={deliveryPosition} onPin={(latitude, longitude) => pinDeliveryLocation(latitude, longitude, "Pinned delivery location", null)} /></div><p className="mt-2 text-xs text-[#777]">{form.delivery_address || "Search, use your current location, or click the map to pin the delivery address."}</p>    {deliveryDistance !== null && <p className="mt-2 text-sm font-semibold text-[#ff641f]">Estimated delivery fee: {money.format(deliveryFee)} ({money.format(deliveryRate)} x {deliveryDistance.toFixed(2)} km)</p>}</div>}<label className="mt-4 block text-sm">Return address<input className={input} value={form.return_address} onChange={event => setField("return_address", event.target.value)} /></label><label className="mt-4 block text-sm">Notes<textarea className={input} rows={3} value={form.notes} onChange={event => setField("notes", event.target.value)} /></label><button type="button" className="mt-5 w-full border border-black/10 p-3 text-left text-sm" onClick={() => { showToast("Return to step 1 to change your schedule.", "info"); setStep(1); }}>Schedule: {dateTime(schedule().pickup_at)} → {dateTime(schedule().return_at)} <span className="float-right text-[#ff641f]">Change</span></button>        <div className="mt-6"><p className="text-sm font-semibold">Required identity attachments</p><p className="mt-1 text-xs text-[#777]">Documents already submitted to your profile will be reused for future booking requests.</p>{attachmentRequirements.map(([category, label, limit]) => <div className="mt-3" key={category}><div className="flex items-center justify-between gap-3"><label className="block text-sm">{label}</label>{requirementComplete(category) && <span className="text-xs font-semibold text-emerald-700">Already submitted</span>}</div>{!requirementComplete(category) && <input required={existingAttachmentCount(category) + files[category].length < limit} type="file" accept="image/*" multiple={limit > 1} className={`${input} text-xs`} onChange={event => { addFiles(category, event.target.files, limit); event.currentTarget.value = ""; }} />}<span className={`text-xs ${requirementComplete(category) ? "text-emerald-700" : "text-[#777]"}`}>{existingAttachmentCount(category) + files[category].length}/{limit} provided</span>{files[category].length > 0 && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{files[category].map((file, index) => <div className="relative overflow-hidden rounded border border-black/10 bg-[#f7f6f3]" key={`${file.name}-${file.lastModified}-${index}`}><img src={filePreviewUrls[category][index]} alt={file.name} className="h-24 w-full object-cover" /><button type="button" aria-label={`Remove ${file.name}`} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white" onClick={() => setFiles(current => ({ ...current, [category]: current[category].filter((_, fileIndex) => fileIndex !== index) }))}>×</button><p className="truncate px-2 py-1 text-[10px]">{file.name}</p></div>)}</div>}</div>)}</div><div className="mt-6 flex flex-wrap gap-3"><button type="button" className="border border-black/10 px-5 py-3 text-sm" onClick={() => setStep(1)}>← Back to vehicle & schedule</button><button disabled={submitting} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Saving..." : "Continue to checkout →"}</button></div></form>    <aside className="h-fit border border-black/10 bg-white p-5"><h3 className="font-semibold">Cost summary</h3><div className="mt-4 flex justify-between text-sm"><span>Rental fees ({money.format(Number(selectedVehicle?.daily_rate ?? 0))} x {rentalDays || 0} day{(rentalDays || 0) === 1 ? "" : "s"})</span><span>{money.format(rentalDays * Number(selectedVehicle?.daily_rate ?? 0))}</span></div>    {extensionHours > 0 && <div className="mt-2 flex justify-between text-sm"><span>Extension fees ({extensionHours} hour{extensionHours === 1 ? "" : "s"})</span><span>{money.format(extensionAmount)}</span></div>}{form.payment_method === "cash_on_delivery" && deliveryDistance !== null && <div className="mt-2 flex justify-between text-sm"><span>Delivery fee ({money.format(deliveryRate)} x {deliveryDistance.toFixed(2)} km)</span><span>{money.format(deliveryFee)}</span></div>}<div className="mt-3 flex justify-between border-t pt-3 text-sm"><span>Rental subtotal</span><span>{money.format(rentalAmount)}</span></div><div className="mt-3 flex justify-between border-t pt-3 text-sm"><span>Reservation fee due</span><span className="font-semibold">{money.format(reservationFee)}</span></div><p className="mt-4 text-xs text-[#777]">Final charges are subject to confirmation by CLCarHub.</p></aside></div>}
    {step === 3 && <div className="max-w-2xl border border-black/10 bg-white p-5 sm:p-8"><h2 className="font-['Space_Grotesk'] text-2xl font-semibold">Checkout</h2><p className="mt-2 text-sm text-[#777]">Review your request before sending it to CLCarHub.</p><div className="mt-6 space-y-3 border-y border-black/10 py-5 text-sm"><div className="flex justify-between"><span>Vehicle</span><strong>{selectedVehicle?.name || `${selectedVehicle?.brand ?? ""} ${selectedVehicle?.model ?? ""}`}</strong></div><div className="flex justify-between"><span>Schedule</span><span>{dateTime(schedule().pickup_at)} → {dateTime(schedule().return_at)}</span></div>    <div className="flex justify-between"><span>Rental estimate</span><span>{money.format(rentalAmount)}</span></div>{form.payment_method === "cash_on_delivery" && deliveryDistance !== null && <div className="flex justify-between"><span>Delivery fee ({money.format(deliveryRate)} x {deliveryDistance.toFixed(2)} km)</span><span>{money.format(deliveryFee)}</span></div>}<div className="flex justify-between font-semibold"><span>Reservation fee due</span><span>{money.format(reservationFee)}</span></div></div><div className="mt-5 bg-amber-50 p-4 text-sm text-amber-900"><strong>Cash only.</strong> Please prepare the reservation fee in cash. Your booking is not confirmed until CLCarHub reviews the request.</div><label className="mt-5 flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#ff641f]" checked={rentalTermsAccepted} onChange={event => setRentalTermsAccepted(event.target.checked)} /><span>I agree to the <Link className="text-[#ff641f] underline" to="/terms" target="_blank" rel="noreferrer">rental terms</Link> and understand that this booking request is subject to confirmation by CLCarHub.</span></label><div className="mt-6 flex gap-3"><button type="button" className="border border-black/10 px-5 py-3 text-sm" onClick={() => setStep(2)}>← Back</button><button type="button" disabled={submitting || !rentalTermsAccepted} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" onClick={() => void submitRequest()}>{submitting ? "Submitting..." : "Confirm & submit request"}</button></div></div>}</section>;
  return <div className="min-h-screen bg-[#f4f3f0] text-[#151515]"><header className="border-b border-black/10 bg-[#111] px-5 text-white sm:px-8"><div className="mx-auto flex h-20 max-w-6xl items-center justify-between"><Link to="/" aria-label="CLCarHub home"><img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-16 w-28 object-contain object-left" /></Link><div className="flex items-center gap-4 text-sm"><span className="hidden sm:block">{displayName(user)}</span><Link className="text-[#ffb18e] hover:text-white" to="/profile">Profile</Link><button className="text-[#ffb18e] hover:text-white" onClick={signOut}>Sign out</button></div></div></header><main className="mx-auto max-w-6xl px-5 py-8 sm:px-8"><p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">CUSTOMER DASHBOARD</p><div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="font-['Space_Grotesk'] text-3xl font-semibold sm:text-4xl">Welcome, {displayName(user).split(" ")[0]}.</h1><p className="mt-2 text-sm text-[#777]">Manage your rentals, request a vehicle, and keep track of your schedule.</p></div><button className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white" onClick={() => { setStep(1); setTab("request"); }}>Request a booking →</button></div><nav className="mt-8 flex gap-1 overflow-x-auto border-b border-black/10"><button className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${tab === "overview" ? "border-[#ff641f] text-[#ff641f]" : "border-transparent text-[#777]"}`} onClick={() => setTab("overview")}>Overview</button><button className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${tab === "calendar" ? "border-[#ff641f] text-[#ff641f]" : "border-transparent text-[#777]"}`} onClick={() => setTab("calendar")}>My calendar</button><button className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${tab === "request" ? "border-[#ff641f] text-[#ff641f]" : "border-transparent text-[#777]"}`} onClick={() => setTab("request")}>Request booking</button></nav>{loadingData ? <div className="mt-8 rounded border border-black/10 bg-white p-10 text-center text-sm text-[#777]">Loading your bookings...</div> : selectedBooking ? <CustomerBookingDetail booking={selectedBooking} loading={bookingDetailLoading} onClose={() => setSelectedBooking(null)} /> : tab === "overview" ? <section className="mt-8 space-y-8"><div className="grid gap-4 sm:grid-cols-3"><div className="border border-black/10 bg-white p-5"><p className="text-xs text-[#777]">Upcoming trips</p><p className="mt-2 text-3xl font-semibold text-[#ff641f]">{upcoming.length}</p></div><div className="border border-black/10 bg-white p-5"><p className="text-xs text-[#777]">Pending requests</p><p className="mt-2 text-3xl font-semibold">{pending.length}</p></div><div className="border border-black/10 bg-white p-5"><p className="text-xs text-[#777]">Total booked</p><p className="mt-2 text-3xl font-semibold">{money.format(totalSpent)}</p></div></div><section><div className="flex items-center justify-between"><h2 className="font-['Space_Grotesk'] text-2xl font-semibold">Your bookings</h2><button className="text-sm font-semibold text-[#ff641f]" onClick={() => setTab("calendar")}>View calendar →</button></div><div className="mt-4 space-y-3">{bookings.length === 0 ? <div className="border border-dashed border-black/20 bg-white p-10 text-center"><p className="font-semibold">No bookings yet</p></div> : bookings.map(booking => <button type="button" className="flex w-full flex-col gap-4 border border-black/10 bg-white p-4 text-left transition hover:border-[#ff641f] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#ff641f] sm:flex-row sm:items-center sm:justify-between" key={booking.id} onClick={() => void openBookingDetails(booking)}><div className="flex min-w-0 items-center gap-4">{booking.vehicle?.images?.[0]?.url ? <img src={booking.vehicle.images[0].url} alt="" className="h-16 w-20 rounded object-cover" /> : <div className="h-16 w-20 rounded bg-[#eee]" />}<div><p className="font-semibold">{booking.reference}</p><p className="mt-1 text-sm">{booking.vehicle?.name || `${booking.vehicle?.brand ?? ""} ${booking.vehicle?.model ?? ""}`}</p><p className="mt-1 text-xs text-[#777]">{dateTime(booking.pickup_at)} → {dateTime(booking.return_at)}</p></div></div><div className="flex items-center justify-between gap-4 text-left sm:text-right"><div><span className={`inline-block rounded px-2 py-1 text-[10px] font-bold uppercase ${statusClass(booking.status)}`}>{booking.status.replaceAll("_", " ")}</span><p className="mt-2 text-sm font-semibold">{money.format(Number(booking.total_amount || 0))}</p></div><span className="text-sm font-semibold text-[#ff641f]">View details →</span></div></button>)}</div></section></section> : tab === "calendar" ? <section className="mt-8 border border-black/10 bg-white p-4 sm:p-6"><div className="flex items-center justify-between"><button className="border border-black/10 px-3 py-2" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>←</button><h2 className="font-['Space_Grotesk'] text-xl font-semibold">{monthTitle(month)}</h2><button className="border border-black/10 px-3 py-2" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>→</button></div><div className="mt-5 grid grid-cols-7 border-l border-t border-black/10">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <div className="border-b border-r border-black/10 p-2 text-center text-[10px] font-bold uppercase text-[#999]" key={day}>{day}</div>)}{days.map(day => { const dayBookings = bookingOnDay(day); return <div className={`min-h-24 border-b border-r border-black/10 p-2 ${day.getMonth() === month.getMonth() ? "bg-white" : "bg-[#fafafa]"}`} key={day.toISOString()}><p className="text-xs text-[#555]">{day.getDate()}</p>{dayBookings.map(booking => <button type="button" className={`mt-2 block w-full truncate rounded px-1.5 py-1 text-left text-[10px] transition hover:ring-1 hover:ring-[#ff641f] ${statusClass(booking.status)}`} onClick={() => void openBookingDetails(booking)} key={booking.id}>{booking.reference}</button>)}</div>; })}</div></section> : requestForm}</main></div>;
}

function RejectionNotice({ status, reason }: { status: string; reason?: string | null }) {
  const label = status === "cancelled" ? "Booking cancelled" : "Booking rejected";
  return <div className="mt-6 border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">{label}</p><p className="mt-1">{reason || "No reason was recorded."}</p></div>;
}

function CustomerBookingDetail({ booking, loading, onClose }: { booking: BookingRecord; loading: boolean; onClose: () => void }) {
  const vehicleName = booking.vehicle?.name || `${booking.vehicle?.brand ?? ""} ${booking.vehicle?.model ?? ""}`;
  const paid = (booking.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return <section className="mt-8 border border-black/10 bg-white p-5 sm:p-8">
    <button type="button" className="text-sm font-semibold text-[#ff641f] hover:underline" onClick={onClose}>← Back to my bookings</button>
    {loading ? <div className="flex min-h-64 items-center justify-center text-sm text-[#777]"><span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-black/10 border-t-[#ff641f]" />Loading booking details...</div> : <><div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs uppercase tracking-widest text-[#ff641f]">Booking {booking.reference}</p><h2 className="mt-2 font-['Space_Grotesk'] text-2xl font-semibold">{vehicleName}</h2><p className="mt-2 text-sm text-[#777]">{booking.vehicle?.plate_number || "Vehicle details"}</p></div><span className={`w-fit rounded px-3 py-2 text-xs font-bold uppercase ${statusClass(booking.status)}`}>{booking.status.replaceAll("_", " ")}</span></div>{["rejected", "cancelled"].includes(booking.status) && <RejectionNotice status={booking.status} reason={booking.status_reason ?? booking.statusHistory?.find(history => history.to_status === booking.status)?.reason ?? booking.status_history?.find(history => history.to_status === booking.status)?.reason} />}<div className="mt-8 grid gap-5 sm:grid-cols-2"><div><p className="text-xs uppercase text-[#888]">Pickup</p><p className="mt-1 font-semibold">{dateTime(booking.pickup_at)}</p></div><div><p className="text-xs uppercase text-[#888]">Return</p><p className="mt-1 font-semibold">{dateTime(booking.return_at)}</p></div><div><p className="text-xs uppercase text-[#888]">Destination</p><p className="mt-1 font-semibold">{booking.destination || "—"}</p></div><div><p className="text-xs uppercase text-[#888]">Handoff</p><p className="mt-1 font-semibold">{booking.payment_method === "cash_on_delivery" ? "Delivery" : "Pickup at CLCarHub"}</p>{booking.payment_method === "cash_on_delivery" && <p className="mt-1 text-sm text-[#555]">{booking.delivery_address || "Location pinned on map"}</p>}</div></div><div className="mt-8 border border-black/10 p-5"><div className="flex items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-[#ff641f]">Charges</p><h3 className="mt-1 text-lg font-semibold">Fee breakdown</h3></div><p className="text-xl font-bold">{money.format(Number(booking.total_amount || 0))}</p></div><div className="mt-5 divide-y divide-black/10 text-sm"><FeeRow label="Daily rental" value={booking.rental_amount} /><FeeRow label="Additional charges" value={booking.additional_charges} /><FeeRow label="Fuel charge" value={booking.fuel_charge} /><FeeRow label="RFID charge" value={booking.rfid_charge} /><FeeRow label="Damage fees" value={booking.damage_fees} /><FeeRow label="Car wash fees" value={booking.car_wash_fees} /><FeeRow label="Extension fees" value={booking.extension_fees} />{Number(booking.delivery_fee ?? 0) > 0 &&     <FeeRow label={`Delivery fee (${money.format(Number(booking.delivery_rate_per_km ?? 0))} x ${Number(booking.delivery_distance_km ?? 0).toFixed(2)} km)`} value={booking.delivery_fee} />}{Number(booking.return_pickup_fee ?? 0) > 0 && <FeeRow label={`Return pickup fee (${Number(booking.return_distance_km ?? 0).toFixed(2)} km x 2)`} value={booking.return_pickup_fee} />}<FeeRow label="Security deposit" value={booking.deposit ?? booking.vehicle?.security_deposit_fee} /><FeeRow label="Discount" value={booking.discount} negative /></div></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="border border-black/10 bg-[#f8f7f5] p-4"><p className="text-xs text-[#777]">Total</p><p className="mt-1 text-xl font-bold">{money.format(Number(booking.total_amount || 0))}</p></div><div className="border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs text-emerald-700">Paid</p><p className="mt-1 text-xl font-bold text-emerald-700">{money.format(paid)}</p></div><div className="border border-black/10 p-4"><p className="text-xs text-[#777]">Balance</p><p className="mt-1 text-xl font-bold">{money.format(Number(booking.balance ?? Number(booking.total_amount || 0) - paid))}</p></div></div><section className="mt-8 border-t border-black/10 pt-6"><div className="flex items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-[#ff641f]">Payments</p><h3 className="mt-1 text-lg font-semibold">Payment history</h3></div><span className="text-sm text-[#777]">{booking.payments?.length ?? 0} payment(s)</span></div>{booking.payments?.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-black/10 text-xs uppercase text-[#888]"><tr><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3">Method</th><th className="p-3">Notes</th></tr></thead><tbody>{booking.payments.map(payment => <tr className="border-b border-black/[.06]" key={payment.id}><td className="p-3">{new Date(payment.paid_at).toLocaleDateString()}</td><td className="p-3 font-semibold">{money.format(Number(payment.amount || 0))}</td><td className="p-3">{payment.payment_method?.replaceAll("_", " ") || "Cash"}</td><td className="p-3 text-[#777]">{payment.notes || "—"}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-[#777]">No payments have been recorded yet.</p>}</section>{booking.notes && <div className="mt-8 border-t border-black/10 pt-5"><p className="text-xs uppercase text-[#888]">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm">{booking.notes}</p></div>}</>}
  </section>;
}

function FeeRow({ label, value, negative = false }: { label: string; value?: string | null; negative?: boolean }) {
  const amount = Number(value || 0);
  return <div className="flex items-center justify-between gap-4 py-2"><span className="text-[#555]">{label}</span><span className={negative ? "text-emerald-700" : "font-medium"}>{negative ? "−" : ""}{money.format(amount)}</span></div>;
}
