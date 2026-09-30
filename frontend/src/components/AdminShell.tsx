import type { ReactNode } from "react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { canViewReports, useAuth, useSignOut } from "../lib/AuthContext";

export function AdminShell({
  children,
  title,
  reportsOnly = false,
}: {
  children: ReactNode;
  title: string;
  reportsOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const signOut = useSignOut();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  if (loading) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (reportsOnly && !canViewReports(user)) return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-[#f4f3f0] text-[#151515]">
      <header className="relative z-20 flex h-20 min-w-0 items-center justify-between border-b border-black/10 bg-[#111] px-4 text-white sm:px-6 md:px-10">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            className="text-xl text-[#bbb] lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>
          <button
            className="hidden text-xl text-[#bbb] lg:block"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? "→" : "←"}
          </button>
          <Link
            className="truncate font-['Space_Grotesk'] text-xl font-bold"
            to="/admin"
          >
            CL<span className="text-[#ff641f]">CarHub</span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">{user.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-[#888]">
              {user.role}
            </p>
          </div>
          <Link className="hidden text-sm text-[#bbb] hover:text-white sm:block" to="/">
            Website ↗
          </Link>
          <button
            className="text-sm text-[#bbb] hover:text-white"
            onClick={signOut}
          >
            Sign out ↗
          </button>
        </div>
      </header>
      <div className="flex">
        <AdminSidebar collapsed={sidebarCollapsed} />
        <div
          className={`${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed bottom-0 left-0 top-20 z-50 block w-[min(84vw,300px)] transition-transform lg:hidden`}
        >
          <AdminSidebar
            collapsed={false}
            mobile
            onNavigate={() => setMobileSidebarOpen(false)}
          />
        </div>
        {mobileSidebarOpen && (
          <button
            className="fixed inset-0 top-20 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close navigation"
          />
        )}
        <main className="min-w-0 max-w-full flex-1 overflow-hidden px-4 py-8 sm:px-6 md:px-10 md:py-10">
          <Link className="text-xs text-[#ff641f]" to="/admin">
            ← Dashboard
          </Link>
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">
              ADMINISTRATION
            </p>
            <h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold tracking-[-1.5px] sm:text-4xl sm:tracking-[-2px]">
              {title}
            </h1>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
