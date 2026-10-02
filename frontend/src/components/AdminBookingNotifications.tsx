import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import type { BookingRecord, Paginated, VehicleRecord } from "../types";

const SOUND_KEY = "clcarhub_admin_notification_sound";
const DESKTOP_KEY = "clcarhub_admin_desktop_notifications";
const NOTICES_KEY = "clcarhub_admin_notifications";
const UNREAD_KEY = "clcarhub_admin_notifications_unread";
const SEEN_KEY = "clcarhub_admin_notifications_seen";

type Notice = {
  key: string;
  title: string;
  body: string;
  receivedAt: number;
  url: string;
};
type Snapshot = {
  bookings: Record<number, { status: string; paymentIds: number[] }>;
  vehicles: number[];
  transactions: number[];
  expenses: number[];
};
type FundsResponse = { transactions?: Array<{ id: number; description?: string; amount: string; type: string }> };
type ExpensesResponse = { data: Array<{ id: number; description?: string; amount: string }> };

function readPreference(key: string, fallback: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored === null ? fallback : stored === "true";
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeSeenKeys(keys: string[]) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(-200)));
}

function playNotificationSound() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1040, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.24);
  oscillator.addEventListener("ended", () => void context.close());
}

function snapshotBookings(bookings: BookingRecord[]) {
  return Object.fromEntries(bookings.map(booking => [booking.id, { status: booking.status, paymentIds: (booking.payments ?? []).map(payment => payment.id) }]));
}

