import { HostShell } from "../components/HostShell";
import { useHostDashboard } from "../lib/hostPortal";

export default function HostDashboardPage() {
  const { data, error, loading } = useHostDashboard();
  return (
    <HostShell title="Host overview">
      {loading && <p className="mt-8 text-sm text-[#777]">Loading overview...</p>}
      {error && <p className="mt-8 text-sm text-red-600">{error}</p>}
      {data && <div className="mt-8 space-y-8">
        <section className="grid gap-4 md:grid-cols-4">
          {Object.entries(data.summary).map(([label, value]) => <div className="border border-black/10 bg-white p-5" key={label}><p className="text-xs uppercase tracking-widest text-[#777]">{label.replaceAll("_", " ")}</p><p className="mt-3 text-2xl font-semibold">₱{value.toLocaleString()}</p></div>)}
        </section>
        <section className="border border-black/10 bg-white p-6">
          <h2 className="text-xl font-semibold">{data.partner.name}</h2>
          <p className="mt-1 text-sm text-[#777]">{data.partner.email}</p>
          <p className="mt-6 text-sm text-[#777]">Use the host navigation to review your authorized vehicles, unit bookings, earnings, and payout history.</p>
        </section>
      </div>}
    </HostShell>
  );
}
