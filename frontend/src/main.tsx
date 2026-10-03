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
    if (import.meta.env.PROD) {
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => registration.update())
      return
    }

    void navigator.serviceWorker.getRegistrations().then(registrations => {
      const unregisterTasks = registrations.map(registration => registration.unregister())
      return Promise.all(unregisterTasks)
    }).then(() => caches.keys()).then(cacheNames => {
      const cacheTasks = cacheNames
        .filter(cacheName => cacheName.startsWith('clcarhub-'))
        .map(cacheName => caches.delete(cacheName))
      return Promise.all(cacheTasks)
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
