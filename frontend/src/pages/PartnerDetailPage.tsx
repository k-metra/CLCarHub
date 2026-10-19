import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import api from "../lib/api";

type Vehicle = { id: number; name?: string; brand: string; model: string; plate_number: string; partner_contracts: Array<{ id: number; status: string; starts_at?: string | null; ends_at?: string | null }> };
type Earning = { id: number; net_amount: string; status: string; earned_at: string; booking?: { id: number; reference: string; customer?: { name: string } | null } | null; vehicle?: { name?: string; brand: string; model: string; images?: Array<{ url: string; is_primary?: boolean }> } | null };
type Payout = { id: number; amount: string; status: string; paid_at?: string | null; payment_reference?: string | null; notes?: string | null; fund?: { id: number; name: string } | null; payout_method?: PayoutMethod | null };
type Fund = { id: number; name: string; balance: number };
type PayoutMethod = { id: number; type: "bank" | "e_wallet"; provider_name: string; account_name: string; account_number: string; notes?: string | null; is_primary: boolean };
type Partner = { id: number; name: string; email: string; contact_number: string; address: string; host_access_status: string; user?: { name: string; email: string; status: string; email_verified_at?: string | null } | null; vehicles: Vehicle[]; earnings: Earning[]; payouts: Payout[]; payout_methods: PayoutMethod[] };

