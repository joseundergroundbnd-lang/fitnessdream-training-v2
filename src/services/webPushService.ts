import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import {
  detectPushPlatform,
  hashPushEndpointToDocId,
  isAllowedPushEndpoint,
  isIosBrowserNotInstalled,
  urlBase64ToUint8Array,
  type PushDevicePlatform,
} from '../utils/webPushValidation';

export type BackgroundPushRegistrationResult =
  | { status: 'subscribed'; platform: PushDevicePlatform; subId: string }
  | { status: 'ios_install_required' }
  | { status: 'permission_denied' }
  | { status: 'server_not_configured' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

let cachedPublicKey: { configured: boolean; publicKey: string | null } | null = null;

export async function fetchServerVapidPublicKey(
  forceRefresh = false
): Promise<{ configured: boolean; publicKey: string | null }> {
  if (cachedPublicKey && !forceRefresh) return cachedPublicKey;
  try {
    const res = await fetch('/api/push/public-key', { cache: 'no-store' });
    if (!res.ok) {
      return { configured: false, publicKey: null };
    }
    const data = (await res.json()) as { configured?: boolean; publicKey?: string | null };
    cachedPublicKey = {
      configured: Boolean(data.configured && data.publicKey),
      publicKey: typeof data.publicKey === 'string' && data.publicKey.trim() ? data.publicKey.trim() : null,
    };
    return cachedPublicKey;
  } catch {
    return { configured: false, publicKey: null };
  }
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Registers the current device (iPhone Home Screen PWA, Android Chrome, or Desktop)
 * for closed-app background Web Push notifications and saves the subscription to Firestore.
 */
export async function registerDeviceForBackgroundPush(params: {
  user: User;
  isLiveAdmin: boolean;
}): Promise<BackgroundPushRegistrationResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { status: 'unsupported' };
  }

  const ua = navigator.userAgent || '';
  if (isIosBrowserNotInstalled(ua, isRunningStandalone())) {
    return { status: 'ios_install_required' };
  }

  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { status: 'unsupported' };
  }

  if (Notification.permission !== 'granted') {
    return { status: 'permission_denied' };
  }

  const keyInfo = await fetchServerVapidPublicKey();
  if (!keyInfo.configured || !keyInfo.publicKey) {
    return { status: 'server_not_configured' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyInfo.publicKey),
      });
    }

    const subJson = subscription.toJSON();
    const endpoint = subJson.endpoint?.trim() || '';
    const p256dh = subJson.keys?.p256dh?.trim() || '';
    const auth = subJson.keys?.auth?.trim() || '';

    if (!endpoint || !p256dh || !auth || !isAllowedPushEndpoint(endpoint)) {
      return { status: 'error', message: 'Suscripción push inválida en este navegador.' };
    }

    const subId = hashPushEndpointToDocId(endpoint);
    const platform = detectPushPlatform(ua);
    const uid = params.user.uid;

    // 1. Save under /members/{uid}/pushSubscriptions/{subId} if member profile exists
    try {
      const memberDocSnap = await getDoc(doc(db, 'members', uid));
      if (memberDocSnap.exists()) {
        const memberSubRef = doc(db, 'members', uid, 'pushSubscriptions', subId);
        const existingSub = await getDoc(memberSubRef);
        if (existingSub.exists()) {
          await updateDoc(memberSubRef, {
            endpoint,
            p256dh,
            auth,
            platform,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(memberSubRef, {
            subId,
            uid,
            endpoint,
            p256dh,
            auth,
            platform,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (memberSubErr) {
      console.warn('[FitnessDreams] Aviso guardando suscripción push de socio:', memberSubErr);
    }

    // 2. If authorized gym/coach staff, also save under /staffPushSubscriptions/{subId}
    if (params.isLiveAdmin) {
      try {
        const staffSubRef = doc(db, 'staffPushSubscriptions', subId);
        const existingStaffSub = await getDoc(staffSubRef);
        if (existingStaffSub.exists()) {
          await updateDoc(staffSubRef, {
            endpoint,
            p256dh,
            auth,
            platform,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(staffSubRef, {
            subId,
            uid,
            role: 'staff',
            endpoint,
            p256dh,
            auth,
            platform,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (staffSubErr) {
        console.warn('[FitnessDreams] Aviso guardando suscripción push de staff:', staffSubErr);
      }
    }

    return { status: 'subscribed', platform, subId };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'No se pudo activar push en segundo plano.',
    };
  }
}

/**
 * Triggers a background Web Push notification (iOS Home Screen PWA + Android + Desktop)
 * through our authenticated server route /api/push/send. Non-fatal if push keys are not yet configured.
 */
export async function dispatchBackgroundPush(params: {
  user: User;
  targetType: 'member' | 'staff' | 'all-members';
  targetMemberId?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  try {
    const idToken = await params.user.getIdToken();
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        targetType: params.targetType,
        targetMemberId: params.targetMemberId,
        title: params.title.slice(0, 100),
        body: params.body.slice(0, 240),
        url: params.url || '/',
        tag: params.tag,
        badgeCount: 1,
      }),
    });
    if (!res.ok) {
      console.warn('[FitnessDreams] Push background status:', res.status);
    }
  } catch (err) {
    console.warn('[FitnessDreams] Aviso enviando push en segundo plano:', err);
  }
}
