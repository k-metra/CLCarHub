import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PublicFooter from "../components/PublicFooter";
import api from "../lib/api";
import Seo from "../components/Seo";

const legalContent = {
  "/terms": {
    eyebrow: "LEGAL",
    title: "Terms and conditions",
    intro:
      "These terms explain the expectations for using CL CarHub and requesting a vehicle rental.",
    sections: [
      ["Bookings and availability", "A booking request is subject to vehicle availability and confirmation by CL CarHub. The rates, dates, times, mileage allowance, deposit, and other conditions shown during the booking process form part of the request."],
      ["Customer responsibilities", "You are responsible for providing accurate account and booking information, presenting valid identification when requested, and using the vehicle responsibly and in accordance with applicable law."],
      ["Changes and cancellation", "Please contact CL CarHub as soon as possible if you need to change or cancel a request. Any applicable charges or refunds depend on the booking terms confirmed for that rental."],
      ["Contact", "If you have questions about a booking or these terms, please contact CL CarHub through the contact details provided by our team."],
    ],
  },
  "/privacy": {
    eyebrow: "LEGAL",
    title: "Privacy policy",
    intro:
      "This policy describes how CL CarHub uses information provided through this website and its rental services.",
    sections: [
      ["Information we collect", "We may collect information you provide when creating an account, requesting a rental, contacting us, or managing a booking. This may include your name, contact details, booking information, and documents needed to verify a rental."],
      ["How we use information", "We use information to operate the rental service, process and support bookings, communicate with customers, maintain account security, and improve our services."],
      ["Sharing and retention", "We only share information with service providers or other parties when needed to operate the service, meet legal obligations, or protect CL CarHub and its customers. We retain information only as long as reasonably needed for these purposes."],
      ["Your choices", "You may contact CL CarHub to ask about the personal information associated with your account or to request help with updating it, subject to applicable legal and operational requirements."],
    ],
  },
} as const;

function formatInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("__") && part.endsWith("__")) return <u key={index}>{part.slice(2, -2)}</u>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={index} className="text-[#ff641f] underline" href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <span key={index}>{part}</span>;
  });
}

function FormattedPolicy({ value }: { value: string }) {
  return (
    <div className="space-y-3 text-sm leading-7 text-[#aaa]">
      {value.split(/\r?\n/).map((line, index) => {
        if (line.trim() === "---") return <hr key={index} className="border-white/10" />;
        if (line.startsWith("## ")) return <h2 key={index} className="pt-4 font-['Space_Grotesk'] text-xl font-semibold text-[#f4f3f0]">{formatInline(line.slice(3))}</h2>;
        if (line.startsWith("- ")) return <div key={index} className="pl-5 before:mr-2 before:text-[#ff641f] before:content-['•']">{formatInline(line.slice(2))}</div>;
        return <p key={index} className={line ? undefined : "h-2"}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

export default function LegalPage() {
  const { pathname } = useLocation();
  const content = legalContent[pathname as keyof typeof legalContent] ?? legalContent["/terms"];
  const [customContent, setCustomContent] = useState<string | null>(null);
  const [loadedPathname, setLoadedPathname] = useState<string | null>(null);
  const loading = loadedPathname !== pathname;

  useEffect(() => {
    api.get<{ terms_and_conditions: string | null; privacy_policy: string | null }>("/legal-settings")
      .then(response => {
        setCustomContent(pathname === "/privacy" ? response.data.privacy_policy : response.data.terms_and_conditions);
      })
      .catch(() => setCustomContent(null))
      .finally(() => setLoadedPathname(pathname));
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-[#f4f3f0]">
      <Seo
        title={`${content.title} | CL CarHub`}
        description={content.intro}
        path={pathname}
      />
      <header className="border-b border-white/[.08]">
        <nav className="mx-auto flex h-[84px] w-[calc(100%-56px)] max-w-[1160px] items-center justify-between">
          <Link to="/" aria-label="CLCarHub home">
            <img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-20 w-32 object-contain object-left" />
          </Link>
          <Link className="text-sm text-[#bbb] transition hover:text-[#ff641f]" to="/">
            Back to home
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-[calc(100%-36px)] max-w-[820px] py-16 sm:py-24">
        <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">{content.eyebrow}</p>
        <h1 className="mt-4 font-['Space_Grotesk'] text-4xl font-semibold tracking-[-2px] sm:text-5xl">
          {content.title}
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-[#999]">{content.intro}</p>
        <div className="mt-12">
          {loading ? (
            <div className="space-y-4" role="status" aria-live="polite">
              <span className="sr-only">Loading legal content...</span>
              <div className="h-5 w-2/5 animate-pulse bg-white/10" />
              <div className="h-4 w-full animate-pulse bg-white/[.06]" />
              <div className="h-4 w-11/12 animate-pulse bg-white/[.06]" />
              <div className="h-4 w-4/5 animate-pulse bg-white/[.06]" />
              <div className="mt-8 h-5 w-1/3 animate-pulse bg-white/10" />
              <div className="h-4 w-full animate-pulse bg-white/[.06]" />
              <div className="h-4 w-10/12 animate-pulse bg-white/[.06]" />
            </div>
          ) : customContent ? (
            <FormattedPolicy value={customContent} />
          ) : content.sections.map(([heading, body]) => (
              <section key={heading}>
                <h2 className="font-['Space_Grotesk'] text-xl font-semibold">{heading}</h2>
                <p className="mt-3 text-sm leading-7 text-[#aaa]">{body}</p>
              </section>
            ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
