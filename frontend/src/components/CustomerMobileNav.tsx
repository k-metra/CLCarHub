import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

type CustomerMobileNavProps = { active?: "home" | "starred" | "bookings" | "profile" };

const items = [
  { key: "home", icon: "⌂", label: "Home", to: "/account?tab=overview" },
  { key: "starred", icon: "☆", label: "Starred", to: "/account?tab=starred" },
  { key: "bookings", icon: "◷", label: "Bookings", to: "/account?tab=calendar" },
  { key: "profile", icon: "♙", label: "Profile", to: "/profile" },
] as const;

export function CustomerMobileNav({ active }: CustomerMobileNavProps) {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const current = active ?? (location.pathname === "/profile" ? "profile" : location.search.includes("tab=starred") ? "starred" : location.search.includes("tab=calendar") ? "bookings" : "home");

  useEffect(() => {
    const updateScrollState = () => {
      const nav = navRef.current;
      if (!nav) return;
      setCanScrollLeft(nav.scrollLeft > 2);
      setCanScrollRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
    };
    const nav = navRef.current;
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

  const scroll = (direction: number) => {
    const nav = navRef.current;
    if (!nav) return;
    nav.scrollBy({ left: direction * Math.max(180, nav.clientWidth * 0.7), behavior: "smooth" });
    window.setTimeout(() => {
      setCanScrollLeft(nav.scrollLeft > 2);
      setCanScrollRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
    }, 250);
  };

  const updateScrollState = () => {
    const nav = navRef.current;
    if (!nav) return;
    setCanScrollLeft(nav.scrollLeft > 2);
    setCanScrollRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  };

  return <nav ref={navRef} onScroll={updateScrollState} className="customer-mobile-nav fixed inset-x-0 bottom-0 z-[190] overflow-x-auto border-t shadow-[0_-8px_24px_rgba(0,0,0,.08)] backdrop-blur print:hidden sm:hidden" aria-label="Customer navigation">
    {canScrollLeft && <button type="button" className="mobile-nav-scroll-arrow left-1" onClick={() => scroll(-1)} aria-label="Scroll navigation left">‹</button>}
    <div className="grid min-w-max grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
      {items.map(item => <Link to={item.to} key={item.key} aria-current={current === item.key ? "page" : undefined} data-customer-tour={item.key} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded px-2 py-2 text-[11px] font-semibold transition active:scale-95 ${current === item.key ? "is-active" : ""}`}><span className={`flex h-7 w-10 items-center justify-center rounded-full text-lg ${current === item.key ? "is-active-icon" : ""}`} aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
    </div>
    {canScrollRight && <button type="button" className="mobile-nav-scroll-arrow right-1" onClick={() => scroll(1)} aria-label="Scroll navigation right">›</button>}
  </nav>;
}
