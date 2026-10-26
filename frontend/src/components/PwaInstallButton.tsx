import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __clcarhubInstallPrompt?: InstallPromptEvent;
  }
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstallButton({
  collapsed = false,
  className = "",
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    () => window.__clcarhubInstallPrompt ?? null,
  );
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [showInstallUnavailable, setShowInstallUnavailable] = useState(false);
  const isIos = isIosDevice();

  useEffect(() => {
    const handleInstallAvailable = () => setInstallPrompt(window.__clcarhubInstallPrompt ?? null);
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener("clcarhubinstallavailable", handleInstallAvailable);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("clcarhubinstallavailable", handleInstallAvailable);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const installApp = async () => {
    if (!installPrompt) {
      setShowInstallUnavailable(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  const iosInstructions = (
    <div className="rounded-lg border border-white/10 bg-[#242424] p-4 text-left text-sm leading-6 text-[#ddd] shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-white">Install CLCarHub</p>
          <p className="mt-1 text-xs text-[#aaa]">Add a quick link to your iPhone or iPad Home Screen.</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded px-2 text-xl leading-none text-[#aaa] hover:bg-white/10 hover:text-white"
          onClick={() => setShowIosInstructions(false)}
          aria-label="Close installation instructions"
        >
          ×
        </button>
      </div>
      <ol className="mt-4 space-y-3">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ff641f] text-xs font-bold text-white">1</span>
          <span>Open this page in <span className="font-semibold text-white">Safari</span>.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ff641f] text-xs font-bold text-white">2</span>
          <span>Tap the <span className="font-semibold text-white">Share</span> button.</span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ff641f] text-xs font-bold text-white">3</span>
          <span>Select <span className="font-semibold text-white">Add to Home Screen</span>, then tap <span className="font-semibold text-white">Add</span>.</span>
        </li>
      </ol>
    </div>
  );

  return (
    <div className={className}>
      <button
        type="button"
        className={`flex items-center justify-center gap-2 rounded bg-[#e85b00] px-3 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#ff641f] ${collapsed ? "w-full px-2" : "w-full"}`}
        onClick={() => {
          setShowInstallUnavailable(false);
          if (isIos) setShowIosInstructions(current => !current);
          else void installApp();
        }}
        title={isIos ? "Add CLCarHub to your Home Screen" : "Install CLCarHub App"}
        aria-expanded={isIos ? showIosInstructions : undefined}
      >
        <span aria-hidden="true">▣</span>
        {!collapsed && (isIos ? "Add to Home Screen" : "Install CLCarHub App")}
      </button>
      {!isIos && showInstallUnavailable && !collapsed && (
        <p className="mt-2 text-xs leading-5 text-[#777]">
          Installation is not available in this browser right now. Try the browser menu and choose <span className="font-semibold">Install app</span> or <span className="font-semibold">Add to Home Screen</span>.
        </p>
      )}
      {isIos && showIosInstructions && !collapsed && (
        <>
          <div className="mt-3 hidden sm:block">{iosInstructions}</div>
          {createPortal(
            <div
              className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+1rem)] z-[250] max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] overflow-y-auto sm:hidden"
              role="dialog"
              aria-label="iOS installation instructions"
            >
              {iosInstructions}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
