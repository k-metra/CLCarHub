import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import { DateTimePicker } from "../components/DateTimePicker";
import { useToast } from "../components/Ui";
import api from "../lib/api";
import type { VehicleRecord } from "../types";

type RevenueRow = {
  vehicle: VehicleRecord & { partner?: { name: string } | null };
  booking_count: number;
  booking_revenue: number;
  collected_revenue: number;
  outstanding_revenue: number;
};

type ReportData = {
  vehicles: RevenueRow[];
  booking_count: number;
  vehicle_count: number;
  total_revenue: number;
  total_collected: number;
  total_outstanding: number;
};

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");

function imageUrl(vehicle: RevenueRow["vehicle"]) {
  const value = vehicle.images?.[0]?.url;
  return value ? (value.startsWith("http") ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, "").replace(/^storage\//, "")}`) : null;
}

export default function VehicleRevenueReportPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("revenue_desc");
  const query = useMemo(() => {
    const params = new URLSearchParams({ sort });
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status) params.set("status", status);
    return params;
  }, [from, search, sort, status, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.get<ReportData>(`/reports/vehicle-revenue?${query}`).then(response => setData(response.data)).catch(error => showToast(error instanceof Error ? error.message : "Unable to load vehicle revenue report", "error"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, showToast]);

  const downloadCsv = async () => {
    try {
      const response = await api.get(`/reports/vehicle-revenue?${query}&csv=1`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "vehicle-revenue.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to export report", "error");
    }
  };

  return <AdminShell title="Vehicle Revenue Report" reportsOnly>
    <div className="mt-8 space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-[#777]">Compare booking value, collected payments, and outstanding balances by vehicle.</p>
        <button className="bg-[#151515] px-4 py-3 text-sm font-bold text-white" onClick={() => void downloadCsv()}>Export CSV</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Total booking revenue", data?.total_revenue ?? 0], ["Collected revenue", data?.total_collected ?? 0], ["Outstanding", data?.total_outstanding ?? 0]].map(([label, value]) => <section className="rounded border border-black/10 bg-white p-5" key={label as string}><p className="text-xs text-[#777]">{label}</p><strong className={`mt-3 block text-2xl ${(value as number) > 0 && label === "Outstanding" ? "text-amber-600" : "text-[#ff641f]"}`}>{money.format(value as number)}</strong></section>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input className="border border-black/10 bg-white px-3 py-2.5 text-sm lg:col-span-2" placeholder="Search vehicle, plate, partner, customer..." value={search} onChange={event => setSearch(event.target.value)} />
        <DateTimePicker value={from} onChange={setFrom} className="border border-black/10 bg-white px-3 py-2.5 text-sm" placeholder="From date" />
        <DateTimePicker value={to} onChange={setTo} className="border border-black/10 bg-white px-3 py-2.5 text-sm" placeholder="To date" />
        <select className="border border-black/10 bg-white px-3 py-2.5 text-sm" value={sort} onChange={event => setSort(event.target.value)}><option value="revenue_desc">Revenue: Highest</option><option value="revenue_asc">Revenue: Lowest</option><option value="collected_desc">Collected: Highest</option><option value="collected_asc">Collected: Lowest</option><option value="bookings_desc">Bookings: Most</option><option value="bookings_asc">Bookings: Fewest</option><option value="name_asc">Vehicle: A-Z</option></select>
        <select className="border border-black/10 bg-white px-3 py-2.5 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="">Active statuses</option><option value="confirmed">Confirmed</option><option value="awaiting_payment">Awaiting payment</option><option value="paid">Paid</option><option value="active">Active</option><option value="completed">Completed</option></select>
      </div>
      <div className="overflow-x-auto rounded border border-black/10 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]"><tr><th className="p-4">Vehicle</th><th className="p-4">Partner</th><th className="p-4 text-right">Bookings</th><th className="p-4 text-right">Booking revenue</th><th className="p-4 text-right">Collected</th><th className="p-4 text-right">Outstanding</th></tr></thead><tbody>{data?.vehicles.length ? data.vehicles.map(row => { const image = imageUrl(row.vehicle); return <tr className="border-b border-black/[.06]" key={row.vehicle.id}><td className="p-4"><div className="flex items-center gap-3">{image ? <img src={image} alt="" className="h-10 w-14 rounded object-cover" /> : <div className="h-10 w-14 rounded bg-[#f1f1f1]" />}<div><p className="font-semibold">{row.vehicle.name || `${row.vehicle.brand} ${row.vehicle.model}`}</p><p className="text-xs text-[#777]">{row.vehicle.brand} {row.vehicle.model} · {row.vehicle.plate_number}</p></div></div></td><td className="p-4">{row.vehicle.partner?.name ?? "—"}</td><td className="p-4 text-right">{row.booking_count}</td><td className="p-4 text-right font-semibold">{money.format(row.booking_revenue)}</td><td className="p-4 text-right text-emerald-600">{money.format(row.collected_revenue)}</td><td className="p-4 text-right text-amber-600">{money.format(row.outstanding_revenue)}</td></tr>; }) : <tr><td className="p-8 text-center text-[#777]" colSpan={6}>No vehicle revenue found for the selected filters.</td></tr>}</tbody></table>
      </div>
      <p className="text-xs text-[#777]">{data?.vehicle_count ?? 0} vehicles · {data?.booking_count ?? 0} bookings included</p>
    </div>
  </AdminShell>;
}
