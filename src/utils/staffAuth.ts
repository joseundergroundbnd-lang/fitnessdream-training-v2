export const OFFICIAL_GYM_EMAIL = 'fitnessdreamsbenidorm@gmail.com';
export const BOOTSTRAPPED_OWNER_EMAIL = 'joseundergroundbnd@gmail.com';
export const BOOTSTRAPPED_ADMIN_EMAILS = [
  OFFICIAL_GYM_EMAIL,
  BOOTSTRAPPED_OWNER_EMAIL,
] as const;

export type AuthorizedStaffRole = 'gym-main' | 'owner' | 'coach' | 'scanner';

export interface AuthorizedStaffRecord {
  staffId: string;
  email: string;
  label: string;
  role: AuthorizedStaffRole;
  addedByUid: string;
  isBootstrappedOwner?: boolean;
  isCloudSynced?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isBootstrappedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return BOOTSTRAPPED_ADMIN_EMAILS.some((allowed) => allowed === normalized);
}

/**
 * Normalizes a Google email into the exact Firestore document ID used by
 * `firestore.rules` (`request.auth.token.email.lower().replace('[^a-z0-9]', '_')`).
 */
export function emailToStaffDocId(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 128);
}

export function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidStaffEmail(email: string): boolean {
  const clean = normalizeStaffEmail(email);
  return clean.length >= 5 && clean.length <= 160 && EMAIL_PATTERN.test(clean);
}

export function getStaffRoleLabel(role: AuthorizedStaffRole): string {
  switch (role) {
    case 'gym-main':
      return 'Correo oficial del gimnasio';
    case 'owner':
      return 'Dirección / Propietario';
    case 'coach':
      return 'Coach / Entrenador';
    case 'scanner':
      return 'Móvil Lector QR Torno';
  }
}

export function resolvePrimaryGymEmail(
  staffList: AuthorizedStaffRecord[],
  fallbackOwnerEmail: string
): string {
  const mainGym = staffList.find((item) => item.role === 'gym-main');
  return mainGym ? mainGym.email : fallbackOwnerEmail;
}
