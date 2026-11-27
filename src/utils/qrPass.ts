import type { FeeStatus } from '../types/gym';

export const QR_PREFIX = 'FD:MEMBER:';

export interface ParsedQrPayload {
  valid: boolean;
  memberId: string | null;
  memberCode: string | null;
  raw: string;
}

/**
 * Encodes a compact, fast-scanning QR payload for FitnessDreams turnstile validation.
 * Example: "FD:MEMBER:uid_12345|FD-0042"
 */
export function buildMemberQrPayload(memberId: string, memberCode: string): string {
  const cleanId = sanitizeId(memberId);
  const cleanCode = sanitizeMemberCode(memberCode);
  return `${QR_PREFIX}${cleanId}|${cleanCode}`;
}

/**
 * Parses either a full FitnessDreams QR payload ("FD:MEMBER:<id>|<code>")
 * or a manually typed member code ("FD-0042" / "#0042").
 */
export function parseMemberQrPayload(rawInput: string): ParsedQrPayload {
  const raw = rawInput.trim();
  if (!raw) {
    return { valid: false, memberId: null, memberCode: null, raw: '' };
  }

  if (raw.startsWith(QR_PREFIX)) {
    const body = raw.slice(QR_PREFIX.length);
    const [idPart, codePart] = body.split('|');
    const cleanId = idPart ? idPart.trim() : '';
    const cleanCode = codePart ? sanitizeMemberCode(codePart) : null;
    if (cleanId && /^[a-zA-Z0-9_\-]{1,128}$/.test(cleanId)) {
      return {
        valid: true,
        memberId: cleanId,
        memberCode: cleanCode,
        raw,
      };
    }
    return { valid: false, memberId: null, memberCode: null, raw };
  }

  // Fallback for manual reception entry (e.g. "FD-0042" or "#0042" or direct UID)
  const normalizedCode = sanitizeMemberCode(raw);
  if (/^FD-[A-Z0-9\-]{2,28}$/.test(normalizedCode)) {
    return {
      valid: true,
      memberId: null,
      memberCode: normalizedCode,
      raw,
    };
  }

  if (/^[a-zA-Z0-9_\-]{4,128}$/.test(raw)) {
    return {
      valid: true,
      memberId: raw,
      memberCode: null,
      raw,
    };
  }

  return { valid: false, memberId: null, memberCode: null, raw };
}

/**
 * Matches a parsed FitnessDreams QR payload against a list of members.
 * Checks exact document ID / UID first (ignoring the 'current-user' local placeholder),
 * then falls back to normalized memberCode (e.g. FD-4821) so scans work even if a member
 * opened their QR before local state finished syncing.
 */
export function matchMemberForQrPayload<
  T extends { id: string; uid?: string; memberCode: string },
>(parsed: ParsedQrPayload, members: T[]): T | null {
  if (!parsed.valid || members.length === 0) return null;

  const targetId =
    parsed.memberId && parsed.memberId !== 'current-user' ? parsed.memberId.trim() : null;
  const targetCode = parsed.memberCode ? sanitizeMemberCode(parsed.memberCode) : null;

  if (targetId) {
    const byId = members.find((m) => m.id === targetId || m.uid === targetId);
    if (byId) return byId;
  }

  if (targetCode) {
    const byCode = members.find((m) => sanitizeMemberCode(m.memberCode) === targetCode);
    if (byCode) return byCode;
  }

  // Case-insensitive ID fallback (for manual typing of UIDs)
  if (targetId) {
    const lowerId = targetId.toLowerCase();
    const byInsensitiveId = members.find(
      (m) => m.id.toLowerCase() === lowerId || (m.uid && m.uid.toLowerCase() === lowerId)
    );
    if (byInsensitiveId) return byInsensitiveId;
  }

  return null;
}

/**
 * Generates a short deterministic uppercase member code like "FD-4821" from a Firebase UID.
 */
export function generateMemberCodeFromUid(uid: string): string {
  let hash = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    hash ^= uid.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = (Math.abs(hash) % 9000) + 1000;
  return `FD-${num}`;
}

/**
 * Sanitizes document IDs to match the Firestore security rule regex ^[a-zA-Z0-9_\-]+$ (<= 128 chars).
 */
export function sanitizeId(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  return cleaned || 'member_guest';
}

/**
 * Sanitizes member codes to match ^[A-Z0-9\-]+$ (3..32 chars).
 */
export function sanitizeMemberCode(input: string): string {
  const upper = input
    .trim()
    .toUpperCase()
    .replace(/^#/, 'FD-')
    .replace(/[^A-Z0-9\-]/g, '')
    .slice(0, 32);
  if (upper.length >= 3) return upper;
  return 'FD-0001';
}

/**
 * Truncates and cleans user-provided strings to enforce firebase-blueprint.json volumetric limits.
 */
export function clampText(value: string, maxLength: number, fallback = ''): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback.slice(0, maxLength);
  return trimmed.slice(0, maxLength);
}

/**
 * Normalizes a FeeStatus value defensively.
 */
export function normalizeFeeStatus(value: unknown): FeeStatus {
  return value === 'pendiente' ? 'pendiente' : 'al-dia';
}
