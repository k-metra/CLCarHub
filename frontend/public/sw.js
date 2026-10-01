const CACHE_NAME = "clcarhub-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        self.addEventListener("notificationclick", (event) => {
          event.notification.close();
          const targetUrl = event.notification.data?.url || "/admin/bookings";
          event.waitUntil(
            self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
              const existing = clients.find((client) => "focus" in client);
              if (existing) {
                existing.navigate(targetUrl);
                return existing.focus();
              }
              return self.clients.openWindow(targetUrl);
            }),
          );
        });
        return response;
      });
    }),
  );
});
