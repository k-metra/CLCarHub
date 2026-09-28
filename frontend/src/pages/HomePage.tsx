import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Eyebrow } from "../components/Ui";
import { accountPath, useAuth, useSignOut } from "../lib/AuthContext";

const vehicles = [
  {
    name: "Toyota Corolla Cross",
    type: "SUV · Automatic",
    price: "₱2,450",
    image:
      "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1000&q=85",
    tags: ["5 seats", "Air conditioning"],
  },
  {
    name: "Honda Civic RS",
    type: "Sedan · Automatic",
    price: "₱2,200",
    image:
      "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1000&q=85",
    tags: ["5 seats", "Apple CarPlay"],
  },
  {
    name: "Yamaha NMAX",
    type: "Motorcycle · Automatic",
    price: "₱850",
    image:
      "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1000&q=85",
    tags: ["2 seats", "Helmet included"],
  },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location, setLocation] = useState("Cebu City");
  const [searched, setSearched] = useState(false);
  const { user, loading } = useAuth();
  const signOut = useSignOut();
  const scrollToFleet = () => {
    document.getElementById("fleet")?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };
  return (
    <div className="min-h-screen overflow-hidden bg-[#0b0b0b] text-[#f4f3f0]">
      <header className="absolute z-10 w-full border-b border-white/[.08]">
        <nav className="mx-auto flex h-[84px] w-[calc(100%-56px)] max-w-[1160px] items-center justify-between">
          <Link
            className="font-['Space_Grotesk'] text-[21px] font-bold text-white"
            to="/"
          >
            CL<span className="text-[#ff641f]">CarHub</span>
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
                    {user.name}
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
                Skip the counter and get moving. Reliable cars and motorcycles,
                ready when you are.
              </p>
              <div className="mt-[35px] flex gap-[25px]">
                <Button onClick={scrollToFleet}>Browse vehicles →</Button>
                <a className="text-[13px]" href="#how-it-works">
                  See how it works ↓
                </a>
              </div>
              <p className="mt-[65px] text-[11px] text-[#777]">
                ✦ Trusted by 2,000+ riders in the Philippines
              </p>
            </div>
            <div className="hidden md:block">
              <div className="ml-auto h-[250px] w-[660px] -skew-x-[13deg] -rotate-[5deg] rounded-[48%_55%_14%_20%] bg-gradient-to-br from-[#d9d2c6] via-[#29231f] to-[#070707] shadow-[-30px_-30px_50px_#000_inset,0_35px_45px_#000]" />
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
              ⌖
              <small className="ml-2 block text-[9px] text-[#777]">
                LOCATION
              </small>
              <select
                className="mt-1 w-full bg-transparent text-sm text-white"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option>Cebu City</option>
                <option>Mandaue City</option>
              </select>
            </label>
            <label className="text-[#ff641f]">
              ▣
              <small className="ml-2 block text-[9px] text-[#777]">
                PICK-UP DATE
              </small>
              <input
                className="mt-1 w-full bg-transparent text-sm text-white"
                type="date"
                defaultValue="2026-10-02"
              />
            </label>
            <label className="text-[#ff641f]">
              ▣
              <small className="ml-2 block text-[9px] text-[#777]">
                RETURN DATE
              </small>
              <input
                className="mt-1 w-full bg-transparent text-sm text-white"
                type="date"
                defaultValue="2026-10-05"
              />
            </label>
            <Button
              onClick={() => {
                setSearched(true);
                scrollToFleet();
              }}
            >
              Check availability →
            </Button>
          </div>
          {searched && (
            <span className="absolute bottom-[-30px] text-xs text-[#ff9b73]">
              Available rides found near {location}.
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
            {vehicles.map((vehicle) => (
              <article
                className="border border-white/[.07] bg-[#151515]"
                key={vehicle.name}
              >
                <img
                  className="h-[240px] w-full object-cover saturate-[.7]"
                  src={vehicle.image}
                  alt={vehicle.name}
                />
                <div className="p-[22px]">
                  <small className="text-[9px] uppercase tracking-[1.5px] text-[#ff641f]">
                    {vehicle.type}
                  </small>
                  <h3 className="mt-2 font-['Space_Grotesk'] text-xl">
                    {vehicle.name}
                  </h3>
                  <strong className="mt-4 block font-['Space_Grotesk'] text-lg">
                    {vehicle.price}
                    <i className="text-xs text-[#777]">/day</i>
                  </strong>
                  <div className="my-5 flex gap-2">
                    {vehicle.tags.map((tag) => (
                      <span
                        className="border border-white/[.12] px-2 py-1.5 text-[10px] text-[#999]"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
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
        <section
          className="mx-auto mb-[70px] flex w-[calc(100%-36px)] max-w-[1160px] flex-col justify-between bg-[#ef5a1a] p-[35px_28px] md:flex-row md:items-center md:p-[55px_65px]"
          id="contact"
        >
          <div>
            <Eyebrow>READY WHEN YOU ARE</Eyebrow>
            <h2 className="my-[13px] font-['Space_Grotesk'] text-[40px]">
              The road is calling.
            </h2>
          </div>
          <Button dark onClick={scrollToFleet}>
            Explore the fleet →
          </Button>
        </section>
      </main>
      <footer className="border-t border-white/[.08] py-10 text-center text-xs text-[#777]">
        © 2026 CL CarHub. Better rides. Better journeys.
      </footer>
    </div>
  );
}
