import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { AdminShell } from "../components/AdminShell";
import { DateTimePicker } from "../components/DateTimePicker";
import { Skeleton, useToast } from "../components/Ui";
import { canManageAccounts, displayName, useAuth } from "../lib/AuthContext";
import { vehicleTypeLabels, vehicleTypes, type BookingRecord, type VehicleRecord, type VehicleType } from "../types";

type DashboardData = {
  year: number;
  summary: Record<"upcoming" | "ongoing" | "complete", { count: number; receivables: number }>;
  financial: { total_bookings: number; total_revenue: number; total_expenses: number; total_profit: number };
  monthly: { month: number; revenue: number; bookings: number }[];
  top_vehicles: (Pick<VehicleRecord, "id" | "name" | "brand" | "model" | "year"> & { revenue: number })[];
  referral_sources: { source: string; label: string; count: number }[];
  upcoming_bookings: BookingRecord[];
};

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
type AvailabilityType = VehicleType | "all";
type StaffAccount = { id: number; name: string; phone?: string | null };

function imageUrl(booking: BookingRecord) {
  const value = booking.vehicle?.images?.[0]?.url;
  return value ? (value.startsWith("http") ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, "").replace(/^storage\//, "")}`) : null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded border border-black/10 bg-white p-5 ${className}`}>{children}</section>;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [availabilityType, setAvailabilityType] = useState<AvailabilityType>("sedan");
  const [availabilityDate, setAvailabilityDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [availableVehicles, setAvailableVehicles] = useState<VehicleRecord[]>([]);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [assignmentBooking, setAssignmentBooking] = useState<BookingRecord | null>(null);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const loading = !data && !error;

  const loadDashboard = () => api.get<DashboardData>("/dashboard").then(response => setData(response.data)).catch(e => setError(e instanceof Error ? e.message : "Unable to load dashboard"));
  useEffect(() => { void loadDashboard(); }, []);
  useEffect(() => {
    if (!canManageAccounts(user)) return;
    api.get<{ data: StaffAccount[] }>("/accounts?role=staff&status=active")
      .then(response => setStaffAccounts(response.data.data))
      .catch(e => showToast(e instanceof Error ? e.message : "Unable to load staff accounts.", "error"));
  }, [showToast, user]);

  const assignBooking = async (booking: BookingRecord, staffId: number | null) => {
    setAssignmentSaving(true);
    try {
      const response = await api.patch<BookingRecord>(`/bookings/${booking.id}`, {
        assigned_to_user_id: staffId,
      });
      setData(current => current ? {
        ...current,
        upcoming_bookings: current.upcoming_bookings.map(item => item.id === booking.id ? response.data : item),
      } : current);
      setAssignmentBooking(null);
      showToast(staffId ? "Booking assigned successfully." : "Booking assignment removed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Unable to assign booking.", "error");
    } finally {
      setAssignmentSaving(false);
    }
  };

  const maxRevenue = useMemo(() => Math.max(1, ...(data?.monthly.map(item => item.revenue) ?? [1])), [data]);
  const maxBookings = useMemo(() => Math.max(1, ...(data?.monthly.map(item => item.bookings) ?? [1])), [data]);
  const maxReferralCount = useMemo(() => Math.max(1, ...(data?.referral_sources.map(item => item.count) ?? [1])), [data]);

  const checkAvailability = async () => {
    setAvailabilityError("");
    setAvailabilityLoading(true);
    const pickup = new Date(availabilityDate);
    const returnAt = new Date(pickup.getTime() + 24 * 60 * 60 * 1000);
    try {
      const response = await api.get<VehicleRecord[]>("/vehicles/availability", {
        params: {
          type: availabilityType,
          pickup_at: pickup.toISOString(),
          return_at: returnAt.toISOString(),
        },
      });
      setAvailableVehicles(response.data);
      setAvailabilityOpen(true);
    } catch (e) {
      setAvailabilityError(e instanceof Error ? e.message : "Unable to check vehicle availability");
    } finally {
      setAvailabilityLoading(false);
    }
  };

  return <AdminShell title="Dashboard">
    <div className="mt-8 space-y-8">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">OVERVIEW</p>
        <h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold tracking-[-1.5px] sm:text-4xl sm:tracking-[-2px]">Good morning, {user ? displayName(user) : "there"}.</h2>
        <p className="mt-2 text-sm text-[#777]">Here’s what’s happening across your rental operation.</p>
      </div>
      {error && <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Upcoming bookings" value={data?.summary.upcoming.count} amount={data?.summary.upcoming.receivables} color="orange" loading={loading} />
        <MetricCard label="Ongoing bookings" value={data?.summary.ongoing.count} amount={data?.summary.ongoing.receivables} color="amber" loading={loading} />
        <MetricCard label="Completed bookings" value={data?.summary.complete.count} amount={data?.summary.complete.receivables} color="green" loading={loading} />
      </div>

      <Card>
        <h3 className="font-semibold">Vehicle availability</h3>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-xs font-semibold text-[#555]">Vehicle type<select value={availabilityType} onChange={event => setAvailabilityType(event.target.value as AvailabilityType)} className="mt-2 w-full border border-black/10 bg-white px-3 py-3 text-sm"><option value="all">All</option>{vehicleTypes.map(vehicleType => <option key={vehicleType} value={vehicleType}>{vehicleTypeLabels[vehicleType]}</option>)}</select></label>
          <label className="flex-1 text-xs font-semibold text-[#555]">Date & time<DateTimePicker mode="datetime" value={availabilityDate} onChange={setAvailabilityDate} className="mt-2 w-full border border-black/10 px-3 py-3 text-sm" /></label>
          <button type="button" onClick={checkAvailability} disabled={availabilityLoading} className="bg-[#ff641f] px-5 py-3 text-center text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{availabilityLoading ? "Checking..." : "Check availability"}</button>
        </div>
        {availabilityError && <p className="mt-3 text-sm text-red-600">{availabilityError}</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h3 className="mb-4 font-semibold">Financial summary</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard label="Total bookings" value={data?.financial.total_bookings} color="orange" loading={loading} />
            <SummaryCard label="Total revenue" value={data?.financial.total_revenue} color="green" moneyValue loading={loading} />
            <SummaryCard label="Total expenses" value={data?.financial.total_expenses} color="red" moneyValue loading={loading} />
            <SummaryCard label="Total profit" value={data?.financial.total_profit} color="blue" moneyValue loading={loading} />
          </div>
        </div>
        <Card>
          <div className="flex items-center justify-between"><h3 className="font-semibold">Yearly financial chart</h3><span className="border border-black/10 px-3 py-2 text-sm">{data?.year ?? new Date().getFullYear()}</span></div>
          <div className="mt-6 flex h-48 min-w-0 items-end gap-1 overflow-hidden border-b border-l border-black/10 px-1 pb-0 sm:gap-2 sm:px-3">
            {(data?.monthly ?? Array.from({ length: 12 }, (_, month) => ({ month: month + 1, revenue: 0, bookings: 0 }))).map(item => <div className="flex h-full flex-1 items-end justify-center gap-1" key={item.month}><div className="w-2 bg-[#22a95a]" style={{ height: `${Math.max(2, item.revenue / maxRevenue * 100)}%` }} title={`${monthNames[item.month - 1]} revenue`} /><div className="w-2 bg-[#ff641f]" style={{ height: `${Math.max(2, item.bookings / maxBookings * 100)}%` }} title={`${monthNames[item.month - 1]} bookings`} /></div>)}
          </div>
          <div className="mt-2 grid grid-cols-12 text-center text-[9px] text-[#888] sm:text-[10px]">{monthNames.map(month => <span key={month}>{month}</span>)}</div>
          <p className="mt-4 text-xs text-[#777]"><span className="mr-3 text-[#22a95a]">■ Revenue</span><span className="text-[#ff641f]">■ Bookings</span></p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4"><div><h3 className="font-semibold">How customers found CL CarHub</h3><p className="mt-1 text-xs text-[#777]">Based on completed customer onboarding responses.</p></div></div>
        <div className="mt-6 flex h-52 items-end gap-3 border-b border-l border-black/10 px-2 pb-0 sm:gap-6 sm:px-5">
          {(data?.referral_sources ?? []).map(item => <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" key={item.source}><span className="text-sm font-semibold">{item.count}</span><div className="w-full max-w-16 rounded-t bg-[#ff641f]" style={{ height: `${Math.max(3, item.count / maxReferralCount * 100)}%` }} title={`${item.label}: ${item.count}`} /><span className="w-full text-center text-[10px] leading-3 text-[#777] sm:text-xs">{item.label}</span></div>)}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card><h3 className="font-semibold">Upcoming bookings</h3><div className="mt-4 space-y-3">{loading ? <BookingSkeletons /> : data?.upcoming_bookings.length ? data.upcoming_bookings.map(booking => <div className="flex items-center gap-4 rounded bg-[#f4f3f0] p-3 hover:border-[#ff641f]" key={booking.id}>{imageUrl(booking) ? <img className="h-14 w-20 rounded object-contain" src={imageUrl(booking)!} alt="" /> : <div className="h-14 w-20 rounded bg-black/10" />}<Link className="min-w-0 flex-1" to={`/admin/bookings?edit=${booking.id}`}><p className="font-semibold">{booking.customer?.name ?? "Customer"}</p><p className="text-xs text-[#777]">{formatDate(booking.pickup_at)} → {formatDate(booking.return_at)}</p><p className="mt-1 text-xs font-medium text-[#555]">{booking.vehicle?.name || `${booking.vehicle?.brand ?? ""} ${booking.vehicle?.model ?? ""}`}</p><p className="mt-1 text-xs text-[#777]">{booking.assigned_to?.name ? `Assigned to ${booking.assigned_to.name}` : "Unassigned"}</p></Link>{canManageAccounts(user) && <button type="button" className="self-start rounded px-2 py-1 text-xl leading-none text-[#777] hover:bg-black/10 hover:text-[#ff641f]" aria-label={`Actions for booking ${booking.reference}`} onClick={() => setAssignmentBooking(booking)}>⋯</button>}</div>) : <p className="py-8 text-sm text-[#777]">No upcoming bookings.</p>}</div></Card>
        <Card><h3 className="font-semibold">Top vehicles by total revenue</h3><div className="mt-5 space-y-4">{loading ? <>{[1, 2, 3, 4].map(item => <Skeleton className="h-8 w-full" key={item} />)}</> : data?.top_vehicles.length ? data.top_vehicles.map(vehicle => <div className="min-w-0" key={vehicle.id}><div className="mb-1 flex min-w-0 items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{vehicle.name || `${vehicle.brand} ${vehicle.model}`} ({vehicle.year})</span><strong className="shrink-0">{money.format(vehicle.revenue)}</strong></div><div className="h-2 bg-black/5"><div className="h-2 bg-[#ff641f]" style={{ width: `${Math.max(4, vehicle.revenue / Math.max(1, data.top_vehicles[0].revenue) * 100)}%` }} /></div></div>) : <p className="py-8 text-sm text-[#777]">No completed revenue records yet.</p>}</div></Card>
      </div>
    </div>
    {availabilityOpen && <AvailabilityModal vehicles={availableVehicles} type={availabilityType} date={availabilityDate} onClose={() => setAvailabilityOpen(false)} showToast={showToast} />}
    {assignmentBooking && <AssignStaffModal booking={assignmentBooking} staffAccounts={staffAccounts} saving={assignmentSaving} onClose={() => setAssignmentBooking(null)} onAssign={staffId => void assignBooking(assignmentBooking, staffId)} />}
  </AdminShell>;
}

function AssignStaffModal({ booking, staffAccounts, saving, onClose, onAssign }: { booking: BookingRecord; staffAccounts: StaffAccount[]; saving: boolean; onClose: () => void; onAssign: (staffId: number | null) => void }) {
  const [selectedStaffId, setSelectedStaffId] = useState(booking.assigned_to_user_id ? String(booking.assigned_to_user_id) : "");
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="assign-staff-title">
    <div className="theme-surface w-full max-w-md rounded p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 id="assign-staff-title" className="text-xl font-semibold">Assign staff</h2><p className="mt-1 text-sm text-[#777]">{booking.reference} · {booking.customer?.name ?? "Customer"}</p></div><button type="button" onClick={onClose} className="text-2xl text-[#777] hover:text-[#ff641f]" aria-label="Close assign staff modal">×</button></div>
      <label className="mt-6 block text-sm font-semibold">Staff member<select className="mt-2 w-full border border-black/10 bg-transparent px-3 py-3 font-normal" value={selectedStaffId} onChange={event => setSelectedStaffId(event.target.value)}><option value="">Unassigned</option>{staffAccounts.map(staff => <option value={staff.id} key={staff.id}>{staff.name}{staff.phone ? ` · ${staff.phone}` : ""}</option>)}</select></label>
      <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="px-4 py-2.5 text-sm">Cancel</button><button type="button" disabled={saving} onClick={() => onAssign(selectedStaffId ? Number(selectedStaffId) : null)} className="bg-[#ff641f] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save assignment"}</button></div>
    </div>
  </div>;
}

function AvailabilityModal({ vehicles, type, date, onClose, showToast }: { vehicles: VehicleRecord[]; type: AvailabilityType; date: string; onClose: () => void; showToast: (message: string, tone?: "success" | "error" | "info") => void }) {
  const dateLabel = new Date(date).toLocaleString([], { dateStyle: "long", timeStyle: "short" });
  const categoryLabel = type === "all" ? "All categories" : vehicleTypeLabels[type];
  const vehicleList = vehicles.map(vehicle => {
    const title = vehicle.name || `${vehicle.brand} ${vehicle.model}`;
    return [
      `🚗 ${title}`,
      `   🏷️ Category: ${vehicleTypeLabels[vehicle.type]}`,
      `   💰 Rate: ${money.format(Number(vehicle.daily_rate))} / day`,
      `   📅 Year: ${vehicle.year}`,
      `   🔢 Plate: ${vehicle.plate_number}`,
    ].join("\n");
  });
  const clipboardText = [
    "🚘 CL CarHub Vehicle Availability",
    `📅 Date: ${dateLabel}`,
    `🏷️ Category: ${categoryLabel}`,
    `✅ ${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"} available`,
    "",
    ...(vehicleList.length ? vehicleList : ["❌ No vehicles are available for this date."]),
  ].join("\n");
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(clipboardText);
      showToast("Availability list copied to clipboard.", "success");
    } catch {
      showToast("Unable to copy the availability list. Please check clipboard permissions.", "error");
    }
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="availability-title">
    <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded bg-[#1f2a3a] text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <div><h2 id="availability-title" className="font-['Space_Grotesk'] text-xl font-semibold">Available {type === "all" ? "vehicles" : vehicleTypeLabels[type]}{vehicles.length ? "" : "s"}</h2><p className="mt-1 text-sm text-slate-300">on {dateLabel}</p></div>
        <button type="button" onClick={onClose} className="text-2xl text-slate-300 hover:text-white" aria-label="Close availability results">×</button>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {vehicles.length ? vehicles.map(vehicle => <AvailabilityVehicleCard vehicle={vehicle} key={vehicle.id} />) : <p className="col-span-full py-12 text-center text-slate-300">No vehicles are available for this date.</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 px-6 py-4"><button type="button" onClick={copyToClipboard} className="border border-white/20 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">Copy to clipboard</button><button type="button" onClick={onClose} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white">Close</button></div>
    </div>
  </div>;
}

function AvailabilityVehicleCard({ vehicle }: { vehicle: VehicleRecord }) {
  const image = vehicle.images?.[0]?.url;
  const resolvedImage = image ? (image.startsWith("http") ? image : `${apiOrigin}/storage/${image.replace(/^\/+/, "").replace(/^storage\//, "")}`) : null;
  const title = vehicle.name || `${vehicle.brand} ${vehicle.model}`;
  return <article className="rounded border border-white/10 bg-[#202c3c] p-4">
    <div className="flex h-36 items-center justify-center">{resolvedImage ? <img className="h-full w-full object-contain" src={resolvedImage} alt={title} /> : <span className="text-sm text-slate-400">No image</span>}</div>
    <p className="mt-3 inline-block rounded border border-[#ff8a3d]/50 bg-[#ff641f]/10 px-2 py-1 text-xs font-bold uppercase text-[#ff9a56]">{title}</p>
    <h3 className="mt-2 text-lg font-semibold text-slate-300">{vehicle.brand} {vehicle.model} {vehicle.year}</h3>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300"><span>♟ {vehicle.seats}-seaters</span><span>◉ {vehicle.coding_day ? `Coding every ${vehicle.coding_day}` : "No Coding"}</span><span>⚙ {vehicle.transmission}</span><span>⛽ {vehicle.fuel_type.replace("_", " ")}</span></div>
  </article>;
}

function MetricCard({ label, value, amount, color, loading }: { label: string; value?: number; amount?: number; color: string; loading: boolean }) {
  return <Card><p className="text-xs text-[#777]">{label}</p>{loading ? <Skeleton className="mt-3 h-9 w-16" /> : <><strong className={`mt-2 block text-3xl ${color === "green" ? "text-[#22a95a]" : "text-[#ff641f]"}`}>{value}</strong><p className="mt-1 text-xs text-[#777]">{money.format(amount ?? 0)} receivables</p></>}</Card>;
}

function SummaryCard({ label, value, color, moneyValue = false, loading }: { label: string; value?: number; color: string; moneyValue?: boolean; loading: boolean }) {
  return <Card><p className="text-xs text-[#777]">{label}</p>{loading ? <Skeleton className="mt-4 h-9 w-28" /> : <strong className={`mt-3 block text-2xl ${color === "green" ? "text-[#22a95a]" : color === "red" ? "text-red-500" : color === "blue" ? "text-blue-500" : "text-[#ff641f]"}`}>{moneyValue ? money.format(value ?? 0) : value}</strong>}</Card>;
}

function BookingSkeletons() {
  return <>{[1, 2, 3].map(item => <div className="flex gap-4 rounded bg-[#f4f3f0] p-3" key={item}><Skeleton className="h-14 w-20" /><div className="flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="mt-2 h-3 w-48" /><Skeleton className="mt-2 h-3 w-24" /></div></div>)}</>;
}
