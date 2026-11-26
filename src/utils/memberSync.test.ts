import assert from 'node:assert/strict';
import test from 'node:test';
import type { LiveGymMember } from '../services/liveGymService';
import {
  isPendingLocalWalkIn,
  mergeCoachDirectoryMembers,
  resolveGoogleSyncMemberName,
} from './memberSync';

function makeMember(partial: Partial<LiveGymMember> & { id: string; name: string }): LiveGymMember {
  return {
    uid: partial.uid ?? partial.id,
    memberCode: partial.memberCode ?? 'FD-1000',
    tier: partial.tier ?? 'Socio Fundador',
    goal: partial.goal ?? 'Fuerza',
    feeStatus: partial.feeStatus ?? 'al-dia',
    monthlyFee: partial.monthlyFee ?? 34.9,
    streakDays: partial.streakDays ?? 0,
    totalCheckIns: partial.totalCheckIns ?? 0,
    lastCheckInLabel: partial.lastCheckInLabel ?? 'Hoy',
    daysSinceLastVisit: partial.daysSinceLastVisit ?? 0,
    outreachStatus: partial.outreachStatus ?? 'pendiente',
    assignedCoach: partial.assignedCoach ?? 'Javi Busta',
    isRealMember: partial.isRealMember ?? false,
    ...partial,
  };
}

test('resolveGoogleSyncMemberName never overwrites a real Google user with the Alex Navarro demo placeholder', () => {
  assert.equal(
    resolveGoogleSyncMemberName({
      profileName: 'Alex Navarro',
      isRegistered: true,
      googleDisplayName: 'Unai Martínez',
      googleEmail: 'unai@gmail.com',
    }),
    'Unai Martínez'
  );

  assert.equal(
    resolveGoogleSyncMemberName({
      profileName: 'Carlos Pérez',
      isRegistered: true,
      googleDisplayName: 'Carlos Google',
      googleEmail: 'carlos@gmail.com',
    }),
    'Carlos Pérez'
  );

  assert.equal(
    resolveGoogleSyncMemberName({
      profileName: '',
      isRegistered: false,
      googleDisplayName: null,
      googleEmail: 'marta.fit@gmail.com',
    }),
    'marta.fit'
  );
});

test('isPendingLocalWalkIn detects local reception members awaiting cloud upload', () => {
  assert.equal(isPendingLocalWalkIn({ id: 'local_pilot_173200000' }), true);
  assert.equal(isPendingLocalWalkIn({ id: 'pilot_173200000_abcd' }), false);
  assert.equal(isPendingLocalWalkIn({ id: 'firebaseUid123' }), false);
});

test('mergeCoachDirectoryMembers places real cloud and reception members ahead of demo profiles without duplicates', () => {
  const cloud = [
    makeMember({ id: 'uid-unai', name: 'Unai Martínez', isRealMember: true }),
    makeMember({ id: 'pilot-maria', name: 'María López', isRealMember: true }),
  ];
  const local = [
    makeMember({ id: 'uid-unai', name: 'Unai Duplicate', isRealMember: false }),
    makeMember({ id: 'demo-1', name: 'Alex Navarro', isRealMember: false }),
    makeMember({ id: 'local_pilot_1', name: 'Pedro Local', isRealMember: true }),
  ];

  const merged = mergeCoachDirectoryMembers(cloud, local);
  assert.equal(merged.length, 4);
  assert.equal(merged[0].name, 'Unai Martínez');
  assert.equal(merged[0].isCloud, true);
  assert.equal(merged[1].name, 'María López');
  assert.equal(merged[2].name, 'Pedro Local');
  assert.equal(merged[2].isCloud, false);
  assert.equal(merged[3].name, 'Alex Navarro');
});
