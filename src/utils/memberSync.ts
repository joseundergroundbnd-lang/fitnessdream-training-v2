import type { LiveGymMember } from '../services/liveGymService';

export const DEMO_PLACEHOLDER_MEMBER_NAME = 'Alex Navarro';

/**
 * Resolves the best real name when syncing a Google-signed-in user's profile to Firestore,
 * ensuring the built-in demo placeholder name ("Alex Navarro") never overwrites a real Google name.
 */
export function resolveGoogleSyncMemberName(params: {
  profileName?: string;
  isRegistered?: boolean;
  googleDisplayName?: string | null;
  googleEmail?: string | null;
}): string {
  const trimmedProfile = (params.profileName ?? '').trim();
  const isPlaceholder =
    !trimmedProfile ||
    trimmedProfile.toLowerCase() === DEMO_PLACEHOLDER_MEMBER_NAME.toLowerCase();

  if (params.isRegistered && !isPlaceholder) {
    return trimmedProfile;
  }

  const trimmedGoogle = (params.googleDisplayName ?? '').trim();
  if (trimmedGoogle) {
    return trimmedGoogle;
  }

  const emailPrefix = (params.googleEmail ?? '').split('@')[0]?.trim();
  if (emailPrefix) {
    return emailPrefix;
  }

  return 'Socio FitnessDreams';
}

export function isPendingLocalWalkIn(member: Pick<LiveGymMember, 'id'>): boolean {
  return member.id.startsWith('local_pilot_');
}

export interface DirectoryMemberWithSource extends LiveGymMember {
  isCloud: boolean;
}

/**
 * Merges real Firestore members, local reception walk-ins, and demo members without duplicates,
 * placing real cloud & walk-in members first so coaches always see new members at the top.
 */
export function mergeCoachDirectoryMembers(
  liveMembers: LiveGymMember[],
  localDemoMembers: LiveGymMember[]
): DirectoryMemberWithSource[] {
  const map = new Map<string, DirectoryMemberWithSource>();

  for (const m of liveMembers) {
    map.set(m.id, { ...m, isCloud: true });
  }

  for (const m of localDemoMembers) {
    if (!map.has(m.id)) {
      map.set(m.id, { ...m, isCloud: false });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.isCloud !== b.isCloud) return a.isCloud ? -1 : 1;
    if (a.isRealMember !== b.isRealMember) return a.isRealMember ? -1 : 1;
    return 0;
  });
}
