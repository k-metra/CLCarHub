import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
type ToastContextValue = { showToast: (message: string, tone?: Toast["tone"]) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function LoadingScreen({ label = "Loading CL CarHub" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f3f0] text-[#151515]" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-black/10 border-t-[#ff641f]" />
        <p className="text-sm text-[#777]">{label}</p>
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-black/10 ${className}`} aria-hidden="true" />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts(current => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 5000);
  }, []);

  return <ToastContext.Provider value={{ showToast }}>
    {children}
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-md" aria-live="polite">
      {toasts.map(toast => <div className={`pointer-events-auto w-full rounded border px-4 py-3 text-sm font-medium shadow-lg ${toast.tone === "error" ? "border-red-300 bg-red-50 text-red-800" : toast.tone === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-black/10 bg-white text-[#222]"}`} key={toast.id}>
        <div className="flex items-start justify-between gap-4"><span>{toast.message}</span><button type="button" className="text-lg leading-none opacity-60 hover:opacity-100" aria-label="Dismiss notification" onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}>×</button></div>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export function ImageLightbox({ src, alt, onRemove }: { src: string; alt: string; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="block overflow-hidden rounded border border-black/10" onClick={() => setOpen(true)} aria-label={`Expand ${alt}`}>
      <img className="h-20 w-full object-cover" src={src} alt={alt} />
    </button>
    {onRemove && <button type="button" className="mt-1 text-xs text-red-600" onClick={onRemove}>Remove</button>}
    {open && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
      <div className="relative max-h-full max-w-5xl" onClick={event => event.stopPropagation()}>
        <img className="max-h-[85vh] max-w-full rounded object-contain" src={src} alt={alt} />
        <button type="button" className="absolute right-2 top-2 rounded bg-black/70 px-3 py-1 text-2xl text-white" onClick={() => setOpen(false)} aria-label="Close image preview">×</button>
      </div>
    </div>}
  </>;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
    <div className="w-full max-w-md rounded bg-white p-6 shadow-2xl">
      <h2 id="confirmation-title" className="font-['Space_Grotesk'] text-xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-[#666]">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="border border-black/10 px-4 py-2 text-sm" onClick={onCancel}>Keep booking</button>
        <textarea className="mb-3 w-full border border-black/10 px-3 py-2 text-sm" placeholder="Reason (required)" value={reason} onChange={event => setReason(event.target.value)} />
        <button type="button" className="bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); setReason("") }}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}

export function Eyebrow({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff6a23]">
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  dark = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  dark?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded-[3px] px-[21px] py-[15px] text-[13px] font-bold transition hover:brightness-110 ${dark ? "bg-[#161616] text-white" : "bg-[#ff641f] text-white shadow-[0_10px_30px_#ff641f32]"}`}
    >
      {children}
    </button>
  );
}

export function RowActions({ actions }: { actions: Array<{ label: string; onClick: () => void; danger?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const updatePosition = useCallback(() => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return;
    setPosition({ top: bounds.bottom + 4, right: Math.max(8, window.innerWidth - bounds.right) });
  }, []);
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const handleViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", handlePointer);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);
  return <div className="inline-block" ref={ref}>
    <button type="button" aria-label="More actions" className="rounded px-2 py-1 text-xl leading-none text-[#777] hover:bg-black/5 hover:text-[#151515]" onClick={() => setOpen(current => !current)}>⋯</button>
    {open && createPortal(<div ref={menuRef} className="fixed z-[130] min-w-36 border border-black/10 bg-white p-1 text-left shadow-xl" style={{ top: position.top, right: position.right }}>{actions.map(action => <button type="button" key={action.label} className={`block w-full whitespace-nowrap px-3 py-2 text-sm hover:bg-[#f8f7f5] ${action.danger ? "text-red-600" : ""}`} onClick={() => { setOpen(false); action.onClick(); }}>{action.label}</button>)}</div>, document.body)}
  </div>;
}
