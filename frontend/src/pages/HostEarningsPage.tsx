import { useState } from "react";
import { HostShell } from "../components/HostShell";
import { formatBusinessDate, useHostDashboard } from "../lib/hostPortal";

export default function HostEarningsPage() {
  const { data, error, loading } = useHostDashboard();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const earnings = data?.partner.earnings.filter(earning => {
    const haystack = `${earning.vehicle?.name ?? ""} ${earning.vehicle?.brand ?? ""} ${earning.vehicle?.model ?? ""} ${earning.booking?.reference ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (status === "all" || earning.status === status);
  }) ?? [];
  return <HostShell title="Earnings and payouts">
    {loading && <p className="mt-8 text-sm text-[#777]">Loading earnings...</p>}
    {error && <p className="mt-8 text-sm text-red-600">{error}</p>}
    {data && <div className="mt-8 space-y-8"><section className="grid gap-4 md:grid-cols-4">{Object.entries(data.summary).map(([label, value]) => <div className="border border-black/10 bg-white p-5" key={label}><p className="text-xs uppercase tracking-widest text-[#777]">{label.replaceAll("_", " ")}</p><p className="mt-3 text-2xl font-semibold">₱{value.toLocaleString()}</p></div>)}</section><section className="border border-black/10 bg-white p-6"><div className="flex flex-wrap gap-3"><input className="min-w-60 flex-1 border border-black/15 p-3 text-sm" placeholder="Search vehicle or booking reference" value={search} onChange={event => setSearch(event.target.value)} /><select className="border border-black/15 bg-white p-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All earning statuses</option><option value="pending">Pending</option><option value="approved">Approved</option></select></div><div className="mt-6 divide-y divide-black/10 border-t border-black/10">{earnings.map(earning => <div className="flex flex-wrap justify-between gap-3 py-4 text-sm" key={earning.id}><span><span className="block font-semibold">{earning.vehicle?.name || `${earning.vehicle?.brand ?? ""} ${earning.vehicle?.model ?? ""}`}</span><span className="text-[#777]">{earning.booking?.reference ?? "No booking reference"} · {formatBusinessDate(earning.earned_at, earning.created_at)}</span></span><span className="text-right">₱{Number(earning.net_amount).toLocaleString()}<span className="ml-2 text-xs uppercase text-[#777]">{earning.status ?? "recorded"}</span></span></div>)}</div>{earnings.length === 0 && <p className="mt-6 text-sm text-[#777]">No earnings match your search or filter.</p>}</section><section className="border border-black/10 bg-white p-6"><h2 className="text-xl font-semibold">Payout history</h2><div className="mt-4 divide-y divide-black/10">{data.partner.payouts.map(payout => <div className="flex flex-wrap justify-between gap-4 py-3 text-sm" key={payout.id}><div><p><span className="capitalize">{payout.status}</span> · <span className="text-[#777]">{formatBusinessDate(payout.paid_at, payout.created_at)}</span></p>{payout.payment_reference && <p className="mt-1 text-[#777]">Payment reference: {payout.payment_reference}</p>}{payout.notes && <p className="mt-1 text-[#777]">Notes: {payout.notes}</p>}</div><span>₱{Number(payout.amount).toLocaleString()}</span></div>)}</div></section></div>}
  </HostShell>;
}
