import { useEffect, useState } from "react";
import { AdminShell } from "../components/AdminShell";
import api from "../lib/api";
import { useToast } from "../components/Ui";

type HostContract = {
  id: number;
  booking_id: number;
  contract_id?: number | null;
  status: string;
  host_details?: { rate?: number | string | null; total_amount?: number | string | null; notes?: string | null; special_terms?: string | null } | null;
  booking: {
    reference: string;
    pickup_at: string;
    return_at: string;
    customer?: { name?: string | null } | null;
    rental_rate?: number | string | null;
    rental_amount?: number | string | null;
    total_amount?: number | string | null;
    vehicle?: { name?: string | null; brand: string; model: string; plate_number: string } | null;
  };
};

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const rentalDays = (booking: HostContract["booking"]) => Math.max(1, Math.floor((new Date(booking.return_at).getTime() - new Date(booking.pickup_at).getTime()) / 86400000));

export default function HostContractBuilderPage() {
  const { showToast } = useToast();
  const [contracts, setContracts] = useState<HostContract[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rate, setRate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [specialTerms, setSpecialTerms] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await api.get<HostContract[]>("/host-contracts");
    setContracts(response.data);
    if (selectedId == null && response.data[0]) select(response.data[0]);
  };

  const select = (contract: HostContract) => {
    setSelectedId(contract.id);
    setRate(contract.host_details?.rate == null ? String(contract.booking.rental_rate ?? "") : String(contract.host_details.rate));
    setTotalAmount(contract.host_details?.total_amount == null ? "" : String(contract.host_details.total_amount));
    setNotes(contract.host_details?.notes ?? "");
    setSpecialTerms(contract.host_details?.special_terms ?? "");
  };

  useEffect(() => {
    load().catch(error => showToast(error instanceof Error ? error.message : "Unable to load host contracts", "error")).finally(() => setLoading(false));
  }, []);

  const selected = contracts.find(contract => contract.id === selectedId);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredContracts = normalizedSearch
    ? contracts.filter(contract => {
      const vehicle = contract.booking.vehicle;
      const haystack = [
        contract.booking.reference,
        contract.booking.customer?.name,
        vehicle?.name,
        vehicle?.brand,
        vehicle?.model,
        vehicle?.plate_number,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    })
    : contracts;
  const calculatedTotal = selected && rate !== ""
    ? Number(selected.booking.total_amount ?? 0) - Number(selected.booking.rental_amount ?? 0) + Number(rate) * rentalDays(selected.booking)
    : null;
  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/host-contracts/${selected.booking_id}`, {
        host_details: {
          rate: rate === "" ? null : Number(rate),
          total_amount: totalAmount === "" ? null : Number(totalAmount),
          notes: notes || null,
          special_terms: specialTerms || null,
        },
      });
      await load();
      showToast("Host contract view saved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save host contract view", "error");
    } finally {
      setSaving(false);
    }
  };

  return <AdminShell title="Host contract views">
    <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
      <section className="rounded border border-black/10 bg-white p-4">
        <h2 className="font-semibold">Contracts</h2>
        <input className="mt-3 w-full border border-black/10 px-3 py-2.5 text-sm" placeholder="Search reference, customer, unit, or plate" value={search} onChange={event => setSearch(event.target.value)} />
        {loading && <p className="mt-4 text-sm text-[#777]">Loading contracts...</p>}
        {!loading && contracts.length === 0 && <p className="mt-4 text-sm text-[#777]">No bookings have been made yet.</p>}
        {!loading && contracts.length > 0 && filteredContracts.length === 0 && <p className="mt-4 text-sm text-[#777]">No bookings match your search.</p>}
        <div className="mt-3 space-y-2">{filteredContracts.map(contract => <button type="button" key={contract.id} onClick={() => select(contract)} className={`w-full rounded border p-3 text-left ${selectedId === contract.id ? "border-[#ff641f] bg-[#fff7f3]" : "border-black/10"}`}>
          <p className="font-semibold">{contract.booking.reference}</p>
          <p className="mt-1 text-sm">{contract.booking.customer?.name ?? "Unknown customer"}</p>
          <p className="mt-1 text-sm">{contract.booking.vehicle?.name || `${contract.booking.vehicle?.brand ?? ""} ${contract.booking.vehicle?.model ?? ""}`}</p>
          <p className="mt-1 text-xs text-[#777]">{contract.booking.vehicle?.plate_number} · {contract.status === "not_created" ? "Host view not configured" : contract.status}</p>
        </button>)}</div>
      </section>
      {selected && <section className="rounded border border-black/10 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Host-only content</p>
        <h2 className="mt-2 text-xl font-semibold">{selected.booking.reference}</h2>
        <p className="mt-1 text-sm text-[#777]">These values are shown to the vehicle host and do not change the renter-facing contract.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Rate shown to host<input className="mt-2 w-full border border-black/10 px-3 py-2.5" type="number" min="0" step="0.01" value={rate} onChange={event => setRate(event.target.value)} /></label>
          <label className="text-sm">Total shown to host<input className="mt-2 w-full border border-black/10 px-3 py-2.5" type="number" min="0" step="0.01" value={totalAmount} onChange={event => setTotalAmount(event.target.value)} placeholder={calculatedTotal == null ? "Calculated from rate" : calculatedTotal.toFixed(2)} /><span className="mt-1 block text-xs text-[#777]">Leave blank to calculate from the host rate. Enter a value only to override the calculated total.</span></label>
        </div>
        <label className="mt-4 block text-sm">Host notes<textarea className="mt-2 min-h-32 w-full border border-black/10 px-3 py-2.5" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional notes for the host" /></label>
        <label className="mt-4 block text-sm">Host contract terms<textarea className="mt-2 min-h-32 w-full border border-black/10 px-3 py-2.5" value={specialTerms} onChange={event => setSpecialTerms(event.target.value)} placeholder="Optional terms shown only to the host" /></label>
        <div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm text-[#777]">Calculated host total: {calculatedTotal == null ? "—" : money.format(calculatedTotal)} · Renter contract rate: {money.format(Number(selected.booking.rental_rate ?? 0))}</p><button type="button" className="bg-[#ff641f] px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save host view"}</button></div>
      </section>}
    </div>
  </AdminShell>;
}
