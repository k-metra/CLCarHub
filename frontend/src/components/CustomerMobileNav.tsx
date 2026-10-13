import { Link, useLocation } from "react-router-dom";

type CustomerMobileNavProps = { active?: "home" | "starred" | "bookings" | "profile" };

const items = [
  { key: "home", icon: "⌂", label: "Home", to: "/account" },
  { key: "starred", icon: "☆", label: "Starred", to: "/account?tab=starred" },
  { key: "bookings", icon: "□", label: "Bookings", to: "/account?tab=calendar" },
  { key: "profile", icon: "♙", label: "Profile", to: "/profile" },
] as const;

export function CustomerMobileNav({ active }: CustomerMobileNavProps) {
  const location = useLocation();
  const current = active ?? (location.pathname === "/profile" ? "profile" : location.search.includes("tab=starred") ? "starred" : location.search.includes("tab=calendar") ? "bookings" : "home");

  return <nav className="customer-mobile-nav fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,.08)] backdrop-blur sm:hidden">
    {items.map(item => <Link to={item.to} key={item.key} className={`flex flex-col items-center gap-1 rounded py-2 text-xs font-semibold ${current === item.key ? "is-active" : ""}`}><span className="text-2xl leading-5">{item.icon}</span>{item.label}</Link>)}
  </nav>;
}
