import { useEffect, useRef, useState, type FormEvent } from "react";
import L from "../lib/leaflet";
import { AdminShell } from "../components/AdminShell";
import { Skeleton, useToast } from "../components/Ui";
import api from "../lib/api";
import { vehicleTypeLabels, vehicleTypes, type DiscountStructure, type FaqItem, type FleetSettings } from "../types";
import RichTextEditor from "../components/RichTextEditor";
import { DateTimePicker } from "../components/DateTimePicker";

const defaultMapCenter: [number, number] = [14.5995, 120.9842];
const dateTimePickerValue = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const defaults: FleetSettings = {
  reservation_fee: "0",
  reservation_fee_deductible: true,
  booking_sms_numbers: [],
  default_hour_extension_rate: "200",
  full_day_extension_threshold_hours: 12,
  late_return_grace_period_minutes: 60,
  gps_refresh_interval_seconds: 30,
  default_delivery_rate_per_km: "0",
  garage_location_name: null,
  garage_location_address: null,
  garage_location_latitude: null,
  garage_location_longitude: null,
  terms_and_conditions: null,
  privacy_policy: null,
  discount_structures: [],
  faqs: [],
};

type SearchResult = {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
};

type DiscountCode = {
  id?: number;
  name: string;
  code: string;
  type: "fixed" | "percentage";
  value: string;
  maximum_discount: string | null;
  redemptions_allowed: number | null;
  redemptions_count?: number;
  starts_at: string | null;
  ends_at: string | null;
  minimum_booking_amount: string | null;
  vehicle_types: string[] | null;
  minimum_duration_hours: number | null;
  new_customers_only: boolean;
  stackable: boolean;
  status: "draft" | "scheduled" | "active" | "paused" | "expired" | "exhausted";
  limit_per_customer: number;
};

const emptyDiscountCode = (): DiscountCode => ({ name: "", code: "", type: "fixed", value: "0", maximum_discount: null, redemptions_allowed: null, starts_at: null, ends_at: null, minimum_booking_amount: null, vehicle_types: allVehicleTypes(), minimum_duration_hours: null, new_customers_only: false, stackable: false, status: "draft", limit_per_customer: 1 });

const normalizeSettings = (value: Partial<FleetSettings>): FleetSettings => ({
  reservation_fee: value.reservation_fee ?? defaults.reservation_fee,
  reservation_fee_deductible: value.reservation_fee_deductible ?? defaults.reservation_fee_deductible,
  booking_sms_numbers: value.booking_sms_numbers ?? defaults.booking_sms_numbers,
  default_hour_extension_rate: value.default_hour_extension_rate === undefined ? defaults.default_hour_extension_rate : value.default_hour_extension_rate,
  full_day_extension_threshold_hours: value.full_day_extension_threshold_hours ?? defaults.full_day_extension_threshold_hours,
  late_return_grace_period_minutes: value.late_return_grace_period_minutes ?? defaults.late_return_grace_period_minutes,
  gps_refresh_interval_seconds: value.gps_refresh_interval_seconds ?? defaults.gps_refresh_interval_seconds,
  default_delivery_rate_per_km: value.default_delivery_rate_per_km ?? defaults.default_delivery_rate_per_km,
  garage_location_name: value.garage_location_name ?? defaults.garage_location_name,
  garage_location_address: value.garage_location_address ?? defaults.garage_location_address,
  garage_location_latitude: value.garage_location_latitude == null ? null : Number(value.garage_location_latitude),
  garage_location_longitude: value.garage_location_longitude == null ? null : Number(value.garage_location_longitude),
  terms_and_conditions: value.terms_and_conditions ?? defaults.terms_and_conditions,
  privacy_policy: value.privacy_policy ?? defaults.privacy_policy,
  discount_structures: value.discount_structures ?? defaults.discount_structures,
  faqs: value.faqs ?? defaults.faqs,
});

const allVehicleTypes = () => [...vehicleTypes];
const emptyStructure = (): DiscountStructure => ({ name: "", vehicle_types: allVehicleTypes(), milestones: [{ days: 1, discount_percent: 0 }] });

