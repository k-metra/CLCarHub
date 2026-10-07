import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRef } from "react";
import L from "leaflet";
import { AdminShell } from "../components/AdminShell";
import api from "../lib/api";
import { vehicleTypeLabels, vehicleTypes, type Paginated, type PartnerRecord, type VehicleImage, type VehicleRecord } from "../types";
import { ImageLightbox, RowActions } from "../components/Ui";

const apiOrigin = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api"
).replace(/\/api\/?$/, "");

function resolveImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("blob:")) return value;

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.pathname.startsWith("/storage/")) {
      return `${apiOrigin}${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return `${apiOrigin}/${value.replace(/^\/+/, "")}`;
  }
}

function statusTagClass(status: string): string {
  if (status === "available") return "bg-emerald-100 text-emerald-700";
  if (status === "maintenance") return "bg-amber-100 text-amber-700";
  if (status === "archived") return "bg-slate-100 text-slate-600";
  return "bg-blue-100 text-blue-700";
}

const GPS_REFRESH_INTERVAL_MS = 30_000;
const GPS_STALE_AFTER_MS = 5 * 60_000;

function formatStatus(status: string): string {
  return status === "maintenance"
    ? "In Maintenance"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

type VehicleForm = {
  name: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  plate_number: string;
  seats: string;
  type: string;
  transmission: string;
  fuel_type: string;
  daily_rate: string;
  mileage_limit: string;
  hour_extension_rate: string;
  security_deposit_fee: string;
  delivery_rate_per_km: string;
  status: string;
  partner_id: string;
  aika_enabled: boolean;
  aika_device_id: string;
  aika_device_password: string;
  image: File | null;
};

const galleryImageSlots = [
  ["back", "Back"],
  ["front", "Front"],
  ["left", "Left"],
  ["right", "Right"],
  ["interior_back", "Interior Back"],
  ["interior_front", "Interior Front"],
  ["trunk", "Trunk"],
  ["thumbnail", "Thumbnail (for marketing)"],
] as const;
type GalleryImageType = (typeof galleryImageSlots)[number][0];
type GalleryFiles = Record<GalleryImageType, File | null>;
type GalleryUrls = Record<GalleryImageType, string | null>;

const emptyGalleryFiles = (): GalleryFiles =>
  Object.fromEntries(galleryImageSlots.map(([slot]) => [slot, null])) as GalleryFiles;
const emptyGalleryUrls = (): GalleryUrls =>
  Object.fromEntries(galleryImageSlots.map(([slot]) => [slot, null])) as GalleryUrls;

const emptyForm: VehicleForm = {
  name: "",
  brand: "",
  model: "",
  year: "",
  color: "",
  plate_number: "",
  seats: "4",
  type: "sedan",
  transmission: "automatic",
  fuel_type: "regular_unleaded",
  daily_rate: "",
  mileage_limit: "",
  hour_extension_rate: "",
  security_deposit_fee: "",
  delivery_rate_per_km: "",
  status: "available",
  partner_id: "",
  aika_enabled: false,
  aika_device_id: "",
  aika_device_password: "",
  image: null,
};

const fields: Array<[keyof VehicleForm, string, string]> = [
  ["name", "Name", "text"],
  ["brand", "Brand", "text"],
  ["model", "Model", "text"],
  ["year", "Year", "number"],
  ["color", "Color", "text"],
  ["plate_number", "Plate number", "text"],
  ["seats", "Seat count", "number"],
  ["daily_rate", "Daily rate", "number"],
  ["mileage_limit", "Overall mileage limit (km, optional)", "number"],
  ["hour_extension_rate", "Hourly extension rate (optional)", "number"],
  ["security_deposit_fee", "Security deposit fee (optional)", "number"],
  ["delivery_rate_per_km", "Delivery rate per kilometer (optional)", "number"],
];

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locationVehicle, setLocationVehicle] = useState<VehicleRecord | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; speed: number | null; position_time: string | null; fetched_at: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationRefreshing, setLocationRefreshing] = useState(false);
  const locationMapRef = useRef<HTMLDivElement>(null);
  const locationLeafletRef = useRef<L.Map | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "images">("details");
  const [galleryFiles, setGalleryFiles] = useState<GalleryFiles>(emptyGalleryFiles);
  const [galleryUrls, setGalleryUrls] = useState<GalleryUrls>(emptyGalleryUrls);
  const [form, setForm] = useState(emptyForm);

  const loadVehicles = useCallback(() => {
    setLoading(true);
    api
      .get<Paginated<VehicleRecord>>(
        `/vehicles?per_page=50&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}${type ? `&type=${type}` : ""}${partnerId ? `&partner_id=${partnerId}` : ""}`,
      )
      .then((result) => setVehicles(result.data.data))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load vehicles"),
      )
      .finally(() => setLoading(false));
  }, [search, status, type, partnerId]);

  useEffect(() => {
    const timer = window.setTimeout(loadVehicles, 0);
    return () => window.clearTimeout(timer);
  }, [loadVehicles]);
  useEffect(() => {
    api
      .get<Paginated<PartnerRecord>>("/partners")
      .then((result) => setPartners(result.data.data))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load partners"),
      );
  }, []);

  const updateField = (key: keyof VehicleForm, value: string | boolean | File | null) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "image") {
      setCurrentImageUrl(value instanceof File ? URL.createObjectURL(value) : null);
    }
  };
  const imageUrl = resolveImageUrl(currentImageUrl);
  const openCreate = () => {
    setEditing(null);
    setCurrentImageUrl(null);
    setActiveTab("details");
    setGalleryFiles(emptyGalleryFiles());
    setGalleryUrls(emptyGalleryUrls());
    setForm(emptyForm);
    setShowForm(true);
  };
  const openEdit = (vehicle: VehicleRecord) => {
    setEditing(vehicle.id);
    setCurrentImageUrl(
      vehicle.images?.find((image) => !image.image_type)?.url ?? null,
    );
    setActiveTab("details");
    setGalleryFiles(emptyGalleryFiles());
    setGalleryUrls({
      ...emptyGalleryUrls(),
      ...Object.fromEntries(
        (vehicle.images ?? [])
          .filter((image): image is VehicleImage & { image_type: GalleryImageType } =>
            galleryImageSlots.some(([slot]) => slot === image.image_type),
          )
          .map((image) => [image.image_type, resolveImageUrl(image.url)]),
      ),
    });
    setForm({
      ...emptyForm,
      name: vehicle.name ?? "",
      brand: vehicle.brand,
      model: vehicle.model,
      year: String(vehicle.year ?? ""),
      color: vehicle.color ?? "",
      plate_number: vehicle.plate_number,
      seats: String(vehicle.seats ?? ""),
      type: vehicle.type,
      transmission: vehicle.transmission ?? "automatic",
      fuel_type: vehicle.fuel_type ?? "regular_unleaded",
      daily_rate: vehicle.daily_rate,
      mileage_limit: vehicle.mileage_limit?.toString() ?? "",
      hour_extension_rate: vehicle.hour_extension_rate ?? "",
      security_deposit_fee: vehicle.security_deposit_fee ?? "",
      delivery_rate_per_km: vehicle.delivery_rate_per_km ?? "",
      status: vehicle.status,
      partner_id: vehicle.partner_id?.toString() ?? "",
      aika_enabled: Boolean(vehicle.aika_device_id),
      aika_device_id: vehicle.aika_device_id ?? "",
      aika_device_password: "",
    });
    setShowForm(true);
  };

  const updateGalleryImage = (slot: GalleryImageType, file: File | null) => {
    setGalleryFiles((current) => ({ ...current, [slot]: file }));
    setGalleryUrls((current) => ({
      ...current,
      [slot]: file ? URL.createObjectURL(file) : null,
    }));
  };

  const saveVehicle = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === "image" || key === "aika_enabled" || key === "aika_device_id" || key === "aika_device_password") return;
      if (typeof value === "boolean") return;
      if (key === "partner_id" || key === "delivery_rate_per_km") {
        payload.append(key, value || "");
      } else if (value !== null && value !== "") {
        payload.append(key, value instanceof File ? value : value);
      }
    });
    if (form.aika_enabled) {
      payload.append("aika_device_id", form.aika_device_id);
      if (form.aika_device_password !== "") {
        payload.append("aika_device_password", form.aika_device_password);
      }
    } else if (editing) {
      payload.append("aika_device_id", "");
      payload.append("aika_device_password", "");
    }
    try {
      let vehicleId = editing;
      if (editing) {
        payload.append("_method", "PUT");
        await api.post(`/vehicles/${editing}`, payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (form.image) {
          const imagePayload = new FormData();
          imagePayload.append("image", form.image);
          await api.post(`/vehicles/${editing}/image`, imagePayload, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
      } else {
        const response = await api.post<VehicleRecord>("/vehicles", payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        vehicleId = response.data.id;
      }
      if (vehicleId) {
        await Promise.all(
          galleryImageSlots.map(async ([slot]) => {
            const file = galleryFiles[slot];
            if (file) {
              const imagePayload = new FormData();
              imagePayload.append("image", file);
              imagePayload.append("image_type", slot);
              await api.post(`/vehicles/${vehicleId}/gallery-image`, imagePayload, {
                headers: { "Content-Type": "multipart/form-data" },
              });
            } else if (editing && !galleryUrls[slot]) {
              await api.delete(`/vehicles/${vehicleId}/gallery-image/${slot}`);
            }
          }),
        );
      }
      setShowForm(false);
      setEditing(null);
      setCurrentImageUrl(null);
      setGalleryFiles(emptyGalleryFiles());
      setGalleryUrls(emptyGalleryUrls());
      setForm(emptyForm);
      loadVehicles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save vehicle");
    }
  };

  const archiveVehicle = async (vehicle: VehicleRecord) => {
    const archived = vehicle.status === "archived";
    if (
      !window.confirm(
        archived ? "Restore this vehicle?" : "Archive this vehicle?",
      )
    )
      return;
    try {
      if (archived) await api.post(`/vehicles/${vehicle.id}/restore`);
      else await api.delete(`/vehicles/${vehicle.id}`);
      loadVehicles();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : archived
            ? "Unable to restore vehicle"
            : "Unable to archive vehicle",
      );
    }
  };
  const refreshLocation = useCallback(async (vehicle: VehicleRecord, initial = false) => {
    if (initial) setLocationLoading(true);
    else setLocationRefreshing(true);
    try {
      const response = await api.get<typeof location>("/vehicles/" + vehicle.id + "/location");
      setLocation(response.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load vehicle location");
    } finally {
      if (initial) setLocationLoading(false);
      else setLocationRefreshing(false);
    }
  }, []);
  const showLocation = async (vehicle: VehicleRecord) => {
    setLocationVehicle(vehicle);
    setLocation(null);
    await refreshLocation(vehicle, true);
  };
  useEffect(() => {
    if (!locationVehicle) return;
    const timer = window.setInterval(() => {
      void refreshLocation(locationVehicle);
    }, GPS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [locationVehicle, refreshLocation]);
  useEffect(() => {
    if (!locationVehicle || !location || !locationMapRef.current) return;
    locationLeafletRef.current?.remove();
    const map = L.map(locationMapRef.current).setView([location.latitude, location.longitude], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    L.marker([location.latitude, location.longitude]).addTo(map).bindPopup(`${locationVehicle.name || `${locationVehicle.brand} ${locationVehicle.model}`}<br>${location.speed ?? 0} km/h`).openPopup();
    locationLeafletRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); locationLeafletRef.current = null; };
  }, [locationVehicle, location]);

  return (
    <AdminShell title="Vehicle management">
      <div className="mt-8 border border-black/10 bg-white p-4 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            className="flex-1 border border-black/10 bg-[#f8f7f5] px-4 py-3 text-sm outline-none focus:border-[#ff641f]"
            placeholder="Search brand, model, or plate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border border-black/10 bg-[#f8f7f5] px-4 py-3 text-sm"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
          >
            <option value="">All partners</option>
            <option value="none">CL CarHub</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
          <select
            className="border border-black/10 bg-[#f8f7f5] px-4 py-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {vehicleTypes.map((vehicleType) => <option key={vehicleType} value={vehicleType}>{vehicleTypeLabels[vehicleType]}</option>)}
          </select>
          <select
            className="border border-black/10 bg-[#f8f7f5] px-4 py-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="maintenance">In Maintenance</option>
            <option value="archived">Archived</option>
          </select>
          <button
            className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white"
            onClick={openCreate}
          >
            + Add vehicle
          </button>
        </div>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <form
              className="max-h-[90vh] w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl"
              onSubmit={saveVehicle}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-['Space_Grotesk'] text-2xl font-semibold">
                  {editing ? "Edit vehicle" : "Add vehicle"}
                </h2>
                <button
                  type="button"
                  className="text-2xl text-[#777]"
                  onClick={() => setShowForm(false)}
                >
                  ×
                </button>
              </div>
              <div className="mt-6 flex border-b border-black/10">
                <button type="button" className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === "details" ? "border-[#ff641f] text-[#151515]" : "border-transparent text-[#888]"}`} onClick={() => setActiveTab("details")}>Details</button>
                <button type="button" className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === "images" ? "border-[#ff641f] text-[#151515]" : "border-transparent text-[#888]"}`} onClick={() => setActiveTab("images")}>Images</button>
              </div>
              {activeTab === "details" ? <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="text-xs text-[#777]">
                  Partner
                  <select
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                    value={form.partner_id}
                    onChange={(e) => updateField("partner_id", e.target.value)}
                  >
                    <option value="">CL CarHub</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                </label>
                {fields.map(([key, label, type]) => (
                  <label className="text-xs text-[#777]" key={key}>
                    {label}
                    <input
                      className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                      type={type}
                      min={type === "number" ? "0" : undefined}
                      step={
                        key.includes("rate") || key.includes("fee")
                          ? "0.01"
                          : undefined
                      }
                      value={form[key] as string}
                      onChange={(e) => updateField(key, e.target.value)}
                      required={key !== "name" && !label.includes("optional")}
                    />
                  </label>
                ))}
                <label className="text-xs text-[#777]">
                  Vehicle type
                  <select
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                    value={form.type}
                    onChange={(e) => updateField("type", e.target.value)}
                  >
                    {vehicleTypes.map((vehicleType) => <option key={vehicleType} value={vehicleType}>{vehicleTypeLabels[vehicleType]}</option>)}
                  </select>
                </label>
                <label className="text-xs text-[#777]">
                  Transmission
                  <select
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                    value={form.transmission}
                    onChange={(e) =>
                      updateField("transmission", e.target.value)
                    }
                  >
                    <option value="manual">Manual</option>
                    <option value="automatic">Automatic</option>
                  </select>
                </label>
                <label className="text-xs text-[#777]">
                  Fuel type
                  <select
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                    value={form.fuel_type}
                    onChange={(e) => updateField("fuel_type", e.target.value)}
                  >
                    {[
                      ["regular_unleaded", "Regular Unleaded"],
                      ["premium_95", "Premium 95"],
                      ["premium_98", "Premium 98"],
                      ["diesel", "Diesel"],
                      ["ev_phev", "EV/PHEV"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[#777]">
                  Status
                  <select
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                    value={form.status}
                    onChange={(e) => updateField("status", e.target.value)}
                  >
                    <option value="available">Available</option>
                    <option value="maintenance">In Maintenance</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 text-sm text-[#333] sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.aika_enabled}
                    onChange={(e) => updateField("aika_enabled", e.target.checked)}
                  />
                  <span>Toggle Aika GPS</span>
                </label>
                {form.aika_enabled && <>
                  <label className="text-xs text-[#777]">
                    Aika device ID
                    <input
                      className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                      type="text"
                      value={form.aika_device_id}
                      onChange={(e) => updateField("aika_device_id", e.target.value)}
                      placeholder="e.g. 9175749144"
                      required
                    />
                  </label>
                  <label className="text-xs text-[#777]">
                    Aika device password
                    <input
                      className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                      type="password"
                      value={form.aika_device_password}
                      onChange={(e) => updateField("aika_device_password", e.target.value)}
                      placeholder={editing && form.aika_device_id ? "Leave blank to keep current password" : "Enter tracker password"}
                      autoComplete="new-password"
                      required={!editing || !form.aika_device_id}
                    />
                    <span className="mt-1 block text-[11px] text-[#888]">
                      Stored encrypted and never shown in vehicle responses.
                    </span>
                  </label>
                </>}
                <label
                  className="text-xs text-[#777] md:col-span-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    updateField("image", e.dataTransfer.files[0] ?? null);
                  }}
                >
                  Vehicle image (optional)
                  {imageUrl && (
                    <div className="mt-2">
                      <ImageLightbox src={imageUrl} alt="Vehicle preview" onRemove={() => updateField("image", null)} />
                    </div>
                  )}
                  <input
                    className="mt-2 block w-full cursor-pointer border border-dashed border-black/20 px-3 py-5 text-sm"
                    type="file"
                    accept="image/*"
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateField("image", e.target.files?.[0] ?? null)
                    }
                  />{" "}
                  <span className="mt-2 block text-[11px] text-[#888]">
                    Drop an image here or click to upload. For better calendar
                    output, vehicle image should have a transparent background.{" "}
                    <a
                      className="text-[#ff641f] underline"
                      href="https://remove.bg"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Remove background here.
                    </a>
                  </span>
                </label>
              </div> : <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <p className="text-xs text-[#777] sm:col-span-2">Optional vehicle gallery images. These are separate from the vehicle icon preview.</p>
                {galleryImageSlots.map(([slot, label]) => (
                  <label className="text-xs text-[#777]" key={slot}>
                    {label}
                    {galleryUrls[slot] && <div className="relative mt-2 h-36 overflow-hidden border border-black/10 bg-[#f8f7f5]"><img src={galleryUrls[slot] ?? ""} alt={`${label} preview`} className="h-full w-full object-contain" /><button type="button" className="absolute right-2 top-2 bg-white px-2 py-1 text-xs text-red-600 shadow" onClick={() => updateGalleryImage(slot, null)}>Remove</button></div>}
                    <input className="mt-2 block w-full cursor-pointer border border-dashed border-black/20 px-3 py-4 text-sm" type="file" accept="image/*" onChange={(event) => updateGalleryImage(slot, event.target.files?.[0] ?? null)} />
                  </label>
                ))}
              </div>}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="border border-black/10 px-4 py-2 text-sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button className="bg-[#151515] px-5 py-2 text-sm font-bold text-white">
                  Save vehicle
                </button>
              </div>
            </form>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[1150px] text-left text-sm">
            <thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]">
              <tr>
                <th className="pb-3">Vehicle</th>
                <th className="pb-3">Partner / ownership</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Plate</th>
                <th className="pb-3">Rate</th>
                <th className="pb-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="py-8 text-[#888]" colSpan={7}>
                    Loading vehicles...
                  </td>
                </tr>
              ) : (
                vehicles.map((vehicle) => {
                  const vehicleImage = resolveImageUrl(
                    vehicle.images?.find((image) => !image.image_type)?.url ?? null,
                  );
                  return (
                    <tr
                      className="border-b border-black/[.06]"
                      key={vehicle.id}
                    >
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          {vehicleImage ? (
                            <img
                              className="h-12 w-16 rounded border border-black/10 bg-[#f8f7f5] object-contain p-1"
                              src={vehicleImage}
                              alt=""
                            />
                          ) : (
                            <div
                              className="h-12 w-16 rounded border border-dashed border-black/10 bg-[#f8f7f5]"
                              aria-hidden="true"
                            />
                          )}
                          <span className="font-semibold">
                            {vehicle.name ||
                              `${vehicle.brand} ${vehicle.model}`}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 text-[#777]">
                        {vehicle.partner?.name ??
                          vehicle.ownership ??
                          "CL CarHub"}
                      </td>
                      <td className="py-4 capitalize text-[#777]">
                        {vehicle.type}
                      </td>
                      <td className="py-4 text-[#777]">
                        {vehicle.plate_number}
                      </td>
                      <td className="py-4">
                        ₱{Number(vehicle.daily_rate).toLocaleString()}/day
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTagClass(vehicle.status)}`}
                          >
                            {formatStatus(vehicle.status)}
                          </span>
                          {vehicle.coding_day && (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${vehicle.is_coding_today ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700"}`}
                            >
                              Coding: {vehicle.coding_day}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 text-right"><RowActions actions={[{ label: "Show GPS location", disabled: !vehicle.aika_device_id, onClick: () => void showLocation(vehicle) }, { label: "Edit", onClick: () => openEdit(vehicle) }, { label: vehicle.status === "archived" ? "Restore" : "Archive", danger: vehicle.status !== "archived", onClick: () => void archiveVehicle(vehicle) }]} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {locationVehicle && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <section className="w-full max-w-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-[#ff641f]">Aika GPS</p><h2 className="mt-1 text-xl font-semibold">{locationVehicle.name || `${locationVehicle.brand} ${locationVehicle.model}`}</h2></div><button type="button" className="text-2xl text-[#777]" onClick={() => setLocationVehicle(null)}>×</button></div>
            {locationLoading ? <p className="flex h-72 items-center justify-center text-sm text-[#777]">Loading latest location...</p> : location ? <><div ref={locationMapRef} className="mt-5 h-72 w-full" /><div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#777]"><span className={location.position_time && Date.now() - new Date(location.position_time).getTime() <= GPS_STALE_AFTER_MS ? "text-emerald-700" : "text-amber-700"}>{location.position_time && Date.now() - new Date(location.position_time).getTime() <= GPS_STALE_AFTER_MS ? "Fresh location" : "Stale location"}</span><span>Last position: {location.position_time || "Unknown"}</span><span>Retrieved {new Date(location.fetched_at).toLocaleString()}</span><span>Speed {location.speed ?? 0} km/h</span>{locationRefreshing && <span>Refreshing...</span>}</div></> : <p className="mt-5 text-sm text-red-600">Unable to load a location for this tracker.</p>}
          </section>
        </div>}
      </div>
    </AdminShell>
  );
}
