import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth, canManageAccounts, canViewReports } from "../lib/AuthContext";

type SidebarSection = {
  title: string;
  items: { label: string; path: string; icon: string }[];
};

const sections: SidebarSection[] = [
  {
    title: "Dashboard",
    items: [
      { label: "Home", path: "/admin", icon: "⌂" },
      { label: "Calendar", path: "/admin/calendar", icon: "▦" },
      { label: "Contract Builder", path: "/admin/contracts", icon: "▤" },
    ],
  },
  {
    title: "Transactions",
    items: [
      { label: "Bookings", path: "/admin/bookings", icon: "◷" },
      { label: "Expenses", path: "/admin/expenses", icon: "−" },
      { label: "Funds", path: "/admin/funds", icon: "$" },
      { label: "Customers", path: "/admin/customers", icon: "♙" },
      { label: "Accounts", path: "/admin/accounts", icon: "♚" },
    ],
  },
  {
    title: "Fleet Management",
    items: [
      { label: "Partners", path: "/admin/partners", icon: "♧" },
      { label: "Vehicles", path: "/admin/vehicles", icon: "▱" },
    ],
  },
  {
    title: "Reports",
    items: [
      {
        label: "Fleet Utilization Report",
        path: "/admin/reports/utilization",
        icon: "▥",
      },
      {
        label: "Income Flow Report",
        path: "/admin/reports/income-flow",
        icon: "↗",
      },
      { label: "Vehicle Revenue", path: "/admin/reports/revenue", icon: "◒" },
    ],
  },
];

export function AdminSidebar({
  collapsed,
  onNavigate,
  mobile = false,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const { user } = useAuth();
  const visibleSections = sections.map(section => ({
    ...section,
    items: section.items.filter(item =>
      item.path.startsWith("/admin/reports/")
        ? canViewReports(user)
        : item.path === "/admin/accounts"
          ? canManageAccounts(user)
          : true,
    ),
  })).filter(section => section.items.length > 0);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(visibleSections.map((section) => [section.title, true])),
  );
  return (
    <aside
      className={`${collapsed ? "w-[76px]" : "w-[260px]"} ${mobile ? "block h-full" : "hidden lg:block"} shrink-0 border-r border-white/[.08] bg-[#151515] text-white transition-[width] duration-200`}
    >
      <div className="sticky top-0 h-full overflow-y-auto px-3 py-6">
        <div
          className={`mb-8 px-3 text-[10px] font-bold uppercase tracking-[2.5px] text-[#ff641f] ${collapsed ? "text-center" : ""}`}
        >
          {collapsed ? "CL" : "ADMIN MENU"}
        </div>
        {visibleSections.map((section) => (
          <div className="mb-5" key={section.title}>
            <button
              className={`flex w-full items-center justify-between px-3 text-[10px] font-bold uppercase tracking-[1.8px] text-[#777] ${collapsed ? "justify-center" : ""}`}
              onClick={() =>
                setOpenSections((current) => ({
                  ...current,
                  [section.title]: !current[section.title],
                }))
              }
            >
              {!collapsed && section.title}
              <span className={collapsed ? "" : "text-[#ff641f]"}>
                {collapsed ? "•" : openSections[section.title] ? "−" : "+"}
              </span>
            </button>
            {openSections[section.title] && (
              <nav className="mt-2 space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/admin"}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded px-3 py-2.5 text-[13px] transition ${isActive ? "bg-[#ff641f] font-semibold text-white" : "text-[#aaa] hover:bg-white/[.06] hover:text-white"} ${collapsed ? "justify-center" : ""}`
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="w-5 text-center text-base">
                      {item.icon}
                    </span>
                    {!collapsed && item.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
