import { useEffect, useState } from "react";

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

  if (isInstalled || (!installPrompt && !isIos)) return null;

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  return (
    <div className={className}>
      <button
        type="button"
        className={`flex items-center justify-center gap-2 rounded bg-[#e85b00] px-3 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#ff641f] ${collapsed ? "w-full px-2" : "w-full"}`}
        onClick={() => isIos ? setShowIosInstructions(current => !current) : void installApp()}
        title={isIos ? "Add CLCarHub to your Home Screen" : "Install CLCarHub App"}
        aria-expanded={isIos ? showIosInstructions : undefined}
      >
        <span aria-hidden="true">▣</span>
        {!collapsed && (isIos ? "Add to Home Screen" : "Install CLCarHub App")}
      </button>
      {isIos && showIosInstructions && !collapsed && (
        <div className="mt-3 rounded border border-white/10 bg-white/[.06] p-3 text-xs leading-5 text-[#ddd]">
          <p className="font-semibold text-white">Install CLCarHub on iPhone or iPad</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Open this page in Safari.</li>
            <li>Tap the Share button.</li>
            <li>Select <span className="font-semibold text-white">Add to Home Screen</span>, then tap <span className="font-semibold text-white">Add</span>.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
