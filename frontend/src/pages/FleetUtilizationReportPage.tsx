import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import { DateTimePicker } from "../components/DateTimePicker";
import { useToast } from "../components/Ui";
import api from "../lib/api";
import { vehicleTypeLabels, vehicleTypes, type PartnerRecord, type VehicleRecord } from "../types";

type UtilizationRow = {
  vehicle: VehicleRecord;
  booking_count: number;
  available_days: number;
  booked_days: number;
  idle_days: number;
  utilization_rate: number;
  average_rental_days: number;
};

type ReportData = {
  from: string;
  to: string;
  available_days: number;
  vehicles: UtilizationRow[];
  vehicle_count: number;
  booking_count: number;
  booked_days: number;
  idle_days: number;
  average_utilization: number;
  partners: Pick<PartnerRecord, "id" | "name">[];
};

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
const dateValue = (date: Date) => date.toISOString().slice(0, 10);
const initialFrom = dateValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const initialTo = dateValue(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

function imageUrl(vehicle: VehicleRecord) {
  const value = vehicle.images?.[0]?.url;
  return value ? (value.startsWith("http") ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, "").replace(/^storage\//, "")}`) : null;
}

export default function FleetUtilizationReportPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [type, setType] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [sort, setSort] = useState("utilization_desc");
  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to, sort });
    if (search.trim()) params.set("search", search.trim());
    if (type) params.set("type", type);
    if (partnerId) params.set("partner_id", partnerId);
    return params;
  }, [from, partnerId, search, sort, to, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.get<ReportData>(`/reports/utilization?${query}`).then(response => setData(response.data)).catch(error => showToast(error instanceof Error ? error.message : "Unable to load fleet utilization report", "error"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, showToast]);

  const downloadCsv = async () => {
    try {
      const response = await api.get(`/reports/utilization?${query}&csv=1`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fleet-utilization.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to export report", "error");
    }
  };

  return <AdminShell title="Fleet Utilization Report" reportsOnly>
    <div className="mt-8 space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-[#777]">Measure how much of the selected period each vehicle is booked.</p>
        <button className="bg-[#151515] px-4 py-3 text-sm font-bold text-white" onClick={() => void downloadCsv()}>Export CSV</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Average utilization", `${data?.average_utilization ?? 0}%`], ["Booked days", data?.booked_days ?? 0], ["Idle days", data?.idle_days ?? 0]].map(([label, value]) => <section className="rounded border border-black/10 bg-white p-5" key={label as string}><p className="text-xs text-[#777]">{label}</p><strong className="mt-3 block text-2xl text-[#ff641f]">{value}</strong></section>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input className="border border-black/10 bg-white px-3 py-2.5 text-sm lg:col-span-2" placeholder="Search vehicle, plate, or partner..." value={search} onChange={event => setSearch(event.target.value)} />
        <DateTimePicker value={from} onChange={setFrom} className="border border-black/10 bg-white px-3 py-2.5 text-sm" placeholder="From date" />
        <DateTimePicker value={to} onChange={setTo} className="border border-black/10 bg-white px-3 py-2.5 text-sm" placeholder="To date" />
        <select className="border border-black/10 bg-white px-3 py-2.5 text-sm" value={type} onChange={event => setType(event.target.value)}><option value="">All types</option>{vehicleTypes.map(vehicleType => <option key={vehicleType} value={vehicleType}>{vehicleTypeLabels[vehicleType]}</option>)}</select>
        <select className="border border-black/10 bg-white px-3 py-2.5 text-sm" value={partnerId} onChange={event => setPartnerId(event.target.value)}><option value="">All partners</option><option value="none">No partner</option>{data?.partners.map(partner => <option value={partner.id} key={partner.id}>{partner.name}</option>)}</select>
        <select className="border border-black/10 bg-white px-3 py-2.5 text-sm lg:col-span-2" value={sort} onChange={event => setSort(event.target.value)}><option value="utilization_desc">Utilization: Highest</option><option value="utilization_asc">Utilization: Lowest</option><option value="bookings_desc">Bookings: Most</option><option value="bookings_asc">Bookings: Fewest</option><option value="booked_days_desc">Booked days: Most</option><option value="booked_days_asc">Booked days: Fewest</option><option value="name_asc">Vehicle: A-Z</option></select>
      </div>
      <div className="overflow-x-auto rounded border border-black/10 bg-white">
        <table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]"><tr><th className="p-4">Vehicle</th><th className="p-4">Partner</th><th className="p-4 text-right">Bookings</th><th className="p-4 text-right">Booked days</th><th className="p-4 text-right">Idle days</th><th className="p-4 text-right">Utilization</th><th className="p-4 text-right">Avg. rental</th></tr></thead><tbody>{data?.vehicles.length ? data.vehicles.map(row => { const image = imageUrl(row.vehicle); return <tr className="border-b border-black/[.06]" key={row.vehicle.id}><td className="p-4"><div className="flex items-center gap-3">{image ? <img src={image} alt="" className="h-10 w-14 rounded object-cover" /> : <div className="h-10 w-14 rounded bg-[#f1f1f1]" />}<div><p className="font-semibold">{row.vehicle.name || `${row.vehicle.brand} ${row.vehicle.model}`}</p><p className="text-xs text-[#777]">{row.vehicle.brand} {row.vehicle.model} · {row.vehicle.plate_number}</p></div></div></td><td className="p-4">{row.vehicle.partner?.name ?? "—"}</td><td className="p-4 text-right">{row.booking_count}</td><td className="p-4 text-right">{row.booked_days} / {row.available_days}</td><td className="p-4 text-right text-[#777]">{row.idle_days}</td><td className="p-4 text-right font-semibold text-[#ff641f]">{row.utilization_rate}%</td><td className="p-4 text-right text-[#777]">{row.average_rental_days} days</td></tr>; }) : <tr><td className="p-8 text-center text-[#777]" colSpan={7}>No utilization data found for the selected filters.</td></tr>}</tbody></table>
      </div>
      <p className="text-xs text-[#777]">{data?.vehicle_count ?? 0} vehicles · {data?.booking_count ?? 0} bookings · {data?.available_days ?? 0} days in selected period</p>
    </div>
  </AdminShell>;
}
