import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Eyebrow } from "../components/Ui";
import PublicFooter from "../components/PublicFooter";
import Seo from "../components/Seo";
import { DateTimePicker } from "../components/DateTimePicker";
import { accountPath, displayName, useAuth, useSignOut } from "../lib/AuthContext";
import api from "../lib/api";
import { vehicleTypeLabels, type VehicleImage, type VehicleRecord } from "../types";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
const imageUrl = (vehicle: VehicleRecord) => {
  const image = vehicle.images?.find((item) => item.image_type === "thumbnail");
  if (!image) return null;
  return imageUrlFromImage(image);
};
const imageUrlFromImage = (image: VehicleImage) => image.url.startsWith("http") ? image.url : `${apiOrigin}/storage/${image.url.replace(/^\/+/, "").replace(/^storage\//, "")}`;
const imageLabels: Record<string, string> = {
  thumbnail: "Thumbnail", front: "Front", back: "Back", left: "Left", right: "Right",
  interior_back: "Interior Back", interior_front: "Interior Front", trunk: "Trunk",
};

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickupDate, setPickupDate] = useState(() => searchParams.get("pickup_at") ?? "2026-10-02T09:00");
  const [returnDate, setReturnDate] = useState(() => searchParams.get("return_at") ?? "2026-10-05T09:00");
  const [availabilityError, setAvailabilityError] = useState("");
  const [searched, setSearched] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRecord | null>(null);
  const [selectedImage, setSelectedImage] = useState<VehicleImage | null>(null);
  const { user, loading } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  useEffect(() => {
    api.get<VehicleRecord[]>("/vehicles/featured")
      .then((response) => setVehicles(response.data))
      .catch(() => setVehicles([]))
      .finally(() => setVehiclesLoading(false));
  }, []);
  useEffect(() => {
    if (!selectedVehicle) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedVehicle(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedVehicle]);
  const openVehicleProfile = (vehicle: VehicleRecord) => {
    setSelectedVehicle(vehicle);
    setSelectedImage(null);
  };
  const rentVehicle = (vehicle: VehicleRecord) => {
    setSelectedVehicle(null);
    const schedule = new URLSearchParams({ vehicle_id: String(vehicle.id), pickup_at: pickupDate, return_at: returnDate });
    if (user?.role === "customer") {
      navigate(`/account?tab=request&${schedule}`);
      return;
    }
    navigate(`/admin/login?register=1&${schedule}`);
  };
  const checkAvailability = () => {
    if (!pickupDate || !returnDate) {
      setSearched(false);
      setAvailabilityError("Select both a pickup and return date and time.");
      return;
    }
    if (new Date(returnDate) <= new Date(pickupDate)) {
      setSearched(false);
      setAvailabilityError("Return must be later than pickup.");
      return;
    }
    setAvailabilityError("");
    setSearchParams({ pickup_at: pickupDate, return_at: returnDate });
    setSearched(true);
    window.setTimeout(scrollToFleet, 0);
  };
  const scrollToFleet = () => {
    document.getElementById("fleet")?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };
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
      <header className="absolute z-10 w-full border-b border-white/[.08]">
        <nav className="mx-auto flex h-[84px] w-[calc(100%-56px)] max-w-[1160px] items-center justify-between">
          <Link className="shrink-0" to="/" aria-label="CLCarHub home">
            <img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-20 w-32 object-contain object-left" />
          </Link>
          <button
            className="flex flex-col gap-[5px] md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="h-px w-[23px] bg-white" />
            <span className="h-px w-[23px] bg-white" />
            <span className="h-px w-[23px] bg-white" />
          </button>
          <div
            className={`${menuOpen ? "flex" : "hidden"} absolute left-0 right-0 top-[70px] flex-col gap-5 bg-[#111] p-[25px_30px] md:static md:flex md:flex-row md:items-center md:gap-[34px] md:bg-transparent md:p-0`}
          >
            {[
              ["Our fleet", "#fleet"],
              ["How it works", "#how-it-works"],
              ["Why CL CarHub", "#why-us"],
              ["Contact", "#contact"],
            ].map(([label, href]) => (
              <a
                className="text-[13px] text-[#bbb] hover:text-[#ff641f]"
                href={href}
                key={href}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </a>
            ))}
            {!loading &&
              (user ? (
                <>
                  <Link
                    className="w-fit rounded-[30px] border border-white/[.17] px-[17px] py-[11px] text-[13px]"
                    to={accountPath(user)}
                  >
                    {displayName(user)}
                  </Link>
                  <button
                    className="w-fit text-left text-[13px] text-[#bbb] hover:text-white"
                    onClick={signOut}
                  >
                    Sign out ↗
                  </button>
                </>
              ) : (
                <Link
                  className="w-fit rounded-[30px] border border-white/[.17] px-[17px] py-[11px] text-[13px]"
                  to="/admin/login"
                >
                  Sign in ↗
                </Link>
              ))}
          </div>
        </nav>
      </header>
      <main>
        <section className="relative min-h-[710px] bg-[radial-gradient(circle_at_77%_48%,#5d1d08_0,#241007_24%,#0b0b0b_58%)]">
          <div className="absolute inset-0 opacity-[.15] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:80px_80px]" />
          <div className="relative mx-auto grid min-h-[710px] w-[calc(100%-56px)] max-w-[1160px] items-center md:grid-cols-[43%_57%]">
            <div>
              <Eyebrow>● PREMIUM VEHICLE RENTALS</Eyebrow>
              <h1 className="my-[25px] font-['Space_Grotesk'] text-[64px] font-semibold leading-[.94] tracking-[-5px] sm:text-[88px]">
                Your ride.
                <br />
                <em className="not-italic text-[#ff641f]">Your way.</em>
              </h1>
              <p className="max-w-[385px] text-[16px] leading-[1.65] text-[#a9a7a4]">
                A reliable car and big bike rental company for every local and
                balikbayan.
              </p>
              <div className="mt-[35px] flex gap-[25px]">
                <Button onClick={scrollToFleet}>Browse vehicles →</Button>
                <a className="text-[13px]" href="#how-it-works">
                  See how it works ↓
                </a>
              </div>

              <div className="mt-[35px] flex flex-wrap gap-x-[25px] gap-y-[12px] text-[11px] font-medium text-[#c8c5c1">
                <span>✓ DTI Registered</span>
                <span>✓ BIR Registered</span>
                <span>
                  ✦ FREE Loyalty Card{" "}
                  <span className="text-[#ff641f]">(12-Hour FREE Rental)</span>
                </span>
              </div>
              <p className="mt-[65px] text-[11px] text-[#777]">
                ✦ Trusted by 2,000+ riders in the Philippines
              </p>
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-[-8%] hidden w-[58%] md:block">
              <div className="absolute inset-[-12%] bg-[radial-gradient(ellipse_at_center,#ff641f33_0%,#5d1d0818_36%,#0b0b0b00_68%)] blur-3xl" />
              <div
                className="relative ml-auto flex h-full max-w-[520px] items-center justify-center overflow-hidden mix-blend-screen"
                style={{
                  maskImage: "radial-gradient(ellipse 63% 48% at center, black 35%, rgba(0,0,0,.9) 58%, transparent 100%)",
                  maskComposite: "intersect",
                  WebkitMaskImage: "radial-gradient(ellipse 63% 48% at center, black 35%, rgba(0,0,0,.9) 58%, transparent 100%)",
                }}
              >
                <img
                  src="/herogif.gif"
                  alt=""
                  className="h-[92%] w-full object-contain opacity-90 mix-blend-screen drop-shadow-[0_30px_35px_#000]"
                />
              </div>
              <div className="absolute inset-0 bg-[linear-gradient(90deg,#0b0b0b66_0%,transparent_24%,transparent_76%,#0b0b0b66_100%),linear-gradient(0deg,#0b0b0b99_0%,transparent_20%,transparent_80%,#0b0b0b99_100%)]" />
            </div>
          </div>
        </section>
        <section className="relative mx-auto mt-[-50px] flex w-[calc(100%-36px)] max-w-[1160px] flex-col gap-[25px] bg-[#171717] p-[23px_30px] shadow-[0_20px_50px_#0008] md:flex-row md:items-center">
          <div className="min-w-[195px]">
            <small className="text-[9px] uppercase tracking-[1.7px] text-[#777]">
              START YOUR JOURNEY
            </small>
            <strong className="block font-['Space_Grotesk']">
              Find your perfect ride
            </strong>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-[17px] md:grid-cols-4">
            <label className="text-[#ff641f]">
              ▣
              <small className="ml-2 block text-[9px] text-[#777]">
                PICK-UP
              </small>
              <DateTimePicker mode="datetime" value={pickupDate} onChange={setPickupDate} className="mt-1 w-full border-0 !bg-transparent text-sm text-white" />
            </label>
            <label className="text-[#ff641f]">
              ▣
              <small className="ml-2 block text-[9px] text-[#777]">
                RETURN
              </small>
              <DateTimePicker mode="datetime" value={returnDate} onChange={setReturnDate} className="mt-1 w-full border-0 !bg-transparent text-sm text-white" />
            </label>
            <Button
              onClick={checkAvailability}
            >
              Check availability →
            </Button>
          </div>
          {searched && (
            <span className="absolute bottom-[-30px] text-xs text-[#ff9b73]">
              Showing vehicles for your selected schedule.
            </span>
          )}
          {availabilityError && (
            <span className="absolute bottom-[-30px] text-xs text-red-300">
              {availabilityError}
            </span>
          )}
        </section>
        <section
          className="mx-auto w-[calc(100%-36px)] max-w-[1160px] py-20 md:py-[120px]"
          id="fleet"
        >
          <div className="mb-12">
            <Eyebrow>OUR FLEET</Eyebrow>
            <h2 className="mt-[17px] font-['Space_Grotesk'] text-[44px] font-semibold leading-[.94] tracking-[-3px] md:text-[54px]">
              Made for the
              <br />
              <em className="not-italic text-[#ff641f]">road ahead.</em>
            </h2>
          </div>
          <div className="grid gap-[18px] md:grid-cols-3">
            {vehiclesLoading ? Array.from({ length: 3 }, (_, index) => (
              <div className="animate-pulse border border-white/[.07] bg-[#151515]" key={`vehicle-skeleton-${index}`} aria-hidden="true">
                <div className="h-[240px] bg-white/[.06]" />
                <div className="space-y-4 p-[22px]">
                  <div className="h-3 w-2/5 bg-white/[.08]" />
                  <div className="h-6 w-4/5 bg-white/[.08]" />
                  <div className="h-6 w-1/3 bg-white/[.08]" />
                  <div className="flex gap-2">
                    <div className="h-6 w-16 bg-white/[.08]" />
                    <div className="h-6 w-20 bg-white/[.08]" />
                  </div>
                </div>
              </div>
            )) : vehicles.slice(0, 3).map((vehicle) => {
              const image = imageUrl(vehicle);
              return (
                <button type="button" className="group cursor-pointer border border-white/[.07] bg-[#151515] text-left transition hover:-translate-y-1 hover:border-[#ff641f] hover:shadow-[0_14px_30px_#0008] focus:outline-none focus:ring-2 focus:ring-[#ff641f] focus:ring-offset-2 focus:ring-offset-[#0b0b0b]" key={vehicle.id} onClick={() => openVehicleProfile(vehicle)} aria-label={`View profile for ${vehicle.name || `${vehicle.brand} ${vehicle.model}`}`}>
                  {image && <img className="h-[240px] w-full object-cover saturate-[.7]" src={image} alt={vehicle.name || `${vehicle.brand} ${vehicle.model}`} />}
                  <div className="p-[22px]">
                    <small className="text-[9px] uppercase tracking-[1.5px] text-[#ff641f]">{vehicleTypeLabels[vehicle.type]} · {vehicle.transmission}</small>
                    <h3 className="mt-2 font-['Space_Grotesk'] text-xl">{vehicle.name || `${vehicle.brand} ${vehicle.model}`}</h3>
                    <strong className="mt-4 block font-['Space_Grotesk'] text-lg">₱{Number(vehicle.daily_rate).toLocaleString()}<i className="text-xs text-[#777]">/day</i></strong>
                    <div className="my-5 flex flex-wrap gap-2">
                      <span className="border border-white/[.12] px-2 py-1.5 text-[10px] text-[#999]">{vehicle.seats} seats</span>
                      {vehicle.mileage_limit !== null && vehicle.mileage_limit !== undefined && <span className="border border-white/[.12] px-2 py-1.5 text-[10px] text-[#999]">{vehicle.mileage_limit.toLocaleString()} km total</span>}
                    </div>
                    <span className="text-xs font-semibold text-[#ff641f] opacity-80 transition group-hover:opacity-100">View details <span aria-hidden="true">→</span></span>
                  </div>
                </button>
              );
            })}
          </div>
          {!vehiclesLoading && vehicles.length > 3 && <Link to="/vehicles" className="mx-auto mt-8 flex w-fit flex-col items-center gap-2 text-sm font-semibold text-[#ff641f] transition hover:text-[#ff9b73]"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ff641f] text-xl">↓</span>See more vehicles</Link>}
          {!vehiclesLoading && !vehicles.length && <p className="border border-white/[.07] p-6 text-sm text-[#999]">Our gallery is being refreshed. Check back soon for available vehicles.</p>}
        </section>
        <section
          className="border-y border-white/[.06] bg-[#151515] py-20"
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
        <section className="border-y border-white/[.06] bg-[#151515] py-20" id="contact">
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
                <div className="grid bg-[#151515] sm:col-span-2 sm:grid-cols-2">
                  <div className="flex min-h-56 flex-col justify-center p-6">
                    <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Visit us</span>
                    <address className="mt-3 not-italic text-sm leading-6 text-[#d0cdca]">Blk 5, Lot 3A, Calle Gracia<br />Calamba, 4027 Laguna</address>
                  </div>
                  <iframe
                    className="h-64 w-full border-0 sm:h-full"
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3867.970611358424!2d121.1692774!3d14.196499199999998!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33bd6300769b6edd%3A0x6ce13f5c55c978db!2sCL%20CarHub!5e0!3m2!1sen!2sph!4v1791431843565!5m2!1sen!2sph"
                    title="CL CarHub location map"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
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
      {selectedVehicle && <VehicleProfileModal vehicle={selectedVehicle} selectedImage={selectedImage} onSelectImage={setSelectedImage} onRent={() => rentVehicle(selectedVehicle)} onClose={() => setSelectedVehicle(null)} />}
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
