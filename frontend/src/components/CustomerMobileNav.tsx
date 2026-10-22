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
  const current = active ?? (location.pathname === "/profile" ? "profile" : location.search.includes("tab=starred") ? "starred" : location.search.includes("tab=calendar") ? "bookings" : "home");

  return <nav className="customer-mobile-nav fixed inset-x-0 bottom-0 z-[190] border-t shadow-[0_-8px_24px_rgba(0,0,0,.08)] backdrop-blur print:hidden sm:hidden" aria-label="Customer navigation">
    <div className="grid grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
      {items.map(item => <Link to={item.to} key={item.key} aria-current={current === item.key ? "page" : undefined} data-customer-tour={item.key} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded px-2 py-2 text-[11px] font-semibold transition active:scale-95 ${current === item.key ? "is-active" : ""}`}><span className={`flex h-7 w-10 items-center justify-center rounded-full text-lg ${current === item.key ? "is-active-icon" : ""}`} aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
    </div>
  </nav>;
}