function GarageMap({
  center,
  position,
  onPin,
}: {
  center: [number, number];
  position: [number, number] | null;
  onPin: (latitude: number, longitude: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const initialCenterRef = useRef(center);
  const onPinRef = useRef(onPin);

  useEffect(() => {
    onPinRef.current = onPin;
  }, [onPin]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(initialCenterRef.current, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on("click", event => onPinRef.current(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(center, Math.max(map.getZoom(), 15));
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = position
      ? L.circleMarker(position, {
        radius: 10,
        color: "#ff641f",
        fillColor: "#ff641f",
        fillOpacity: 0.85,
      }).addTo(map)
      : null;
  }, [position]);

  return <div ref={containerRef} className="h-80 w-full" />;
}

export default function FleetSettingsPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [mapCenter, setMapCenter] = useState(defaultMapCenter);
  const [expandedStructures, setExpandedStructures] = useState<Set<number>>(() => new Set());
  const [bookingSmsNumber, setBookingSmsNumber] = useState("");
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [discountCodeForm, setDiscountCodeForm] = useState<DiscountCode>(emptyDiscountCode);
  const [discountCodeSaving, setDiscountCodeSaving] = useState(false);

  useEffect(() => {
    api.get<FleetSettings>("/fleet-settings")
      .then(response => {
        const normalized = normalizeSettings(response.data);
        setSettings(normalized);
        if (normalized.garage_location_latitude !== null && normalized.garage_location_longitude !== null) {
          setMapCenter([normalized.garage_location_latitude, normalized.garage_location_longitude]);
        }
      })
      .catch(error => showToast(error instanceof Error ? error.message : "Unable to load fleet settings", "error"))
      .finally(() => setLoading(false));
    api.get<DiscountCode[]>("/discount-codes").then(response => setDiscountCodes(response.data)).catch(error => showToast(error instanceof Error ? error.message : "Unable to load discount codes", "error"));
  }, [showToast]);

  const pinLocation = (latitude: number, longitude: number, name: string | null, address: string | null) => {
    setSettings(current => ({
      ...current,
      garage_location_name: name,
      garage_location_address: address,
      garage_location_latitude: latitude,
      garage_location_longitude: longitude,
    }));
    setMapCenter([latitude, longitude]);
    setSearchResults([]);
  };

  const findLocation = async (event: FormEvent) => {
    event.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    try {
      const query = new URLSearchParams({ q: search.trim(), limit: "8", lang: "en" });
      const response = await fetch(`https://photon.komoot.io/api/?${query.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Location search is temporarily unavailable.");
      const data = await response.json() as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: {
            name?: string;
            street?: string;
            housenumber?: string;
            city?: string;
            state?: string;
            country?: string;
          };
        }>;
      };
      const results: SearchResult[] = (data.features ?? []).flatMap(feature => {
        const coordinates = feature.geometry?.coordinates;
        if (!coordinates || coordinates.length < 2) return [];
        const properties = feature.properties ?? {};
        const name = properties.name ?? "Unnamed location";
        const address = [
          properties.housenumber && properties.street
            ? `${properties.housenumber} ${properties.street}`
            : properties.street,
          properties.city,
          properties.state,
          properties.country,
        ].filter(Boolean).join(", ");
        return [{
          name,
          displayName: address ? `${name}, ${address}` : name,
          latitude: coordinates[1],
          longitude: coordinates[0],
        }];
      });
      setSearchResults(results);
      if (results.length === 0) showToast("No matching locations found.", "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to search for that location.", "error");
    } finally {
      setSearching(false);
    }
  };

  const handleMapClick = (latitude: number, longitude: number) => {
    pinLocation(latitude, longitude, "Pinned garage location", null);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast("Current location is not supported by this browser.", "error");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        try {
          const query = new URLSearchParams({
            lat: String(latitude),
            lon: String(longitude),
            lang: "en",
          });
          const response = await fetch(`https://photon.komoot.io/reverse?${query.toString()}`, {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) throw new Error("Address lookup is temporarily unavailable.");
          const data = await response.json() as {
            features?: Array<{
              properties?: {
                name?: string;
                street?: string;
                housenumber?: string;
                city?: string;
                state?: string;
                country?: string;
              };
            }>;
          };
          const properties = data.features?.[0]?.properties;
          const name = properties?.name ?? "Current garage location";
          const address = [
            properties?.housenumber && properties.street
              ? `${properties.housenumber} ${properties.street}`
              : properties?.street,
            properties?.city,
            properties?.state,
            properties?.country,
          ].filter(Boolean).join(", ");
          pinLocation(latitude, longitude, name, address || null);
        } catch (error) {
          pinLocation(latitude, longitude, "Current garage location", null);
          showToast(error instanceof Error ? `${error.message} Coordinates were pinned.` : "Coordinates were pinned, but the address lookup failed.", "error");
        } finally {
          setLocating(false);
        }
      },
      error => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access and try again."
          : error.code === error.TIMEOUT
            ? "Location detection timed out. Try again."
            : "Unable to determine your current location.";
        showToast(message, "error");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const persistSettings = async () => {
    setSaving(true);
    try {
      const response = await api.put<FleetSettings>("/fleet-settings", settings);
      setSettings(normalizeSettings(response.data));
      showToast("Fleet settings saved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save fleet settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await persistSettings();
  };

  const updateStructure = (index: number, structure: DiscountStructure) => setSettings(current => ({ ...current, discount_structures: current.discount_structures.map((item, itemIndex) => itemIndex === index ? structure : item) }));
  const addStructure = () => setSettings(current => ({ ...current, discount_structures: [...current.discount_structures, emptyStructure()] }));
  const removeStructure = (index: number) => {
    setExpandedStructures(current => new Set([...current].filter(itemIndex => itemIndex !== index).map(itemIndex => itemIndex > index ? itemIndex - 1 : itemIndex)));
    setSettings(current => ({ ...current, discount_structures: current.discount_structures.filter((_, itemIndex) => itemIndex !== index) }));
  };
  const updateFaq = (index: number, faq: FaqItem) => setSettings(current => ({ ...current, faqs: current.faqs.map((item, itemIndex) => itemIndex === index ? faq : item) }));
  const addFaq = () => setSettings(current => ({ ...current, faqs: [...current.faqs, { question: "", answer: "" }] }));
  const removeFaq = (index: number) => setSettings(current => ({ ...current, faqs: current.faqs.filter((_, itemIndex) => itemIndex !== index) }));
  const addBookingSmsNumber = () => {
    const value = bookingSmsNumber.trim();
    if (!/^(?:\+63|0)?9\d{9}$/.test(value)) {
      showToast("Enter a valid Philippine mobile number, such as +639939928496, 09939928496, or 9939928496.", "error");
      return;
    }
    const digits = value.replace(/^\+/, "");
    const normalized = `+63${digits.startsWith("0") ? digits.slice(1) : digits}`;
    if (settings.booking_sms_numbers.includes(normalized)) {
      showToast("That notification number is already listed.", "error");
      return;
    }
    setSettings(current => ({ ...current, booking_sms_numbers: [...current.booking_sms_numbers, normalized] }));
    setBookingSmsNumber("");
  };
  const saveDiscountStructures = async () => {
    setSaving(true);
    try {
      const response = await api.put<FleetSettings>("/fleet-settings", settings);
      setSettings(normalizeSettings(response.data));
      showToast("Discount structures saved successfully.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save discount structures.", "error");
    } finally {
      setSaving(false);
    }
  };
  const saveDiscountCode = async (event: FormEvent) => {
    event.preventDefault();
    if (discountCodeSaving) return;
    setDiscountCodeSaving(true);
    try {
      const response = discountCodeForm.id
        ? await api.patch<DiscountCode>(`/discount-codes/${discountCodeForm.id}`, discountCodeForm)
        : await api.post<DiscountCode>("/discount-codes", discountCodeForm);
      const savedCode = { ...response.data, vehicle_types: response.data.vehicle_types?.length ? response.data.vehicle_types : allVehicleTypes() };
      setDiscountCodes(current => discountCodeForm.id ? current.map(code => code.id === response.data.id ? savedCode : code) : [savedCode, ...current]);
      setDiscountCodeForm(emptyDiscountCode());
      showToast(discountCodeForm.id ? "Discount code updated successfully." : "Discount code created successfully.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save discount code.", "error");
    } finally {
      setDiscountCodeSaving(false);
    }
  };
  const deleteDiscountCode = async (id: number) => {
    try {
      await api.delete(`/discount-codes/${id}`);
      setDiscountCodes(current => current.filter(code => code.id !== id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to delete discount code.", "error");
    }
  };

  return (
    <AdminShell title="Fleet Settings">
      <div className="mt-8 max-w-3xl space-y-6">
        <section className="rounded-lg border border-black/10 bg-white p-5 sm:p-8">
          <p className="text-xs uppercase tracking-widest text-[#ff641f]">Reservation policy</p>
          <h2 className="mt-2 text-2xl font-semibold">Global reservation fee</h2>
          <p className="mt-2 text-sm text-[#777]">This fee applies to every vehicle and replaces the old vehicle-specific reservation fee.</p>
          {loading ? (
            <div className="mt-6 space-y-6" role="status" aria-live="polite">
              <div>
                <div className="h-4 w-32 animate-pulse rounded bg-black/10" />
                <div className="mt-2 h-12 w-full animate-pulse rounded bg-black/5" />
              </div>
              <div className="h-20 animate-pulse rounded border border-black/10 bg-black/[.03]" />
              <div className="flex justify-end"><div className="h-11 w-32 animate-pulse rounded bg-black/10" /></div>
              <span className="sr-only">Loading fleet settings...</span>
            </div>
          ) : (
            <form className="mt-6 space-y-6" onSubmit={save}>
              <label className="block text-sm font-semibold">
                Reservation fee
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#777]">₱</span>
                  <input required min="0" step="0.01" type="number" className="w-full border border-black/10 py-3 pl-8 pr-3 text-sm" value={settings.reservation_fee} onChange={event => setSettings(current => ({ ...current, reservation_fee: event.target.value }))} />
                </div>
              </label>
              <label className="block text-sm font-semibold">
                Default hourly extension rate
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#777]">₱</span>
                  <input min="0" step="0.01" type="number" className="w-full border border-black/10 py-3 pl-8 pr-3 text-sm" value={settings.default_hour_extension_rate ?? ""} onChange={event => setSettings(current => ({ ...current, default_hour_extension_rate: event.target.value === "" ? null : event.target.value }))} />
                </div>
                <span className="mt-1 block text-xs font-normal text-[#777]">Used when a vehicle does not have its own hourly extension rate. Default: ₱200 per hour.</span>
              </label>
              <label className="block text-sm font-semibold">
                Full-day extension threshold
                <div className="mt-2 flex items-center gap-3">
                  <input required min="1" max="23" type="number" className="w-28 border border-black/10 px-3 py-3 text-sm" value={settings.full_day_extension_threshold_hours} onChange={event => setSettings(current => ({ ...current, full_day_extension_threshold_hours: Number(event.target.value) }))} />
                  <span className="font-normal text-[#555]">hours</span>
                </div>
                <span className="mt-1 block text-xs font-normal text-[#777]">At or above this many extra hours, charge one full daily rate instead.</span>
              </label>
              <label className="block text-sm font-semibold">
                Late return grace period
                <div className="mt-2 flex items-center gap-3">
                  <input required min="0" max="1439" type="number" className="w-28 border border-black/10 px-3 py-3 text-sm" value={settings.late_return_grace_period_minutes} onChange={event => setSettings(current => ({ ...current, late_return_grace_period_minutes: Number(event.target.value) }))} />
                  <span className="font-normal text-[#555]">minutes</span>
                </div>
                <span className="mt-1 block text-xs font-normal text-[#777]">Returns within this period after a full rental day do not incur an hourly extension charge. Default: 60 minutes.</span>
              </label>
              <label className="block text-sm font-semibold">
                GPS refresh interval
                <div className="mt-2 flex items-center gap-3">
                  <input required min="10" max="3600" type="number" className="w-28 border border-black/10 px-3 py-3 text-sm" value={settings.gps_refresh_interval_seconds} onChange={event => setSettings(current => ({ ...current, gps_refresh_interval_seconds: Number(event.target.value) }))} />
                  <span className="font-normal text-[#555]">seconds</span>
                </div>
                <span className="mt-1 block text-xs font-normal text-[#777]">The minimum is 10 seconds. Shorter intervals can increase vendor/API load and may be rate-limited.</span>
              </label>
              <label className="block text-sm font-semibold">
                Default delivery rate per kilometer
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#777]">₱</span>
                  <input required min="0" step="0.01" type="number" className="w-full border border-black/10 py-3 pl-8 pr-3 text-sm" value={settings.default_delivery_rate_per_km} onChange={event => setSettings(current => ({ ...current, default_delivery_rate_per_km: event.target.value }))} />
                </div>
                <span className="mt-1 block text-xs font-normal text-[#777]">Used for delivery bookings when a vehicle does not have its own delivery rate.</span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 border border-black/10 p-4 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#ff641f]" checked={settings.reservation_fee_deductible} onChange={event => setSettings(current => ({ ...current, reservation_fee_deductible: event.target.checked }))} />
                <span><strong className="block">Deduct reservation fee from rental total</strong><span className="mt-1 block text-[#777]">When enabled, the reservation fee counts as an advance payment toward the rental total. When disabled, it is added as a separate charge.</span></span>
              </label>
              <div className="border border-black/10 p-4">
                <p className="font-semibold">Customer booking SMS notifications</p>
                <p className="mt-1 text-xs font-normal text-[#777]">These numbers receive an SMS when a customer submits a booking. Staff-created bookings do not trigger this notification.</p>
                <div className="mt-4 flex gap-2">
                  <input className="min-w-0 flex-1 border border-black/10 px-3 py-3 text-sm" placeholder="09XXXXXXXXX or +639XXXXXXXXX" value={bookingSmsNumber} onChange={event => setBookingSmsNumber(event.target.value)} />
                  <button type="button" className="shrink-0 border border-black/15 px-4 py-3 text-sm font-semibold" onClick={addBookingSmsNumber}>Add number</button>
                </div>
                <div className="mt-3 space-y-2">
                  {settings.booking_sms_numbers.map(number => (
                    <div className="flex items-center justify-between gap-3 bg-[#f8f7f5] px-3 py-2 text-sm" key={number}>
                      <span>{number}</span>
                      <button type="button" className="text-xs font-semibold text-red-600" onClick={() => setSettings(current => ({ ...current, booking_sms_numbers: current.booking_sms_numbers.filter(item => item !== number) }))}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button disabled={saving} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save settings"}</button>
              </div>
            </form>
          )}
        </section>
        <section className="rounded-lg border border-black/10 bg-white p-5 sm:p-8">
          <p className="text-xs uppercase tracking-widest text-[#ff641f]">Rental pricing</p>
          <h2 className="mt-2 text-2xl font-semibold">Discount structures</h2>
          <p className="mt-2 text-sm text-[#777]">Create reusable milestone pricing for one or more vehicle categories. The highest matching milestone applies to the daily rental rate.</p>
          <div className="mt-6 space-y-5" aria-busy={loading || saving}>
            {loading ? <div className="space-y-4" role="status" aria-live="polite"><Skeleton className="h-24 w-full" /><Skeleton className="h-44 w-full" /><span className="sr-only">Loading discount structures...</span></div> : settings.discount_structures.map((structure, structureIndex) => {
              const expanded = expandedStructures.has(structureIndex);
              return <div className="rounded-md border border-black/10 p-4" key={structureIndex}>
              <div className="flex items-center gap-3">
                <input aria-label="Discount structure name" className="min-w-0 flex-1 border border-black/10 px-3 py-2 text-sm font-semibold" placeholder="Structure name" value={structure.name} onChange={event => updateStructure(structureIndex, { ...structure, name: event.target.value })} />
                <button
                  type="button"
                  className="shrink-0 border border-black/10 px-3 py-2 text-sm font-semibold"
                  aria-expanded={expanded}
                  aria-controls={`discount-structure-${structureIndex}`}
                  onClick={() => setExpandedStructures(current => {
                    const next = new Set(current);
                    if (next.has(structureIndex)) next.delete(structureIndex); else next.add(structureIndex);
                    return next;
                  })}
                >
                  {expanded ? "Collapse" : "Expand"}
                </button>
                <button type="button" className="text-sm text-red-600" onClick={() => removeStructure(structureIndex)}>Remove</button>
              </div>
              {expanded && <div id={`discount-structure-${structureIndex}`} className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#777]">Vehicle categories</p>
                            <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="border border-[#ff641f] px-3 py-2 text-sm font-semibold text-[#ff641f]" onClick={() => updateStructure(structureIndex, { ...structure, vehicle_types: structure.vehicle_types.length === vehicleTypes.length ? [] : allVehicleTypes() })}>{structure.vehicle_types.length === vehicleTypes.length ? "Deselect all" : "Select all"}</button>{vehicleTypes.map(type => <label className="flex items-center gap-2 border border-black/10 px-3 py-2 text-sm" key={type}><input type="checkbox" checked={structure.vehicle_types.includes(type)} onChange={event => updateStructure(structureIndex, { ...structure, vehicle_types: event.target.checked ? [...structure.vehicle_types, type] : structure.vehicle_types.filter(item => item !== type) })} />{vehicleTypeLabels[type]}</label>)}</div>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm"><thead><tr className="border-b border-black/10 text-left text-xs uppercase tracking-wider text-[#777]"><th className="pb-2">Rental days</th><th className="pb-2">Discount (%)</th><th className="pb-2 text-right">Action</th></tr></thead><tbody>{structure.milestones.map((milestone, milestoneIndex) => <tr className="border-b border-black/5" key={milestoneIndex}><td className="py-2"><input min="1" type="number" className="w-28 border border-black/10 px-2 py-2" value={milestone.days} onChange={event => updateStructure(structureIndex, { ...structure, milestones: structure.milestones.map((item, index) => index === milestoneIndex ? { ...item, days: Number(event.target.value) } : item) })} /></td><td className="py-2"><input min="-100" max="100" step="0.01" type="number" className="w-28 border border-black/10 px-2 py-2" value={milestone.discount_percent} onChange={event => updateStructure(structureIndex, { ...structure, milestones: structure.milestones.map((item, index) => index === milestoneIndex ? { ...item, discount_percent: Number(event.target.value) } : item) })} /></td><td className="py-2 text-right"><button type="button" className="text-xs text-red-600 disabled:text-[#aaa]" disabled={structure.milestones.length === 1} onClick={() => updateStructure(structureIndex, { ...structure, milestones: structure.milestones.filter((_, index) => index !== milestoneIndex) })}>Remove</button></td></tr>)}</tbody></table>
                  <button type="button" className="mt-3 text-sm font-semibold text-[#ff641f]" onClick={() => updateStructure(structureIndex, { ...structure, milestones: [...structure.milestones, { days: 1, discount_percent: 0 }] })}>+ Add milestone</button>
                </div>
              </div>}
            </div>;
            })}
            {!loading && <button type="button" disabled={saving} className="border border-[#ff641f] px-4 py-2 text-sm font-semibold text-[#ff641f] disabled:cursor-not-allowed disabled:opacity-50" onClick={addStructure}>+ Add discount structure</button>}
          </div>
          {!loading && <div className="mt-5 flex items-center justify-between gap-4"><p className="text-xs text-[#777]" aria-live="polite">{saving ? "Saving your discount structures..." : "Changes are local until you save them."}</p><button type="button" disabled={saving} onClick={saveDiscountStructures} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save discount structures"}</button></div>}
        </section>
        <section className="rounded-lg border border-black/10 bg-white p-5 sm:p-8">
            <p className="text-xs uppercase tracking-widest text-[#ff641f]">Promotions</p>
            <h2 className="mt-2 text-2xl font-semibold">Discount codes</h2>
            <p className="mt-2 text-sm text-[#777]">Create codes that apply to the base rental after discount structures. Add-ons, deposits, and delivery are excluded.</p>
            <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={saveDiscountCode}>
              <label className="text-sm">Name<input required className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.name} onChange={event => setDiscountCodeForm(current => ({ ...current, name: event.target.value }))} /></label>
              <label className="text-sm">Code<input required className="mt-2 w-full border border-black/10 px-3 py-2 uppercase" value={discountCodeForm.code} onChange={event => setDiscountCodeForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} /></label>
              <label className="text-sm">Type<select className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.type} onChange={event => setDiscountCodeForm(current => ({ ...current, type: event.target.value as DiscountCode["type"] }))}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select></label>
              <label className="text-sm">Value<input required min="0" step="0.01" type="number" className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.value} onChange={event => setDiscountCodeForm(current => ({ ...current, value: event.target.value }))} /></label>
              <label className="text-sm">Maximum discount (optional)<input min="0" step="0.01" type="number" className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.maximum_discount ?? ""} onChange={event => setDiscountCodeForm(current => ({ ...current, maximum_discount: event.target.value || null }))} /></label>
              <label className="text-sm">Total redemptions (optional)<input min="1" type="number" className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.redemptions_allowed ?? ""} onChange={event => setDiscountCodeForm(current => ({ ...current, redemptions_allowed: event.target.value ? Number(event.target.value) : null }))} /></label>
              <label className="text-sm">Starts at<DateTimePicker mode="datetime" className="mt-2 w-full border border-black/10 px-3 py-2" value={dateTimePickerValue(discountCodeForm.starts_at)} onChange={value => setDiscountCodeForm(current => ({ ...current, starts_at: value || null }))} placeholder="Choose start date and time" /></label>
              <label className="text-sm">Ends at<DateTimePicker mode="datetime" className="mt-2 w-full border border-black/10 px-3 py-2" value={dateTimePickerValue(discountCodeForm.ends_at)} onChange={value => setDiscountCodeForm(current => ({ ...current, ends_at: value || null }))} placeholder="Choose end date and time" /></label>
              <label className="text-sm">Minimum rental amount<input min="0" step="0.01" type="number" className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.minimum_booking_amount ?? ""} onChange={event => setDiscountCodeForm(current => ({ ...current, minimum_booking_amount: event.target.value || null }))} /></label>
              <label className="text-sm">Minimum duration (hours)<input min="1" type="number" className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.minimum_duration_hours ?? ""} onChange={event => setDiscountCodeForm(current => ({ ...current, minimum_duration_hours: event.target.value ? Number(event.target.value) : null }))} /></label>
              <label className="text-sm">Status<select className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.status} onChange={event => setDiscountCodeForm(current => ({ ...current, status: event.target.value as DiscountCode["status"] }))}>{["draft", "scheduled", "active", "paused"].map(status => <option key={status} value={status}>{status}</option>)}</select></label>
              <label className="text-sm">Limit per customer<input min="1" type="number" className="mt-2 w-full border border-black/10 px-3 py-2" value={discountCodeForm.limit_per_customer} onChange={event => setDiscountCodeForm(current => ({ ...current, limit_per_customer: Number(event.target.value) }))} /></label>
              <fieldset className="sm:col-span-2"><legend className="text-sm">Applicable vehicle categories</legend><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="border border-[#ff641f] px-3 py-2 text-sm font-semibold text-[#ff641f]" onClick={() => setDiscountCodeForm(current => ({ ...current, vehicle_types: current.vehicle_types?.length === vehicleTypes.length ? [] : allVehicleTypes() }))}>{discountCodeForm.vehicle_types?.length === vehicleTypes.length ? "Deselect all" : "Select all"}</button>{vehicleTypes.map(type => <label key={type} className="flex items-center gap-2 border border-black/10 px-3 py-2 text-sm"><input type="checkbox" checked={discountCodeForm.vehicle_types?.includes(type) ?? false} onChange={event => setDiscountCodeForm(current => ({ ...current, vehicle_types: event.target.checked ? [...(current.vehicle_types ?? []), type] : (current.vehicle_types ?? []).filter(item => item !== type) }))} />{vehicleTypeLabels[type]}</label>)}</div></fieldset>
              <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2"><label><input type="checkbox" checked={discountCodeForm.new_customers_only} onChange={event => setDiscountCodeForm(current => ({ ...current, new_customers_only: event.target.checked }))} /> <span className="ml-1">New customers only</span></label><label><input type="checkbox" checked={discountCodeForm.stackable} onChange={event => setDiscountCodeForm(current => ({ ...current, stackable: event.target.checked }))} /> <span className="ml-1">Stackable</span></label></div>
              <div className="flex items-center gap-3 sm:col-span-2"><button disabled={discountCodeSaving} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{discountCodeSaving ? (discountCodeForm.id ? "Updating..." : "Creating...") : (discountCodeForm.id ? "Update code" : "Create code")}</button>{discountCodeForm.id && <button type="button" disabled={discountCodeSaving} className="border border-black/10 px-5 py-3 text-sm disabled:opacity-50" onClick={() => setDiscountCodeForm(emptyDiscountCode())}>Cancel</button>}<span className="text-xs text-[#777]" role="status" aria-live="polite">{discountCodeSaving ? "Saving discount code..." : "New codes appear below immediately after saving."}</span></div>
            </form>
            <div className="mt-8 space-y-2">{discountCodes.map(code => <div key={code.id} className="flex flex-wrap items-center justify-between gap-3 border border-black/10 p-3 text-sm"><div><strong>{code.code}</strong><span className="ml-2 text-[#777]">{code.name}</span><span className="ml-2 rounded bg-black/5 px-2 py-1 text-xs">{code.status}</span><span className="ml-2 text-[#777]">Applied {code.redemptions_count ?? 0}{code.redemptions_allowed !== null ? ` / ${code.redemptions_allowed}` : ""} times</span></div><div className="flex gap-3"><button type="button" className="font-semibold text-[#ff641f]" onClick={() => setDiscountCodeForm({ ...code, starts_at: dateTimePickerValue(code.starts_at), ends_at: dateTimePickerValue(code.ends_at) })}>Edit</button>{code.id && <button type="button" className="text-red-600" onClick={() => void deleteDiscountCode(code.id!)}>Delete</button>}</div></div>)}</div>
          </section>
          <section className="rounded-lg border border-black/10 bg-white p-5 sm:p-8">
          <p className="text-xs uppercase tracking-widest text-[#ff641f]">Public website</p>
          <h2 className="mt-2 text-2xl font-semibold">Frequently asked questions</h2>
          <p className="mt-2 text-sm text-[#777]">Add the questions and answers customers should see on the public homepage.</p>
          <div className="mt-6 space-y-4">
            {settings.faqs.map((faq, index) => (
              <div className="border border-black/10 p-4" key={`${index}-${faq.question}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">Question {index + 1}</p>
                  <button type="button" className="text-xs font-semibold text-red-600" onClick={() => removeFaq(index)}>Remove</button>
                </div>
                <input className="mt-3 w-full border border-black/10 px-3 py-3 text-sm" value={faq.question} onChange={event => updateFaq(index, { ...faq, question: event.target.value })} placeholder="What should customers know?" maxLength={255} />
                <textarea className="mt-3 min-h-28 w-full border border-black/10 px-3 py-3 text-sm" value={faq.answer} onChange={event => updateFaq(index, { ...faq, answer: event.target.value })} placeholder="Write a clear answer..." maxLength={5000} />
              </div>
            ))}
            <button type="button" className="border border-[#ff641f] px-4 py-3 text-sm font-semibold text-[#ff641f]" onClick={addFaq}>Add FAQ</button>
            <div className="flex justify-end">
              <button type="button" disabled={saving} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" onClick={() => void persistSettings()}>{saving ? "Saving..." : "Save FAQs"}</button>
            </div>
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Legal pages</h2>
          <p className="mt-2 text-sm text-[#777]">
            Edit the content shown on the public Terms and conditions and Privacy policy pages. Plain text is preserved with line breaks.
          </p>
          <form className="mt-6 space-y-6" onSubmit={save}>
            <label className="block text-sm font-semibold">
              Terms and conditions
              <RichTextEditor
                value={settings.terms_and_conditions ?? ""}
                onChange={value => setSettings(current => ({ ...current, terms_and_conditions: value }))}
                placeholder="Enter your terms and conditions..."
              />
            </label>
            <label className="block text-sm font-semibold">
              Privacy policy
              <RichTextEditor
                value={settings.privacy_policy ?? ""}
                onChange={value => setSettings(current => ({ ...current, privacy_policy: value }))}
                placeholder="Enter your privacy policy..."
              />
            </label>
            <div className="flex justify-end">
              <button disabled={saving} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
                {saving ? "Saving..." : "Save legal content"}
              </button>
            </div>
          </form>
        </section>
        <section className="rounded-lg border border-black/10 bg-white p-5 sm:p-8">
          <p className="text-xs uppercase tracking-widest text-[#ff641f]">Delivery origin</p>
          <h2 className="mt-2 text-2xl font-semibold">Garage location</h2>
          <p className="mt-2 text-sm text-[#777]">
            Search for the garage, choose a result, or click the map to pin the exact location. This will be used as the starting point for future delivery bookings.
          </p>
          <form className="mt-6" onSubmit={findLocation}>
            <label className="block text-sm font-semibold" htmlFor="garage-location-search">Search for a location</label>
            <div className="mt-2 flex gap-2">
              <input
                id="garage-location-search"
                className="min-w-0 flex-1 border border-black/10 px-3 py-3 text-sm"
                placeholder="Search an address, landmark, or business"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              <button type="submit" disabled={searching || !search.trim()} className="shrink-0 bg-[#151515] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
          </form>
          <button
            type="button"
            disabled={locating}
            onClick={useCurrentLocation}
            className="mt-3 border border-black/15 px-4 py-3 text-sm font-semibold text-[#151515] hover:bg-[#f8f7f5] disabled:opacity-50"
          >
            {locating ? "Detecting current location..." : "Use current location"}
          </button>
          {searchResults.length > 0 && (
            <div className="mt-3 divide-y divide-black/10 border border-black/10" role="listbox" aria-label="Location search results">
              {searchResults.map(result => (
                <button
                  type="button"
                  className="block w-full px-3 py-3 text-left text-sm hover:bg-[#f8f7f5]"
                  key={`${result.latitude}:${result.longitude}`}
                  onClick={() => pinLocation(result.latitude, result.longitude, result.name, result.displayName)}
                >
                  {result.displayName}
                </button>
              ))}
            </div>
          )}
          <div className="garage-map mt-4 overflow-hidden border border-black/10">
            <GarageMap
              center={mapCenter}
              position={settings.garage_location_latitude !== null && settings.garage_location_longitude !== null
                ? [settings.garage_location_latitude, settings.garage_location_longitude]
                : null}
              onPin={handleMapClick}
            />
          </div>
          {settings.garage_location_latitude !== null && settings.garage_location_longitude !== null ? (
            <div className="mt-4 flex items-start justify-between gap-4 border border-black/10 bg-[#f8f7f5] p-4 text-sm">
              <div>
                <p className="font-semibold">{settings.garage_location_name ?? "Pinned garage location"}</p>
                <p className="mt-1 text-[#777]">{settings.garage_location_address ?? "Selected directly on the map"}</p>
                <p className="mt-1 text-xs text-[#777]">
                  {settings.garage_location_latitude.toFixed(7)}, {settings.garage_location_longitude.toFixed(7)}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-red-600"
                onClick={() => setSettings(current => ({
                  ...current,
                  garage_location_name: null,
                  garage_location_address: null,
                  garage_location_latitude: null,
                  garage_location_longitude: null,
                }))}
              >
                Clear
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-[#777]">No garage location pinned yet.</p>
          )}
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistSettings()}
              className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save garage location"}
            </button>
          </div>
          <p className="mt-3 text-xs text-[#777]">Map and place data © OpenStreetMap contributors. Search is provided by Photon.</p>
        </section>
        <section className="rounded-lg border border-dashed border-black/20 p-5 text-sm text-[#777]">
          <p className="font-semibold text-[#151515]">Future fleet settings</p>
          <p className="mt-2">Default security deposit, minimum rental duration, booking buffers, customer cancellation rules, and maintenance scheduling can be added here as the fleet policy grows.</p>
        </section>
      </div>
    </AdminShell>
  );
}