export default function PartnerDetailPage() {
  const { partnerId } = useParams();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [error, setError] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutStatus, setPayoutStatus] = useState<"pending" | "paid">("paid");
  const [paymentReference, setPaymentReference] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [funds, setFunds] = useState<Fund[]>([]);
  const [payoutFundId, setPayoutFundId] = useState("");
  const [payoutMethodId, setPayoutMethodId] = useState("");
  const [pendingPayoutFunds, setPendingPayoutFunds] = useState<Record<number, string>>({});
  const [pendingPayoutMethods, setPendingPayoutMethods] = useState<Record<number, string>>({});
  const [savingPayout, setSavingPayout] = useState(false);
  const [updatingPayoutId, setUpdatingPayoutId] = useState<number | null>(null);
  const [methodForm, setMethodForm] = useState({ type: "bank" as "bank" | "e_wallet", provider_name: "", account_name: "", account_number: "", notes: "", is_primary: false });
  const [savingMethod, setSavingMethod] = useState(false);
  const load = () => Promise.all([
    api.get<Partner>(`/partners/${partnerId}`),
    api.get<{ funds: Fund[] }>("/funds"),
  ]).then(([partnerResponse, fundsResponse]) => {
    setPartner(partnerResponse.data);
    setFunds(fundsResponse.data.funds);
    setPayoutMethodId(current => current || String(partnerResponse.data.payout_methods.find(method => method.is_primary)?.id ?? ""));
  }).catch(error => setError(error instanceof Error ? error.message : "Unable to load partner"));
  useEffect(() => { void load(); }, [partnerId]);
  const setContract = async (vehicle: Vehicle, status: string) => {
    try {
      await api.post(`/partners/${partnerId}/vehicle-contracts`, { vehicle_id: vehicle.id, status });
      load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save vehicle contract");
    }
  };
  const eligibleTotal = partner?.earnings.filter(earning => earning.status === "approved").reduce((sum, earning) => sum + Number(earning.net_amount), 0) ?? 0;
  const recordedPayouts = partner?.payouts.filter(payout => ["pending", "paid"].includes(payout.status)).reduce((sum, payout) => sum + Number(payout.amount), 0) ?? 0;
  const outstanding = Math.max(0, eligibleTotal - recordedPayouts);
  const createPayout = async (event: FormEvent) => {
    event.preventDefault();
    setSavingPayout(true);
    setError("");
    try {
      await api.post(`/partners/${partnerId}/payouts`, {
        amount: Number(payoutAmount),
        status: payoutStatus,
        fund_id: Number(payoutFundId),
        partner_payout_method_id: Number(payoutMethodId),
        paid_at: payoutStatus === "paid" ? new Date().toISOString().slice(0, 10) : null,
        payment_reference: paymentReference || null,
        notes: payoutNotes || null,
      });
      setPayoutAmount("");
      setPaymentReference("");
      setPayoutNotes("");
      setPayoutFundId("");
      setPayoutMethodId("");
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create payout");
    } finally {
      setSavingPayout(false);
    }
  };
  const approveEarning = async (earning: Earning) => {
    try {
      await api.patch(`/partner-earnings/${earning.id}`, { status: "approved" });
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to approve earning");
    }
  };
  const updatePayout = async (payout: Payout, status: "paid" | "cancelled") => {
    if (status === "cancelled" && !window.confirm("Cancel this pending payout?")) return;
    setUpdatingPayoutId(payout.id);
    setError("");
    try {
      const updateData = status === "paid"
        ? {
          status,
          fund_id: payout.fund?.id ?? Number(pendingPayoutFunds[payout.id]),
          partner_payout_method_id: payout.payout_method?.id ?? Number(pendingPayoutMethods[payout.id]),
          paid_at: new Date().toISOString().slice(0, 10),
        }
        : { status };
      await api.patch(`/partner-payouts/${payout.id}`, {
        ...updateData,
      });
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update payout");
    } finally {
      setUpdatingPayoutId(null);
    }
  };
  const savePayoutMethod = async (event: FormEvent) => {
    event.preventDefault();
    setSavingMethod(true);
    setError("");
    try {
      await api.post(`/partners/${partnerId}/payout-methods`, methodForm);
      setMethodForm({ type: "bank", provider_name: "", account_name: "", account_number: "", notes: "", is_primary: false });
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save payout method");
    } finally {
      setSavingMethod(false);
    }
  };
  const removePayoutMethod = async (method: PayoutMethod) => {
    if (!window.confirm(`Remove ${method.provider_name} payout details?`)) return;
    try {
      await api.delete(`/partner-payout-methods/${method.id}`);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to remove payout method");
    }
  };
  return <AdminShell title="Partner details">
    <Link className="mt-8 inline-block text-sm text-[#ff641f]" to="/admin/partners">← All partners</Link>
    {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    {partner && <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
      <section className="border border-black/10 bg-white p-6">
        <h2 className="text-2xl font-semibold">{partner.name}</h2>
        <p className="mt-2 text-sm text-[#777]">{partner.email}</p>
        <p className="mt-1 text-sm text-[#777]">{partner.contact_number}</p>
        <p className="mt-1 text-sm text-[#777]">{partner.address}</p>
        <p className="mt-6 text-xs uppercase tracking-widest text-[#777]">Host access</p>
        <p className="mt-2 font-semibold">{partner.host_access_status}</p>
        {partner.user && <p className="mt-2 text-sm text-[#777]">Linked account: {partner.user.email} ({partner.user.status})</p>}
      </section>
      <section className="border border-black/10 bg-white p-6">
        <h2 className="text-xl font-semibold">Partner vehicles and contracts</h2>
        <div className="mt-4 divide-y divide-black/10">{partner.vehicles.map(vehicle => {
          const contract = vehicle.partner_contracts[0];
          return <div className="flex flex-wrap items-center justify-between gap-3 py-4" key={vehicle.id}>
            <div><p className="font-semibold">{vehicle.name || `${vehicle.brand} ${vehicle.model}`}</p><p className="text-sm text-[#777]">{vehicle.plate_number}</p></div>
            <div className="flex items-center gap-3"><span className="text-xs uppercase text-[#777]">{contract?.status ?? "no contract"}</span><select className="border border-black/10 px-2 py-2 text-sm" value={contract?.status ?? "draft"} onChange={event => void setContract(vehicle, event.target.value)}><option value="draft">Draft</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="suspended">Suspended</option><option value="expired">Expired</option></select></div>
          </div>;
        })}</div>
      </section>
      <section className="border border-black/10 bg-white p-6 lg:col-span-2">
        <h2 className="text-xl font-semibold">Partner earnings</h2>
        <p className="mt-1 text-sm text-[#777]">Review completed-booking earnings before they become payable.</p>
        <div className="mt-4 divide-y divide-black/10 border-t border-black/10">
          {partner.earnings.length === 0 && <p className="py-4 text-sm text-[#777]">No earnings recorded yet.</p>}
          {partner.earnings.map(earning => {
            const vehicleImage = earning.vehicle?.images?.find(image => image.is_primary)?.url ?? earning.vehicle?.images?.[0]?.url;
            return <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm" key={earning.id}>
              <Link className="flex min-w-0 items-center gap-3 rounded p-1 transition hover:bg-black/5" to={earning.booking ? `/admin/bookings?booking=${earning.booking.id}` : "#"} aria-label={earning.booking ? `View booking ${earning.booking.reference}` : "Booking unavailable"}>
                {vehicleImage ? <img className="h-12 w-16 shrink-0 rounded object-cover" src={vehicleImage} alt="" /> : <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-[#f4f3f0] text-lg text-[#999]" aria-hidden="true">▱</div>}
                <span className="min-w-0"><span className="block font-semibold">{earning.vehicle?.name || `${earning.vehicle?.brand ?? ""} ${earning.vehicle?.model ?? ""}`}</span><span className="block text-xs text-[#777]">{earning.booking?.reference ?? "No booking reference"} · {earning.booking?.customer?.name ?? "Customer unavailable"}</span></span>
              </Link>
              <span className="flex items-center gap-3 uppercase text-[#777]">₱{Number(earning.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} · {earning.status}{earning.status === "pending" && <button className="bg-[#151515] px-3 py-2 text-xs font-semibold text-white hover:bg-[#ff641f]" onClick={() => void approveEarning(earning)}>Approve</button>}</span>
            </div>;
          })}
        </div>
      </section>
      <section className="border border-black/10 bg-white p-6 lg:col-span-2">
        <h2 className="text-xl font-semibold">Bank and e-wallet details</h2>
        <p className="mt-1 text-sm text-[#777]">Save multiple payout destinations for quick reference when processing transfers.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {partner.payout_methods.map(method => <div className="border border-black/10 p-4" key={method.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{method.provider_name} {method.is_primary && <span className="ml-2 text-xs uppercase text-[#ff641f]">Primary</span>}</p><p className="mt-1 text-sm text-[#777]">{method.type === "bank" ? "Bank account" : "E-wallet"}</p></div><button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void removePayoutMethod(method)}>Remove</button></div><p className="mt-3 text-sm">{method.account_name}</p><p className="text-sm font-mono">{method.account_number}</p>{method.notes && <p className="mt-2 text-xs text-[#777]">{method.notes}</p>}</div>)}
          {partner.payout_methods.length === 0 && <p className="text-sm text-[#777]">No payout details saved yet.</p>}
        </div>
        <form className="mt-6 grid gap-4 border-t border-black/10 pt-6 md:grid-cols-2" onSubmit={savePayoutMethod}>
          <label className="text-sm font-medium">Type<select className="mt-2 w-full border border-black/15 bg-white p-3" value={methodForm.type} onChange={event => setMethodForm({ ...methodForm, type: event.target.value as "bank" | "e_wallet" })}><option value="bank">Bank account</option><option value="e_wallet">E-wallet</option></select></label>
          <label className="text-sm font-medium">Bank or e-wallet provider<input className="mt-2 w-full border border-black/15 bg-white p-3" placeholder="e.g. BDO, GCash, Maya" value={methodForm.provider_name} onChange={event => setMethodForm({ ...methodForm, provider_name: event.target.value })} required /></label>
          <label className="text-sm font-medium">Account name<input className="mt-2 w-full border border-black/15 bg-white p-3" value={methodForm.account_name} onChange={event => setMethodForm({ ...methodForm, account_name: event.target.value })} required /></label>
          <label className="text-sm font-medium">Account number or mobile number<input className="mt-2 w-full border border-black/15 bg-white p-3" value={methodForm.account_number} onChange={event => setMethodForm({ ...methodForm, account_number: event.target.value })} required /></label>
          <label className="text-sm font-medium md:col-span-2">Notes<input className="mt-2 w-full border border-black/15 bg-white p-3" placeholder="Optional branch or account note" value={methodForm.notes} onChange={event => setMethodForm({ ...methodForm, notes: event.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={methodForm.is_primary} onChange={event => setMethodForm({ ...methodForm, is_primary: event.target.checked })} /> Mark as primary payout destination</label>
          <button className="bg-[#151515] p-3 font-semibold text-white hover:bg-[#ff641f] disabled:opacity-50 md:col-span-2" type="submit" disabled={savingMethod}>{savingMethod ? "Saving details..." : "Add payout details"}</button>
        </form>
      </section>
      <section className="border border-black/10 bg-white p-6 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Partner payouts</h2>
            <p className="mt-1 text-sm text-[#777]">Only approved, unpaid earnings can be paid out.</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-[#777]">Eligible outstanding</p>
            <p className="mt-1 text-2xl font-semibold">₱{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <form className="mt-6 grid gap-4 border-t border-black/10 pt-6 md:grid-cols-2 lg:grid-cols-4" onSubmit={createPayout}>
          <label className="text-sm font-medium">Amount<input className="mt-2 w-full border border-black/15 bg-white p-3" type="number" min="0.01" max={outstanding.toFixed(2)} step="0.01" value={payoutAmount} onChange={event => setPayoutAmount(event.target.value)} required disabled={outstanding <= 0} /></label>
          <label className="text-sm font-medium">Status<select className="mt-2 w-full border border-black/15 bg-white p-3" value={payoutStatus} onChange={event => setPayoutStatus(event.target.value as "pending" | "paid")} disabled={outstanding <= 0}><option value="paid">Paid</option><option value="pending">Pending review</option></select></label>
          <label className="text-sm font-medium">Source fund<select className="mt-2 w-full border border-black/15 bg-white p-3" value={payoutFundId} onChange={event => setPayoutFundId(event.target.value)} disabled={outstanding <= 0} required><option value="">Select fund</option>{funds.map(fund => <option value={fund.id} key={fund.id}>{fund.name} · ₱{Number(fund.balance).toLocaleString()} available</option>)}</select></label>
          <label className="text-sm font-medium">Payout destination<select className="mt-2 w-full border border-black/15 bg-white p-3" value={payoutMethodId} onChange={event => setPayoutMethodId(event.target.value)} disabled={outstanding <= 0 || partner.payout_methods.length === 0} required><option value="">Select saved bank or e-wallet</option>{partner.payout_methods.map(method => <option value={method.id} key={method.id}>{method.provider_name} · {method.account_name} · {method.account_number}{method.is_primary ? " · Primary" : ""}</option>)}</select></label>
          <label className="text-sm font-medium">Payment reference<input className="mt-2 w-full border border-black/15 bg-white p-3" placeholder="Bank or wallet reference" value={paymentReference} onChange={event => setPaymentReference(event.target.value)} disabled={outstanding <= 0} /></label>
          <label className="text-sm font-medium">Notes<input className="mt-2 w-full border border-black/15 bg-white p-3" placeholder="Optional note" value={payoutNotes} onChange={event => setPayoutNotes(event.target.value)} disabled={outstanding <= 0} /></label>
          {partner.payout_methods.length === 0 && <p className="text-sm text-amber-700 md:col-span-2 lg:col-span-4">Add a bank or e-wallet payout destination above before recording a payout.</p>}
          <button className="bg-[#151515] p-3 font-semibold text-white hover:bg-[#ff641f] disabled:cursor-not-allowed disabled:opacity-40 md:col-span-2 lg:col-span-4" type="submit" disabled={savingPayout || outstanding <= 0 || partner.payout_methods.length === 0}>{savingPayout ? "Recording payout..." : payoutStatus === "paid" ? "Record payout" : "Create payout for review"}</button>
        </form>
        <div className="mt-6 divide-y divide-black/10 border-t border-black/10">
          {partner.payouts.length === 0 && <p className="py-4 text-sm text-[#777]">No payouts recorded yet.</p>}
          {partner.payouts.map(payout => <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm" key={payout.id}><span>₱{Number(payout.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}{payout.fund?.name ? ` · ${payout.fund.name}` : ""}{payout.payout_method?.provider_name ? ` · ${payout.payout_method.provider_name} ${payout.payout_method.account_number}` : ""}{payout.payment_reference ? ` · ${payout.payment_reference}` : ""}</span><span className="flex flex-wrap items-center justify-end gap-3 uppercase text-[#777]">{payout.status}{payout.status === "pending" && <>{!payout.fund && <select className="border border-black/15 bg-white px-2 py-2 text-xs normal-case" value={pendingPayoutFunds[payout.id] ?? ""} onChange={event => setPendingPayoutFunds({ ...pendingPayoutFunds, [payout.id]: event.target.value })}><option value="">Select fund</option>{funds.map(fund => <option value={fund.id} key={fund.id}>{fund.name}</option>)}</select>}{!payout.payout_method && <select className="border border-black/15 bg-white px-2 py-2 text-xs normal-case" value={pendingPayoutMethods[payout.id] ?? ""} onChange={event => setPendingPayoutMethods({ ...pendingPayoutMethods, [payout.id]: event.target.value })}><option value="">Select destination</option>{partner.payout_methods.map(method => <option value={method.id} key={method.id}>{method.provider_name} · {method.account_number}</option>)}</select>}<button type="button" className="bg-[#151515] px-3 py-2 text-xs font-semibold text-white hover:bg-[#ff641f] disabled:opacity-50" onClick={() => void updatePayout(payout, "paid")} disabled={updatingPayoutId === payout.id || (!payout.fund && !pendingPayoutFunds[payout.id]) || (!payout.payout_method && !pendingPayoutMethods[payout.id])}>{updatingPayoutId === payout.id ? "Updating..." : payout.fund && payout.payout_method ? "Mark paid" : "Assign fund and destination first"}</button><button type="button" className="border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50" onClick={() => void updatePayout(payout, "cancelled")} disabled={updatingPayoutId === payout.id}>Cancel</button></>}</span></div>)}
        </div>
      </section>
    </div>}
  </AdminShell>;
}
