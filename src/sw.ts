/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

interface GymPushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  badgeCount?: number;
}

self.addEventListener('push', (event) => {
  let payload: GymPushPayload = {};
  if (event.data) {
    try {
      payload = event.data.json() as GymPushPayload;
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = (payload.title || 'FitnessDreams Benidorm').slice(0, 100);
  const body = (payload.body || 'Tienes un nuevo aviso en tu app de FitnessDreams.').slice(0, 240);
  const rawUrl = typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//')
    ? payload.url
    : '/';
  const tag = (payload.tag || `fd-push-${Date.now()}`).slice(0, 80);

  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body,
    icon: '/icon-pedestal-192.png',
    badge: '/icon-pedestal-192.png',
    tag,
    renotify: true,
    vibrate: [140, 60, 140],
    data: { url: rawUrl },
  };

  const navWithBadge = self.navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      typeof navWithBadge?.setAppBadge === 'function'
        ? navWithBadge.setAppBadge(Math.max(1, Number(payload.badgeCount ?? 1))).catch(() => {})
        : Promise.resolve(),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl =
    event.notification.data &&
    typeof event.notification.data === 'object' &&
    typeof (event.notification.data as { url?: unknown }).url === 'string'
      ? (event.notification.data as { url: string }).url
      : '/';
  const safePath = rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/';
  const targetFullUrl = new URL(safePath, self.location.origin).href;

  const navWithBadge = self.navigator as Navigator & {
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof navWithBadge?.clearAppBadge === 'function') {
    void navWithBadge.clearAppBadge().catch(() => {});
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.startsWith(self.location.origin)) {
          if ('navigate' in client && safePath !== '/') {
            return client.navigate(targetFullUrl).then((navigated) => (navigated ? navigated.focus() : client.focus()));
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetFullUrl);
      }
      return undefined;
    })
  );
});
