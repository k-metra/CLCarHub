import { Link } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import Seo from "../components/Seo";

const facebookUrl = "https://facebook.com/clcarhub";

export default function HostPartnershipPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b0b0b] text-[#f4f3f0]">
      <Seo
        title="Host Partnership Program | CL CarHub"
        description="Have a vehicle? Partner with CL CarHub and earn extra income by registering your car in our rental business."
        path="/host-partnership"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Offer",
          name: "CL CarHub Host Partnership Program",
          description: "A vehicle partnership program for owners who want to earn extra income through car rentals.",
          url: "https://clcarhub.com/host-partnership",
          seller: { "@type": "Organization", name: "CL CarHub" },
        }}
      />
      <header className="border-b border-white/[.08]">
        <nav className="mx-auto flex h-[76px] w-[calc(100%-36px)] max-w-[1160px] items-center justify-between sm:h-[84px]">
          <Link to="/" aria-label="CL CarHub home">
            <img src="/clcarhublogo_upscaled.png" alt="CL CarHub" className="h-16 w-28 object-contain object-left sm:h-20 sm:w-32" />
          </Link>
          <Link className="text-xs text-[#aaa] transition hover:text-[#ff641f] sm:text-sm" to="/">
            Back to home
          </Link>
        </nav>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[560px] w-[720px] -translate-x-1/2 rounded-full bg-[#ff641f]/10 blur-[130px]" />
        <section className="relative mx-auto grid w-[calc(100%-36px)] max-w-[1160px] gap-12 py-12 sm:py-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:gap-20">
          <div className="order-2 lg:order-1">
            <p className="text-[10px] font-bold uppercase tracking-[2.8px] text-[#ff6a23]">CL CARHUB HOST PARTNERSHIP</p>
            <h1 className="mt-5 font-['Space_Grotesk'] text-[48px] font-semibold leading-[.95] tracking-[-3px] sm:text-[72px] sm:tracking-[-4px]">
              May sasakyan ka?
              <br />
              <em className="not-italic text-[#ff641f]">Pagkakitaan natin ’yan!</em>
            </h1>
            <p className="mt-7 max-w-[520px] text-base leading-7 text-[#aaa6a1] sm:text-lg">
              Your vehicle can do more than sit in the garage. Partner with CL CarHub and register your car in our rental business to earn extra income with a team that helps take care of the details.
            </p>
            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <a
                href={facebookUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-3 bg-[#ff641f] px-6 py-4 text-sm font-bold text-white shadow-[0_12px_32px_#ff641f3d] transition hover:brightness-110"
              >
                Inquire on Facebook
                <span aria-hidden="true">↗</span>
              </a>
              <span className="text-xs text-[#777]">Message us for program details</span>
            </div>
          </div>

          <div className="relative order-1 mx-auto w-full max-w-[560px] lg:order-2">
            <div className="absolute -inset-4 rounded-[2rem] bg-[#ff641f]/20 blur-2xl" />
            <div className="relative overflow-hidden border border-[#ff641f]/35 bg-[#151515] p-2 shadow-[0_25px_70px_#0009]">
              <img
                src="/hostpartnershipprogram.jpg"
                alt="CL CarHub Host Partnership Program: earn extra income with your vehicle"
                className="h-auto w-full"
              />
            </div>
          </div>
        </section>

        <section className="border-y border-white/[.06] bg-[#151515]">
          <div className="mx-auto grid w-[calc(100%-36px)] max-w-[1160px] gap-px bg-white/[.08] py-px sm:grid-cols-3">
            {[
              ["Extra income", "Make your vehicle work for you when it is available."],
              ["Flexible partnership", "Explore an arrangement that fits your vehicle and schedule."],
              ["A growing team", "Connect with CL CarHub and our rental community."],
            ].map(([title, description], index) => (
              <div className="bg-[#151515] p-7 sm:p-9" key={title}>
                <span className="text-sm font-bold text-[#ff641f]">0{index + 1}</span>
                <h2 className="mt-7 font-['Space_Grotesk'] text-xl font-semibold">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#85827e]">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-[calc(100%-36px)] max-w-[760px] py-16 text-center sm:py-24">
          <p className="text-[10px] font-bold uppercase tracking-[2.8px] text-[#ff6a23]">READY TO GET STARTED?</p>
          <h2 className="mt-4 font-['Space_Grotesk'] text-4xl font-semibold tracking-[-2px] sm:text-5xl">
            Let&apos;s talk about
            <br />
            <em className="not-italic text-[#ff641f]">your vehicle.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-[520px] text-sm leading-7 text-[#85827e]">
            Send CL CarHub a message on Facebook to learn about the requirements and next steps for becoming a host.
          </p>
          <a href={facebookUrl} target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-3 border border-[#ff641f] px-6 py-4 text-sm font-bold text-[#ff8a55] transition hover:bg-[#ff641f] hover:text-white">
            Message CL CarHub <span aria-hidden="true">↗</span>
          </a>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
