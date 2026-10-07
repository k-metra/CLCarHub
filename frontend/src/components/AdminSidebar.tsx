import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth, canManageAccounts, canViewReports } from "../lib/AuthContext";

type SidebarSection = {
  title: string;
  items: { label: string; path: string; icon: string }[];
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
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
      { label: "Rental Operations", path: "/admin/rental-operations", icon: "↗" },
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
      { label: "Fleet Settings", path: "/admin/fleet-settings", icon: "⚙" },
      { label: "Audit Logs", path: "/admin/audit-logs", icon: "◉" },
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
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    () => window.__clcarhubInstallPrompt ?? null,
  );
  const [isInstalled, setIsInstalled] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const handleInstallAvailable = () => setInstallPrompt(window.__clcarhubInstallPrompt ?? null);
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener("clcarhubinstallavailable", handleInstallAvailable);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("clcarhubinstallavailable", handleInstallAvailable);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };
  const openInstallInstructions = () => {
    if (isIos) {
      setShowIosInstructions((current) => !current);
      return;
    }
    void installApp();
  };
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
      className={`${collapsed ? "w-[76px]" : "w-[260px]"} ${mobile ? "block h-[calc(100vh-5rem)]" : "sticky top-20 hidden h-[calc(100vh-5rem)] self-start lg:block"} shrink-0 border-r border-white/[.08] bg-[#151515] text-white transition-[width] duration-200 print:hidden`}
    >
      <div className="h-full overflow-y-auto px-3 py-6">
        <div
          className={`mb-8 px-3 text-[10px] font-bold uppercase tracking-[2.5px] text-[#ff641f] ${collapsed ? "text-center" : ""}`}
        >
          {collapsed ? "CL" : "ADMIN MENU"}
        </div>
        {((installPrompt && !isInstalled) || (isIos && !isInstalled)) && (
          <button
            type="button"
            className={`mb-6 flex w-full items-center justify-center gap-2 rounded bg-[#e85b00] px-3 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#ff641f] ${collapsed ? "px-2" : ""}`}
            onClick={openInstallInstructions}
            title={isIos ? "Add CLCarHub to your Home Screen" : "Install CLCarHub App"}
          >
            <span aria-hidden="true">▣</span>
            {!collapsed && (isIos ? "Add to Home Screen" : "Install CLCarHub App")}
          </button>
        )}
        {isIos && showIosInstructions && !isInstalled && !collapsed && (
          <div className="mb-6 rounded border border-white/10 bg-white/[.06] p-3 text-xs leading-5 text-[#ddd]">
            <p className="font-semibold text-white">Install CLCarHub on iOS</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Tap the Share button in Safari.</li>
              <li>Select <span className="font-semibold text-white">Add to Home Screen</span>.</li>
              <li>Tap <span className="font-semibold text-white">Add</span>.</li>
            </ol>
            <p className="mt-2 text-[#aaa]">If you are using another browser on iPhone or iPad, open this page in Safari first.</p>
          </div>
        )}
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
