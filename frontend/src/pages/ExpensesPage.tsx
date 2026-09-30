import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AdminShell } from "../components/AdminShell";
import { useToast } from "../components/Ui";
import api from "../lib/api";
import type { ExpenseRecord, FundRecord, Paginated, VehicleRecord } from "../types";

type ExpenseResponse = Paginated<ExpenseRecord> & {
  total_expenses: number;
  car_related: number;
  general_expense: number;
};
type Category = "unit-related" | "general";
const generalCategories = ["Vehicle Insurance", "Registration", "LTO Fees", "Cleaning & Detailing", "Toll Fee", "Parking", "Fuel", "Office Supplies", "Utility Bills", "Staff Salaries", "Rent Taxes", "Ads & Marketing", "Transportation", "Food", "Personal Advance", "Others"];
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function vehicleLabel(vehicle: VehicleRecord) {
  return `${vehicle.name ? `${vehicle.name} - ` : ""}${vehicle.brand} ${vehicle.model} (${vehicle.year})`;
}

function vehicleImageUrl(vehicle: VehicleRecord): string | null {
  const value = vehicle.images?.[0]?.url;
  if (!value) return null;
  return value.startsWith("http") ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, "").replace(/^storage\//, "")}`;
}

function VehicleOption({ vehicle, selected = false }: { vehicle: VehicleRecord; selected?: boolean }) {
  const image = vehicleImageUrl(vehicle);
  return <span className="flex min-w-0 items-center gap-3">
    {image ? <img className="h-10 w-14 shrink-0 rounded object-contain" src={image} alt="" /> : <span className="h-10 w-14 shrink-0 rounded bg-black/5" />}
    <span className="min-w-0">
      <span className={`block truncate font-medium ${selected ? "text-[#ff641f]" : "text-[#222]"}`}>{vehicleLabel(vehicle)}</span>
      <span className="block truncate text-xs text-[#888]">{vehicle.plate_number}</span>
    </span>
  </span>;
}

