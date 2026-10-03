import { useEffect, useRef, useState, type FormEvent } from "react";
import L from "leaflet";
import { AdminShell } from "../components/AdminShell";
import { useToast } from "../components/Ui";
import api from "../lib/api";
import type { FleetSettings } from "../types";
import RichTextEditor from "../components/RichTextEditor";

const defaultMapCenter: [number, number] = [14.5995, 120.9842];
const defaults: FleetSettings = {
  reservation_fee: "0",
  reservation_fee_deductible: true,
  default_hour_extension_rate: "200",
  full_day_extension_threshold_hours: 12,
  late_return_grace_period_minutes: 60,
  default_delivery_rate_per_km: "0",
  garage_location_name: null,
  garage_location_address: null,
  garage_location_latitude: null,
  garage_location_longitude: null,
  terms_and_conditions: null,
  privacy_policy: null,
};

type SearchResult = {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
};

const normalizeSettings = (value: Partial<FleetSettings>): FleetSettings => ({
  reservation_fee: value.reservation_fee ?? defaults.reservation_fee,
  reservation_fee_deductible: value.reservation_fee_deductible ?? defaults.reservation_fee_deductible,
  default_hour_extension_rate: value.default_hour_extension_rate === undefined ? defaults.default_hour_extension_rate : value.default_hour_extension_rate,
  full_day_extension_threshold_hours: value.full_day_extension_threshold_hours ?? defaults.full_day_extension_threshold_hours,
  late_return_grace_period_minutes: value.late_return_grace_period_minutes ?? defaults.late_return_grace_period_minutes,
  default_delivery_rate_per_km: value.default_delivery_rate_per_km ?? defaults.default_delivery_rate_per_km,
  garage_location_name: value.garage_location_name ?? defaults.garage_location_name,
  garage_location_address: value.garage_location_address ?? defaults.garage_location_address,
  garage_location_latitude: value.garage_location_latitude == null ? null : Number(value.garage_location_latitude),
  garage_location_longitude: value.garage_location_longitude == null ? null : Number(value.garage_location_longitude),
  terms_and_conditions: value.terms_and_conditions ?? defaults.terms_and_conditions,
  privacy_policy: value.privacy_policy ?? defaults.privacy_policy,
});

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

  return (
    <AdminShell title="Fleet Settings">
      <div className="mt-8 max-w-3xl space-y-6">
        <section className="border border-black/10 bg-white p-5 sm:p-8">
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
              <div className="flex justify-end">
                <button disabled={saving} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save settings"}</button>
              </div>
            </form>
          )}
        </section>
        <section className="border border-black/10 bg-white p-5 sm:p-8">
          <p className="text-xs uppercase tracking-widest text-[#ff641f]">Public website</p>
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
        <section className="border border-black/10 bg-white p-5 sm:p-8">
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
        <section className="border border-dashed border-black/20 p-5 text-sm text-[#777]">
          <p className="font-semibold text-[#151515]">Future fleet settings</p>
          <p className="mt-2">Default security deposit, minimum rental duration, booking buffers, customer cancellation rules, and maintenance scheduling can be added here as the fleet policy grows.</p>
        </section>
      </div>
    </AdminShell>
  );
}
