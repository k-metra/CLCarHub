import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import type { BookingRecord, Paginated } from "../types";

const SOUND_KEY = "clcarhub_admin_notification_sound";
const DESKTOP_KEY = "clcarhub_admin_desktop_notifications";

type Notice = { id: number; booking: BookingRecord; receivedAt: number };

function readPreference(key: string, fallback: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored === null ? fallback : stored === "true";
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

export function AdminBookingNotifications() {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => readPreference(SOUND_KEY, true));
  const [desktopEnabled, setDesktopEnabled] = useState(() => readPreference(DESKTOP_KEY, false));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const knownBookingIds = useRef(new Set<number>());

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
    const checkForBookings = async () => {
      try {
        const response = await api.get<Paginated<BookingRecord>>("/bookings?per_page=20&sort=latest&filter=pending");
        if (!active) return;
        const current = response.data.data;
        if (!initialized.current) {
          current.forEach(booking => knownBookingIds.current.add(booking.id));
          initialized.current = true;
          return;
        }
        const newBookings = current.filter(booking => !knownBookingIds.current.has(booking.id));
        current.forEach(booking => knownBookingIds.current.add(booking.id));
        if (!newBookings.length) return;
        const incoming = newBookings.map(booking => ({ id: booking.id, booking, receivedAt: Date.now() }));
        setNotices(previous => [...incoming, ...previous].slice(0, 10));
        setUnread(previous => previous + incoming.length);
        if (soundEnabled) playNotificationSound();
        if (desktopEnabled && "Notification" in window && Notification.permission === "granted") {
          const registration = await navigator.serviceWorker?.getRegistration();
          for (const notice of incoming) {
            const customerName = notice.booking.customer?.name ?? "A customer";
            if (registration) {
              await registration.showNotification("New booking request", {
                body: `${customerName} submitted ${notice.booking.reference}.`,
                tag: `booking-${notice.booking.id}`,
                data: { url: "/admin/bookings" },
              });
            } else {
              new Notification("New booking request", { body: `${customerName} submitted ${notice.booking.reference}.` });
            }
          }
        }
      } catch {
        // Polling failures should not interrupt normal admin navigation.
      }
    };
    void checkForBookings();
    const timer = window.setInterval(() => void checkForBookings(), 20000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [desktopEnabled, soundEnabled]);

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

  return <div className="relative mr-2 sm:mr-3" ref={containerRef}>
    <button type="button" className="relative rounded-full p-2 text-[#bbb] transition hover:bg-white/10 hover:text-white" aria-label={`${unread} unread booking notifications`} onClick={() => { setOpen(current => !current); setUnread(0); }}>
      <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17H9m10-2V11a7 7 0 1 0-14 0v4l-2 2h18l-2-2Zm-5 5h-4" /></svg>
      {unread > 0 && <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-[#ff641f] px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-9 z-50 w-[min(90vw,360px)] border border-black/10 bg-white text-[#151515] shadow-xl">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3"><p className="text-sm font-semibold">Booking notifications</p><button type="button" className="text-xs text-[#ff641f]" onClick={() => setSettingsOpen(current => !current)}>Settings</button></div>
      {settingsOpen && <div className="space-y-3 border-b border-black/10 bg-[#f8f7f5] p-4 text-xs">
        <label className="flex items-center justify-between gap-4"><span>Notification sound</span><input type="checkbox" checked={soundEnabled} onChange={event => { setSoundEnabled(event.target.checked); localStorage.setItem(SOUND_KEY, String(event.target.checked)); }} /></label>
        <label className="flex items-center justify-between gap-4"><span>Desktop notifications</span><input type="checkbox" checked={desktopEnabled} onChange={() => void toggleDesktopNotifications()} /></label>
        <p className="text-[#777]">Notifications are checked every 20 seconds while an admin page is open.</p>
      </div>}
      {notices.length === 0 ? <p className="px-4 py-6 text-sm text-[#777]">No new booking requests.</p> : <div className="max-h-80 overflow-y-auto">{notices.map(notice => <button type="button" className="block w-full border-b border-black/[.06] px-4 py-3 text-left hover:bg-[#fff7f3]" key={`${notice.id}-${notice.receivedAt}`} onClick={() => { setOpen(false); navigate(`/admin/bookings?booking=${notice.booking.id}`); }}><p className="text-sm font-semibold">New booking request</p><p className="mt-1 text-xs text-[#555]">{notice.booking.customer?.name ?? "Customer"} · {notice.booking.reference}</p><p className="mt-1 text-[11px] text-[#999]">{new Date(notice.receivedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></button>)}</div>}
    </div>}
  </div>;
}
