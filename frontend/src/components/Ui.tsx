import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
type ToastContextValue = { showToast: (message: string, tone?: Toast["tone"]) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

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
      className={`rounded-[3px] px-[21px] py-[15px] text-[13px] font-bold transition hover:brightness-110 ${dark ? "bg-[#161616] text-white" : "bg-[#ff641f] text-white shadow-[0_10px_30px_#ff641f32]"}`}
    >
      {children}
    </button>
  );
}
