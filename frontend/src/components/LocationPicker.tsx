import { useEffect, useRef, useState } from "react";
import L from "../lib/leaflet";

export type LocationValue = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type Place = { name: string; displayName: string; latitude: number; longitude: number };

async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const response = await fetch(`https://photon.komoot.io/reverse?${new URLSearchParams({ lat: String(latitude), lon: String(longitude), lang: "en" })}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Reverse geocoding is temporarily unavailable.");
  const data = await response.json() as { features?: Array<{ properties?: Record<string, string> }> };
  const properties = data.features?.[0]?.properties ?? {};
  const address = [properties.housenumber && properties.street ? `${properties.housenumber} ${properties.street}` : properties.street, properties.city, properties.state, properties.country].filter(Boolean).join(", ");
  return address || `Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function LocationPicker({ label, value, onChange }: { label: string; value: LocationValue; onChange: (value: LocationValue) => void }) {
  const [search, setSearch] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCenterRef = useRef<[number, number]>([value.latitude ?? 14.5995, value.longitude ?? 120.9842]);
  const initialPositionRef = useRef<[number, number] | null>(value.latitude !== null && value.longitude !== null ? [value.latitude, value.longitude] : null);
  const initialAddressRef = useRef(value.address);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange }, [onChange]);
  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(initialCenterRef.current, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    map.on("click", event => {
      const { lat, lng } = event.latlng;
      onChangeRef.current({ address: `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, latitude: lat, longitude: lng });
      void reverseGeocode(lat, lng)
        .then(address => onChangeRef.current({ address, latitude: lat, longitude: lng }))
        .catch(() => undefined);
    });
    mapRef.current = map;
    if (initialPositionRef.current) {
      const position = initialPositionRef.current;
      markerRef.current = L.circleMarker(position, { radius: 10, color: "#ff641f", fillColor: "#ff641f", fillOpacity: 0.85 }).addTo(map);
      map.setView(position, 15);
      if (initialAddressRef.current === "Pinned location") {
        void reverseGeocode(position[0], position[1])
          .then(address => onChangeRef.current({ address, latitude: position[0], longitude: position[1] }))
          .catch(() => undefined);
      }
    }
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null };
  }, []);
  useEffect(() => { if (value.latitude !== null && value.longitude !== null) { const position: [number, number] = [value.latitude, value.longitude]; mapRef.current?.setView(position, Math.max(mapRef.current.getZoom(), 15)); markerRef.current?.remove(); markerRef.current = mapRef.current ? L.circleMarker(position, { radius: 10, color: "#ff641f", fillColor: "#ff641f", fillOpacity: 0.85 }).addTo(mapRef.current) : null } }, [value.latitude, value.longitude]);
  const find = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: search.trim(), limit: "8", lang: "en" })}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Location search is temporarily unavailable.");
      const data = await response.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }> };
      setPlaces((data.features ?? []).flatMap(feature => {
        const coordinates = feature.geometry?.coordinates; if (!coordinates) return [];
        const properties = feature.properties ?? {}; const name = properties.name ?? "Unnamed location";
        const address = [properties.housenumber && properties.street ? `${properties.housenumber} ${properties.street}` : properties.street, properties.city, properties.state, properties.country].filter(Boolean).join(", ");
        return [{ name, displayName: address ? `${name}, ${address}` : name, latitude: coordinates[1], longitude: coordinates[0] }];
      }));
    } finally { setSearching(false) }
  };
  const select = (place: Place) => { onChange({ address: place.displayName, latitude: place.latitude, longitude: place.longitude }); setPlaces([]); setSearch("") };
  const updateAddress = (address: string) => onChange({ address, latitude: value.latitude, longitude: value.longitude });
  return <div className="mt-2 border border-black/10 p-3"><p className="text-xs font-semibold text-[#555]">{label}</p><div className="mt-2 flex gap-2"><input className="min-w-0 flex-1 border border-black/10 px-3 py-2 text-sm" value={value.address} onChange={event => updateAddress(event.target.value)} placeholder="Address or business name" /><input className="min-w-0 flex-1 border border-black/10 px-3 py-2 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search to pin" /><button type="button" onClick={() => void find()} disabled={searching} className="bg-[#151515] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{searching ? "..." : "Search"}</button></div>{places.length > 0 && <div className="mt-2 divide-y divide-black/10 border border-black/10">{places.map(place => <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-[#f8f7f5]" key={`${place.latitude}:${place.longitude}`} onClick={() => select(place)}>{place.displayName}</button>)}</div>}<div ref={containerRef} className="mt-3 h-48 w-full" /><p className="mt-2 text-xs text-[#777]">Click the map to pin this location.</p></div>;
}
