import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "../components/Ui";
import PublicFooter from "../components/PublicFooter";
import Seo from "../components/Seo";
import api from "../lib/api";
import { accountPath, displayName, useAuth, useSignOut } from "../lib/AuthContext";
import { vehicleTypeLabels, type VehicleImage, type VehicleRecord } from "../types";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
const imageUrl = (image: VehicleImage) => image.url.startsWith("http") ? image.url : `${apiOrigin}/storage/${image.url.replace(/^\/+/, "").replace(/^storage\//, "")}`;
const imageLabels: Record<string, string> = {
  thumbnail: "Thumbnail", front: "Front", back: "Back", left: "Left", right: "Right",
  interior_back: "Interior back", interior_front: "Interior front", trunk: "Trunk",
};

export default function VehicleDetailPage() {
  const { vehicleId } = useParams();
  const [searchParams] = useSearchParams();
  const [vehicle, setVehicle] = useState<VehicleRecord | null>(null);
  const [otherVehicles, setOtherVehicles] = useState<VehicleRecord[]>([]);
  const [selectedImage, setSelectedImage] = useState<VehicleImage | null>(null);
  const [error, setError] = useState("");
  const { user, loading } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const pickupAt = searchParams.get("pickup_at") ?? "";
  const returnAt = searchParams.get("return_at") ?? "";

  useEffect(() => {
    if (!vehicleId) return;
    api.get<VehicleRecord>(`/vehicles/${vehicleId}`)
      .then(response => setVehicle(response.data))
      .catch(() => setError("This vehicle could not be found."))
    api.get<VehicleRecord[]>("/vehicles/featured")
      .then(response => setOtherVehicles(response.data))
      .catch(() => setOtherVehicles([]))
  }, [vehicleId]);
  useEffect(() => {
    if (!vehicleId || user?.role !== "customer") return;
    const key = `clcarhub-recent-vehicles-${user.id}`;
    try {
      const current = JSON.parse(window.localStorage.getItem(key) ?? "[]") as number[];
      const next = [Number(vehicleId), ...current.filter(id => id !== Number(vehicleId))].slice(0, 10);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      window.localStorage.setItem(key, JSON.stringify([Number(vehicleId)]));
    }
  }, [user, vehicleId]);

  if (error) {
    return <div className="min-h-screen bg-[#0b0b0b] px-6 py-24 text-center text-[#f4f3f0]"><p className="text-[#ff641f]">{error}</p><Link className="mt-6 inline-block text-sm text-[#ff9b73]" to="/vehicles">← Back to our fleet</Link></div>;
  }
  if (!vehicle) return <div className="min-h-screen bg-[#0b0b0b] px-6 py-24 text-center text-sm text-[#999]">Loading vehicle details...</div>;

  const title = vehicle.name || `${vehicle.brand} ${vehicle.model}`;
  const seoTitle = `${vehicle.brand} ${vehicle.model}`;
  const gallery = vehicle.images?.filter(image => image.image_type) ?? [];
  const heroImage = selectedImage ?? gallery.find(image => image.image_type === "thumbnail") ?? gallery[0];
  const rent = () => {
    const schedule = new URLSearchParams({ vehicle_id: String(vehicle.id) });
    if (pickupAt) schedule.set("pickup_at", pickupAt);
    if (returnAt) schedule.set("return_at", returnAt);
    navigate(user?.role === "customer" ? `/account?tab=request&${schedule}` : `/admin/login?register=1&${schedule}`);
  };

  return <div className="min-h-screen bg-[#0b0b0b] text-[#f4f3f0]">
    <Seo
      title={`${seoTitle} Rental in the Philippines | CL CarHub`}
      description={`Rent the ${seoTitle}${vehicle.name ? ` (${vehicle.name})` : ""} from CL CarHub. View photos, specifications, daily rate, and request this vehicle for your next trip.`}
      path={`/vehicles/${vehicle.id}`}
      structuredData={{
        "@context": "https://schema.org",
        "@type": "Product",
        name: title,
        description: vehicle.description || `Rent the ${title} from CL CarHub.`,
        image: gallery.map(image => imageUrl(image)),
        brand: { "@type": "Brand", name: vehicle.brand },
        offers: { "@type": "Offer", priceCurrency: "PHP", price: Number(vehicle.daily_rate), availability: "https://schema.org/InStock", url: `https://clcarhub.com/vehicles/${vehicle.id}` },
      }}
    />
    <header className="border-b border-white/[.08]">
      <nav className="mx-auto flex h-[84px] w-[calc(100%-36px)] max-w-[1160px] items-center justify-between">
        <Link to="/" aria-label="CLCarHub home"><img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-20 w-32 object-contain object-left" /></Link>
        <div className="flex items-center gap-5 text-sm">
          <Link className="text-[#bbb] hover:text-[#ff641f]" to="/vehicles">Our fleet</Link>
          {!loading && (user ? <><Link className="rounded-[30px] border border-white/[.17] px-4 py-2" to={accountPath(user)}>{displayName(user)}</Link><button className="text-[#bbb]" onClick={signOut}>Sign out ↗</button></> : <Link className="rounded-[30px] border border-white/[.17] px-4 py-2" to="/admin/login">Sign in ↗</Link>)}
        </div>
      </nav>
    </header>
    <main className="mx-auto w-[calc(100%-36px)] max-w-[1160px] py-12 sm:py-20">
      <Link className="text-sm text-[#ff641f] hover:text-[#ff9b73]" to="/vehicles">← Back to our fleet</Link>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.15fr_.85fr]">
        <section>
          <div className="flex min-h-[300px] items-center justify-center bg-[#191919] sm:min-h-[500px]">
            {heroImage ? <img src={imageUrl(heroImage)} alt={imageLabels[heroImage.image_type ?? ""] ?? title} className="h-full max-h-[500px] w-full object-contain" /> : <span className="text-sm text-[#777]">No gallery image</span>}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {gallery.map(image => <button type="button" key={image.id} className={`overflow-hidden border-2 bg-[#191919] ${selectedImage?.id === image.id ? "border-[#ff641f]" : "border-transparent"}`} onClick={() => setSelectedImage(image)}><img src={imageUrl(image)} alt={imageLabels[image.image_type ?? ""] ?? "Vehicle gallery image"} className="h-16 w-full object-cover" /></button>)}
          </div>
        </section>
        <section className="self-start">
          <p className="text-xs font-bold uppercase tracking-[1.5px] text-[#ff641f]">{vehicleTypeLabels[vehicle.type]} · {vehicle.transmission}</p>
          <h1 className="mt-3 font-['Space_Grotesk'] text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-2 text-sm text-[#888]">{vehicle.brand} {vehicle.model} · {vehicle.year}</p>
          <p className="mt-8 font-['Space_Grotesk'] text-4xl font-semibold">₱{Number(vehicle.daily_rate).toLocaleString()}<span className="text-sm font-normal text-[#888]"> / day</span></p>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-white/10 py-6 text-sm">
            <Detail label="Overall mileage limit" value={vehicle.mileage_limit == null ? "No limit listed" : `${vehicle.mileage_limit.toLocaleString()} km total`} />
            <Detail label="Fuel type" value={vehicle.fuel_type.replaceAll("_", " ")} />
            <Detail label="Plate number" value={vehicle.plate_number} />
            <Detail label="Color" value={vehicle.color} />
            <Detail label="Seats" value={String(vehicle.seats)} />
            <Detail label="Status" value={vehicle.status} />
          </div>
          {vehicle.description && <p className="mt-7 text-sm leading-7 text-[#aaa]">{vehicle.description}</p>}
          <div className="mt-8"><Button onClick={rent}>Rent this vehicle →</Button></div>
        </section>
      </div>
      {otherVehicles.filter(other => other.id !== vehicle.id).length > 0 && <section className="mt-20 border-t border-white/10 pt-12">
        <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">EXPLORE MORE</p>
        <h2 className="mt-3 font-['Space_Grotesk'] text-3xl font-semibold">Other vehicles in our fleet</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {otherVehicles.filter(other => other.id !== vehicle.id).map(other => {
            const otherTitle = other.name || `${other.brand} ${other.model}`;
            const thumbnail = other.images?.find(image => image.image_type === "thumbnail");
            return <Link to={`/vehicles/${other.id}`} key={other.id} className="group border border-white/[.07] bg-[#151515] transition hover:-translate-y-1 hover:border-[#ff641f] hover:shadow-[0_14px_30px_#0008]">
              {thumbnail ? <img src={imageUrl(thumbnail)} alt={otherTitle} className="h-52 w-full object-cover" /> : <div className="flex h-52 items-center justify-center bg-[#191919] text-sm text-[#777]">No image available</div>}
              <div className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-[#ff641f]">{vehicleTypeLabels[other.type]} · {other.transmission}</p>
                <h3 className="mt-2 font-['Space_Grotesk'] text-xl">{otherTitle}</h3>
                <p className="mt-4 text-lg font-semibold">₱{Number(other.daily_rate).toLocaleString()}<span className="text-xs font-normal text-[#777]"> / day</span></p>
                <span className="mt-4 block text-xs font-semibold text-[#ff641f] opacity-80 transition group-hover:opacity-100">View details <span aria-hidden="true">→</span></span>
              </div>
            </Link>;
          })}
        </div>
      </section>}
    </main>
    <PublicFooter />
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-wider text-[#777]">{label}</p><p className="mt-1 capitalize font-medium text-[#eee]">{value || "—"}</p></div>;
}
