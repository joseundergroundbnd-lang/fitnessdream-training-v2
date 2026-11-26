import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatIncomingMessageNotification,
  formatIncomingRoutineNotification,
  shouldNotifyIncomingMessage,
} from './notifications';

test('shouldNotifyIncomingMessage notifies coach when a member sends a new message', () => {
  const seen = new Set<string>(['old-1']);
  assert.equal(
    shouldNotifyIncomingMessage({
      viewerMode: 'coach',
      message: { id: 'msg-unai-1', senderRole: 'socio', authorUid: 'uid-unai' },
      currentUid: 'uid-javi',
      seenIds: seen,
    }),
    true
  );
});

test('shouldNotifyIncomingMessage skips already seen messages and own echoed messages', () => {
  const seen = new Set<string>(['msg-1']);
  assert.equal(
    shouldNotifyIncomingMessage({
      viewerMode: 'coach',
      message: { id: 'msg-1', senderRole: 'socio', authorUid: 'uid-unai' },
      currentUid: 'uid-javi',
      seenIds: seen,
    }),
    false
  );
  assert.equal(
    shouldNotifyIncomingMessage({
      viewerMode: 'socio',
      message: { id: 'msg-2', senderRole: 'coach', authorUid: 'uid-same' },
      currentUid: 'uid-same',
      seenIds: seen,
    }),
    false
  );
});

test('shouldNotifyIncomingMessage notifies member only for coach replies and never in turnstile scanner mode', () => {
  const seen = new Set<string>();
  assert.equal(
    shouldNotifyIncomingMessage({
      viewerMode: 'socio',
      message: { id: 'msg-coach-1', senderRole: 'coach', authorUid: 'uid-javi' },
      currentUid: 'uid-unai',
      seenIds: seen,
    }),
    true
  );
  assert.equal(
    shouldNotifyIncomingMessage({
      viewerMode: 'socio',
      message: { id: 'msg-socio-1', senderRole: 'socio', authorUid: 'uid-other' },
      currentUid: 'uid-unai',
      seenIds: seen,
    }),
    false
  );
  assert.equal(
    shouldNotifyIncomingMessage({
      viewerMode: 'lector',
      message: { id: 'msg-socio-2', senderRole: 'socio', authorUid: 'uid-unai' },
      currentUid: 'uid-javi',
      seenIds: seen,
    }),
    false
  );
});

test('formatIncomingMessageNotification builds clear Spanish copy for text and voice notes', () => {
  const textNotif = formatIncomingMessageNotification({
    id: 'm1',
    senderRole: 'socio',
    senderName: 'Unai Martínez',
    kind: 'text',
    text: 'Hola Javi, ¿me cambias el día de pecho?',
  });
  assert.equal(textNotif.title, 'Nuevo mensaje de Unai Martínez');
  assert.match(textNotif.body, /pecho/);

  const audioNotif = formatIncomingMessageNotification({
    id: 'm2',
    senderRole: 'coach',
    senderName: 'Javi Busta',
    kind: 'audio',
    audioDurationSec: 18,
    text: 'Corrección técnica Press Banca',
  });
  assert.equal(audioNotif.title, 'Nueva nota de voz de Coach Javi Busta');
  assert.match(audioNotif.body, /18s/);
  assert.match(audioNotif.body, /Press Banca/);
});

test('formatIncomingRoutineNotification includes coach name and frequency', () => {
  const notif = formatIncomingRoutineNotification({
    id: 'rt-1',
    coachName: 'Javi Busta',
    title: 'Pecho y Espalda Telju',
    frequency: 'Semanal',
  });
  assert.equal(notif.title, 'Nueva rutina de Coach Javi Busta');
  assert.match(notif.body, /Semanal: Pecho y Espalda Telju/);
});
