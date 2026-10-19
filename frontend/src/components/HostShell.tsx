import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { displayName, useAuth, useSignOut } from "../lib/AuthContext";
import { ThemeToggle, useTheme } from "../lib/ThemeContext";

const navigation = [
  { label: "Overview", href: "/host", icon: "⌂" },
  { label: "My vehicles", href: "/host/vehicles", icon: "▱" },
  { label: "Bookings", href: "/host/bookings", icon: "◷" },
  { label: "Earnings", href: "/host/earnings", icon: "◒" },
];

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
  const mobileNavigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const activeItem = mobileNavigationRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    activeItem?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [location.pathname]);

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
      >
        <div className="flex min-w-max items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
          {navigation.map(item => {
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
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
      </nav>
    </div>
  );
}
