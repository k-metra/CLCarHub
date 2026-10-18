import { useEffect, useState } from "react";
import { HostShell } from "../components/HostShell";
import api from "../lib/api";

type Dashboard = {
  partner: {
    name: string;
    email: string;
    vehicles: Array<{ id: number; name?: string; brand: string; model: string; plate_number: string; partner_contracts: Array<{ status: string }> }>;
    earnings: Array<{ id: number; net_amount: string; earned_at: string; created_at?: string; vehicle?: { name?: string; brand: string; model: string } }>;
    payouts: Array<{ id: number; amount: string; status: string; paid_at?: string | null; created_at?: string; payment_reference?: string | null; notes?: string | null }>;
  };
  summary: { gross_earnings: number; net_earnings: number; paid_out: number; outstanding: number };
};

function formatBusinessDate(value?: string | null, timeValue?: string | null): string {
  if (!value) return "Date unavailable";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  const formattedDate = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
  if (!timeValue) return formattedDate;

  const timestamp = new Date(timeValue);
  if (Number.isNaN(timestamp.getTime())) return formattedDate;

  return `${formattedDate}, ${new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)}`;
}

export default function HostDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<Dashboard>("/host/dashboard").then(response => setData(response.data)).catch(error => setError(error instanceof Error ? error.message : "Unable to load host dashboard"));
  }, []);
  return (
    <HostShell title="Host Dashboard">
      {error && <p className="mt-8 text-sm text-red-600">{error}</p>}
      {data && <div className="mt-8 space-y-8">
        <section id="overview" className="grid gap-4 md:grid-cols-4">
          {Object.entries(data.summary).map(([label, value]) => <div className="border border-black/10 bg-white p-5" key={label}><p className="text-xs uppercase tracking-widest text-[#777]">{label.replaceAll("_", " ")}</p><p className="mt-3 text-2xl font-semibold">₱{value.toLocaleString()}</p></div>)}
        </section>
        <section id="vehicles" className="border border-black/10 bg-white p-6">
          <h2 className="text-xl font-semibold">{data.partner.name}</h2>
          <p className="mt-1 text-sm text-[#777]">{data.partner.email}</p>
          <h3 className="mt-6 text-xs font-bold uppercase tracking-widest text-[#777]">Authorized vehicles</h3>
          <div className="mt-3 divide-y divide-black/10">{data.partner.vehicles.map(vehicle => <div className="flex justify-between py-3 text-sm" key={vehicle.id}><span>{vehicle.name || `${vehicle.brand} ${vehicle.model}`} · {vehicle.plate_number}</span><span className="text-[#777]">{vehicle.partner_contracts[0]?.status ?? "No contract"}</span></div>)}</div>
        </section>
        <section id="earnings" className="border border-black/10 bg-white p-6">
          <h2 className="text-xl font-semibold">Earnings and payouts</h2>
          <div className="mt-4 divide-y divide-black/10">{data.partner.earnings.map(earning => <div className="flex justify-between gap-4 py-3 text-sm" key={earning.id}><span>{earning.vehicle?.name || `${earning.vehicle?.brand ?? ""} ${earning.vehicle?.model ?? ""}`} · <span className="text-[#777]">{formatBusinessDate(earning.earned_at, earning.created_at)}</span></span><span className="shrink-0">₱{Number(earning.net_amount).toLocaleString()}</span></div>)}</div>
          <div className="mt-6 border-t border-black/10 pt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[#777]">Payout history</p>
            <div className="mt-2 divide-y divide-black/10">{data.partner.payouts.map(payout => <div className="flex flex-wrap justify-between gap-4 py-3 text-sm" key={payout.id}><div><p><span className="capitalize">{payout.status}</span> · <span className="text-[#777]">{formatBusinessDate(payout.paid_at, payout.created_at)}</span></p>{payout.payment_reference && <p className="mt-1 text-[#777]">Payment reference: {payout.payment_reference}</p>}{payout.notes && <p className="mt-1 text-[#777]">Notes: {payout.notes}</p>}</div><span className="shrink-0">₱{Number(payout.amount).toLocaleString()}</span></div>)}</div>
            <p className="mt-3 text-sm text-[#777]">Payouts recorded: {data.partner.payouts.length}</p>
          </div>
        </section>
      </div>}
    </HostShell>
  );
}
