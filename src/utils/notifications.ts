export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface NotificationMessagePayload {
  title: string;
  body: string;
  tag: string;
}

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  const perm = Notification.permission;
  if (perm === 'granted' || perm === 'denied' || perm === 'default') {
    return perm;
  }
  return 'unsupported';
}

export function shouldNotifyIncomingMessage(params: {
  viewerMode: 'socio' | 'coach' | 'direccion' | 'lector';
  message: {
    id: string;
    senderRole: 'socio' | 'coach';
    authorUid?: string;
  };
  currentUid?: string | null;
  seenIds: Set<string>;
}): boolean {
  const { viewerMode, message, currentUid, seenIds } = params;
  if (!message.id || seenIds.has(message.id)) return false;
  if (viewerMode === 'lector') return false;
  if (currentUid && message.authorUid && message.authorUid === currentUid) {
    return false;
  }
  if (viewerMode === 'socio') {
    return message.senderRole === 'coach';
  }
  return message.senderRole === 'socio';
}

export function formatIncomingMessageNotification(msg: {
  id: string;
  senderRole: 'socio' | 'coach';
  senderName: string;
  kind: 'text' | 'audio';
  text?: string;
  audioDurationSec?: number;
}): NotificationMessagePayload {
  const senderLabel =
    msg.senderRole === 'coach' ? `Coach ${msg.senderName}` : msg.senderName || 'Socio FitnessDreams';

  if (msg.kind === 'audio') {
    const secs = Math.max(1, Math.round(msg.audioDurationSec ?? 5));
    const caption = msg.text?.trim();
    return {
      title: `Nueva nota de voz de ${senderLabel}`,
      body: caption
        ? `Audio (${secs}s): ${caption.slice(0, 110)}`
        : `Te ha enviado un audio de ${secs} segundos. Pulsa para escucharlo.`,
      tag: `fd-msg-${msg.id}`,
    };
  }

  const preview = (msg.text || 'Nuevo mensaje en tu chat de FitnessDreams').trim().slice(0, 120);
  return {
    title: `Nuevo mensaje de ${senderLabel}`,
    body: preview,
    tag: `fd-msg-${msg.id}`,
  };
}

export function formatIncomingRoutineNotification(routine: {
  id: string;
  coachName: string;
  title: string;
  frequency: string;
}): NotificationMessagePayload {
  return {
    title: `Nueva rutina de Coach ${routine.coachName}`,
    body: `${routine.frequency}: ${routine.title}. Pulsa para abrirla en Entreno.`,
    tag: `fd-routine-${routine.id}`,
  };
}

export function shouldNotifyNewMember(params: {
  viewerMode: 'socio' | 'coach' | 'direccion' | 'lector';
  member: { id: string; uid?: string };
  currentUid?: string | null;
  seenIds: Set<string>;
}): boolean {
  const { viewerMode, member, currentUid, seenIds } = params;
  if (!member.id || seenIds.has(member.id)) return false;
  if (viewerMode !== 'coach' && viewerMode !== 'direccion') return false;
  if (currentUid && (member.id === currentUid || member.uid === currentUid)) return false;
  return true;
}

export function formatNewMemberNotification(member: {
  id: string;
  name: string;
  memberCode: string;
  tier?: string;
}): NotificationMessagePayload {
  const cleanName = member.name.trim() || 'Nuevo socio';
  return {
    title: `Nuevo socio registrado · ${cleanName}`,
    body: `${cleanName} (${member.memberCode}${member.tier ? ` · ${member.tier}` : ''}) acaba de darse de alta en FitnessDreams.`,
    tag: `fd-member-${member.id}`,
  };
}

export async function requestGymNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted' || result === 'denied' || result === 'default') {
      return result;
    }
    return 'unsupported';
  } catch {
    return getNotificationPermissionState();
  }
}

export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.06, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    playTone(660, 0, 0.14);
    playTone(880, 0.13, 0.22);

    window.setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        // Ignore close errors
      }
    }, 600);
  } catch {
    // Ignore autoplay/Web Audio restrictions
  }
}

export function vibrateIncomingAlert(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([120, 60, 120]);
    } catch {
      // Ignore unsupported vibration
    }
  }
}

export async function showGymNotification(payload: {
  title: string;
  body: string;
  tag?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions = {
    body: payload.body,
    tag: payload.tag || `fd-alert-${Date.now()}`,
    icon: '/icon-pedestal-192.png',
    badge: '/icon-pedestal-192.png',
  };

  // Prefer Service Worker showNotification (works best on installed Android/iOS PWAs)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(payload.title, options);
        return true;
      }
    } catch {
      // Fall back to Window Notification API below
    }
  }

  try {
    const notif = new Notification(payload.title, options);
    notif.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore focus restriction
      }
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads previously seen notification IDs from localStorage so messages/routines
 * that arrived while the mobile app was closed still alert the user upon reopening.
 */
export function loadSeenNotificationIds(storageKey: string): {
  hydrated: boolean;
  ids: Set<string>;
} {
  if (typeof window === 'undefined') {
    return { hydrated: false, ids: new Set() };
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { hydrated: false, ids: new Set() };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { hydrated: false, ids: new Set() };
    const clean = parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
    return { hydrated: true, ids: new Set(clean) };
  } catch {
    return { hydrated: false, ids: new Set() };
  }
}

export function saveSeenNotificationIds(storageKey: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(ids).slice(-250);
    window.localStorage.setItem(storageKey, JSON.stringify(arr));
  } catch {
    // Ignore storage quota errors
  }
}

export function setAppNotificationBadge(unreadCount: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (unreadCount > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(unreadCount).catch(() => {});
    } else if (unreadCount <= 0 && typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // Ignore unsupported badge API
  }
}
