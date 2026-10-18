import type { ReactNode } from "react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { displayName, useAuth, useSignOut } from "../lib/AuthContext";
import { ThemeToggle, useTheme } from "../lib/ThemeContext";

const navigation = [
  { label: "Overview", href: "#overview", icon: "⌂" },
  { label: "My vehicles", href: "#vehicles", icon: "▱" },
  { label: "Earnings", href: "#earnings", icon: "◒" },
];

function HostSidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  return (
    <aside className={`${mobile ? "block h-[calc(100vh-5rem)]" : "sticky top-20 hidden h-[calc(100vh-5rem)] self-start lg:block"} w-[260px] shrink-0 border-r border-white/[.08] bg-[#151515] text-white print:hidden`}>
      <div className="h-full overflow-y-auto px-3 py-6">
        <p className="mb-8 px-3 text-[10px] font-bold uppercase tracking-[2.5px] text-[#ff641f]">HOST MENU</p>
        <nav className="space-y-1" aria-label="Host navigation">
          {navigation.map(item => (
            <a
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded px-3 py-2.5 text-[13px] text-[#aaa] transition hover:bg-white/[.06] hover:text-white"
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </a>
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== "host") return <Navigate to="/admin" replace />;

  return (
    <div className={`dashboard-theme min-h-screen bg-[#f4f3f0] text-[#151515] ${theme === "dark" ? "theme-dark" : ""}`}>
      <header className="sticky top-0 z-[200] flex h-20 min-w-0 items-center justify-between border-b border-black/10 bg-[#111] px-4 text-white print:hidden sm:px-6 md:px-10">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button className="text-xl text-[#bbb] lg:hidden" onClick={() => setMobileSidebarOpen(true)} aria-label="Open host navigation">☰</button>
          <Link className="shrink-0" to="/host" aria-label="CLCarHub host portal">
            <img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-16 w-28 object-contain object-left" />
          </Link>
          <span className="hidden border-l border-white/20 pl-4 text-xs font-semibold uppercase tracking-widest text-[#aaa] sm:block">Host portal</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">{displayName(user)}</p>
            <p className="text-[10px] uppercase tracking-widest text-[#888]">Host</p>
          </div>
          <button className="text-sm text-[#bbb] hover:text-white" onClick={signOut}>Sign out ↗</button>
        </div>
      </header>
      <div className="flex items-start">
        <HostSidebar />
        <div className={`${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed bottom-0 left-0 top-20 z-50 block transition-transform print:hidden lg:hidden`}>
          <HostSidebar mobile onNavigate={() => setMobileSidebarOpen(false)} />
        </div>
        {mobileSidebarOpen && <button className="fixed inset-0 top-20 z-40 bg-black/40 print:hidden lg:hidden" onClick={() => setMobileSidebarOpen(false)} aria-label="Close host navigation" />}
        <main className="min-w-0 max-w-full flex-1 px-4 py-8 sm:px-6 md:px-10 md:py-10 print:p-0">
          <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">HOST PORTAL</p>
          <h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold tracking-[-1.5px] sm:text-4xl sm:tracking-[-2px]">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
