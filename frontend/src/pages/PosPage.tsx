import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "../components/AdminShell";
import api from "../lib/api";
import type { BookingRecord, FundRecord, PaymentRecord } from "../types";
import { useToast } from "../components/Ui";

type PosPayment = PaymentRecord & { booking?: BookingRecord; fund?: FundRecord };
type PosResponse = {
  date: string;
  summary: { cash: number; online: number; total: number };
  staff_collections: Array<{ staff_id: number | null; staff_name: string; cash: number; online: number; total: number }>;
  payments: PosPayment[];
  funds: FundRecord[];
};

function Skeleton({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded bg-black/10 ${className}`} />;
}

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function vehicleLabel(booking: BookingRecord) {
  const vehicle = booking.vehicle;
  if (!vehicle) return "Vehicle details unavailable";
  return `${vehicle.brand} ${vehicle.model} ${vehicle.year} · ${vehicle.plate_number}`;
}

function vehicleImage(booking: BookingRecord) {
  return booking.vehicle?.images?.[0]?.url ?? null;
}

function departureTime(booking: BookingRecord) {
  return new Date(booking.pickup_at).getTime();
}

function formatKeypadAmount(digits: string) {
  const normalized = digits.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  const cents = normalized.padStart(3, "0");
  const whole = cents.slice(0, -2) || "0";
  return `${whole}.${cents.slice(-2)}`;
}

export default function PosPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<PosResponse | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(5);
  const [selected, setSelected] = useState<BookingRecord | null>(null);
  const [amount, setAmount] = useState("");
  const [fundId, setFundId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const paymentPanelRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pos, bookingResult] = await Promise.all([
        api.get<PosResponse>(`/pos?date=${date}`),
        api.get<{ data: BookingRecord[] }>("/bookings?per_page=100"),
      ]);
      setData(pos.data);
      setBookings(bookingResult.data.data);
      if (!fundId && pos.data.funds[0]) setFundId(String(pos.data.funds[0].id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load point of sale", "error");
    } finally {
      setLoading(false);
    }
  }, [date, fundId, showToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const bookingId = Number(searchParams.get("booking"));
    if (searchParams.get("payment") !== "success" || !bookingId) return;
    api.post<{ recorded: boolean }>(`/pos/bookings/${bookingId}/sync`)
      .then((response) => {
        showToast(response.data.recorded ? "PayMongo payment recorded." : "Payment received. PayMongo is still confirming it; the POS will update shortly.", response.data.recorded ? "success" : "info");
        void load();
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Unable to verify PayMongo payment", "error"));
  }, [load, searchParams, showToast]);

  const payableBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bookings
      .filter((booking) => {
        if ((booking.balance ?? 0) <= 0 || ["cancelled", "rejected"].includes(booking.status)) return false;
        if (statusFilter !== "all" && booking.status !== statusFilter) return false;
        if (!query) return true;
        const searchable = [
          booking.reference,
          booking.customer?.name,
          booking.customer?.phone,
          booking.vehicle?.plate_number,
          booking.vehicle?.name,
          booking.vehicle?.brand,
          booking.vehicle?.model,
        ].filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(query);
      })
      .sort((a, b) => departureTime(a) - departureTime(b));
  }, [bookings, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(payableBookings.length / pageSize));
  const visibleBookings = payableBookings.slice((page - 1) * pageSize, page * pageSize);
  const filteredPayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    if (!query) return data?.payments ?? [];
    return (data?.payments ?? []).filter((payment) => [
      payment.booking?.reference,
      payment.booking?.customer?.name,
      payment.booking?.vehicle?.plate_number,
      payment.booking?.vehicle?.name,
      payment.booking?.vehicle?.brand,
      payment.booking?.vehicle?.model,
      payment.provider === "paymongo" ? "paymongo online" : "cash",
      payment.creator?.name,
      payment.creator?.first_name,
      payment.creator?.last_name,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [data?.payments, paymentSearch]);
  const paymentPageCount = Math.max(1, Math.ceil(filteredPayments.length / paymentPageSize));
  const visiblePayments = filteredPayments.slice((paymentPage - 1) * paymentPageSize, paymentPage * paymentPageSize);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);
  useEffect(() => {
    setPaymentPage(1);
  }, [paymentSearch, paymentPageSize, date]);

  useEffect(() => {
    if (selected) {
      paymentPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selected]);

  const selectBooking = (booking: BookingRecord) => {
    setSelected(booking);
    setAmount("0.00");
  };

  const pressKey = (key: string) => {
    if (key === "clear") return setAmount("0.00");
    if (key === "backspace") {
      return setAmount((current) => formatKeypadAmount(current.replace(/\D/g, "").slice(0, -1)));
    }
    if (key === ".") return;
    setAmount((current) => formatKeypadAmount(`${current.replace(/\D/g, "")}${key}`));
  };

  const submitCash = async () => {
    if (!selected || Number(amount) <= 0 || !fundId) return;
    setSaving(true);
    try {
      await api.post(`/pos/bookings/${selected.id}/payments`, {
        amount: Number(amount), fund_id: Number(fundId), paid_at: new Date().toISOString(), notes,
      });
      showToast("Cash payment recorded.", "success");
      setSelected(null); setAmount(""); setNotes(""); void load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to record cash payment", "error");
    } finally { setSaving(false); }
  };

  const startOnline = async () => {
    if (!selected || Number(amount) <= 0) return;
    setSaving(true);
    try {
      const result = await api.post<{ checkout_url: string }>(
        `/pos/bookings/${selected.id}/checkout`, { amount: Number(amount) },
      );
      window.location.assign(result.data.checkout_url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to start online payment", "error");
      setSaving(false);
    }
  };

  const cards = data ? [
    ["Cash collected", data.summary.cash],
    ["Online collected", data.summary.online],
    ["Total collected", data.summary.total],
  ] : [];

  return (
    <AdminShell title="Point of sale">
      <div className="theme-surface mt-8 min-w-0 max-w-full space-y-6 overflow-x-hidden p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-[#777]">Collect payments against existing bookings and close out the day.</p>
            <label className="mt-4 block text-xs text-[#777]">
              Collection date
              <input className="mt-2 block border border-black/10 px-3 py-2.5 text-sm" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
          <input className="w-full border border-black/10 px-3 py-3 text-sm sm:w-80" placeholder="Search booking, customer, plate..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {loading ? [1, 2, 3].map((card) => (
            <section className="rounded border border-black/10 bg-white p-5" key={card}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-8 w-32" />
            </section>
          )) : cards.map(([label, value]) => (
            <section className="rounded border border-black/10 bg-white p-5" key={label}>
              <p className="text-xs text-[#777]">{label}</p>
              <strong className="mt-3 block text-2xl text-[#ff641f]">{money.format(value as number)}</strong>
            </section>
          ))}
        </div>

        <section className="rounded border border-black/10 bg-white p-4 sm:p-5">
          <div>
            <h2 className="font-semibold">Staff collections</h2>
            <p className="mt-1 text-xs text-[#777]">Use the cash column for end-of-day cash reconciliation.</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-black/10 text-xs uppercase text-[#777]">
                <tr><th className="py-3">Staff member</th><th className="text-right">Cash</th><th className="text-right">Online</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {loading ? [1, 2, 3].map((item) => (
                  <tr className="border-b border-black/5" key={item}><td className="py-4"><Skeleton className="h-4 w-32" /></td><td><Skeleton className="ml-auto h-4 w-20" /></td><td><Skeleton className="ml-auto h-4 w-20" /></td><td><Skeleton className="ml-auto h-4 w-20" /></td></tr>
                )) : data?.staff_collections.map((staff) => (
                  <tr className="border-b border-black/5" key={staff.staff_id ?? "unassigned"}>
                    <td className="py-3 font-medium">{staff.staff_name}</td>
                    <td className="text-right">{money.format(staff.cash)}</td>
                    <td className="text-right">{money.format(staff.online)}</td>
                    <td className="text-right font-semibold">{money.format(staff.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !data?.staff_collections.length && <p className="py-6 text-center text-sm text-[#777]">No payments collected for this date.</p>}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 rounded border border-black/10 bg-white p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0"><h2 className="font-semibold">Bookings with balances</h2><p className="mt-1 text-xs text-[#777]">Nearest departure appears first.</p></div>
              <div className="flex flex-wrap gap-2">
                <select className="min-w-0 max-w-full border border-black/10 px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All active</option>
                <option value="pending">Pending</option>
                <option value="upcoming">Upcoming</option>
                <option value="for_handover">For handover</option>
                <option value="for_delivery">For delivery</option>
                <option value="ongoing">Ongoing</option>
                </select>
                <select className="border border-black/10 px-3 py-2 text-sm" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="Bookings per page">
                  {[5, 10, 15, 20, 25, 30].map((size) => <option value={size} key={size}>{size} per page</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 divide-y divide-black/10">
              {loading ? [1, 2, 3].map((item) => (
                <div className="flex items-start gap-3 py-4" key={item}>
                  <Skeleton className="h-14 w-16 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-full" /></div>
                  <Skeleton className="h-5 w-16" />
                </div>
              )) : visibleBookings.map((booking) => (
                <button className={`flex w-full min-w-0 items-start gap-3 py-4 text-left ${selected?.id === booking.id ? "text-[#ff641f]" : ""}`} key={booking.id} onClick={() => selectBooking(booking)}>
                  {vehicleImage(booking) ? <img className="h-14 w-16 shrink-0 rounded object-cover" src={vehicleImage(booking) ?? undefined} alt="" /> : <span className="flex h-14 w-16 shrink-0 items-center justify-center rounded bg-[#f4f3f0] text-2xl">🚗</span>}
                  <span className="min-w-0 flex-1 break-words">
                    <strong className="block">{booking.reference} · {booking.customer?.name ?? "Unknown customer"}</strong>
                    <span className="mt-1 block truncate text-sm text-[#777]">{vehicleLabel(booking)}</span>
                    <span className="mt-1 block text-xs text-[#777]">Departure: {dateTime.format(new Date(booking.pickup_at))} · Return: {dateTime.format(new Date(booking.return_at))}</span>
                  </span>
                  <span className="max-w-[35%] shrink-0 break-words text-right font-semibold">{money.format(booking.balance ?? 0)}<span className="block text-xs font-normal text-[#777]">due</span></span>
                </button>
              ))}
              {!loading && payableBookings.length === 0 && <p className="py-8 text-center text-sm text-[#777]">No matching bookings with balances.</p>}
            </div>
            {pageCount > 1 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4 text-sm">
              <span className="text-[#777]">Page {page} of {pageCount}</span>
              <div className="flex gap-2">
                <button className="border border-black/10 px-3 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
                <button className="border border-black/10 px-3 py-2 disabled:opacity-40" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</button>
              </div>
            </div>}
          </section>

          <section ref={paymentPanelRef} className="min-w-0 scroll-mt-24 rounded border border-black/10 bg-white p-4 sm:p-5">
            <h2 className="font-semibold">Collect payment</h2>
            {selected ? (
              <div className="mt-4 space-y-4">
                <div className="text-sm"><strong>{selected.reference}</strong><p className="mt-1 text-[#777]">{vehicleLabel(selected)}</p><p className="mt-1 text-[#777]">{money.format(selected.balance ?? 0)} due</p></div>
                <label className="block text-xs text-[#777]">Amount<input className="mt-2 w-full border border-black/10 px-3 py-3 text-right text-2xl font-semibold" type="number" min="0.01" max={selected.balance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"].map((key) => <button className="border border-black/10 bg-[#f8f7f5] py-3 text-lg font-semibold hover:border-[#ff641f] dark:bg-[#303030]" key={key} onClick={() => pressKey(key)}>{key === "backspace" ? "⌫" : key}</button>)}
                  <button className="col-span-3 border border-red-300 py-2 text-sm font-semibold text-red-600" onClick={() => pressKey("clear")}>Clear amount</button>
                </div>
                <label className="block text-xs text-[#777]">Cash fund<select className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" value={fundId} onChange={(event) => setFundId(event.target.value)}>{data?.funds.map((fund) => <option value={fund.id} key={fund.id}>{fund.name}</option>)}</select></label>
                <textarea className="w-full border border-black/10 px-3 py-2.5 text-sm" placeholder="Payment notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
                <div className="grid gap-3 sm:grid-cols-2"><button className="bg-[#151515] px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={saving || Number(amount) <= 0 || !fundId} onClick={() => void submitCash()}>Record cash</button><button className="bg-[#ff641f] px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={saving || Number(amount) <= 0} onClick={() => void startOnline()}>Pay online</button></div>
              </div>
            ) : <p className="mt-4 text-sm text-[#777]">Select a booking to collect a payment.</p>}
          </section>
        </div>

        <section className="overflow-hidden rounded border border-black/10 bg-white p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="font-semibold">Payments collected on {date}</h2>
            <div className="flex flex-wrap gap-2">
              <input className="w-full border border-black/10 px-3 py-2 text-sm sm:w-64" placeholder="Search payments..." value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} />
              <select className="border border-black/10 px-3 py-2 text-sm" value={paymentPageSize} onChange={(event) => setPaymentPageSize(Number(event.target.value))} aria-label="Payments per page">
                {[5, 10, 15, 20, 25, 30].map((size) => <option value={size} key={size}>{size} per page</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-black/10 text-xs uppercase text-[#777]"><tr><th className="py-3">Time</th><th>Booking</th><th>Method</th><th>Collected by</th><th className="text-right">Amount</th></tr></thead><tbody>{loading ? [1, 2, 3].map((item) => <tr className="border-b border-black/5" key={item}><td className="py-4"><Skeleton className="h-4 w-16" /></td><td><Skeleton className="h-4 w-40" /></td><td><Skeleton className="h-4 w-16" /></td><td><Skeleton className="h-4 w-24" /></td><td><Skeleton className="ml-auto h-4 w-20" /></td></tr>) : visiblePayments.map((payment) => <tr className="border-b border-black/5" key={payment.id}><td className="py-3">{new Date(payment.paid_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td><td>{payment.booking?.reference ?? "—"}<span className="ml-2 text-[#777]">{payment.booking?.customer?.name ?? ""}</span></td><td>{payment.provider === "paymongo" ? "PayMongo" : "Cash"}</td><td>{payment.creator?.name ?? ([payment.creator?.first_name, payment.creator?.last_name].filter(Boolean).join(" ") || "Not recorded")}</td><td className="text-right font-semibold">{money.format(Number(payment.amount))}</td></tr>)}</tbody></table></div>
          {!loading && filteredPayments.length === 0 && <p className="py-8 text-center text-sm text-[#777]">No matching payments for this date.</p>}
          {!loading && paymentPageCount > 1 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4 text-sm"><span className="text-[#777]">Page {paymentPage} of {paymentPageCount}</span><div className="flex gap-2"><button className="border border-black/10 px-3 py-2 disabled:opacity-40" disabled={paymentPage === 1} onClick={() => setPaymentPage((current) => current - 1)}>Previous</button><button className="border border-black/10 px-3 py-2 disabled:opacity-40" disabled={paymentPage === paymentPageCount} onClick={() => setPaymentPage((current) => current + 1)}>Next</button></div></div>}
        </section>
      </div>
    </AdminShell>
  );
}
