import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CustomerMobileNav } from "../components/CustomerMobileNav";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { ThemeToggle, useTheme } from "../lib/ThemeContext";
import { displayName, useAuth } from "../lib/AuthContext";
import api from "../lib/api";
import type { FaqItem } from "../types";
import PublicFooter from "../components/PublicFooter";
import FaqAccordion from "../components/FaqAccordion";

const renderInline = (value: string): ReactNode[] => {
  const parts: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
    if (match[2] && match[3]) parts.push(<a className="text-[#ff641f] underline underline-offset-2 hover:text-[#ff8c63]" href={match[3]} target="_blank" rel="noreferrer" key={`${match.index}-link`}>{match[2]}</a>);
    else if (match[4]) parts.push(<strong key={`${match.index}-bold`}>{match[4]}</strong>);
    else if (match[5]) parts.push(<u key={`${match.index}-underline`}>{match[5]}</u>);
    else if (match[6]) parts.push(<em key={`${match.index}-italic`}>{match[6]}</em>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return parts;
};

function Answer({ value }: { value: string }) {
  return <div className="mt-4 text-sm leading-7 text-[#69747b]">{value.split("\n").map((line, index) => {
    const content = line.startsWith("- ") ? <div key={index} className="flex gap-2"><span aria-hidden="true">•</span><span>{renderInline(line.slice(2))}</span></div> : line.startsWith("## ") ? <h3 key={index} className="font-semibold text-[#151515]">{renderInline(line.slice(3))}</h3> : line === "---" ? <hr key={index} className="border-black/10" /> : <span key={index}>{renderInline(line)}</span>;
    return <Fragment key={`line-${index}`}>{index > 0 && !line.startsWith("- ") && <br />}{content}</Fragment>;
  })}</div>;
}

export default function CustomerFaqPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isAuthenticated = Boolean(user);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ faqs?: FaqItem[] }>("/legal-settings")
      .then(response => setFaqs(response.data.faqs ?? []))
      .finally(() => setLoading(false));
  }, []);

  return <div className={`dashboard-theme min-h-screen bg-[#f4f3f0] text-[#151515] ${theme === "dark" ? "theme-dark" : ""}`}>
    <header className="hidden border-b border-black/10 bg-[#111] px-5 text-white sm:block sm:px-8">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between">
        <Link to={isAuthenticated ? "/account" : "/"} aria-label="CLCarHub home"><img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-16 w-28 object-contain object-left" /></Link>
        <div className="flex items-center gap-4 text-sm"><span>{user ? displayName(user) : ""}</span><PwaInstallButton /><ThemeToggle />{isAuthenticated ? <><Link className="font-semibold text-[#ffb18e] hover:text-white" to="/account">Dashboard</Link><Link className="font-semibold text-[#ffb18e] hover:text-white" to="/profile">Profile</Link></> : <><Link className="font-semibold text-[#ffb18e] hover:text-white" to="/vehicles">Browse vehicles</Link><Link className="font-semibold text-[#ffb18e] hover:text-white" to="/admin/login">Sign in</Link></>}</div>
      </div>
    </header>
    <div className="bg-[#111] px-5 pb-7 pt-10 text-white sm:hidden">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[2px] text-white/65">CL CarHub</p><h1 className="mt-2 text-2xl font-bold">Help center</h1></div><div className="flex items-center gap-2"><PwaInstallButton /><ThemeToggle /></div></div>
    </div>
    <main className="mx-auto max-w-4xl px-5 py-8 pb-28 sm:px-8 sm:py-12 sm:pb-12">
      <Link to={isAuthenticated ? "/account" : "/"} className="text-sm font-semibold text-[#ff641f] hover:underline">← Back to {isAuthenticated ? "dashboard" : "home"}</Link>
      <p className="mt-8 text-xs font-bold uppercase tracking-[2.7px] text-[#ff641f]">CUSTOMER HELP</p>
      <h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold sm:text-4xl">Frequently asked questions</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#69747b]">Find answers about bookings, payments, reservations, and renting with CL CarHub.</p>
      {loading ? <div className="mt-8 rounded-2xl bg-white p-8 text-sm text-[#69747b]">Loading FAQs...</div> : faqs.length ? <div className="mt-8 space-y-3">{faqs.map((faq, index) => <FaqAccordion className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition hover:border-[#ff641f] sm:p-6" key={`${index}-${faq.question}`} question={faq.question}><Answer value={faq.answer} /></FaqAccordion>)}</div> : <div className="mt-8 rounded-2xl border border-dashed border-black/15 bg-white p-8 text-sm text-[#69747b]">FAQs will appear here once they are published.</div>}
    </main>
    {isAuthenticated && <CustomerMobileNav />}
    {!isAuthenticated && <PublicFooter />}
  </div>;
}
