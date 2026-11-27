export type PushDevicePlatform = 'ios' | 'android' | 'desktop' | 'other';

const ALLOWED_PUSH_HOST_EXACT = new Set([
  'fcm.googleapis.com',
  'web.push.apple.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'android.googleapis.com',
]);

const ALLOWED_PUSH_HOST_SUFFIXES = [
  '.push.apple.com',
  '.notify.windows.com',
  '.push.services.mozilla.com',
  '.push.samsungosp.com',
];

/**
 * SSRF protection: validates that a stored Web Push endpoint points strictly to
 * an official HTTPS browser push service (Apple APNs, Google FCM, Mozilla, WNS, Samsung).
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== 'string') return false;
  const trimmed = endpoint.trim();
  if (trimmed.length < 20 || trimmed.length > 1000) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;

  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return false;
  }

  if (ALLOWED_PUSH_HOST_EXACT.has(host)) return true;
  return ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}

/**
 * Ensures push notification click URLs stay strictly on the same origin as a relative path.
 */
export function sanitizePushUrlPath(input: unknown): string {
  if (typeof input !== 'string') return '/';
  const trimmed = input.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  if (/[\r\n]/.test(trimmed)) return '/';
  return trimmed.slice(0, 200);
}

/**
 * Produces a deterministic, Firestore-rule-safe document ID (^[a-zA-Z0-9_-]+$) from a push endpoint.
 */
export function hashPushEndpointToDocId(endpoint: string): string {
  let h1 = 2166136261;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < endpoint.length; i++) {
    const ch = endpoint.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 16777619);
  }
  const part1 = (h1 >>> 0).toString(36).padStart(7, '0');
  const part2 = (h2 >>> 0).toString(36).padStart(7, '0');
  return `sub_${part1}_${part2}`;
}

export function detectPushPlatform(userAgent: string): PushDevicePlatform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|windows|linux/.test(ua)) return 'desktop';
  return 'other';
}

export function isIosBrowserNotInstalled(userAgent: string, isStandalone: boolean): boolean {
  const ua = userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !isStandalone;
}

/**
 * Converts a URL-safe base64 VAPID public key into a Uint8Array for PushManager.subscribe().
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData =
    typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
