const CACHE_NAME = "alimentacao-escolar-v4";

const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/logo.png",
  "/prefeitura.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Um arquivo ausente não pode impedir a instalação do Service Worker.
      await Promise.all(
        APP_SHELL.map(async (asset) => {
          try {
            await cache.add(asset);
          } catch (error) {
            console.warn("[SW] Não foi possível armazenar:", asset, error);
          }
        })
      );
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  let url;

  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // O Cache API só aceita http/https. Isso também impede que
  // requisições chrome-extension:// de chegarem ao cache.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // Não intercepta Firebase, APIs ou outros recursos externos.
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch((error) => {
              console.warn("[SW] Falha ao armazenar resposta:", error);
            });
          });

          return response;
        })
        .catch(() => {
          // Só usa o shell offline para navegação de páginas.
          if (request.mode === "navigate") {
            return caches.match("/");
          }

          return new Response("", {
            status: 503,
            statusText: "Offline",
          });
        });
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  // O Firebase Cloud Messaging envia título e texto dentro de
  // payload.notification. Mensagens de dados podem vir em payload.data.
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title =
    notification.title || payload.title || data.title || "Alimentação Escolar";
  const body =
    notification.body || payload.body || data.body ||
    "Há um novo aviso no sistema.";
  const icon =
    notification.icon || payload.icon || data.icon || "/icon-192.png";
  const badge =
    notification.badge || payload.badge || data.badge || "/icon-192.png";
  const url =
    notification.click_action || payload.url || data.url || "/";
  const tag = notification.tag || payload.tag || data.tag || "aviso-alimentacao-escolar";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: false,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then(async (clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            await client.navigate(url);
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
