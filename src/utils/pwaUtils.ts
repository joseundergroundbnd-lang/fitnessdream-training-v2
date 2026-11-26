export const DIRECT_SHARED_APP_URL = 'https://fitnessdream-training.vercel.app';

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface PlatformDetection {
  platform: InstallPlatform;
  isInAppBrowser: boolean;
  isSafariOnIOS: boolean;
}

/**
 * Classifies the visitor's platform and detects embedded webviews (Instagram, WhatsApp,
 * Facebook, LinkedIn, or iframe wrappers) where native PWA install requires opening in Chrome/Safari.
 */
export function detectInstallPlatform(userAgent: string): PlatformDetection {
  const ua = userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && /mobile/.test(ua));
  const isAndroid = /android/.test(ua);
  const platform: InstallPlatform = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';

  const isInAppBrowser =
    /instagram|fban|fbav|fb_iab|whatsapp|line\/|micromessenger|tiktok|snapchat|wv\)/.test(ua);

  const isSafariOnIOS = isIOS && /safari/.test(ua) && !/crios|fxios|edgios|opios/.test(ua);

  return {
    platform,
    isInAppBrowser,
    isSafariOnIOS,
  };
}

/**
 * Resolves the clean, direct URL to encode inside public QR codes (A3 poster & reception scanner).
 * Avoids encoding localhost or Google AI Studio launcher/preview URLs (ai.studio/apps/..., ais-dev/ais-pre)
 * so every QR points straight to the live public production domain.
 */
export function resolveDirectPublicUrl(currentOrigin?: string): string {
  const trimmed = (currentOrigin ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return DIRECT_SHARED_APP_URL;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    const isStudioWrapper =
      host === 'ai.studio' ||
      host.endsWith('.ai.studio') ||
      host.includes('ais-dev-') ||
      host.includes('ais-pre-');

    if (isLocal || isStudioWrapper) {
      return DIRECT_SHARED_APP_URL;
    }
    return parsed.origin;
  } catch {
    return DIRECT_SHARED_APP_URL;
  }
}

/**
 * Normalizes a custom URL entered by the gym owner for the printable A3 poster QR code.
 */
export function sanitizeCustomPosterUrl(input: string, fallback = DIRECT_SHARED_APP_URL): string {
  const trimmed = input.trim();
  if (!trimmed) return fallback;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

/**
 * Builds the direct Turnstile QR Scanner URL (?mode=lector) for the spare reception mobile phone.
 */
export function buildTurnstileScannerUrl(baseUrl: string): string {
  const clean = sanitizeCustomPosterUrl(baseUrl);
  return `${clean}/?mode=lector`;
}

/**
 * Builds the direct Gym Reception PC URL (?mode=direccion) for the reception desk computer.
 */
export function buildReceptionPcUrl(baseUrl: string): string {
  const clean = sanitizeCustomPosterUrl(baseUrl);
  return `${clean}/?mode=direccion`;
}

/**
 * Builds the dedicated Coach Portal URL (?mode=coach, ?mode=coach-javi, ?mode=coach-joel)
 * so coaches enter straight into the member database & routine builder with their own link.
 */
export function buildCoachPortalUrl(baseUrl: string, coachSlug?: 'javi' | 'joel'): string {
  const clean = sanitizeCustomPosterUrl(baseUrl);
  if (coachSlug === 'javi') return `${clean}/?mode=coach-javi`;
  if (coachSlug === 'joel') return `${clean}/?mode=coach-joel`;
  return `${clean}/?mode=coach`;
}
