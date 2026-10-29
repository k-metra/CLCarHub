import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { displayName, useAuth, useSignOut } from "../lib/AuthContext";
import { ThemeToggle, useTheme } from "../lib/ThemeContext";
import { PwaInstallButton } from "./PwaInstallButton";

const navigation = [
  { label: "Overview", href: "/host", icon: "⌂", tour: "overview" },
  { label: "My vehicles", href: "/host/vehicles", icon: "▱", tour: "vehicles" },
  { label: "Bookings", href: "/host/bookings", icon: "◷", tour: "bookings" },
  { label: "Earnings", href: "/host/earnings", icon: "◒", tour: "earnings" },
  { label: "Rent a vehicle", href: "/host/rent", icon: "▣", tour: "rent" },
];

const hostTourSteps = [
  ["overview", "Overview", "See your fleet summary, partner details, and shared contract documents."],
  ["vehicles", "My vehicles", "Review the units assigned to you and open vehicle details."],
  ["bookings", "Bookings", "Track booking schedules and open host-visible contract PDFs."],
  ["earnings", "Earnings", "Review your earnings and payout history."],
] as const;

function HostLiveTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<DOMRect | null>(null);
  const [target, stepTitle, description] = hostTourSteps[step];
  const updateSpotlight = useCallback(() => {
    const selector = `[data-host-tour="${target}"]`;
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const visible = candidates.find(element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
    setSpotlight(visible?.getBoundingClientRect() ?? null);
  }, [target]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(updateSpotlight);
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
    };
  }, [updateSpotlight]);
  const tooltipStyle = useMemo(() => {
    if (!spotlight) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const width = Math.min(360, window.innerWidth - 32);
    const left = Math.min(Math.max(16, spotlight.left), window.innerWidth - width - 16);
    const below = spotlight.bottom + 16;
    const top = below + 190 < window.innerHeight ? below : Math.max(16, spotlight.top - 206);
    return { top, left, width };
  }, [spotlight]);
  return <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-labelledby="host-tour-title">
    {spotlight ? <div className="pointer-events-none fixed rounded-lg ring-4 ring-[#ff641f] ring-offset-2 ring-offset-transparent shadow-[0_0_0_9999px_rgba(0,0,0,.62)]" style={{ top: spotlight.top - 6, left: spotlight.left - 6, width: spotlight.width + 12, height: spotlight.height + 12 }} /> : <div className="fixed inset-0 bg-black/60" />}
    <section className="absolute rounded-xl bg-white p-5 text-[#151515] shadow-2xl" style={tooltipStyle}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff641f]">Host portal tour · {step + 1}/{hostTourSteps.length}</p>
      <h2 id="host-tour-title" className="mt-2 text-xl font-semibold">{stepTitle}</h2>
      <p className="mt-2 text-sm leading-6 text-[#555]">{description}</p>
      <div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={onClose} className="text-sm font-semibold text-[#777]">Skip tour</button><div className="flex gap-2">{step > 0 && <button type="button" onClick={() => setStep(value => value - 1)} className="border border-black/10 px-3 py-2 text-sm font-semibold">Back</button>}<button type="button" onClick={() => step === hostTourSteps.length - 1 ? onClose() : setStep(value => value + 1)} className="bg-[#ff641f] px-3 py-2 text-sm font-bold text-white">{step === hostTourSteps.length - 1 ? "Finish" : "Next"}</button></div></div>
    </section>
  </div>;
}

