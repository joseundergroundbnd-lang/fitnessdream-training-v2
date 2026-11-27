import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPushPlatform,
  hashPushEndpointToDocId,
  isAllowedPushEndpoint,
  isIosBrowserNotInstalled,
  sanitizePushUrlPath,
  urlBase64ToUint8Array,
} from './webPushValidation';

test('isAllowedPushEndpoint allows Apple APNs, Google FCM, Mozilla, and WNS endpoints and blocks SSRF targets', () => {
  assert.equal(
    isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/eXAmPlEtOkEn1234567890'),
    true
  );
  assert.equal(
    isAllowedPushEndpoint('https://web.push.apple.com/QF3abCDefGhIjKlMnOpQrStUvWxYz'),
    true
  );
  assert.equal(
    isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abcdef123456'),
    true
  );

  // Blocked SSRF / invalid schemes / private targets
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/insecure'), false);
  assert.equal(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(isAllowedPushEndpoint('https://localhost:3000/api/internal'), false);
  assert.equal(isAllowedPushEndpoint('https://evil.example.com/push/steal'), false);
  assert.equal(isAllowedPushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/abc'), false);
});

test('sanitizePushUrlPath permits relative paths only and blocks external or javascript URLs', () => {
  assert.equal(sanitizePushUrlPath('/?mode=coach-javi'), '/?mode=coach-javi');
  assert.equal(sanitizePushUrlPath('/'), '/');
  assert.equal(sanitizePushUrlPath('https://evil.com/phish'), '/');
  assert.equal(sanitizePushUrlPath('//evil.com/phish'), '/');
  assert.equal(sanitizePushUrlPath('javascript:alert(1)'), '/');
});

test('hashPushEndpointToDocId generates deterministic Firestore-safe document IDs', () => {
  const endpoint = 'https://web.push.apple.com/QF3abCDefGhIjKlMnOpQrStUvWxYz';
  const idA = hashPushEndpointToDocId(endpoint);
  const idB = hashPushEndpointToDocId(endpoint);
  assert.equal(idA, idB);
  assert.match(idA, /^sub_[a-z0-9]+_[a-z0-9]+$/);
});

test('detectPushPlatform and isIosBrowserNotInstalled detect iPhone Safari vs installed PWA and Android', () => {
  const iphoneUa =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const androidUa =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

  assert.equal(detectPushPlatform(iphoneUa), 'ios');
  assert.equal(detectPushPlatform(androidUa), 'android');
  assert.equal(isIosBrowserNotInstalled(iphoneUa, false), true);
  assert.equal(isIosBrowserNotInstalled(iphoneUa, true), false);
  assert.equal(isIosBrowserNotInstalled(androidUa, false), false);
});

test('urlBase64ToUint8Array decodes URL-safe base64 keys cleanly', () => {
  const bytes = urlBase64ToUint8Array('SGVsbG8');
  assert.deepEqual(Array.from(bytes), [72, 101, 108, 108, 111]);
});
