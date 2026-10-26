import { HostShell } from "../components/HostShell";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { useHostDashboard } from "../lib/hostPortal";
import { formatPartnerName } from "../lib/partners";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
function resolveDocumentUrl(value: string): string {
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.pathname.startsWith("/storage/") ? `${apiOrigin}${parsed.pathname}${parsed.search}` : parsed.toString();
  } catch {
    return `${apiOrigin}/${value.replace(/^\/+/, "")}`;
  }
}

export default function HostDashboardPage() {
  const { data, error, loading } = useHostDashboard();
  return (
    <HostShell title="Host overview">
      {loading && <p className="mt-8 text-sm text-[#777]">Loading overview...</p>}
      {error && <p className="mt-8 text-sm text-red-600">{error}</p>}
      {data && <div className="mt-8 space-y-8">
        <aside className="rounded border border-[#ff641f]/30 bg-[#fff7f3] p-4 text-[#151515] sm:hidden">
          <p className="text-sm font-semibold">Install CL CarHub for quick access</p>
          <p className="mt-1 text-xs leading-5 text-[#666]">Add the host portal to your Home Screen for faster access to your earnings and vehicles.</p>
          <PwaInstallButton className="mt-3" />
        </aside>
        <section className="grid gap-4 md:grid-cols-4">
          {Object.entries(data.summary).map(([label, value]) => <div className="border border-black/10 bg-white p-5" key={label}><p className="text-xs uppercase tracking-widest text-[#777]">{label.replaceAll("_", " ")}</p><p className="mt-3 text-2xl font-semibold">₱{value.toLocaleString()}</p></div>)}
        </section>
        <section className="border border-black/10 bg-white p-6">
          <h2 className="text-xl font-semibold">{formatPartnerName(data.partner)}</h2>
          <p className="mt-1 text-sm text-[#777]">{data.partner.email}</p>
          <p className="mt-6 text-sm text-[#777]">Use the host navigation to review your authorized vehicles, unit bookings, earnings, and payout history.</p>
        </section>
        <section className="border border-black/10 bg-white p-6">
          <h2 className="text-xl font-semibold">Partner contract documents</h2>
          <p className="mt-1 text-sm text-[#777]">Documents shared by CL CarHub for your partnership.</p>
          <div className="mt-6 grid gap-4 border-t border-black/10 pt-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.partner.contract_documents.map(document => {
              const url = resolveDocumentUrl(document.url);
              return <div className="overflow-hidden border border-black/10" key={document.id}>
                {document.mime_type.startsWith("image/") ? <img className="h-40 w-full object-contain bg-[#f4f3f0]" src={url} alt={document.original_name} /> : <iframe className="h-40 w-full" src={url} title={document.original_name} />}
                <a className="block truncate p-3 text-xs text-[#ff641f] hover:underline" href={url} target="_blank" rel="noreferrer">{document.original_name}</a>
              </div>;
            })}
            {data.partner.contract_documents.length === 0 && <p className="text-sm text-[#777]">No contract documents are available yet.</p>}
          </div>
        </section>
      </div>}
    </HostShell>
  );
}
