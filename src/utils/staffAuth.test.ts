import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailToStaffDocId,
  getStaffRoleLabel,
  isValidStaffEmail,
  resolvePrimaryGymEmail,
} from './staffAuth';

test('emailToStaffDocId matches Firestore rules lower().replace([^a-z0-9], _) exactly', () => {
  assert.equal(emailToStaffDocId('  FitnesDream@Gmail.com '), 'fitnesdream_gmail_com');
  assert.equal(
    emailToStaffDocId('fitnessdreams.benidorm+pc@gmail.com'),
    'fitnessdreams_benidorm_pc_gmail_com'
  );
  assert.equal(
    emailToStaffDocId('joseundergroundbnd@gmail.com'),
    'joseundergroundbnd_gmail_com'
  );
});

test('isValidStaffEmail validates email syntax and rejects invalid strings', () => {
  assert.equal(isValidStaffEmail('fitnessdream@gmail.com'), true);
  assert.equal(isValidStaffEmail('javi.coach@fitnessdreams.es'), true);
  assert.equal(isValidStaffEmail('fitnesdream'), false);
  assert.equal(isValidStaffEmail('   '), false);
  assert.equal(isValidStaffEmail('a@b'), false);
});

test('resolvePrimaryGymEmail prefers gym-main role and falls back to bootstrapped owner', () => {
  assert.equal(
    resolvePrimaryGymEmail([], 'joseundergroundbnd@gmail.com'),
    'joseundergroundbnd@gmail.com'
  );
  assert.equal(
    resolvePrimaryGymEmail(
      [
        {
          staffId: 'javi_gmail_com',
          email: 'javi@gmail.com',
          label: 'Coach Javi',
          role: 'coach',
          addedByUid: 'u1',
        },
        {
          staffId: 'fitnesdream_gmail_com',
          email: 'fitnesdream@gmail.com',
          label: 'Gimnasio FitnessDreams',
          role: 'gym-main',
          addedByUid: 'u1',
        },
      ],
      'joseundergroundbnd@gmail.com'
    ),
    'fitnesdream@gmail.com'
  );
});

test('getStaffRoleLabel returns Spanish role labels', () => {
  assert.equal(getStaffRoleLabel('gym-main'), 'Correo oficial del gimnasio');
  assert.equal(getStaffRoleLabel('coach'), 'Coach / Entrenador');
});
