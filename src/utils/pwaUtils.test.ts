import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceptionPcUrl,
  buildTurnstileScannerUrl,
  detectInstallPlatform,
  DIRECT_SHARED_APP_URL,
  resolveDirectPublicUrl,
  sanitizeCustomPosterUrl,
} from './pwaUtils';

test('detectInstallPlatform identifies iPhone Safari, Android Chrome, Desktop, and in-app browsers', () => {
  const iosSafari = detectInstallPlatform(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  );
  assert.equal(iosSafari.platform, 'ios');
  assert.equal(iosSafari.isSafariOnIOS, true);
  assert.equal(iosSafari.isInAppBrowser, false);

  const androidChrome = detectInstallPlatform(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  );
  assert.equal(androidChrome.platform, 'android');
  assert.equal(androidChrome.isInAppBrowser, false);

  const instaInApp = detectInstallPlatform(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram 340.0.0'
  );
  assert.equal(instaInApp.platform, 'ios');
  assert.equal(instaInApp.isInAppBrowser, true);

  const desktop = detectInstallPlatform(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'
  );
  assert.equal(desktop.platform, 'desktop');
});

test('resolveDirectPublicUrl replaces localhost and AI Studio dev/wrapper links with clean shared app URL', () => {
  assert.equal(resolveDirectPublicUrl('http://localhost:3000'), DIRECT_SHARED_APP_URL);
  assert.equal(resolveDirectPublicUrl('https://ai.studio/apps/2c9feb47-0aed-4e88-9c58-db7ae19a6ca7'), DIRECT_SHARED_APP_URL);
  assert.equal(
    resolveDirectPublicUrl('https://ais-dev-vltvrbk73xcr2l2ai744xn-439599759960.europe-west2.run.app'),
    DIRECT_SHARED_APP_URL
  );
  assert.equal(
    resolveDirectPublicUrl('https://ais-pre-vltvrbk73xcr2l2ai744xn-439599759960.europe-west2.run.app'),
    DIRECT_SHARED_APP_URL
  );
  assert.equal(
    resolveDirectPublicUrl('https://fitnessdream-training.vercel.app/'),
    'https://fitnessdream-training.vercel.app'
  );
});

test('sanitizeCustomPosterUrl and scanner/reception URL builders normalize URLs safely', () => {
  assert.equal(
    sanitizeCustomPosterUrl('fitnessdream-training.vercel.app/'),
    'https://fitnessdream-training.vercel.app'
  );
  assert.equal(sanitizeCustomPosterUrl('   '), DIRECT_SHARED_APP_URL);
  assert.equal(
    buildTurnstileScannerUrl('https://fitnessdream-training.vercel.app'),
    'https://fitnessdream-training.vercel.app/?mode=lector'
  );
  assert.equal(
    buildReceptionPcUrl('https://fitnessdream-training.vercel.app'),
    'https://fitnessdream-training.vercel.app/?mode=direccion'
  );
});
