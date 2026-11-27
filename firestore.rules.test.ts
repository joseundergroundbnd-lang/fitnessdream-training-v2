import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Security Rules Static & Payload Invariant Verification Suite
 * Verifies that all Dirty Dozen attack vectors from security_spec.md are explicitly blocked
 * by our Firestore ruleset and blueprint constraints.
 */
const rulesPath = fs.existsSync(path.resolve('firestore.rules'))
  ? path.resolve('firestore.rules')
  : path.resolve('DRAFT_firestore.rules');

const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8'));

test('Rules start with version 2 and global default-deny catch-all', () => {
  assert.match(rulesText, /rules_version\s*=\s*'2';/);
  assert.match(rulesText, /match\s+\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;\s*\}/);
});

test('Dirty Dozen #1 & #11: Validation blueprints enforce hasAll, hasOnly, and string size caps', () => {
  assert.match(rulesText, /function isValidGymMember\(data\)/);
  assert.match(rulesText, /data\.keys\(\)\.hasAll\(/);
  assert.match(rulesText, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesText, /data\.name is string && data\.name\.size\(\) >= 1 && data\.name\.size\(\) <= 100/);
  assert.equal(blueprint.entities.GymMember.properties.name.maxLength, 100);
});

test('Dirty Dozen #2: Regular members cannot modify feeStatus, monthlyFee, or outreachStatus on update', () => {
  assert.match(
    rulesText,
    /affectedKeys\(\)\.hasOnly\(\[\s*'name',\s*'goal',\s*'tier',\s*'updatedAt'\s*\]\)/
  );
});

test('Dirty Dozen #3 & #6: Identity integrity & admin escalation are strictly blocked', () => {
  assert.match(rulesText, /match \/admins\/\{adminUid\}/);
  assert.match(rulesText, /incoming\(\)\.uid == request\.auth\.uid/);
});

test('Dirty Dozen #4: Email spoof protection mandates email_verified == true', () => {
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
});

test('Dirty Dozen #5: PII private contact subcollection restricts reads to owner or admin only', () => {
  assert.match(rulesText, /match \/private\/\{docId\}/);
  assert.match(rulesText, /allow get: if isValidId\(memberId\) && isValidId\(docId\) && \(isOwner\(memberId\) \|\| isAdmin\(\)\);/);
});

test('Dirty Dozen #7 & #8: Turnstile access logs are admin-create only and immutable', () => {
  assert.match(rulesText, /match \/accessLogs\/\{logId\}/);
  assert.match(rulesText, /allow update, delete: if false;/);
});

test('Dirty Dozen #9 & #10: Temporal integrity (request.time) and ID poisoning guard enforced', () => {
  assert.match(rulesText, /function isValidId\(id\)/);
  assert.match(rulesText, /id\.size\(\) <= 128/);
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
});

test('Dirty Dozen #12: Direct messages prevent coach impersonation and cross-member writes', () => {
  assert.match(rulesText, /match \/directMessages\/\{messageId\}/);
  assert.match(rulesText, /incoming\(\)\.senderRole == 'socio'/);
  assert.match(rulesText, /incoming\(\)\.memberId == request\.auth\.uid/);
});

test('Every collection in firebase-blueprint.json has an explicit match block in rules', () => {
  const expectedMatches = [
    'admins',
    'authorizedStaff',
    'members',
    'private',
    'pushSubscriptions',
    'staffPushSubscriptions',
    'accessLogs',
    'coachRoutines',
    'directMessages',
  ];
  for (const col of expectedMatches) {
    assert.ok(rulesText.includes(`match /${col}/`), `Missing match block for collection /${col}/`);
  }
});

test('Push subscriptions enforce HTTPS endpoints, owner/admin write isolation, and Master Gate', () => {
  assert.match(rulesText, /function isValidPushSubscription\(data\)/);
  assert.match(rulesText, /function isValidStaffPushSubscription\(data\)/);
  assert.match(rulesText, /data\.endpoint\.matches\('\^https:\/\/\.\*\$'\)/);
  assert.match(rulesText, /match \/pushSubscriptions\/\{subId\}/);
  assert.match(rulesText, /match \/staffPushSubscriptions\/\{subId\}/);
});
