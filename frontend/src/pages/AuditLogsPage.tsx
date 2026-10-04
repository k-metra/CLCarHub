import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import api from "../lib/api";

type AuditLog = {
  id: number;
  category: "account" | "dashboard";
  action: string;
  description: string;
  changes?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
  user?: { name: string; email: string; role: string } | null;
};

type AuditResponse = {
  data: AuditLog[];
  current_page: number;
  last_page: number;
  total: number;
};

const actions = ["login", "registered", "password_changed", "created", "updated", "deleted"];
const actionLabel = (action: string) => action.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

export default function AuditLogsPage() {
  const [category, setCategory] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<AuditResponse>("/audit-logs", { params: { category: category || undefined, action: action || undefined, search: search || undefined, sort, page, per_page: 20 } })
      .then(response => setResult(response.data))
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : "Unable to load audit logs"))
      .finally(() => setLoading(false));
  }, [action, category, page, search, sort]);

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
    setLoading(true);
    setError("");
  };

  const updatePage = (nextPage: number) => {
    setPage(nextPage);
    setLoading(true);
    setError("");
  };

  return (
    <AdminShell title="Audit Logs">
      <div className="mt-8 space-y-6">
        <section className="border border-black/10 bg-white p-5 sm:p-8">
          <p className="text-xs uppercase tracking-widest text-[#ff641f]">Account and dashboard activity</p>
          <h2 className="mt-2 text-2xl font-semibold">Know what is changing</h2>
          <p className="mt-2 text-sm text-[#777]">Review sign-ins, account changes, and dashboard mutations with the acting staff member and timestamp.</p>
          <div className="mt-6 grid gap-3 md:grid-cols-[1fr_180px_180px_150px]">
            <input className="border border-black/10 px-3 py-3 text-sm" placeholder="Search activity or staff..." value={search} onChange={event => updateFilter(setSearch, event.target.value)} />
            <select className="border border-black/10 px-3 py-3 text-sm" value={category} onChange={event => updateFilter(setCategory, event.target.value)}>
              <option value="">All sections</option>
              <option value="account">Account activity</option>
              <option value="dashboard">Dashboard activity</option>
            </select>
            <select className="border border-black/10 px-3 py-3 text-sm" value={action} onChange={event => updateFilter(setAction, event.target.value)}>
              <option value="">All actions</option>
              {actions.map(item => <option key={item} value={item}>{actionLabel(item)}</option>)}
            </select>
            <select className="border border-black/10 px-3 py-3 text-sm" value={sort} onChange={event => updateFilter(setSort, event.target.value)}>
              <option value="latest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </section>
        <section className="border border-black/10 bg-white">
          {loading ? (
            <div className="space-y-4 p-6" role="status" aria-live="polite">
              <span className="sr-only">Loading audit logs...</span>
              {[1, 2, 3, 4, 5].map(item => <div key={item} className="h-14 animate-pulse border-b border-black/5 bg-black/[.03]" />)}
            </div>
          ) : error ? <p className="p-8 text-sm text-red-600">{error}</p> : result?.data.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-black/10 bg-[#f8f7f5] text-xs uppercase tracking-wider text-[#777]">
                    <tr><th className="px-5 py-4">When</th><th className="px-5 py-4">Section</th><th className="px-5 py-4">Activity</th><th className="px-5 py-4">Actor</th><th className="px-5 py-4">IP address</th></tr>
                  </thead>
                  <tbody>
                    {result.data.map(log => <tr className="border-b border-black/5" key={log.id}>
                      <td className="whitespace-nowrap px-5 py-4 text-[#777]">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-5 py-4"><span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${log.category === "account" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>{log.category}</span></td>
                      <td className="px-5 py-4"><strong>{actionLabel(log.action)}</strong><p className="mt-1 text-xs text-[#777]">{log.description}</p></td>
                      <td className="px-5 py-4">{log.user ? <><strong>{log.user.name}</strong><span className="block text-xs text-[#777]">{log.user.email}</span></> : <span className="text-[#777]">System / public</span>}</td>
                      <td className="px-5 py-4 text-[#777]">{log.ip_address ?? "—"}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-black/10 px-5 py-4 text-sm">
                <span className="text-[#777]">{result.total} total entries</span>
                <div className="flex items-center gap-3"><button disabled={page <= 1} className="border border-black/10 px-3 py-2 disabled:opacity-40" onClick={() => updatePage(page - 1)}>← Previous</button><span>Page {result.current_page} of {result.last_page}</span><button disabled={page >= result.last_page} className="border border-black/10 px-3 py-2 disabled:opacity-40" onClick={() => updatePage(page + 1)}>Next →</button></div>
              </div>
            </>
          ) : <p className="p-8 text-center text-sm text-[#777]">No audit activity matches these filters.</p>}
        </section>
      </div>
    </AdminShell>
  );
}
