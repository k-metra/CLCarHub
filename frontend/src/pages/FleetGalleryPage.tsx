import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { VehicleProfileModal } from "./HomePage";
import { vehicleTypeLabels, vehicleTypes, type VehicleImage, type VehicleRecord } from "../types";
import { accountPath, displayName, useAuth, useSignOut } from "../lib/AuthContext";
import PublicFooter from "../components/PublicFooter";
import Seo from "../components/Seo";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
const thumbnailUrl = (vehicle: VehicleRecord) => {
  const image = vehicle.images?.find((item) => item.image_type === "thumbnail");
  return image ? (image.url.startsWith("http") ? image.url : `${apiOrigin}/storage/${image.url.replace(/^\/+/, "").replace(/^storage\//, "")}`) : null;
};

export default function FleetGalleryPage() {
  const { user, loading } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [selected, setSelected] = useState<VehicleRecord | null>(null);
  const [selectedImage, setSelectedImage] = useState<VehicleImage | null>(null);

  useEffect(() => {
    api.get<VehicleRecord[]>("/vehicles/featured").then(response => setVehicles(response.data)).catch(() => setVehicles([]));
  }, []);

  const filtered = useMemo(() => vehicles.filter(vehicle => {
    const matchesType = !type || vehicle.type === type;
    const haystack = `${vehicle.name} ${vehicle.brand} ${vehicle.model} ${vehicle.color}`.toLowerCase();
    return matchesType && haystack.includes(search.toLowerCase().trim());
  }), [search, type, vehicles]);

  const rent = (vehicle: VehicleRecord) => {
    setSelected(null);
    navigate(user?.role === "customer" ? `/account?tab=request&vehicle_id=${vehicle.id}` : `/admin/login?register=1&vehicle_id=${vehicle.id}`);
  };

  return <div className="min-h-screen bg-[#0b0b0b] text-[#f4f3f0]">
    <Seo title="Rental Fleet | Cars and Big Bikes | CL CarHub" description="Browse CL CarHub's available rental cars and big bikes in the Philippines. Compare vehicle types, rates, and details." path="/vehicles" />
    <header className="border-b border-white/[.08]">
      <nav className="mx-auto flex h-[84px] w-[calc(100%-56px)] max-w-[1160px] items-center justify-between">
        <Link to="/" aria-label="CLCarHub home"><img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-20 w-32 object-contain object-left" /></Link>
        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">☰</button>
        <div className={`${menuOpen ? "flex" : "hidden"} absolute left-0 right-0 top-[84px] z-10 flex-col gap-5 bg-[#111] p-6 md:static md:flex md:flex-row md:items-center md:bg-transparent md:p-0`}>
          <Link className="text-[13px] text-[#bbb] hover:text-[#ff641f]" to="/#how-it-works">How it works</Link>
          <Link className="text-[13px] text-[#bbb] hover:text-[#ff641f]" to="/#why-us">Why CL CarHub</Link>
          <Link className="text-[13px] text-[#bbb] hover:text-[#ff641f]" to="/#contact">Contact</Link>
          {!loading && (user ? <><Link className="rounded-[30px] border border-white/[.17] px-4 py-2 text-[13px]" to={accountPath(user)}>{displayName(user)}</Link><button className="text-left text-[13px] text-[#bbb]" onClick={signOut}>Sign out ↗</button></> : <Link className="rounded-[30px] border border-white/[.17] px-4 py-2 text-[13px]" to="/admin/login">Sign in ↗</Link>)}
        </div>
      </nav>
    </header>
    <main className="mx-auto w-[calc(100%-36px)] max-w-[1160px] py-16">
      <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">OUR FLEET</p>
      <h1 className="mt-4 font-['Space_Grotesk'] text-5xl font-semibold tracking-[-3px]">Find your perfect ride.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[#999]">Browse every available vehicle in our marketing gallery.</p>
      <div className="mt-10 grid gap-3 md:grid-cols-[1fr_240px]">
        <input className="border border-white/10 bg-[#151515] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]" placeholder="Search vehicles..." value={search} onChange={event => setSearch(event.target.value)} />
        <select className="border border-white/10 bg-[#151515] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]" value={type} onChange={event => setType(event.target.value)}><option value="">All vehicle types</option>{vehicleTypes.map(vehicleType => <option key={vehicleType} value={vehicleType}>{vehicleTypeLabels[vehicleType]}</option>)}</select>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(vehicle => <button type="button" key={vehicle.id} className="group cursor-pointer border border-white/[.07] bg-[#151515] text-left transition hover:-translate-y-1 hover:border-[#ff641f] hover:shadow-[0_14px_30px_#0008] focus:outline-none focus:ring-2 focus:ring-[#ff641f] focus:ring-offset-2 focus:ring-offset-[#0b0b0b]" onClick={() => { setSelected(vehicle); setSelectedImage(null); }} aria-label={`View profile for ${vehicle.name || `${vehicle.brand} ${vehicle.model}`}`}>
          {thumbnailUrl(vehicle) && <img src={thumbnailUrl(vehicle) ?? ""} alt={vehicle.name || `${vehicle.brand} ${vehicle.model}`} className="h-56 w-full object-cover" />}
          <div className="p-5"><p className="text-[10px] uppercase tracking-wider text-[#ff641f]">{vehicleTypeLabels[vehicle.type]} · {vehicle.transmission}</p><h2 className="mt-2 font-['Space_Grotesk'] text-xl">{vehicle.name || `${vehicle.brand} ${vehicle.model}`}</h2><p className="mt-4 text-lg font-semibold">₱{Number(vehicle.daily_rate).toLocaleString()}<span className="text-xs font-normal text-[#777]"> / day</span></p><span className="mt-4 block text-xs font-semibold text-[#ff641f] opacity-80 transition group-hover:opacity-100">View details <span aria-hidden="true">→</span></span></div>
        </button>)}
      </div>
      {!filtered.length && <p className="mt-8 border border-white/[.07] p-6 text-sm text-[#999]">No vehicles match your search or filter.</p>}
    </main>
    <PublicFooter />
    {selected && <VehicleProfileModal vehicle={selected} selectedImage={selectedImage} onSelectImage={setSelectedImage} onRent={() => rent(selected)} onClose={() => setSelected(null)} />}
  </div>;
}
