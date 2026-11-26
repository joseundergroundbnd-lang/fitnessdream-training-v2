import type { DirectMessage } from '../types/gym';

export const MAX_AUDIO_RECORDING_SECONDS = 45;
export const MAX_FIRESTORE_AUDIO_DATAURL_CHARS = 340_000;

export interface DirectoryMemberLike {
  id: string;
  uid: string;
  name: string;
  memberCode: string;
  tier: string;
  isRealMember?: boolean;
  isCloud?: boolean;
}

export interface CoachChatContact {
  id: string;
  threadMemberId: string;
  recipientMemberId: string | null;
  name: string;
  subtitle: string;
  memberCode?: string;
  isCloud: boolean;
  isRealMember: boolean;
  activeCoachCount: number;
  otherCoachCount: number;
  totalCount: number;
  latestMessage?: DirectMessage;
  hasMemberReplyWaiting: boolean;
  latestOrder: number;
}

export function normalizeNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function selectBestAudioMimeType(
  isTypeSupported?: (mime: string) => boolean
): string {
  if (!isTypeSupported) return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    try {
      if (isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // Ignore browser quirks
    }
  }
  return '';
}

export function validateAudioPayload(dataUrl: string): {
  valid: boolean;
  error?: string;
} {
  if (!dataUrl || !dataUrl.startsWith('data:audio')) {
    return {
      valid: false,
      error: 'No se pudo grabar audio real desde el micrófono. Comprueba los permisos de micrófono e inténtalo de nuevo.',
    };
  }
  if (dataUrl.length > MAX_FIRESTORE_AUDIO_DATAURL_CHARS) {
    return {
      valid: false,
      error: `El audio es demasiado largo para enviarse (${Math.round(
        dataUrl.length / 1024
      )} KB). Graba una nota de voz de hasta ${MAX_AUDIO_RECORDING_SECONDS} segundos.`,
    };
  }
  return { valid: true };
}

/**
 * Unifies registered directory members AND any real member who has sent a direct message
 * (even if their /members profile document hasn't synced yet or uses a different walk-in ID),
 * sorting members with pending incoming messages straight to the top of the coach inbox.
 */
export function buildCoachChatContacts(params: {
  directoryMembers: DirectoryMemberLike[];
  directMessages: DirectMessage[];
  activeCoachId: string;
  authUid?: string | null;
}): CoachChatContact[] {
  const { directoryMembers, directMessages, activeCoachId, authUid } = params;
  const byThreadId = new Map<string, CoachChatContact>();

  // 1. Seed from directory members
  for (const member of directoryMembers) {
    const threadMemberId = authUid && member.uid === authUid ? 'current-user' : member.uid;
    if (!byThreadId.has(threadMemberId)) {
      byThreadId.set(threadMemberId, {
        id: member.id,
        threadMemberId,
        recipientMemberId: member.id,
        name: member.name,
        subtitle: `${member.memberCode} · ${member.tier}`,
        memberCode: member.memberCode,
        isCloud: Boolean(member.isCloud),
        isRealMember: Boolean(member.isRealMember || member.isCloud),
        activeCoachCount: 0,
        otherCoachCount: 0,
        totalCount: 0,
        hasMemberReplyWaiting: false,
        latestOrder: -1,
      });
    }
  }

  // 2. Scan every message so no sender (e.g. Unai Martínez) is ever orphaned or invisible
  directMessages.forEach((msg, index) => {
    const msgMemberId = msg.memberId;
    let contact = byThreadId.get(msgMemberId);

    if (!contact) {
      // Try matching by normalized name against an existing walk-in member that has no cloud messages yet
      const senderKey =
        msg.senderRole === 'member' ? normalizeNameKey(msg.senderName) : '';
      const matchedDirectory = senderKey
        ? directoryMembers.find(
            (m) => !m.isCloud && normalizeNameKey(m.name) === senderKey
          )
        : undefined;

      const displayName =
        msg.senderRole === 'member'
          ? msg.senderName
          : matchedDirectory?.name || 'Socio FitnessDreams';

      contact = {
        id: matchedDirectory?.id ?? msgMemberId,
        threadMemberId: msgMemberId,
        recipientMemberId: matchedDirectory?.id ?? msgMemberId,
        name: displayName,
        subtitle: matchedDirectory
          ? `${matchedDirectory.memberCode} · Chat en directo`
          : 'Socio conectado · Chat en directo',
        memberCode: matchedDirectory?.memberCode,
        isCloud: true,
        isRealMember: true,
        activeCoachCount: 0,
        otherCoachCount: 0,
        totalCount: 0,
        hasMemberReplyWaiting: false,
        latestOrder: -1,
      };
      byThreadId.set(msgMemberId, contact);
    }

    contact.totalCount += 1;
    if (msg.coachId === activeCoachId) {
      contact.activeCoachCount += 1;
      contact.latestMessage = msg;
      contact.latestOrder = index;
      contact.hasMemberReplyWaiting = msg.senderRole === 'member';
      if (msg.senderRole === 'member' && msg.senderName.trim()) {
        // Keep fresh member name if contact was synthesized
        if (contact.name === 'Socio FitnessDreams') {
          contact.name = msg.senderName.trim();
        }
      }
    } else {
      contact.otherCoachCount += 1;
      if (!contact.latestMessage) {
        contact.latestMessage = msg;
        contact.latestOrder = index;
      }
    }
  });

  // 3. Sort: pending member messages for active coach first, then active coach chats, then other coach chats, then cloud/real members
  return Array.from(byThreadId.values()).sort((a, b) => {
    if (a.hasMemberReplyWaiting !== b.hasMemberReplyWaiting) {
      return a.hasMemberReplyWaiting ? -1 : 1;
    }
    if ((a.activeCoachCount > 0) !== (b.activeCoachCount > 0)) {
      return a.activeCoachCount > 0 ? -1 : 1;
    }
    if (a.latestOrder !== b.latestOrder) {
      return b.latestOrder - a.latestOrder;
    }
    if (a.otherCoachCount !== b.otherCoachCount) {
      return b.otherCoachCount - a.otherCoachCount;
    }
    if (a.isCloud !== b.isCloud) {
      return a.isCloud ? -1 : 1;
    }
    if (a.isRealMember !== b.isRealMember) {
      return a.isRealMember ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'es');
  });
}