function HostSidebar() {
  const location = useLocation();

  return (
    <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-[260px] shrink-0 self-start border-r border-white/[.08] bg-[#151515] text-white print:hidden lg:block">
      <div className="h-full overflow-y-auto px-3 py-6">
        <p className="mb-8 px-3 text-[10px] font-bold uppercase tracking-[2.5px] text-[#ff641f]">HOST MENU</p>
        <nav className="space-y-1" aria-label="Host navigation">
          {navigation.map(item => (
            <Link
              key={item.href}
              to={item.href}
              aria-current={location.pathname === item.href ? "page" : undefined}
              data-host-tour={item.tour}
              className={`flex items-center gap-3 rounded px-3 py-2.5 text-[13px] transition hover:bg-white/[.06] hover:text-white ${
                location.pathname === item.href ? "bg-white/[.1] text-white" : "text-[#aaa]"
              }`}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-white/10 pt-6">
          <Link className="flex items-center gap-3 rounded px-3 py-2.5 text-[13px] text-[#aaa] transition hover:bg-white/[.06] hover:text-white" to="/">
            <span className="w-5 text-center text-base">↗</span>
            Visit website
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function HostShell({ children, title }: { children: ReactNode; title: string }) {
  const { user, loading } = useAuth();
  const signOut = useSignOut();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [showTour, setShowTour] = useState(() => new URLSearchParams(location.search).get("host_tutorial") === "1");
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const updateScrollState = () => {
      const nav = mobileNavigationRef.current;
      if (!nav) return;
      setCanScrollLeft(nav.scrollLeft > 2);
      setCanScrollRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
    };
    const nav = mobileNavigationRef.current;
    const frame = window.requestAnimationFrame(updateScrollState);
    const observer = nav ? new ResizeObserver(updateScrollState) : null;
    if (nav) observer?.observe(nav);
    window.addEventListener("resize", updateScrollState);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  useEffect(() => {
    const activeItem = mobileNavigationRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    activeItem?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    window.setTimeout(() => {
      const nav = mobileNavigationRef.current;
      if (!nav) return;
      setCanScrollLeft(nav.scrollLeft > 2);
      setCanScrollRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
    }, 250);
  }, [location.pathname]);

  const updateScrollState = () => {
    const nav = mobileNavigationRef.current;
    if (!nav) return;
    setCanScrollLeft(nav.scrollLeft > 2);
    setCanScrollRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  };

  const scrollMobileNavigation = (direction: number) => {
    const nav = mobileNavigationRef.current;
    if (!nav) return;
    nav.scrollBy({ left: direction * 180, behavior: "smooth" });
    window.setTimeout(updateScrollState, 250);
  };
  const closeTour = () => {
    const params = new URLSearchParams(location.search);
    params.delete("host_tutorial");
    navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
    setShowTour(false);
  };

  if (loading) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== "host") return <Navigate to="/admin" replace />;

  return (
    <div className={`dashboard-theme min-h-screen bg-[#f4f3f0] text-[#151515] ${theme === "dark" ? "theme-dark" : ""}`}>
      <header className="sticky top-0 z-[200] flex min-h-16 min-w-0 items-center justify-between border-b border-black/10 bg-[#111] px-4 py-2 text-white print:hidden sm:h-20 sm:px-6 sm:py-0 md:px-10">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link className="shrink-0" to="/host" aria-label="CLCarHub host portal">
            <img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-11 w-24 object-contain object-left sm:h-16 sm:w-28" />
          </Link>
          <span className="hidden border-l border-white/20 pl-4 text-xs font-semibold uppercase tracking-widest text-[#aaa] sm:block">Host portal</span>
          <span className="min-w-0 truncate border-l border-white/20 pl-3 text-sm font-semibold sm:hidden">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          <div className="hidden w-40 sm:block">
            <PwaInstallButton />
          </div>
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">{displayName(user)}</p>
            <p className="text-[10px] uppercase tracking-widest text-[#888]">Host</p>
          </div>
          <button className="text-sm text-[#bbb] hover:text-white" onClick={signOut} aria-label="Sign out">
            <span className="hidden sm:inline">Sign out </span>↗
          </button>
        </div>
      </header>
      <div className="flex items-start">
        <HostSidebar />
        <main className="host-main min-w-0 max-w-full flex-1 px-4 pb-28 pt-6 sm:px-6 sm:py-8 md:px-10 md:py-10 print:p-0">
          <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">HOST PORTAL</p>
          <h1 className="mt-2 hidden font-['Space_Grotesk'] text-3xl font-semibold tracking-[-1.5px] sm:block sm:text-4xl sm:tracking-[-2px]">{title}</h1>
          {children}
        </main>
      </div>
      <nav
        ref={mobileNavigationRef}
        className="host-mobile-nav fixed inset-x-0 bottom-0 z-[190] overflow-x-auto border-t border-black/10 bg-white/95 shadow-[0_-8px_24px_rgba(0,0,0,.08)] backdrop-blur print:hidden lg:hidden"
        aria-label="Host navigation"
        onScroll={updateScrollState}
      >
        {canScrollLeft && <button type="button" className="mobile-nav-scroll-arrow left-1" onClick={() => scrollMobileNavigation(-1)} aria-label="Scroll navigation left">‹</button>}
        <div className="flex min-w-max items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
          {navigation.map(item => {
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                data-host-tour={item.tour}
                className={`flex min-h-16 min-w-[84px] flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-[11px] font-semibold transition active:scale-95 ${
                  active ? "text-[#ff641f]" : "text-[#777] hover:text-[#151515]"
                }`}
              >
                <span className={`flex h-7 w-10 items-center justify-center rounded-full text-lg ${active ? "bg-[#fff0e9]" : ""}`} aria-hidden="true">{item.icon}</span>
                <span className="whitespace-nowrap">{item.label === "My vehicles" ? "Vehicles" : item.label}</span>
              </Link>
            );
          })}
          <Link
            to="/"
            className="flex min-h-16 min-w-[84px] flex-1 flex-col items-center justify-center gap-1 px-3 py-2 text-[11px] font-semibold text-[#777] transition active:scale-95 hover:text-[#151515]"
          >
            <span className="flex h-7 w-10 items-center justify-center rounded-full text-lg" aria-hidden="true">↗</span>
            <span className="whitespace-nowrap">Website</span>
          </Link>
        </div>
        {canScrollRight && <button type="button" className="mobile-nav-scroll-arrow right-1" onClick={() => scrollMobileNavigation(1)} aria-label="Scroll navigation right">›</button>}
      </nav>
      {showTour && <HostLiveTour onClose={closeTour} />}
    </div>
  );
}
