import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectMessage } from '../types/gym';
import {
  buildCoachChatContacts,
  MAX_FIRESTORE_AUDIO_DATAURL_CHARS,
  selectBestAudioMimeType,
  validateAudioPayload,
} from './messaging';

test('buildCoachChatContacts surfaces an incoming member message even if not yet in directory and sorts it first', () => {
  const directoryMembers = [
    {
      id: 'demo-1',
      uid: 'demo-1',
      name: 'Carlos Ruiz',
      memberCode: 'FD-1001',
      tier: 'Socio Fundador',
      isCloud: false,
      isRealMember: false,
    },
  ];
  const directMessages: DirectMessage[] = [
    {
      id: 'msg-unai-1',
      coachId: 'coach-javi',
      memberId: 'uid-unai-real',
      senderRole: 'member',
      senderName: 'Unai Martínez',
      kind: 'text',
      text: 'Hola Javi, ya estoy registrado',
      timestampLabel: 'Hoy, 18:10',
    },
  ];

  const contacts = buildCoachChatContacts({
    directoryMembers,
    directMessages,
    activeCoachId: 'coach-javi',
    authUid: 'uid-javi',
  });

  assert.equal(contacts[0].name, 'Unai Martínez');
  assert.equal(contacts[0].threadMemberId, 'uid-unai-real');
  assert.equal(contacts[0].activeCoachCount, 1);
  assert.equal(contacts[0].hasMemberReplyWaiting, true);
});

test('buildCoachChatContacts links messages for a walk-in member with the same name and flags other-coach messages', () => {
  const directoryMembers = [
    {
      id: 'pilot_unai',
      uid: 'pilot_unai',
      name: 'Unai Martinez',
      memberCode: 'FD-4501',
      tier: 'Socio Fundador',
      isCloud: false,
      isRealMember: true,
    },
  ];
  const directMessages: DirectMessage[] = [
    {
      id: 'msg-unai-joel',
      coachId: 'coach-joel',
      memberId: 'uid-unai-google',
      senderRole: 'member',
      senderName: 'Unai Martínez',
      kind: 'audio',
      audioUrl: 'data:audio/webm;base64,AAAA',
      audioDurationSec: 12,
      timestampLabel: 'Hoy, 18:15',
    },
  ];

  const contacts = buildCoachChatContacts({
    directoryMembers,
    directMessages,
    activeCoachId: 'coach-javi',
    authUid: 'uid-javi',
  });

  const unaiThread = contacts.find((c) => c.threadMemberId === 'uid-unai-google');
  assert.ok(unaiThread);
  assert.equal(unaiThread.memberCode, 'FD-4501');
  assert.equal(unaiThread.otherCoachCount, 1);
});

test('selectBestAudioMimeType prefers compact opus codecs', () => {
  const supported = new Set(['audio/webm', 'audio/webm;codecs=opus']);
  assert.equal(
    selectBestAudioMimeType((m) => supported.has(m)),
    'audio/webm;codecs=opus'
  );
  assert.equal(
    selectBestAudioMimeType((m) => m === 'audio/mp4'),
    'audio/mp4'
  );
  assert.equal(selectBestAudioMimeType(() => false), '');
});

test('validateAudioPayload rejects synthetic or oversized audio payloads', () => {
  assert.equal(validateAudioPayload('synthetic-voice').valid, false);
  assert.equal(validateAudioPayload('data:audio/webm;base64,AAAA').valid, true);
  const oversized = `data:audio/webm;base64,${'A'.repeat(MAX_FIRESTORE_AUDIO_DATAURL_CHARS + 10)}`;
  assert.equal(validateAudioPayload(oversized).valid, false);
});
