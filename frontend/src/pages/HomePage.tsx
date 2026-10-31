import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eyebrow } from "../components/Ui";
import PublicFooter from "../components/PublicFooter";
import Seo from "../components/Seo";
import FaqAccordion from "../components/FaqAccordion";
import { DateRangeTimePicker } from "../components/DateTimePicker";
import { LocationPicker, type LocationValue } from "../components/LocationPicker";
import api from "../lib/api";
import { citiesByProvince, luzonProvinces } from "../lib/philippineLocations";
import { vehicleTypes, vehicleTypeLabels, type FaqItem, type VehicleImage, type VehicleRecord, type VehicleType } from "../types";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
const imageUrl = (vehicle: VehicleRecord) => {
  const image = vehicle.images?.find((item) => item.image_type === "thumbnail");
  if (!image) return null;
  return imageUrlFromImage(image);
};
const imageUrlFromImage = (image: VehicleImage) => {
  const rawUrl = image.url.trim();
  if (!rawUrl) return "";
  if (!rawUrl.startsWith("http")) {
    return `${apiOrigin}/storage/${rawUrl.replace(/^\/+/, "").replace(/^storage\//, "")}`;
  }
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.pathname.startsWith("/storage/")
      ? `${apiOrigin}${parsedUrl.pathname}${parsedUrl.search}`
      : rawUrl;
  } catch {
    return rawUrl;
  }
};
const imageLabels: Record<string, string> = {
  thumbnail: "Thumbnail", front: "Front", back: "Back", left: "Left", right: "Right",
  interior_back: "Interior Back", interior_front: "Interior Front", trunk: "Trunk",
};
const fleetCategories = [
  { label: "Cars", types: ["sedan", "hatchback", "crossover"] },
  { label: "SUVs, AUVs & pickups", types: ["suv", "auv", "pickup"] },
  { label: "MPVs & vans", types: ["mpv", "van"] },
  { label: "Motorcycles & big bikes", types: ["motorcycle"] },
] as const;
const allVehicleTypes = [...vehicleTypes] as VehicleType[];
const formatSearchDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { month: "short", day: "numeric" });
};
const formatSearchTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const formatSearchDuration = (minutes: number) => {
  const units = [
    { value: Math.floor(minutes / (30 * 1440)), label: "month" },
    { value: Math.floor(minutes % (30 * 1440) / 1440), label: "day" },
    { value: Math.floor(minutes % 1440 / 60), label: "hour" },
    { value: minutes % 60, label: "minute" },
  ];
  return units.filter(unit => unit.value > 0).map(unit => `${unit.value} ${unit.label}${unit.value === 1 ? "" : "s"}`).join(" ");
};
const searchDuration = (pickupDate: string, returnDate: string, pickupTime: string, returnTime: string) => {
  const pickup = new Date(`${pickupDate}T${pickupTime}:00`);
  const returned = new Date(`${returnDate}T${returnTime}:00`);
  const minutes = (returned.getTime() - pickup.getTime()) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  return formatSearchDuration(minutes);
};
const renderFaqInline = (value: string): ReactNode[] => {
  const parts: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
    if (match[2] && match[3]) parts.push(<a className="text-[#ff9b73] underline underline-offset-2 hover:text-white" href={match[3]} target="_blank" rel="noreferrer" key={`${match.index}-link`}>{match[2]}</a>);
    else if (match[4]) parts.push(<strong key={`${match.index}-bold`}>{match[4]}</strong>);
    else if (match[5]) parts.push(<u key={`${match.index}-underline`}>{match[5]}</u>);
    else if (match[6]) parts.push(<em key={`${match.index}-italic`}>{match[6]}</em>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return parts;
};
const renderFaqAnswer = (value: string) => value.split("\n").map((line, index) => {
  const content = line.startsWith("- ") ? <div key={index} className="flex gap-2"><span aria-hidden="true">•</span><span>{renderFaqInline(line.slice(2))}</span></div> : line.startsWith("## ") ? <h4 key={index} className="font-semibold text-[#f4f3f0]">{renderFaqInline(line.slice(3))}</h4> : line === "---" ? <hr key={index} className="border-white/[.12]" /> : <span key={index}>{renderFaqInline(line)}</span>;
  return <Fragment key={`faq-line-${index}`}>{index > 0 && !line.startsWith("- ") && <br />}{content}</Fragment>;
});

function SearchPanel({
  activeField,
  datePickerOpenRequest,
  selectedVehicleTypes,
  setSelectedVehicleTypes,
  pickupMode,
  setPickupMode,
  garage,
  setGarage,
  province,
  setProvince,
  city,
  setCity,
  tripDetails,
  setTripDetails,
  pickupDate,
  setPickupDate,
  returnDate,
  setReturnDate,
  pickupTime,
  setPickupTime,
  returnTime,
  setReturnTime,
  deliveryLocation,
  setDeliveryLocation,
}: {
  activeField: "from" | "to" | "dates" | "vehicleType" | null;
  datePickerOpenRequest: number;
  selectedVehicleTypes: VehicleType[];
  setSelectedVehicleTypes: (value: VehicleType[]) => void;
  pickupMode: "garage" | "delivery";
  setPickupMode: (value: "garage" | "delivery") => void;
  garage: string;
  setGarage: (value: string) => void;
  province: string;
  setProvince: (value: string) => void;
  city: string;
  setCity: (value: string) => void;
  tripDetails: string;
  setTripDetails: (value: string) => void;
  pickupDate: string;
  setPickupDate: (value: string) => void;
  returnDate: string;
  setReturnDate: (value: string) => void;
  pickupTime: string;
  setPickupTime: (value: string) => void;
  returnTime: string;
  setReturnTime: (value: string) => void;
  deliveryLocation: LocationValue;
  setDeliveryLocation: (value: LocationValue) => void;
}) {
  const showFrom = activeField === null || activeField === "from";
  const showTo = activeField === null || activeField === "to";
  const showDates = activeField === null || activeField === "dates";
  const showTripDetails = activeField === null;
  const vehicleTypePicker = <fieldset>
    <legend className="text-xs text-[#aaa]">Vehicle type</legend>
    <div className="mt-1 border border-white/10 bg-[#0b0b0b] p-3">
      <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
        <button type="button" className="border border-[#ff641f] px-2 py-1 text-[#ff9b73] hover:bg-[#ff641f] hover:text-white" onClick={() => setSelectedVehicleTypes(allVehicleTypes)}>Select all</button>
        <button type="button" className="border border-white/20 px-2 py-1 text-[#aaa] hover:border-[#ff641f] hover:text-white" onClick={() => setSelectedVehicleTypes(allVehicleTypes.slice(0, 1))}>Deselect all</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {allVehicleTypes.map(type => {
          const checked = selectedVehicleTypes.includes(type);
          return <label className="flex items-center gap-2 text-xs text-[#d0cdca]" key={type}>
            <input type="checkbox" checked={checked} onChange={() => {
              if (checked && selectedVehicleTypes.length === 1) return;
              setSelectedVehicleTypes(checked ? selectedVehicleTypes.filter(item => item !== type) : [...selectedVehicleTypes, type]);
            }} className="accent-[#ff641f]" />
            {vehicleTypeLabels[type]}
          </label>;
        })}
      </div>
    </div>
  </fieldset>;
  const datePicker = <DateRangeTimePicker openRequest={activeField === "dates" ? datePickerOpenRequest : 0} value={{ pickupDate, returnDate, pickupTime, returnTime }} onChange={value => { setPickupDate(value.pickupDate); setReturnDate(value.returnDate); setPickupTime(value.pickupTime); setReturnTime(value.returnTime); }} minDate={new Date().toISOString().slice(0, 10)} className="hidden" placeholder="Choose pickup and return dates" />;
  if (activeField === "dates") return datePicker;
  if (activeField === "vehicleType") return <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 border border-white/[.12] bg-[#151515] p-4 text-left shadow-2xl">{vehicleTypePicker}</div>;
  return <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 border border-white/[.12] bg-[#151515] p-4 text-left shadow-2xl">
    <p className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Plan your rental</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {showTripDetails && <div className="sm:col-span-2">{vehicleTypePicker}</div>}
      {showFrom && <>
        <label className="text-xs text-[#aaa]">Pickup
          <select className="mt-1 w-full border border-white/10 bg-[#0b0b0b] px-3 py-2.5 text-sm text-white" value={pickupMode} onChange={event => setPickupMode(event.target.value as "garage" | "delivery")}>
            <option value="garage">Pickup from garage</option>
            <option value="delivery">Delivery to me</option>
          </select>
        </label>
        {pickupMode === "garage" ? <label className="text-xs text-[#aaa]">Garage
          <select className="mt-1 w-full border border-white/10 bg-[#0b0b0b] px-3 py-2.5 text-sm text-white" value={garage} onChange={event => setGarage(event.target.value)}>
            <option value="Cabuyao">CL CarHub - Cabuyao</option>
            <option value="Calamba">CL CarHub - Calamba</option>
          </select>
        </label> : <div className="sm:col-span-2">
          <LocationPicker label="Vehicle handover location" value={deliveryLocation} onChange={setDeliveryLocation} />
        </div>}
      </>}
      {showTo && <>
        <label className="text-xs text-[#aaa]">Province
          <select className="mt-1 w-full border border-white/10 bg-[#0b0b0b] px-3 py-2.5 text-sm text-white" value={province} onChange={event => { setProvince(event.target.value); setCity(""); }}>
            <option value="">Select province</option>
            {luzonProvinces.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#aaa]">City / municipality
          <select className="mt-1 w-full border border-white/10 bg-[#0b0b0b] px-3 py-2.5 text-sm text-white disabled:opacity-50" value={city} onChange={event => setCity(event.target.value)} disabled={!province}>
            <option value="">Select city / municipality</option>
            {(citiesByProvince[province] ?? []).map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </>}
      {showDates && <div className="sm:col-span-2">{datePicker}</div>}
      {showTripDetails && <label className="text-xs text-[#aaa] sm:col-span-2">Trip details <span className="text-[#777]">(optional)</span>
        <input className="mt-1 w-full border border-white/10 bg-[#0b0b0b] px-3 py-2.5 text-sm text-white placeholder:text-[#666]" value={tripDetails} onChange={event => setTripDetails(event.target.value)} placeholder="Dates, destination, or anything else we should know" />
      </label>}
    </div>
  </div>;
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<"from" | "to" | "dates" | "vehicleType" | null>(null);
  const [pickupMode, setPickupMode] = useState<"garage" | "delivery">("garage");
  const [garage, setGarage] = useState("Cabuyao");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [tripDetails, setTripDetails] = useState("");
  const [pickupDate, setPickupDate] = useState(() => searchParams.get("pickup_date") ?? "");
  const [returnDate, setReturnDate] = useState(() => searchParams.get("return_date") ?? "");
  const [pickupTime, setPickupTime] = useState(() => searchParams.get("pickup_time") ?? "09:00");
  const [returnTime, setReturnTime] = useState(() => searchParams.get("return_time") ?? "09:00");
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<VehicleType[]>(() => {
    const values = searchParams.get("vehicle_types")?.split(",") as VehicleType[] | undefined;
    return values?.length && values.every(value => allVehicleTypes.includes(value)) ? values : allVehicleTypes;
  });
  const [datePickerOpenRequest, setDatePickerOpenRequest] = useState(0);
  const [deliveryLocation, setDeliveryLocation] = useState<LocationValue>({ address: "", latitude: null, longitude: null });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchApplied, setSearchApplied] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  useEffect(() => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (pickupDate) next.set("pickup_date", pickupDate); else next.delete("pickup_date");
      if (returnDate) next.set("return_date", returnDate); else next.delete("return_date");
      if (pickupTime) next.set("pickup_time", pickupTime); else next.delete("pickup_time");
      if (returnTime) next.set("return_time", returnTime); else next.delete("return_time");
      next.set("vehicle_types", selectedVehicleTypes.join(","));
      return next;
    }, { replace: true });
  }, [pickupDate, returnDate, pickupTime, returnTime, selectedVehicleTypes, setSearchParams]);
  const searchVehicles = async () => {
    if (!pickupDate || !returnDate) {
      setSearchError("Choose pickup and return dates to see available units.");
      setSearchOpen(true);
      setActiveSearchField("dates");
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    try {
      const response = await api.get<VehicleRecord[]>("/vehicles/availability", {
        params: {
          type: "all",
          types: selectedVehicleTypes,
          pickup_at: new Date(`${pickupDate}T${pickupTime}:00`).toISOString(),
          return_at: new Date(`${returnDate}T${returnTime}:00`).toISOString(),
        },
      });
      setVehicles(response.data);
      setSearchApplied(true);
      setSearchOpen(false);
      window.setTimeout(() => document.getElementById("fleet")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Unable to check vehicle availability.");
    } finally {
      setSearchLoading(false);
    }
  };
  useEffect(() => {
    api.get<VehicleRecord[]>("/vehicles/featured")
      .then((response) => setVehicles(response.data))
      .catch(() => setVehicles([]))
      .finally(() => setVehiclesLoading(false));
  }, []);
  useEffect(() => {
    api.get<{ faqs?: FaqItem[] }>("/legal-settings")
      .then(response => setFaqs(response.data.faqs ?? []))
      .catch(() => setFaqs([]));
  }, []);
  return (
    <div className="min-h-screen overflow-hidden bg-[#0b0b0b] text-[#f4f3f0]">
      <Seo
        title="Car and Big Bike Rentals in the Philippines | CL CarHub"
        description="Rent reliable cars and big bikes from CL CarHub in the Philippines. Browse our fleet, check availability, and request your next ride."
        path="/"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "AutoRental",
          name: "CL CarHub",
          url: "https://clcarhub.com/",
          logo: "https://clcarhub.com/clcarhublogo_upscaled.png",
          description: "Car and big bike rentals in the Philippines.",
          areaServed: "Philippines",
        }}
      />
      <header className="relative z-10 w-full border-b border-white/[.08] bg-[#0b0b0b]">
        <nav className="mx-auto flex min-h-[76px] w-[calc(100%-36px)] max-w-[1240px] items-center gap-5 py-3">
          <Link className="shrink-0" to="/" aria-label="CLCarHub home">
            <img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-20 w-32 object-contain object-left" />
          </Link>
          <div className="relative hidden min-w-0 flex-1 md:block">
            <div className="flex min-h-12 w-full items-stretch border border-white/[.15] bg-[#151515] px-1 shadow-[0_8px_24px_#0005]">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left hover:bg-white/[.04]" onClick={() => { setActiveSearchField("dates"); setDatePickerOpenRequest(current => current + 1); setSearchOpen(true); }} aria-label="Choose rental dates">
                <span className="text-lg text-[#ff641f]" aria-hidden="true">▣</span>
                <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[1.4px] text-[#777]">Dates</span>{pickupDate && returnDate ? <span className="block truncate text-xs text-[#d0cdca]">{formatSearchDate(pickupDate)}, {formatSearchTime(pickupTime)} <span className="text-[#777]">—</span> {formatSearchDate(returnDate)}, {formatSearchTime(returnTime)} <strong className="ml-1 text-[#ff9b73]">· {searchDuration(pickupDate, returnDate, pickupTime, returnTime)}</strong></span> : <span className="block truncate text-xs text-[#d0cdca]">Add dates</span>}</span>
              </button>
              <button type="button" className="hidden min-w-[8rem] items-center border-l border-white/[.1] px-3 text-left hover:bg-white/[.04] sm:flex" onClick={() => { setActiveSearchField("vehicleType"); setSearchOpen(true); }} aria-label="Choose vehicle types">
                <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[1.4px] text-[#777]">Vehicle type</span><span className="block truncate text-xs text-[#d0cdca]">{selectedVehicleTypes.length === allVehicleTypes.length ? "All types" : `${selectedVehicleTypes.length} selected`}</span></span>
              </button>
              <button type="button" className="my-1 flex w-12 shrink-0 items-center justify-center bg-[#ff641f] text-sm font-bold text-white hover:bg-[#ff7b42] disabled:cursor-wait disabled:opacity-70" onClick={() => searchOpen ? void searchVehicles() : (setActiveSearchField(null), setSearchOpen(true))} disabled={searchLoading} aria-label={searchOpen ? "Search available vehicles" : "Open search options"}>{searchLoading ? "…" : "⌕"}</button>
            </div>
            {searchOpen && <SearchPanel activeField={activeSearchField} datePickerOpenRequest={datePickerOpenRequest} selectedVehicleTypes={selectedVehicleTypes} setSelectedVehicleTypes={setSelectedVehicleTypes} pickupMode={pickupMode} setPickupMode={setPickupMode} garage={garage} setGarage={setGarage} province={province} setProvince={setProvince} city={city} setCity={setCity} tripDetails={tripDetails} setTripDetails={setTripDetails} pickupDate={pickupDate} setPickupDate={setPickupDate} returnDate={returnDate} setReturnDate={setReturnDate} pickupTime={pickupTime} setPickupTime={setPickupTime} returnTime={returnTime} setReturnTime={setReturnTime} deliveryLocation={deliveryLocation} setDeliveryLocation={setDeliveryLocation} />}
          </div>
          <Link className="hidden text-sm font-semibold text-[#bbb] hover:text-[#ff641f] lg:block" to="/faq">FAQ</Link>
          <Link className="hidden rounded-full bg-[#242424] px-5 py-3 text-sm font-bold text-white hover:bg-[#ff641f] md:block" to="/host-partnership">Become a host</Link>
          <Link className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-bold text-white hover:border-[#ff641f] hover:bg-[#ff641f]" to="/admin/login">Sign in</Link>
        </nav>
      </header>
      <main className="bg-[#0b0b0b] text-[#f4f3f0]">
        <div className="relative border-b border-white/[.08] bg-[#111] px-[18px] py-3 md:hidden">
          <button type="button" className="flex h-12 w-full items-center gap-3 border border-white/[.15] bg-[#151515] px-4 text-left" onClick={() => searchOpen ? void searchVehicles() : (setActiveSearchField(null), setSearchOpen(true))}><span className="text-[#ff641f]">⌖</span><span className="flex-1 truncate text-sm text-[#bbb]">Find your next CL CarHub ride</span><span className="bg-[#ff641f] px-3 py-2 text-xs font-bold">{searchOpen ? "Search" : "Plan"}</span></button>
          {searchOpen && <SearchPanel activeField={null} datePickerOpenRequest={datePickerOpenRequest} selectedVehicleTypes={selectedVehicleTypes} setSelectedVehicleTypes={setSelectedVehicleTypes} pickupMode={pickupMode} setPickupMode={setPickupMode} garage={garage} setGarage={setGarage} province={province} setProvince={setProvince} city={city} setCity={setCity} tripDetails={tripDetails} setTripDetails={setTripDetails} pickupDate={pickupDate} setPickupDate={setPickupDate} returnDate={returnDate} setReturnDate={setReturnDate} pickupTime={pickupTime} setPickupTime={setPickupTime} returnTime={returnTime} setReturnTime={setReturnTime} deliveryLocation={deliveryLocation} setDeliveryLocation={setDeliveryLocation} />}
        </div>
        <section
          className="mx-auto w-[calc(100%-36px)] max-w-[1240px] py-10 sm:py-14"
          id="fleet"
        >
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#ff641f]">CL CarHub fleet</p>
              <h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold tracking-[-1px] md:text-4xl">{searchApplied ? "Available for your dates." : "Choose your next ride."}</h1>
            </div>
            <Link to="/vehicles" className="shrink-0 text-sm font-bold text-[#ff641f] hover:text-[#d94f12]">View all <span aria-hidden="true">→</span></Link>
          </div>
          {searchError && <p className="mb-6 border border-[#ff641f]/40 bg-[#2a1710] p-3 text-sm text-[#ffb18e]">{searchError}</p>}
          {vehiclesLoading ? <div className="flex gap-4 overflow-hidden">{Array.from({ length: 4 }, (_, index) => <div className="h-[350px] min-w-[280px] animate-pulse bg-[#151515]" key={`vehicle-skeleton-${index}`} />)}</div> : fleetCategories.map(category => {
            const categoryVehicles = vehicles.filter(vehicle => (category.types as readonly string[]).includes(vehicle.type));
            if (!categoryVehicles.length) return null;
            return <section className="mt-10 first:mt-0" key={category.label} aria-labelledby={`category-${category.label}`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 id={`category-${category.label}`} className="font-['Space_Grotesk'] text-xl font-semibold">{category.label}</h2>
                <span className="text-xs text-[#777]">Swipe to browse <span aria-hidden="true">→</span></span>
              </div>
              <div className="flex snap-x gap-4 overflow-x-auto pb-4">
                {categoryVehicles.map((vehicle) => {
              const image = imageUrl(vehicle);
              return (
                <Link key={vehicle.id} to={`/vehicles/${vehicle.id}`} className="group w-[280px] min-w-[280px] snap-start overflow-hidden border border-white/[.07] bg-[#151515] text-left transition hover:-translate-y-1 hover:border-[#ff641f] hover:shadow-[0_14px_30px_#0008] focus:outline-none focus:ring-2 focus:ring-[#ff641f] sm:w-[300px] sm:min-w-[300px]">
                  <div className="relative h-[220px] overflow-hidden bg-[#191919]">
                    {image ? <img className="h-full w-full object-cover saturate-[.7] transition duration-500 group-hover:scale-105" src={image} alt={vehicle.name || `${vehicle.brand} ${vehicle.model}`} /> : <div className="flex h-full items-center justify-center text-sm text-[#777]">Vehicle photo coming soon</div>}
                    <span className="absolute bottom-3 left-3 bg-[#ff641f] px-3 py-1 text-[10px] font-bold text-white">{vehicleTypeLabels[vehicle.type]}</span>
                  </div>
                  <div className="p-[18px]">
                    <h3 className="font-['Space_Grotesk'] text-lg font-semibold">{vehicle.name || `${vehicle.brand} ${vehicle.model}`}</h3>
                    <p className="mt-1 text-xs text-[#777]">{vehicle.brand} {vehicle.model} · {vehicle.transmission}</p>
                    <strong className="mt-4 block font-['Space_Grotesk'] text-lg">₱{Number(vehicle.daily_rate).toLocaleString()}<i className="text-xs font-normal text-[#777]"> / day</i></strong>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="border border-white/[.12] px-2.5 py-1 text-[10px] text-[#999]">{vehicle.seats} seats</span>
                      {vehicle.mileage_limit !== null && vehicle.mileage_limit !== undefined && <span className="border border-white/[.12] px-2.5 py-1 text-[10px] text-[#999]">{vehicle.mileage_limit.toLocaleString()} km</span>}
                    </div>
                    <span className="mt-5 block text-xs font-bold text-[#ff641f]">View details <span aria-hidden="true">→</span></span>
                  </div>
                </Link>
              );
            })}
              </div>
            </section>;
          })}
          {!vehiclesLoading && !vehicles.length && <p className="border border-black/10 p-6 text-sm text-[#777]">Our gallery is being refreshed. Check back soon for available vehicles.</p>}
        </section>
        <section
          className="border-y border-white/[.06] bg-[#151515] py-20 text-white"
          id="how-it-works"
        >
          <div className="mx-auto w-[calc(100%-36px)] max-w-[1160px]">
            <Eyebrow>SIMPLE BY DESIGN</Eyebrow>
            <h2 className="mt-[17px] font-['Space_Grotesk'] text-[44px] font-semibold">
              Get moving in{" "}
              <em className="not-italic text-[#ff641f]">three steps.</em>
            </h2>
            <div className="mt-10 grid gap-px bg-white/[.08] md:grid-cols-3">
              {["Choose your ride", "Book in a few clicks", "Hit the road"].map(
                (step, index) => (
                  <div className="bg-[#151515] p-[30px]" key={step}>
                    <b className="text-[#ff641f]">0{index + 1}</b>
                    <h3 className="mt-12 font-['Space_Grotesk'] text-xl">
                      {step}
                    </h3>
                    <p className="mt-3 text-xs leading-[1.6] text-[#777]">
                      A simpler way to rent, with support at every step.
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>
        <section
          className="mx-auto w-[calc(100%-36px)] max-w-[1160px] py-20"
          id="why-us"
        >
          <Eyebrow>WHY CL CARHUB</Eyebrow>
          <h2 className="mt-[17px] font-['Space_Grotesk'] text-[44px] font-semibold">
            More than a rental.
            <br />
            <em className="not-italic text-[#ff641f]">Your road partner.</em>
          </h2>
          <p className="mt-6 max-w-[500px] text-sm leading-[1.75] text-[#85827e]">
            Every CL CarHub ride is clean, checked, and backed by people who
            care about your journey.
          </p>
        </section>
        {faqs.length > 0 && <section className="border-y border-white/[.06] bg-[#151515] py-20 text-white" id="faq">
          <div className="mx-auto w-[calc(100%-36px)] max-w-[900px]">
            <Eyebrow>QUESTIONS, ANSWERED</Eyebrow>
            <h2 className="mt-[17px] font-['Space_Grotesk'] text-[44px] font-semibold">Frequently asked <em className="not-italic text-[#ff641f]">questions.</em></h2>
            <div className="mt-10 divide-y divide-white/[.1] border-y border-white/[.1]">
              {faqs.map((faq, index) => <FaqAccordion className="py-5 text-lg" key={`${index}-${faq.question}`} question={faq.question}>
                <div className="mt-4 max-w-3xl text-sm leading-7 text-[#999]">{renderFaqAnswer(faq.answer)}</div>
              </FaqAccordion>)}
            </div>
          </div>
        </section>}
        <section className="border-y border-white/[.06] bg-[#151515] py-20 text-white" id="contact">
          <div className="mx-auto w-[calc(100%-36px)] max-w-[1160px]">
            <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-end">
              <div>
                <Eyebrow>CONTACT CL CARHUB</Eyebrow>
                <h2 className="mt-[17px] font-['Space_Grotesk'] text-[44px] font-semibold leading-[.94] tracking-[-3px] md:text-[54px]">
                  Let&apos;s get you
                  <br />
                  <em className="not-italic text-[#ff641f]">on the road.</em>
                </h2>
                <p className="mt-6 max-w-[420px] text-sm leading-[1.75] text-[#85827e]">
                  Have a question about a vehicle, booking, or delivery? Reach out to the CL CarHub team.
                </p>
              </div>
              <div className="grid gap-px bg-white/[.08] sm:grid-cols-2">
                <a className="bg-[#151515] p-6 transition hover:bg-[#1d1d1d]" href="tel:+639761928977">
                  <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Call or text</span>
                  <strong className="mt-3 block font-['Space_Grotesk'] text-xl">0976 192 8977</strong>
                </a>
                <a className="bg-[#151515] p-6 transition hover:bg-[#1d1d1d]" href="mailto:licoancyril25@gmail.com">
                  <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Email</span>
                  <strong className="mt-3 block break-all font-['Space_Grotesk'] text-xl">licoancyril25@gmail.com</strong>
                </a>
                <div className="grid gap-px bg-white/[.08] sm:col-span-2 sm:grid-cols-2">
                  {[
                    ["CL CarHub - Cabuyao", "Cabuyao, Laguna"],
                    ["CL CarHub - Calamba", "Calamba, Laguna"],
                  ].map(([name, address]) => (
                    <div className="bg-[#151515]" key={name}>
                      <div className="p-6">
                        <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Pickup garage</span>
                        <strong className="mt-3 block font-['Space_Grotesk'] text-xl">{name}</strong>
                        <address className="mt-2 not-italic text-sm leading-6 text-[#d0cdca]">{address}</address>
                      </div>
                      <iframe
                        className="h-56 w-full border-0"
                        src={`https://www.google.com/maps?q=${encodeURIComponent(name)}&output=embed`}
                        title={`${name} map`}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  ))}
                </div>
                <a className="bg-[#151515] p-6 transition hover:bg-[#1d1d1d]" href="https://www.facebook.com/p/CL-CarHub-61567994249496/" target="_blank" rel="noreferrer">
                  <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Facebook</span>
                  <strong className="mt-3 block font-['Space_Grotesk'] text-xl">CL CarHub ↗</strong>
                </a>
                <a className="bg-[#151515] p-6 transition hover:bg-[#1d1d1d]" href="https://www.tiktok.com/@cl_carhub" target="_blank" rel="noreferrer">
                  <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">TikTok</span>
                  <strong className="mt-3 block font-['Space_Grotesk'] text-xl">@cl_carhub ↗</strong>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

export function VehicleProfileModal({
  vehicle,
  selectedImage,
  onSelectImage,
  onRent,
  onClose,
}: {
  vehicle: VehicleRecord;
  selectedImage: VehicleImage | null;
  onSelectImage: (image: VehicleImage) => void;
  onRent: () => void;
  onClose: () => void;
}) {
  const gallery = vehicle.images?.filter((image) => image.image_type) ?? [];
  const title = vehicle.name || `${vehicle.brand} ${vehicle.model}`;
  const heroImage = selectedImage ?? gallery.find((image) => image.image_type === "thumbnail") ?? gallery[0];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={`${title} profile`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mx-auto my-4 max-w-5xl border border-white/10 bg-[#111] text-[#f4f3f0] shadow-2xl sm:my-8">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
          <p className="text-xs font-bold uppercase tracking-[2px] text-[#ff641f]">Vehicle profile</p>
          <button type="button" className="text-2xl leading-none text-[#aaa] hover:text-white" aria-label="Close vehicle profile" onClick={onClose}>×</button>
        </div>
        <div className="grid gap-0 lg:grid-cols-[1.15fr_.85fr]">
          <section className="border-b border-white/10 p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <div className="flex h-[280px] items-center justify-center bg-[#191919] sm:h-[390px]">
              {heroImage ? <img src={imageUrlFromImage(heroImage)} alt={imageLabels[heroImage.image_type ?? ""] ?? title} className="h-full w-full object-contain" /> : <span className="text-sm text-[#777]">No gallery image</span>}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {gallery.map((image) => <button type="button" key={image.id} className={`overflow-hidden border-2 bg-[#191919] ${selectedImage?.id === image.id ? "border-[#ff641f]" : "border-transparent"}`} onClick={() => onSelectImage(image)}><img src={imageUrlFromImage(image)} alt={imageLabels[image.image_type ?? ""] ?? "Vehicle gallery image"} className="h-16 w-full object-cover" /></button>)}
            </div>
          </section>
          <section className="p-5 sm:p-7">
            <p className="text-xs uppercase tracking-[1.5px] text-[#ff641f]">{vehicleTypeLabels[vehicle.type]} · {vehicle.transmission}</p>
            <h2 className="mt-3 font-['Space_Grotesk'] text-3xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-[#888]">{vehicle.brand} {vehicle.model} · {vehicle.year}</p>
            <p className="mt-7 font-['Space_Grotesk'] text-3xl font-semibold">₱{Number(vehicle.daily_rate).toLocaleString()}<span className="text-sm font-normal text-[#888]"> / day</span></p>
            <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-white/10 py-6 text-sm">
              <ProfileDetail label="Overall mileage limit" value={vehicle.mileage_limit == null ? "No limit listed" : `${vehicle.mileage_limit.toLocaleString()} km total`} />
              <ProfileDetail label="Fuel type" value={vehicle.fuel_type.replaceAll("_", " ")} />
              <ProfileDetail label="Plate number" value={vehicle.plate_number} />
              <ProfileDetail label="Color" value={vehicle.color} />
              <ProfileDetail label="Seats" value={String(vehicle.seats)} />
              <ProfileDetail label="Status" value={vehicle.status} />
            </div>
            {vehicle.description && <p className="mt-6 text-sm leading-6 text-[#aaa]">{vehicle.description}</p>}
            <button type="button" className="mt-8 w-full bg-[#ff641f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#ff7b42]" onClick={onRent}>Rent this vehicle →</button>
          </section>
        </div>
      </div>
    </div>
  );
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-wider text-[#777]">{label}</p><p className="mt-1 capitalize font-medium text-[#eee]">{value || "—"}</p></div>;
}