export function AdminBookingNotifications() {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<Notice[]>(() => readJson<Notice[]>(NOTICES_KEY, []));
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(() => readJson<number>(UNREAD_KEY, 0));
  const [soundEnabled, setSoundEnabled] = useState(() => readPreference(SOUND_KEY, true));
  const [desktopEnabled, setDesktopEnabled] = useState(() => readPreference(DESKTOP_KEY, false));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pollingError, setPollingError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const polling = useRef(false);
  const snapshot = useRef<Snapshot>({ bookings: {}, vehicles: [], transactions: [], expenses: [] });
  const soundEnabledRef = useRef(soundEnabled);
  const desktopEnabledRef = useRef(desktopEnabled);

  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled]);
  useEffect(() => { desktopEnabledRef.current = desktopEnabled }, [desktopEnabled]);

  useEffect(() => {
    localStorage.setItem(NOTICES_KEY, JSON.stringify(notices));
  }, [notices]);
  useEffect(() => {
    localStorage.setItem(UNREAD_KEY, String(unread));
  }, [unread]);
  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSettingsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active || polling.current || !navigator.onLine) return;
      polling.current = true;
      try {
        const [bookingResult, vehicleResult, fundsResult, expenseResult] = await Promise.all([
          api.get<Paginated<BookingRecord>>("/bookings?per_page=100&sort=latest"),
          api.get<Paginated<VehicleRecord>>("/vehicles?per_page=100"),
          api.get<FundsResponse>("/funds"),
          api.get<ExpensesResponse>("/expenses?per_page=50"),
        ]);
        if (!active) return;
        setLastCheckedAt(Date.now());
        setPollingError("");
        const bookings = bookingResult.data.data;
        const vehicles = vehicleResult.data.data;
        const transactions = fundsResult.data.transactions ?? [];
        const expenses = expenseResult.data.data ?? [];
        const current: Snapshot = {
          bookings: snapshotBookings(bookings),
          vehicles: vehicles.map(vehicle => vehicle.id),
          transactions: transactions.map(transaction => transaction.id),
          expenses: expenses.map(expense => expense.id),
        };
        if (!initialized.current) {
          snapshot.current = current;
          initialized.current = true;
          return;
        }
        const seenKeys = readJson<string[]>(SEEN_KEY, []);
        const incoming: Notice[] = [];
        const addNotice = (notice: Notice) => {
          if (seenKeys.includes(notice.key)) return;
          seenKeys.push(notice.key);
          incoming.push(notice);
        };
        bookings.forEach(booking => {
          const previous = snapshot.current.bookings[booking.id];
          if (!previous) addNotice({ key: `booking-created-${booking.id}`, title: "New booking", body: `${booking.customer?.name ?? "A customer"} submitted ${booking.reference}.`, receivedAt: Date.now(), url: `/admin/bookings?booking=${booking.id}` });
          if (previous && previous.status !== booking.status && ["cancelled", "rejected"].includes(booking.status)) addNotice({ key: `booking-${booking.status}-${booking.id}`, title: `Booking ${booking.status}`, body: `${booking.reference} was marked ${booking.status}.`, receivedAt: Date.now(), url: `/admin/bookings?booking=${booking.id}` });
          (booking.payments ?? []).filter(payment => !previous?.paymentIds.includes(payment.id)).forEach(payment => addNotice({ key: `payment-${payment.id}`, title: "New payment", body: `${booking.reference} received a payment of ₱${Number(payment.amount).toLocaleString()}.`, receivedAt: Date.now(), url: `/admin/bookings?booking=${booking.id}` }));
        });
        vehicles.filter(vehicle => !snapshot.current.vehicles.includes(vehicle.id)).forEach(vehicle => addNotice({ key: `vehicle-${vehicle.id}`, title: "Vehicle added", body: `${vehicle.name || `${vehicle.brand} ${vehicle.model}`} was added to the fleet.`, receivedAt: Date.now(), url: "/admin/vehicles" }));
        transactions.filter(transaction => !snapshot.current.transactions.includes(transaction.id)).forEach(transaction => addNotice({ key: `transaction-${transaction.id}`, title: "New transaction", body: `${transaction.description || "A fund transaction"} · ₱${Number(transaction.amount).toLocaleString()}.`, receivedAt: Date.now(), url: "/admin/funds" }));
        expenses.filter(expense => !snapshot.current.expenses.includes(expense.id)).forEach(expense => addNotice({ key: `expense-${expense.id}`, title: "New expense", body: `${expense.description || "An expense"} · ₱${Number(expense.amount).toLocaleString()}.`, receivedAt: Date.now(), url: "/admin/expenses" }));
        snapshot.current = current;
        writeSeenKeys(seenKeys);
        if (!incoming.length) return;
        setNotices(previous => [...incoming, ...previous.filter(notice => !incoming.some(item => item.key === notice.key))].slice(0, 50));
        setUnread(previous => previous + incoming.length);
        if (soundEnabledRef.current) playNotificationSound();
        if (desktopEnabledRef.current && "Notification" in window && Notification.permission === "granted") {
          const registration = await navigator.serviceWorker?.getRegistration();
          for (const notice of incoming) {
            if (registration) await registration.showNotification(notice.title, { body: notice.body, tag: notice.key, data: { url: notice.url } });
            else new Notification(notice.title, { body: notice.body });
          }
        }
      } catch (error) {
        if (active) setPollingError(error instanceof Error ? error.message : "Unable to check for new notifications.");
      } finally {
        polling.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 10000);
    const refreshOnActivity = () => { if (document.visibilityState === "visible") void poll() };
    window.addEventListener("focus", refreshOnActivity);
    document.addEventListener("visibilitychange", refreshOnActivity);
    window.addEventListener("online", refreshOnActivity);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOnActivity);
      document.removeEventListener("visibilitychange", refreshOnActivity);
      window.removeEventListener("online", refreshOnActivity);
    };
  }, []);

  const toggleDesktopNotifications = async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "denied") {
      setDesktopEnabled(false);
      localStorage.setItem(DESKTOP_KEY, "false");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    const enabled = permission === "granted";
    setDesktopEnabled(enabled);
    localStorage.setItem(DESKTOP_KEY, String(enabled));
  };
  const clearNotifications = () => {
    setNotices([]);
    setUnread(0);
  };

  return <div className="relative mr-2 sm:mr-3" ref={containerRef}>
    <button type="button" className="relative rounded-full p-2 text-[#bbb] transition hover:bg-white/10 hover:text-white" aria-label={`${unread} unread admin notifications`} onClick={() => { setOpen(current => !current); setUnread(0); }}>
      <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17H9m10-2V11a7 7 0 1 0-14 0v4l-2 2h18l-2-2Zm-5 5h-4" /></svg>
      {unread > 0 && <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-[#ff641f] px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-9 z-50 w-[min(90vw,380px)] border border-black/10 bg-white text-[#151515] shadow-xl">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3"><p className="text-sm font-semibold">Admin notifications</p><div className="flex items-center gap-3"><button type="button" className="text-xs text-[#ff641f]" onClick={clearNotifications}>Clear</button><button type="button" className="text-xs text-[#ff641f]" onClick={() => setSettingsOpen(current => !current)}>Settings</button></div></div>
      {settingsOpen && <div className="space-y-3 border-b border-black/10 bg-[#f8f7f5] p-4 text-xs"><label className="flex items-center justify-between gap-4"><span>Notification sound</span><input type="checkbox" checked={soundEnabled} onChange={event => { setSoundEnabled(event.target.checked); localStorage.setItem(SOUND_KEY, String(event.target.checked)); }} /></label><label className="flex items-center justify-between gap-4"><span>Desktop notifications</span><input type="checkbox" checked={desktopEnabled} onChange={() => void toggleDesktopNotifications()} /></label><p className="text-[#777]">Activity is checked every 10 seconds while an admin page is open and refreshes when you return to the tab.</p>{pollingError && <p className="text-red-700">Notification check failed: {pollingError}</p>}{lastCheckedAt && !pollingError && <p className="text-[#777]">Last checked {new Date(lastCheckedAt).toLocaleTimeString()}</p>}</div>}
      {notices.length === 0 ? <p className="px-4 py-6 text-sm text-[#777]">No notifications.</p> : <div className="max-h-96 overflow-y-auto">{notices.map(notice => <button type="button" className="block w-full border-b border-black/[.06] px-4 py-3 text-left hover:bg-[#fff7f3]" key={notice.key} onClick={() => { setOpen(false); navigate(notice.url); }}><p className="text-sm font-semibold">{notice.title}</p><p className="mt-1 text-xs text-[#555]">{notice.body}</p><p className="mt-1 text-[11px] text-[#999]">{new Date(notice.receivedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p></button>)}</div>}
    </div>}
  </div>;
}
