import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import { RowActions, useToast } from "../components/Ui";
import api from "../lib/api";
import { useAuth } from "../lib/AuthContext";

type Account = { id: number; name: string; username?: string | null; email: string; role: string; status: string; last_login_at?: string | null; created_at: string };
type CustomerAccount = { id: number; user_id?: number | null; name: string; email?: string | null; phone: string; created_at: string; user?: { status?: string; last_login_at?: string | null } | null };
const roleLabels: Record<string, string> = { owner: "Owner", co_owner: "Co-Owner", it_management: "ITM", staff: "Staff" };
const rolesFor = (role: string) => role === "owner" ? ["co_owner", "it_management", "staff"] : role === "co_owner" ? ["it_management", "staff"] : ["staff"];

export default function AccountsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", role: "staff", status: "active" });
  const query = useMemo(() => new URLSearchParams({ ...(search ? { search } : {}), ...(roleFilter ? { role: roleFilter } : {}), ...(customerSearch ? { customer_search: customerSearch } : {}) }), [customerSearch, roleFilter, search]);
  const load = () => api.get<{ data: Account[]; customers: CustomerAccount[] }>(`/accounts?${query}`).then(response => { setAccounts(response.data.data); setCustomers(response.data.customers); }).catch(error => showToast(error instanceof Error ? error.message : "Unable to load accounts", "error"));
  useEffect(() => { void load(); }, [query.toString()]);
  const openCreate = () => { setEditing(null); setForm({ name: "", username: "", email: "", password: "", role: rolesFor(user?.role ?? "staff")[0], status: "active" }); setFormOpen(true); };
  const openEdit = (account: Account) => { setEditing(account); setForm({ name: account.name, username: account.username ?? "", email: account.email, password: "", role: account.role, status: account.status }); setFormOpen(true); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const payload = { ...form, ...(form.password ? {} : { password: undefined }) };
      if (editing) await api.patch(`/accounts/${editing.id}`, payload);
      else await api.post("/accounts", payload);
      setFormOpen(false); await load(); showToast("Account saved.");
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to save account", "error"); }
  };
  const remove = async (account: Account) => {
    if (!window.confirm(`Delete ${account.name}'s account?`)) return;
    try { await api.delete(`/accounts/${account.id}`); await load(); showToast("Account deleted."); } catch (error) { showToast(error instanceof Error ? error.message : "Unable to delete account", "error"); }
  };
  return <AdminShell title="Account Management"><div className="mt-8 space-y-8">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm text-[#777]">Manage internal access and customer accounts.</p>{user && user.role !== "staff" && <button className="bg-[#ff641f] px-4 py-3 text-sm font-bold text-white" onClick={openCreate}>Add staff account</button>}</div>
    {user && user.role !== "staff" && <section className="space-y-4"><div><h2 className="text-xl font-semibold">Staff & management accounts</h2><p className="mt-1 text-sm text-[#777]">Internal accounts and role assignments.</p></div>
    <div className="grid gap-3 sm:grid-cols-[1fr_220px]"><input className="border border-black/10 bg-white px-3 py-2.5 text-sm" placeholder="Search name, username, or email..." value={search} onChange={event => setSearch(event.target.value)} /><select className="border border-black/10 bg-white px-3 py-2.5 text-sm" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="">All roles</option><option value="owner">Owner</option><option value="co_owner">Co-Owner</option><option value="it_management">ITM</option><option value="staff">Staff</option></select></div>
    <div className="overflow-x-auto rounded border border-black/10 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]"><tr><th className="p-4">Account</th><th className="p-4">Role</th><th className="p-4">Status</th><th className="p-4">Last login</th><th className="p-4 text-right">Actions</th></tr></thead><tbody>{accounts.map(account => <tr className="border-b border-black/[.06]" key={account.id}><td className="p-4"><p className="font-semibold">{account.name}</p><p className="text-xs text-[#777]">{account.email} · @{account.username}</p></td><td className="p-4">{roleLabels[account.role] ?? account.role}</td><td className="p-4">{account.status}</td><td className="p-4 text-[#777]">{account.last_login_at ? new Date(account.last_login_at).toLocaleString() : "Never"}</td>    <td className="p-4 text-right"><RowActions actions={[{ label: "Edit", onClick: () => openEdit(account) }, ...(account.id !== user?.id ? [{ label: "Delete", danger: true, onClick: () => void remove(account) }] : [])]} /></td></tr>)}</tbody></table></div>
    </section>}
    <section className="space-y-4"><div><h2 className="text-xl font-semibold">Customer accounts</h2><p className="mt-1 text-sm text-[#777]">Customer profiles and their linked login accounts.</p></div><div className="flex gap-3"><input className="w-full max-w-xl border border-black/10 bg-white px-3 py-2.5 text-sm" placeholder="Search customer name, email, or phone..." value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} /><Link className="shrink-0 bg-[#151515] px-4 py-2.5 text-sm font-bold text-white" to="/admin/customers">Open customer records</Link></div><div className="overflow-x-auto rounded border border-black/10 bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]"><tr><th className="p-4">Customer</th><th className="p-4">Phone</th><th className="p-4">Account status</th><th className="p-4">Last login</th><th className="p-4 text-right">Actions</th></tr></thead><tbody>{customers.map(customer => <tr className="border-b border-black/[.06]" key={customer.id}><td className="p-4"><p className="font-semibold">{customer.name}</p><p className="text-xs text-[#777]">{customer.email || "No email"}</p></td><td className="p-4">{customer.phone}</td><td className="p-4">{customer.user?.status ?? "Profile only"}</td><td className="p-4 text-[#777]">{customer.user?.last_login_at ? new Date(customer.user.last_login_at).toLocaleString() : "Never"}</td><td className="p-4 text-right"><Link className="text-[#ff641f]" to="/admin/customers">Manage customer</Link></td></tr>)}</tbody></table></div></section>
    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form className="w-full max-w-lg space-y-4 rounded bg-white p-6" onSubmit={submit}><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{editing ? "Edit account" : "Add account"}</h2><button type="button" onClick={() => setFormOpen(false)}>×</button></div><input className="w-full border border-black/10 px-3 py-2.5" placeholder="Full name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /><input className="w-full border border-black/10 px-3 py-2.5" placeholder="Username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} required /><input className="w-full border border-black/10 px-3 py-2.5" type="email" placeholder="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /><input className="w-full border border-black/10 px-3 py-2.5" type="password" placeholder={editing ? "New password (optional)" : "Password"} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required={!editing} /><select className="w-full border border-black/10 px-3 py-2.5" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} disabled={editing?.id === user?.id}>{editing?.id === user?.id ? <option value={form.role}>{roleLabels[form.role]}</option> : rolesFor(user?.role ?? "staff").map(role => <option value={role} key={role}>{roleLabels[role]}</option>)}</select><select className="w-full border border-black/10 px-3 py-2.5" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="suspended">Suspended</option></select><div className="flex justify-end gap-3"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="bg-[#ff641f] px-4 py-2.5 font-bold text-white">Save</button></div></form></div>}
  </div></AdminShell>;
}