function VehiclePicker({ value, vehicles, onChange }: { value: string; vehicles: VehicleRecord[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = vehicles.find(vehicle => String(vehicle.id) === value);
  const filtered = vehicles.filter(vehicle => `${vehicleLabel(vehicle)} ${vehicle.plate_number}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) { setOpen(false); setQuery(""); } };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return <div className="relative" ref={ref}>
    <button type="button" className="flex min-h-[43px] w-full items-center justify-between gap-3 border border-black/10 bg-white px-3 py-2.5 text-left text-sm" onClick={() => setOpen(current => !current)}><span className="min-w-0 flex-1">{selected ? <VehicleOption vehicle={selected} selected /> : <span className="text-[#999]">Search and select a unit</span>}</span><span className="shrink-0 text-[#777]">⌄</span></button>
    {open && <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden border border-black/10 bg-white shadow-xl"><input autoFocus className="w-full border-b border-black/10 px-3 py-3 text-sm outline-none" placeholder="Search unit..." value={query} onChange={event => setQuery(event.target.value)} /><div className="max-h-60 overflow-y-auto p-1">{filtered.length ? filtered.map(vehicle => <button type="button" className="flex w-full items-center rounded px-2 py-2 text-left hover:bg-[#f8f7f5]" key={vehicle.id} onClick={() => { onChange(String(vehicle.id)); setOpen(false); setQuery(""); }}><VehicleOption vehicle={vehicle} selected={String(vehicle.id) === value} /></button>) : <p className="px-3 py-5 text-sm text-[#777]">No units found.</p>}</div></div>}
  </div>;
}

export default function ExpensesPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<ExpenseResponse | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [funds, setFunds] = useState<FundRecord[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);
  const [category, setCategory] = useState<Category>("unit-related");
  const [vehicleId, setVehicleId] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [fundId, setFundId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date_latest");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ sort });
    if (search.trim()) params.set("search", search.trim());
    if (categoryFilter) params.set("category", categoryFilter);
    Promise.all([api.get<ExpenseResponse>(`/expenses?${params.toString()}`), api.get<Paginated<VehicleRecord>>("/vehicles?per_page=100"), api.get<{ funds: FundRecord[] }>("/funds")])
      .then(([expenses, vehicleResult, fundResult]) => { setData(expenses.data); setVehicles(vehicleResult.data.data); setFunds(fundResult.data.funds); })
      .catch(error => showToast(error instanceof Error ? error.message : "Unable to load expenses", "error"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [search, sort, categoryFilter]);
  const resetForm = () => { setEditingId(null); setVehicleId(""); setExpenseType(""); setFundId(""); setSpentAt(new Date().toISOString().slice(0, 16)); setDescription(""); setAmount(""); };
  const editExpense = (expense: ExpenseRecord) => {
    setEditingId(expense.id);
    setCategory(expense.category);
    setVehicleId(expense.vehicle_id ? String(expense.vehicle_id) : "");
    setFundId(expense.fund_id ? String(expense.fund_id) : "");
    setExpenseType(expense.expense_type ?? "");
    setSpentAt(expense.spent_at.slice(0, 16));
    setDescription(expense.description);
    setAmount(expense.amount);
    setSelectedExpense(null);
    setFormOpen(true);
  };
  const submit = async (event: FormEvent, createAnother: boolean) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { category, vehicle_id: category === "unit-related" ? Number(vehicleId) : null, fund_id: fundId ? Number(fundId) : null, expense_type: category === "general" ? expenseType : null, spent_at: spentAt, description, amount: Number(amount) };
      if (editingId) await api.patch(`/expenses/${editingId}`, payload);
      else await api.post("/expenses", payload);
      showToast(editingId ? "Expense updated successfully." : "Expense created successfully.", "success");
      load();
      if (createAnother) { resetForm(); setCategory("unit-related"); } else { setFormOpen(false); resetForm(); }
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to create expense", "error"); }
    finally { setSaving(false); }
  };
  const deleteExpense = async (expense: ExpenseRecord) => {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    try {
      await api.delete(`/expenses/${expense.id}`);
      setSelectedExpense(null);
      load();
      showToast("Expense deleted successfully.", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to delete expense", "error"); }
  };
  const cards = useMemo(() => data ? [["Total Expenses", data.total_expenses], ["Car Related", data.car_related], ["General Expense", data.general_expense]] : [], [data]);
  return <AdminShell title="Expenses">
    <div className="mt-8 space-y-6">
      <div><p className="text-sm text-[#777]">Track fleet operational costs and general business expenses.</p><button className="mt-4 bg-[#ff641f] px-5 py-3 text-sm font-bold text-white" onClick={() => { resetForm(); setCategory("unit-related"); setFormOpen(true); }}>+ Add expense</button></div>
      <div className="grid gap-4 sm:grid-cols-3">{cards.length ? cards.map(([label, value]) => <section className="rounded border border-black/10 bg-white p-5" key={label as string}><p className="text-xs text-[#777]">{label}</p><strong className="mt-3 block text-2xl text-[#ff641f]">{money.format(value as number)}</strong></section>) : [1, 2, 3].map(item => <section className="h-24 animate-pulse rounded bg-black/5" key={item} />)}</div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_190px]">
        <input className="w-full border border-black/10 bg-white px-3 py-2.5 text-sm" placeholder="Search description, category, unit, or plate..." value={search} onChange={event => setSearch(event.target.value)} />
        <select className="w-full border border-black/10 bg-white px-3 py-2.5 text-sm" value={sort} onChange={event => setSort(event.target.value)}>
          <option value="date_latest">Date: Latest</option>
          <option value="date_oldest">Date: Oldest</option>
          <option value="amount_asc">Amount: Ascending</option>
          <option value="amount_desc">Amount: Descending</option>
          <option value="category_unit">Category: Unit-Related</option>
          <option value="category_general">Category: General Expense</option>
        </select>
        <select className="w-full border border-black/10 bg-white px-3 py-2.5 text-sm" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
          <option value="">All categories</option>
          <option value="unit-related">Unit-Related</option>
          <option value="general">General Expense</option>
        </select>
      </div>
      {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"><form className="w-full max-w-2xl bg-white p-6 shadow-2xl" onSubmit={event => void submit(event, false)}><div className="flex items-center justify-between"><h2 className="font-['Space_Grotesk'] text-2xl font-semibold">{editingId ? "Edit expense" : "Add expense"}</h2><button type="button" className="text-2xl text-[#777]" onClick={() => { setFormOpen(false); resetForm(); }}>×</button></div><div className="mt-6 space-y-5"><fieldset><legend className="text-xs font-semibold text-[#555]">Expense category</legend><div className="mt-2 flex gap-5 text-sm"><label><input type="radio" checked={category === "unit-related"} onChange={() => setCategory("unit-related")} /> <span className="ml-1">Unit-Related</span></label><label><input type="radio" checked={category === "general"} onChange={() => setCategory("general")} /> <span className="ml-1">General Expense</span></label></div></fieldset>{category === "unit-related" ? <label className="block text-xs text-[#777]">Select Unit<VehiclePicker value={vehicleId} vehicles={vehicles} onChange={setVehicleId} /></label> : <label className="block text-xs text-[#777]">Select Category<select required className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" value={expenseType} onChange={event => setExpenseType(event.target.value)}><option value="">Choose a category</option>{generalCategories.map(option => <option key={option}>{option}</option>)}</select></label>}<label className="block text-xs text-[#777]">Fund source<select className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" value={fundId} onChange={event => setFundId(event.target.value)}><option value="">No fund source</option>{funds.map(fund => <option value={fund.id} key={fund.id}>{fund.name}</option>)}</select></label><label className="block text-xs text-[#777]">Date and time<input required type="datetime-local" className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" value={spentAt} onChange={event => setSpentAt(event.target.value)} /></label><label className="block text-xs text-[#777]">Description / Particulars<textarea required className="mt-2 min-h-28 w-full border border-black/10 px-3 py-2.5 text-sm" value={description} onChange={event => setDescription(event.target.value)} /></label><label className="block text-xs text-[#777]">Amount in PHP<input required min="0.01" step="0.01" type="number" className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" value={amount} onChange={event => setAmount(event.target.value)} /></label></div><div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" className="border border-black/10 px-4 py-2 text-sm" onClick={() => { setFormOpen(false); resetForm(); }}>Cancel</button>{!editingId && <button type="button" disabled={saving} className="border border-[#ff641f] px-4 py-2 text-sm text-[#ff641f] disabled:opacity-50" onClick={event => void submit(event, true)}>Create &amp; create another</button>}<button disabled={saving} className="bg-[#151515] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? (editingId ? "Saving..." : "Creating...") : (editingId ? "Save changes" : "Create")}</button></div></form></div>}
      {selectedExpense && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section className="w-full max-w-lg bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Expense details</p><h2 className="mt-2 font-['Space_Grotesk'] text-2xl font-semibold">{selectedExpense.category === "unit-related" ? "Unit-Related expense" : "General expense"}</h2></div><button className="text-2xl text-[#777]" onClick={() => setSelectedExpense(null)}>×</button></div><dl className="mt-6 space-y-4 text-sm"><div><dt className="text-xs uppercase tracking-widest text-[#888]">Date and time</dt><dd className="mt-1">{formatDate(selectedExpense.spent_at)}</dd></div><div><dt className="text-xs uppercase tracking-widest text-[#888]">Unit / category</dt><dd className="mt-1">{selectedExpense.vehicle ? vehicleLabel(selectedExpense.vehicle) : selectedExpense.expense_type}</dd></div><div><dt className="text-xs uppercase tracking-widest text-[#888]">Description</dt><dd className="mt-1 whitespace-pre-wrap text-[#555]">{selectedExpense.description}</dd></div><div><dt className="text-xs uppercase tracking-widest text-[#888]">Amount</dt><dd className="mt-1 text-xl font-bold text-[#ff641f]">{money.format(Number(selectedExpense.amount))}</dd></div></dl><div className="mt-8 flex justify-end gap-3"><button className="border border-red-200 px-4 py-2 text-sm text-red-600" onClick={() => void deleteExpense(selectedExpense)}>Delete</button><button className="bg-[#151515] px-4 py-2 text-sm font-bold text-white" onClick={() => editExpense(selectedExpense)}>Edit</button></div></section></div>}
      <div className="overflow-x-auto rounded border border-black/10 bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]"><tr><th className="p-4">Date</th><th className="p-4">Category</th><th className="p-4">Unit / Expense category</th><th className="p-4">Description</th><th className="p-4 text-right">Amount</th><th className="p-4 text-right">Actions</th></tr></thead><tbody>{loading ? <tr><td className="p-6 text-[#888]" colSpan={6}>Loading expenses...</td></tr> : data?.data.length ? data.data.map(expense => <tr className="border-b border-black/[.06]" key={expense.id}><td className="p-4 whitespace-nowrap text-[#777]">{formatDate(expense.spent_at)}</td><td className="p-4 capitalize">{expense.category === "unit-related" ? "Unit-Related" : "General Expense"}</td><td className="p-4">{expense.vehicle ? vehicleLabel(expense.vehicle) : expense.expense_type}</td><td className="p-4 text-[#777]">{expense.description}</td><td className="p-4 text-right font-semibold">{money.format(Number(expense.amount))}</td><td className="p-4 text-right whitespace-nowrap"><button className="mr-3 text-[#ff641f]" onClick={() => setSelectedExpense(expense)}>View</button><button className="text-red-600" onClick={() => void deleteExpense(expense)}>Delete</button></td></tr>) : <tr><td className="p-8 text-center text-[#777]" colSpan={6}>No expenses recorded yet.</td></tr>}</tbody></table></div>
    </div>
  </AdminShell>;
}
