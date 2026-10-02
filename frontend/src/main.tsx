import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __clcarhubInstallPrompt?: InstallPromptEvent;
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__clcarhubInstallPrompt = event as InstallPromptEvent;
  window.dispatchEvent(new Event("clcarhubinstallavailable"));
});

window.addEventListener("appinstalled", () => {
  delete window.__clcarhubInstallPrompt;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => registration.update())
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
