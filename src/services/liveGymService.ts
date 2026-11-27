import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, isOwnerEmail, OperationType } from '../firebase';
import type { FeeStatus } from '../types/gym';
import { evaluateTurnstileAccess } from '../utils/gymLogic';
import {
  clampText,
  generateMemberCodeFromUid,
  matchMemberForQrPayload,
  normalizeFeeStatus,
  parseMemberQrPayload,
  sanitizeId,
  sanitizeMemberCode,
} from '../utils/qrPass';
import {
  emailToStaffDocId,
  isValidStaffEmail,
  normalizeStaffEmail,
  type AuthorizedStaffRecord,
  type AuthorizedStaffRole,
} from '../utils/staffAuth';

export interface LiveGymMember {
  id: string;
  uid: string;
  memberCode: string;
  name: string;
  tier: 'Socio Fundador' | 'Socio Club';
  goal: string;
  feeStatus: FeeStatus;
  monthlyFee: number;
  streakDays: number;
  totalCheckIns: number;
  lastCheckInLabel: string;
  daysSinceLastVisit: number;
  outreachStatus: 'pendiente' | 'contactado' | 'reactivado';
  lastOutreachNote?: string;
  assignedCoach: string;
  isRealMember: boolean;
  email?: string;
  phone?: string;
}

export interface LiveAccessLog {
  id: string;
  memberId: string;
  memberUid: string;
  memberName: string;
  memberCode: string;
  feeStatus: FeeStatus;
  allowed: boolean;
  reason: string;
  scannerLabel: string;
  scannedByUid: string;
  createdAtLabel: string;
  createdAtMs: number;
}

export interface LiveCoachRoutineDoc {
  id: string;
  targetMemberId: string;
  targetMemberName?: string;
  targetMemberCode?: string;
  title: string;
  frequency: 'Diaria' | 'Semanal' | 'Mensual' | 'Trimestral';
  dayLabel: string;
  coachId: string;
  coachName: string;
  coachRole: string;
  goal: string;
  coachMessage: string;
  machineCodes: string[];
  exercises?: import('../types/gym').CoachRoutineExercise[];
  cardioBlock?: import('../types/gym').CoachRoutineCardioBlock;
  createdByUid: string;
  createdAtLabel: string;
}

export interface LiveDirectMessageDoc {
  id: string;
  coachId: string;
  memberId: string;
  senderRole: 'socio' | 'coach';
  senderName: string;
  kind: 'text' | 'audio';
  text?: string;
  audioDataUrl?: string;
  audioDurationSec?: number;
  authorUid: string;
  timestampLabel: string;
  createdAtMs: number;
}

export interface TurnstileScanOutcome {
  found: boolean;
  allowed: boolean;
  status: 'granted' | 'blocked_fee_overdue' | 'scanner_not_connected' | 'unknown_qr';
  title: string;
  message: string;
  memberName: string;
  memberCode: string;
  tier?: string;
  feeStatus?: FeeStatus;
  streakDays?: number;
  scannedAtLabel: string;
}

function formatTimestampLabel(ts: unknown): { label: string; ms: number } {
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as Timestamp).toDate === 'function') {
    const d = (ts as Timestamp).toDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return { label: `${hh}:${mm}:${ss}`, ms: d.getTime() };
  }
  const now = new Date();
  return {
    label: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    ms: now.getTime(),
  };
}

export async function checkIsLiveAdmin(user: User): Promise<boolean> {
  if (user.emailVerified && isOwnerEmail(user.email)) {
    return true;
  }
  if (user.emailVerified && user.email) {
    try {
      const staffSnap = await getDoc(doc(db, 'authorizedStaff', emailToStaffDocId(user.email)));
      if (staffSnap.exists()) return true;
    } catch {
      // Continue to legacy UID admin check
    }
  }
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

function extractFirestoreErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '');
  }
  return '';
}

const FIRESTORE_WRITE_TIMEOUT_MS = 9000;

async function withCloudWriteTimeout<T>(
  operation: Promise<T>,
  contextLabel: string,
  timeoutMs = FIRESTORE_WRITE_TIMEOUT_MS
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(
        new Error(
          `Firebase no respondió a tiempo al ${contextLabel} [quota-or-network-timeout]. Si has superado la cuota diaria gratuita de escrituras de Firebase (Spark), las escrituras quedan pausadas hasta el reinicio diario o hasta ampliar el plan en Firebase Console.`
        )
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }
}

function formatFirestoreErrorMessage(error: unknown, contextLabel: string): string {
  const code = extractFirestoreErrorCode(error);
  const rawMsg = error instanceof Error ? error.message : String(error);
  const lower = `${code} ${rawMsg}`.toLowerCase();

  if (lower.includes('quota-or-network-timeout')) {
    return rawMsg;
  }
  if (lower.includes('resource-exhausted') || lower.includes('quota')) {
    return `Cuota diaria gratuita de escrituras de Firebase alcanzada (${code || 'resource-exhausted'}). Se reinicia al día siguiente o puedes cambiar de base de datos / plan en Firebase Console.`;
  }
  if (lower.includes('permission')) {
    return `Permiso denegado en la nube al ${contextLabel} (${code || 'permission-denied'}). Asegúrate de iniciar sesión con fitnessdreamsbenidorm@gmail.com o joseundergroundbnd@gmail.com.`;
  }
  if (lower.includes('unavailable') || lower.includes('offline') || lower.includes('network')) {
    return `Sin conexión estable con Firebase al ${contextLabel} (${code || 'unavailable'}). Revisa Internet e inténtalo de nuevo.`;
  }
  return `Error en la nube al ${contextLabel}${code ? ` [${code}]` : ''}: ${rawMsg}`;
}

function mapMemberDocToLiveGymMember(
  snap: QueryDocumentSnapshot<DocumentData>
): { member: LiveGymMember; sortMs: number } {
  const d = snap.data();
  const updatedTs = d.updatedAt
    ? formatTimestampLabel(d.updatedAt).ms
    : d.createdAt
      ? formatTimestampLabel(d.createdAt).ms
      : 0;
  const member: LiveGymMember = {
    id: snap.id,
    uid: String(d.uid ?? snap.id),
    memberCode: String(d.memberCode ?? 'FD-0001'),
    name: String(d.name ?? 'Socio'),
    tier: d.tier === 'Socio Club' ? 'Socio Club' : 'Socio Fundador',
    goal: String(d.goal ?? ''),
    feeStatus: normalizeFeeStatus(d.feeStatus),
    monthlyFee: Number(d.monthlyFee ?? 34.9),
    streakDays: Number(d.streakDays ?? 0),
    totalCheckIns: Number(d.totalCheckIns ?? 0),
    lastCheckInLabel: String(d.lastCheckInLabel ?? ''),
    daysSinceLastVisit: Number(d.daysSinceLastVisit ?? 0),
    outreachStatus: (d.outreachStatus as LiveGymMember['outreachStatus']) ?? 'pendiente',
    lastOutreachNote: typeof d.lastOutreachNote === 'string' ? d.lastOutreachNote : undefined,
    assignedCoach: String(d.assignedCoach ?? 'Javi Busta'),
    isRealMember: Boolean(d.isRealMember ?? true),
  };
  return { member, sortMs: updatedTs };
}

export function subscribeAuthorizedStaff(
  onData: (staff: AuthorizedStaffRecord[]) => void
): Unsubscribe {
  const path = 'authorizedStaff';
  const q = query(collection(db, path), limit(30));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AuthorizedStaffRecord[] = snapshot.docs
        .map((snap) => {
          const d = snap.data();
          const role: AuthorizedStaffRole =
            d.role === 'gym-main' || d.role === 'owner' || d.role === 'scanner'
              ? d.role
              : 'coach';
          return {
            record: {
              staffId: snap.id,
              email: String(d.email ?? ''),
              label: String(d.label ?? 'Cuenta autorizada'),
              role,
              addedByUid: String(d.addedByUid ?? ''),
              isCloudSynced: true,
            },
            sortMs: d.updatedAt ? formatTimestampLabel(d.updatedAt).ms : 0,
          };
        })
        .sort((a, b) => b.sortMs - a.sortMs)
        .map((entry) => entry.record);
      onData(list);
    },
    (error) => {
      console.error('[FitnessDreams] Error suscripción authorizedStaff:', error);
    }
  );
}

export async function addAuthorizedStaffEmail(params: {
  email: string;
  label: string;
  role: AuthorizedStaffRole;
  addedByUid: string;
}): Promise<AuthorizedStaffRecord> {
  const cleanEmail = normalizeStaffEmail(params.email);
  if (!isValidStaffEmail(cleanEmail)) {
    throw new Error('Escribe un correo electrónico válido (ej. fitnessdream@gmail.com).');
  }
  const staffId = emailToStaffDocId(cleanEmail);
  const cleanLabel = clampText(params.label, 80, 'Cuenta del Gimnasio');
  const cleanRole: AuthorizedStaffRole =
    params.role === 'gym-main' || params.role === 'owner' || params.role === 'scanner'
      ? params.role
      : 'coach';
  const ref = doc(db, 'authorizedStaff', staffId);

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await withCloudWriteTimeout(
        updateDoc(ref, {
          label: cleanLabel,
          role: cleanRole,
          updatedAt: serverTimestamp(),
        }),
        'actualizar el correo autorizado'
      );
    } else {
      await withCloudWriteTimeout(
        setDoc(ref, {
          staffId,
          email: cleanEmail,
          label: cleanLabel,
          role: cleanRole,
          addedByUid: sanitizeId(params.addedByUid),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        'guardar el correo autorizado'
      );
    }
    return {
      staffId,
      email: cleanEmail,
      label: cleanLabel,
      role: cleanRole,
      addedByUid: sanitizeId(params.addedByUid),
      isCloudSynced: true,
    };
  } catch (error) {
    throw new Error(formatFirestoreErrorMessage(error, 'autorizar el correo en la nube'));
  }
}

export async function removeAuthorizedStaffEmail(staffId: string): Promise<void> {
  const cleanId = sanitizeId(staffId);
  try {
    await withCloudWriteTimeout(
      deleteDoc(doc(db, 'authorizedStaff', cleanId)),
      'quitar el correo autorizado'
    );
  } catch (error) {
    throw new Error(formatFirestoreErrorMessage(error, 'quitar el correo autorizado'));
  }
}

/**
 * Ensures a signed-in Google user has a synced real member record in Firestore
 * (plus PII-isolated contact doc in /members/{uid}/private/contact).
 */
export async function upsertSignedInMemberProfile(
  user: User,
  profileInput: {
    name: string;
    email: string;
    phone: string;
    goal: string;
    tier: 'Socio Fundador' | 'Socio Club';
  }
): Promise<LiveGymMember> {
  const uid = sanitizeId(user.uid);
  const memberRef = doc(db, 'members', uid);
  const privateRef = doc(db, 'members', uid, 'private', 'contact');
  const memberPath = `members/${uid}`;

  try {
    const existingSnap = await getDoc(memberRef);
    const cleanName = clampText(profileInput.name || user.displayName || 'Socio FitnessDreams', 100, 'Socio FitnessDreams');
    const cleanGoal = clampText(profileInput.goal || 'Hipertrofia y Fuerza', 120, 'Hipertrofia y Fuerza');
    const cleanTier: 'Socio Fundador' | 'Socio Club' =
      profileInput.tier === 'Socio Club' ? 'Socio Club' : 'Socio Fundador';
    const cleanEmail = clampText(profileInput.email || user.email || '', 160);
    const cleanPhone = clampText(profileInput.phone || 'Sin teléfono', 32);

    if (!existingSnap.exists()) {
      const memberCode = generateMemberCodeFromUid(uid);
      const monthlyFee = cleanTier === 'Socio Fundador' ? 34.9 : 46.9;

      // 1. Write the main /members/{uid} document first so it can never be rolled back by PII subdoc writes
      await withCloudWriteTimeout(
        setDoc(memberRef, {
          uid,
          memberCode,
          name: cleanName,
          tier: cleanTier,
          goal: cleanGoal,
          feeStatus: 'al-dia',
          monthlyFee,
          streakDays: 1,
          totalCheckIns: 0,
          lastCheckInLabel: 'Recién registrado',
          daysSinceLastVisit: 0,
          outreachStatus: 'pendiente',
          assignedCoach: 'Javi Busta',
          isRealMember: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        'registrar tu ficha de socio'
      );

      // 2. Write isolated PII contact subdocument (non-blocking if rules/network reject subdoc)
      try {
        await withCloudWriteTimeout(
          setDoc(privateRef, {
            uid,
            email: cleanEmail,
            phone: cleanPhone,
            updatedAt: serverTimestamp(),
          }),
          'guardar contacto privado',
          5000
        );
      } catch (contactErr) {
        console.warn('[FitnessDreams] Aviso guardando contacto privado de socio:', contactErr);
      }

      return {
        id: uid,
        uid,
        memberCode,
        name: cleanName,
        tier: cleanTier,
        goal: cleanGoal,
        feeStatus: 'al-dia',
        monthlyFee,
        streakDays: 1,
        totalCheckIns: 0,
        lastCheckInLabel: 'Recién registrado',
        daysSinceLastVisit: 0,
        outreachStatus: 'pendiente',
        assignedCoach: 'Javi Busta',
        isRealMember: true,
        email: cleanEmail,
        phone: cleanPhone,
      };
    }

    // Update only Tier-2 allowed profile fields so member never touches feeStatus
    await withCloudWriteTimeout(
      updateDoc(memberRef, {
        name: cleanName,
        goal: cleanGoal,
        tier: cleanTier,
        updatedAt: serverTimestamp(),
      }),
      'actualizar tu perfil de socio'
    );
    try {
      const existingPrivate = await getDoc(privateRef);
      if (existingPrivate.exists()) {
        await withCloudWriteTimeout(
          updateDoc(privateRef, {
            email: cleanEmail,
            phone: cleanPhone,
            updatedAt: serverTimestamp(),
          }),
          'actualizar contacto privado',
          5000
        );
      } else {
        await withCloudWriteTimeout(
          setDoc(privateRef, {
            uid,
            email: cleanEmail,
            phone: cleanPhone,
            updatedAt: serverTimestamp(),
          }),
          'guardar contacto privado',
          5000
        );
      }
    } catch (contactErr) {
      console.warn('[FitnessDreams] Aviso actualizando contacto privado:', contactErr);
    }

    const data = existingSnap.data();
    return {
      id: uid,
      uid,
      memberCode: String(data.memberCode ?? generateMemberCodeFromUid(uid)),
      name: cleanName,
      tier: cleanTier,
      goal: cleanGoal,
      feeStatus: normalizeFeeStatus(data.feeStatus),
      monthlyFee: Number(data.monthlyFee ?? 34.9),
      streakDays: Number(data.streakDays ?? 1),
      totalCheckIns: Number(data.totalCheckIns ?? 0),
      lastCheckInLabel: String(data.lastCheckInLabel ?? 'Activo'),
      daysSinceLastVisit: Number(data.daysSinceLastVisit ?? 0),
      outreachStatus: (data.outreachStatus as LiveGymMember['outreachStatus']) ?? 'pendiente',
      assignedCoach: String(data.assignedCoach ?? 'Javi Busta'),
      isRealMember: Boolean(data.isRealMember ?? true),
      email: cleanEmail,
      phone: cleanPhone,
    };
  } catch (error) {
    console.error(`[FitnessDreams] Error guardando socio en ${memberPath}:`, error);
    throw new Error(formatFirestoreErrorMessage(error, 'guardar tu perfil de socio'));
  }
}

/**
 * Reception PC / Coach Portal quick-add for real clients (writes /members/{walkinId} directly first,
 * verifies server persistence, then writes private/contact separately so nothing can roll back the member).
 */
export async function createWalkInPilotMember(input: {
  name: string;
  phone: string;
  email?: string;
  tier: 'Socio Fundador' | 'Socio Club';
  feeStatus: FeeStatus;
  assignedCoach: string;
}): Promise<LiveGymMember> {
  const memberId = sanitizeId(`pilot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const memberCode = generateMemberCodeFromUid(memberId);
  const cleanName = clampText(input.name, 100, 'Cliente Prueba');
  const cleanPhone = clampText(input.phone, 32, '600 000 000');
  const cleanEmail = clampText(input.email ?? '', 160);
  const cleanTier = input.tier === 'Socio Club' ? 'Socio Club' : 'Socio Fundador';
  const monthlyFee = cleanTier === 'Socio Fundador' ? 34.9 : 46.9;
  const cleanCoach = clampText(input.assignedCoach || 'Javi Busta', 60, 'Javi Busta');
  const feeStatus = normalizeFeeStatus(input.feeStatus);

  const memberRef = doc(db, 'members', memberId);
  const privateRef = doc(db, 'members', memberId, 'private', 'contact');

  try {
    // 1. Write the main member document directly (no writeBatch / existsAfter failure risk)
    await withCloudWriteTimeout(
      setDoc(memberRef, {
        uid: memberId,
        memberCode,
        name: cleanName,
        tier: cleanTier,
        goal: 'Alta en recepción',
        feeStatus,
        monthlyFee,
        streakDays: 0,
        totalCheckIns: 0,
        lastCheckInLabel: 'Alta en mostrador',
        daysSinceLastVisit: 0,
        outreachStatus: 'pendiente',
        assignedCoach: cleanCoach,
        isRealMember: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      'dar de alta al nuevo socio'
    );

    // 2. Verify document actually persisted on Firestore servers
    const verifiedSnap = await getDocFromServer(memberRef);
    if (!verifiedSnap.exists()) {
      throw new Error('La nube no confirmó el alta del socio. Revisa tu conexión e inténtalo de nuevo.');
    }

    // 3. Persist private contact details separately (never rolls back the member doc)
    try {
      await withCloudWriteTimeout(
        setDoc(privateRef, {
          uid: memberId,
          email: cleanEmail,
          phone: cleanPhone,
          updatedAt: serverTimestamp(),
        }),
        'guardar contacto privado del alta',
        5000
      );
    } catch (contactErr) {
      console.warn('[FitnessDreams] Aviso guardando contacto privado del alta:', contactErr);
    }

    return {
      id: memberId,
      uid: memberId,
      memberCode,
      name: cleanName,
      tier: cleanTier,
      goal: 'Alta en recepción',
      feeStatus,
      monthlyFee,
      streakDays: 0,
      totalCheckIns: 0,
      lastCheckInLabel: 'Alta en mostrador',
      daysSinceLastVisit: 0,
      outreachStatus: 'pendiente',
      assignedCoach: cleanCoach,
      isRealMember: true,
      email: cleanEmail,
      phone: cleanPhone,
    };
  } catch (error) {
    console.error(`[FitnessDreams] Error creando socio walk-in en members/${memberId}:`, error);
    throw new Error(formatFirestoreErrorMessage(error, 'guardar el nuevo socio'));
  }
}

/**
 * Reception PC 1-click fee status toggle (Al día <-> Cuota pendiente).
 * Updates Firestore immediately so client phones & the spare QR scanner phone see it in real time.
 */
export async function setLiveMemberFeeStatus(memberId: string, feeStatus: FeeStatus): Promise<void> {
  const cleanId = sanitizeId(memberId);
  try {
    await withCloudWriteTimeout(
      updateDoc(doc(db, 'members', cleanId), {
        feeStatus: normalizeFeeStatus(feeStatus),
        updatedAt: serverTimestamp(),
      }),
      'cambiar el estado de cuota'
    );
  } catch (error) {
    throw new Error(formatFirestoreErrorMessage(error, 'cambiar el estado de cuota'));
  }
}

/**
 * Validates a scanned QR code against live Firestore (or local demo fallback when offline/demo),
 * writes an immutable /accessLogs entry, and increments check-in stats when allowed.
 */
export async function verifyAndLogTurnstileScan(params: {
  rawQr: string;
  scannerLabel: string;
  scannerUser: User | null;
  isLiveAdmin: boolean;
  localFallbackMembers: LiveGymMember[];
}): Promise<TurnstileScanOutcome> {
  const now = new Date();
  const scannedAtLabel = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const parsed = parseMemberQrPayload(params.rawQr);
  if (!parsed.valid) {
    return {
      found: false,
      allowed: false,
      status: 'unknown_qr',
      title: 'QR NO RECONOCIDO',
      message: 'Este código no pertenece a un Pase QR oficial de FitnessDreams.',
      memberName: 'Código desconocido',
      memberCode: params.rawQr.slice(0, 24) || '—',
      scannedAtLabel,
    };
  }

  let matchedMember: LiveGymMember | null = null;
  let cameFromFirestore = false;

  // 1. Live Firestore lookup when authenticated as admin/scanner
  if (params.scannerUser && params.isLiveAdmin) {
    // 1a. Direct document lookup from server first (guarantees fresh feeStatus, zero index needed)
    if (parsed.memberId && parsed.memberId !== 'current-user') {
      try {
        const ref = doc(db, 'members', sanitizeId(parsed.memberId));
        let snap;
        try {
          snap = await getDocFromServer(ref);
        } catch {
          snap = await getDoc(ref);
        }
        if (snap.exists()) {
          const d = snap.data();
          matchedMember = {
            id: snap.id,
            uid: String(d.uid ?? snap.id),
            memberCode: String(d.memberCode ?? 'FD-0001'),
            name: String(d.name ?? 'Socio'),
            tier: d.tier === 'Socio Club' ? 'Socio Club' : 'Socio Fundador',
            goal: String(d.goal ?? ''),
            feeStatus: normalizeFeeStatus(d.feeStatus),
            monthlyFee: Number(d.monthlyFee ?? 34.9),
            streakDays: Number(d.streakDays ?? 0),
            totalCheckIns: Number(d.totalCheckIns ?? 0),
            lastCheckInLabel: String(d.lastCheckInLabel ?? ''),
            daysSinceLastVisit: Number(d.daysSinceLastVisit ?? 0),
            outreachStatus: (d.outreachStatus as LiveGymMember['outreachStatus']) ?? 'pendiente',
            assignedCoach: String(d.assignedCoach ?? 'Javi Busta'),
            isRealMember: Boolean(d.isRealMember ?? true),
          };
          cameFromFirestore = true;
        }
      } catch (error) {
        console.warn('[FitnessDreams] Aviso en lectura directa QR por UID:', error);
      }
    }

    // 1b. Live full-collection server lookup by ID/UID/memberCode (works on Firestore Enterprise without manual indexes)
    if (!matchedMember) {
      try {
        const serverMembers = await fetchAllLiveMembersFromServer();
        const foundInServer = matchMemberForQrPayload(parsed, serverMembers);
        if (foundInServer) {
          matchedMember = foundInServer;
          cameFromFirestore = true;
        }
      } catch (error) {
        console.warn('[FitnessDreams] Aviso consultando directorio de socios en servidor para QR:', error);
      }
    }
  }

  // 2. Fallback to already-synced members in memory (liveMembers when connected, or local demo when offline)
  if (!matchedMember) {
    matchedMember = matchMemberForQrPayload(parsed, params.localFallbackMembers);
    if (matchedMember && params.scannerUser && params.isLiveAdmin) {
      cameFromFirestore = !matchedMember.id.startsWith('demo_') && !matchedMember.id.startsWith('local_');
    }
  }

  if (!matchedMember) {
    if (!params.isLiveAdmin) {
      return {
        found: false,
        allowed: false,
        status: 'scanner_not_connected',
        title: 'LECTOR SIN CONECTAR A RECEPCIÓN',
        message: params.scannerUser
          ? `Has entrado con ${params.scannerUser.email ?? 'una cuenta de socio'}, que no tiene permisos de lector. Pulsa "Cambiar cuenta" arriba y entra con fitnessdreamsbenidorm@gmail.com o joseundergroundbnd@gmail.com.`
          : 'Este móvil lector está en modo prueba local y no puede consultar a los socios reales. Pulsa arriba "Entrar: fitnessdreamsbenidorm@gmail.com" o "joseundergroundbnd@gmail.com" para validarlo.',
        memberName: params.scannerUser ? 'Cuenta sin permisos de torno' : 'Modo prueba local',
        memberCode: parsed.memberCode ?? parsed.memberId ?? '—',
        scannedAtLabel,
      };
    }

    return {
      found: false,
      allowed: false,
      status: 'unknown_qr',
      title: 'SOCIO NO ENCONTRADO',
      message: `No existe ningún socio activo en la nube con el código ${parsed.memberCode ?? parsed.memberId}. Pide al socio que actualice su app y comprueba que esté conectado con Google.`,
      memberName: 'No registrado',
      memberCode: parsed.memberCode ?? parsed.memberId ?? '—',
      scannedAtLabel,
    };
  }

  const evaluation = evaluateTurnstileAccess(matchedMember.feeStatus);

  // 3. Persist immutable access log & update check-in stats in Firestore when live (non-fatal so alarm ALWAYS renders)
  if (cameFromFirestore && params.scannerUser && params.isLiveAdmin) {
    const logId = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    const scannerUid = sanitizeId(params.scannerUser.uid);
    const logRef = doc(db, 'accessLogs', logId);
    const memberRef = doc(db, 'members', sanitizeId(matchedMember.id));

    try {
      const batch = writeBatch(db);
      batch.set(logRef, {
        memberId: sanitizeId(matchedMember.id),
        memberUid: sanitizeId(matchedMember.uid),
        memberName: clampText(matchedMember.name, 100, 'Socio'),
        memberCode: sanitizeMemberCode(matchedMember.memberCode),
        feeStatus: matchedMember.feeStatus,
        allowed: evaluation.allowed,
        reason: clampText(evaluation.title, 200),
        scannerLabel: clampText(params.scannerLabel, 80, 'Móvil Lector Torno'),
        scannedByUid: scannerUid,
        createdAt: serverTimestamp(),
      });

      if (evaluation.allowed) {
        batch.update(memberRef, {
          daysSinceLastVisit: 0,
          streakDays: matchedMember.streakDays + 1,
          totalCheckIns: matchedMember.totalCheckIns + 1,
          lastCheckInLabel: clampText(`Hoy ${scannedAtLabel}`, 64),
          outreachStatus: matchedMember.outreachStatus === 'contactado' ? 'reactivado' : matchedMember.outreachStatus,
          updatedAt: serverTimestamp(),
        });
      }

      await withCloudWriteTimeout(batch.commit(), 'registrar paso en el torno', 6000);
    } catch (error) {
      console.warn(`[FitnessDreams] Aviso guardando historial de acceso ${logId}:`, error);
    }
  }

  return {
    found: true,
    allowed: evaluation.allowed,
    status: evaluation.status,
    title: evaluation.title,
    message: evaluation.message,
    memberName: matchedMember.name,
    memberCode: matchedMember.memberCode,
    tier: matchedMember.tier,
    feeStatus: matchedMember.feeStatus,
    streakDays: evaluation.allowed ? matchedMember.streakDays + 1 : matchedMember.streakDays,
    scannedAtLabel,
  };
}

/**
 * Publishes an official routine from Javi or Joel to Firestore so real client phones get it live.
 */
export async function publishLiveRoutine(params: {
  authorUid: string;
  targetMemberId: string;
  targetMemberName?: string;
  targetMemberCode?: string;
  title: string;
  frequency: 'Diaria' | 'Semanal' | 'Mensual' | 'Trimestral';
  dayLabel: string;
  coachId: string;
  coachName: string;
  coachRole: string;
  goal: string;
  coachMessage: string;
  machineCodes: string[];
  exercises?: import('../types/gym').CoachRoutineExercise[];
  cardioBlock?: import('../types/gym').CoachRoutineCardioBlock;
}): Promise<void> {
  const routineId = sanitizeId(`rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const safeCodes = params.machineCodes
    .map((c) => c.trim().slice(0, 32))
    .filter(Boolean)
    .slice(0, 20);
  if (safeCodes.length === 0) return;

  const validFrequency: 'Diaria' | 'Semanal' | 'Mensual' | 'Trimestral' =
    params.frequency === 'Semanal' ||
    params.frequency === 'Mensual' ||
    params.frequency === 'Trimestral'
      ? params.frequency
      : 'Diaria';

  const payload: Record<string, unknown> = {
    targetMemberId: sanitizeId(params.targetMemberId || 'all'),
    title: clampText(params.title, 120, 'Rutina FitnessDreams'),
    frequency: validFrequency,
    dayLabel: clampText(params.dayLabel, 80, 'Hoy'),
    coachId: sanitizeId(params.coachId),
    coachName: clampText(params.coachName, 80, 'Javi Busta'),
    coachRole: clampText(params.coachRole, 100, 'Coach FitnessDreams'),
    goal: clampText(params.goal, 120, 'Fuerza y constancia'),
    coachMessage: clampText(params.coachMessage, 600, '¡A por todas hoy!'),
    machineCodes: safeCodes,
    createdByUid: sanitizeId(params.authorUid),
    createdAt: serverTimestamp(),
  };

  if (params.targetMemberName) {
    payload.targetMemberName = clampText(params.targetMemberName, 100);
  }
  if (params.targetMemberCode) {
    payload.targetMemberCode = clampText(params.targetMemberCode, 32);
  }
  if (params.exercises && params.exercises.length > 0) {
    payload.exercises = params.exercises.slice(0, 20).map((ex) => {
      const cleanEx: Record<string, unknown> = {
        machineCode: clampText(ex.machineCode, 32, '4SHP01/0'),
        targetSets: Math.min(10, Math.max(1, Math.round(ex.targetSets || 4))),
        repScheme: ex.repScheme === 'piramide' ? 'piramide' : 'fijas',
        targetReps: clampText(ex.targetReps, 40, '10-12'),
        suggestedWeightKg: Math.max(0, Number(ex.suggestedWeightKg ?? 0)),
        restSeconds: Math.min(600, Math.max(15, Math.round(ex.restSeconds || 90))),
      };
      if (ex.exerciseName) cleanEx.exerciseName = clampText(ex.exerciseName, 100);
      if (ex.muscleGroup) cleanEx.muscleGroup = clampText(ex.muscleGroup, 40);
      if (ex.equipmentType) cleanEx.equipmentType = clampText(ex.equipmentType, 40);
      if (ex.pyramidPreset) cleanEx.pyramidPreset = ex.pyramidPreset;
      if (ex.pyramidSets && ex.pyramidSets.length > 0) {
        cleanEx.pyramidSets = ex.pyramidSets.slice(0, 10).map((ps) => ({
          setNumber: Math.min(10, Math.max(1, Math.round(ps.setNumber))),
          reps: Math.min(100, Math.max(1, Math.round(ps.reps))),
          weightKg: Math.max(0, Number(ps.weightKg ?? 0)),
        }));
      }
      if (ex.intensityLabel) cleanEx.intensityLabel = clampText(ex.intensityLabel, 60);
      if (ex.note) cleanEx.note = clampText(ex.note, 200);
      return cleanEx;
    });
  }
  if (params.cardioBlock?.enabled) {
    const cardioPayload: Record<string, unknown> = {
      enabled: true,
      machineCode: clampText(params.cardioBlock.machineCode, 32, '4HP4TN'),
      machineName: clampText(params.cardioBlock.machineName, 100, 'Cinta de Correr Health'),
      durationMin: Math.min(180, Math.max(1, Math.round(params.cardioBlock.durationMin || 20))),
      intensityLabel: clampText(params.cardioBlock.intensityLabel, 80, 'Zona 2 · Moderada'),
    };
    if (params.cardioBlock.note) {
      cardioPayload.note = clampText(params.cardioBlock.note, 200);
    }
    payload.cardioBlock = cardioPayload;
  }

  try {
    await withCloudWriteTimeout(
      setDoc(doc(db, 'coachRoutines', routineId), payload),
      'enviar la rutina a la nube'
    );
  } catch (error) {
    console.error(`[FitnessDreams] Error publicando rutina coachRoutines/${routineId}:`, error);
    throw new Error(formatFirestoreErrorMessage(error, 'enviar la rutina'));
  }
}

/**
 * Sends a real-time text or short audio message between a member and Javi/Joel.
 */
export async function sendLiveMessage(params: {
  id?: string;
  authorUid: string;
  coachId: string;
  memberId: string;
  senderRole: 'socio' | 'coach';
  senderName: string;
  kind: 'text' | 'audio';
  text?: string;
  audioDataUrl?: string;
  audioDurationSec?: number;
}): Promise<void> {
  const msgId = sanitizeId(
    params.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  );
  const payload: Record<string, unknown> = {
    coachId: sanitizeId(params.coachId),
    memberId: sanitizeId(params.memberId),
    senderRole: params.senderRole === 'coach' ? 'coach' : 'socio',
    senderName: clampText(params.senderName, 100, 'Socio'),
    kind: params.kind === 'audio' ? 'audio' : 'text',
    authorUid: sanitizeId(params.authorUid),
    createdAt: serverTimestamp(),
  };

  if (params.text !== undefined && params.text.trim().length > 0) {
    payload.text = clampText(params.text, 1000);
  }
  if (params.kind === 'audio') {
    if (!params.audioDataUrl || !params.audioDataUrl.startsWith('data:audio')) {
      throw new Error(
        'No se capturó audio del micrófono. Permite el acceso al micrófono en tu navegador e inténtalo de nuevo.'
      );
    }
    if (params.audioDataUrl.length > 350000) {
      throw new Error(
        'La nota de voz supera el tamaño máximo en la nube (máx. 45 segundos). Graba un audio más breve.'
      );
    }
    payload.audioDataUrl = params.audioDataUrl;
    payload.audioDurationSec = Math.min(120, Math.max(1, Math.round(Number(params.audioDurationSec ?? 5))));
  }

  try {
    await withCloudWriteTimeout(
      setDoc(doc(db, 'directMessages', msgId), payload),
      params.kind === 'audio' ? 'enviar el audio' : 'enviar el mensaje'
    );
  } catch (error) {
    console.error('[FitnessDreams] Error enviando mensaje a Firestore:', error);
    const rawMsg = error instanceof Error ? error.message : String(error);
    if (rawMsg.toLowerCase().includes('permission')) {
      throw new Error(
        params.senderRole === 'coach'
          ? 'Permiso denegado en la nube: conecta una cuenta de Google autorizada de Coach/Gimnasio para enviar mensajes a socios.'
          : 'Permiso denegado en la nube: vuelve a iniciar sesión con tu cuenta de Google verificada para enviar mensajes a tu Coach.'
      );
    }
    throw new Error(
      formatFirestoreErrorMessage(
        error,
        params.kind === 'audio' ? 'enviar el audio' : 'enviar el mensaje'
      )
    );
  }
}

export function subscribeLiveMemberSelf(
  uid: string,
  onData: (member: LiveGymMember | null) => void
): Unsubscribe {
  const cleanUid = sanitizeId(uid);
  const path = `members/${cleanUid}`;
  return onSnapshot(
    doc(db, 'members', cleanUid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const d = snap.data();
      onData({
        id: snap.id,
        uid: String(d.uid ?? snap.id),
        memberCode: String(d.memberCode ?? generateMemberCodeFromUid(cleanUid)),
        name: String(d.name ?? 'Socio'),
        tier: d.tier === 'Socio Club' ? 'Socio Club' : 'Socio Fundador',
        goal: String(d.goal ?? ''),
        feeStatus: normalizeFeeStatus(d.feeStatus),
        monthlyFee: Number(d.monthlyFee ?? 34.9),
        streakDays: Number(d.streakDays ?? 0),
        totalCheckIns: Number(d.totalCheckIns ?? 0),
        lastCheckInLabel: String(d.lastCheckInLabel ?? ''),
        daysSinceLastVisit: Number(d.daysSinceLastVisit ?? 0),
        outreachStatus: (d.outreachStatus as LiveGymMember['outreachStatus']) ?? 'pendiente',
        assignedCoach: String(d.assignedCoach ?? 'Javi Busta'),
        isRealMember: Boolean(d.isRealMember ?? true),
      });
    },
    (error) => {
      console.error(`[FitnessDreams] Error suscripción ${path}:`, error);
    }
  );
}

/**
 * Direct server-first fetch of all /members documents (bypasses stalled WebChannel listeners or local cache).
 */
export async function fetchAllLiveMembersFromServer(): Promise<LiveGymMember[]> {
  const q = query(collection(db, 'members'), limit(200));
  try {
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs
      .map(mapMemberDocToLiveGymMember)
      .sort((a, b) => b.sortMs - a.sortMs)
      .map((entry) => entry.member);
  } catch (error) {
    console.error('[FitnessDreams] Error leyendo socios desde servidor:', error);
    throw new Error(formatFirestoreErrorMessage(error, 'leer los socios de la nube'));
  }
}

export function subscribeAllLiveMembers(
  onData: (members: LiveGymMember[]) => void,
  onError?: (errorMessage: string) => void
): Unsubscribe {
  const path = 'members';
  const q = query(collection(db, path), limit(200));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map(mapMemberDocToLiveGymMember)
        .sort((a, b) => b.sortMs - a.sortMs)
        .map((entry) => entry.member);
      onData(list);
    },
    (error) => {
      console.error('[FitnessDreams] Error suscripción directorio de socios:', error);
      onError?.(formatFirestoreErrorMessage(error, 'sincronizar la lista de socios'));
    }
  );
}

export function subscribeLiveAccessLogs(
  isAdminUser: boolean,
  uid: string,
  onData: (logs: LiveAccessLog[]) => void
): Unsubscribe {
  const path = 'accessLogs';
  const q = isAdminUser
    ? query(collection(db, path), limit(60))
    : query(collection(db, path), where('memberUid', '==', sanitizeId(uid)), limit(25));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: LiveAccessLog[] = snapshot.docs
        .map((snap) => {
          const d = snap.data();
          const ts = formatTimestampLabel(d.createdAt);
          return {
            id: snap.id,
            memberId: String(d.memberId ?? ''),
            memberUid: String(d.memberUid ?? ''),
            memberName: String(d.memberName ?? 'Socio'),
            memberCode: String(d.memberCode ?? '—'),
            feeStatus: normalizeFeeStatus(d.feeStatus),
            allowed: Boolean(d.allowed),
            reason: String(d.reason ?? ''),
            scannerLabel: String(d.scannerLabel ?? 'Lector Torno'),
            scannedByUid: String(d.scannedByUid ?? ''),
            createdAtLabel: ts.label,
            createdAtMs: ts.ms,
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, 40);
      onData(list);
    },
    (error) => {
      console.error('[FitnessDreams] Error suscripción accessLogs:', error);
    }
  );
}

export function subscribeLiveRoutines(
  isAdminUser: boolean,
  uid: string,
  onData: (routines: LiveCoachRoutineDoc[]) => void
): Unsubscribe {
  const path = 'coachRoutines';
  const q = isAdminUser
    ? query(collection(db, path), limit(50))
    : query(collection(db, path), where('targetMemberId', 'in', ['all', sanitizeId(uid)]), limit(35));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: LiveCoachRoutineDoc[] = snapshot.docs
        .map((snap) => {
          const d = snap.data();
          const ts = formatTimestampLabel(d.createdAt);
          const freq: LiveCoachRoutineDoc['frequency'] =
            d.frequency === 'Semanal' || d.frequency === 'Mensual' || d.frequency === 'Trimestral'
              ? d.frequency
              : 'Diaria';
          return {
            routine: {
              id: snap.id,
              targetMemberId: String(d.targetMemberId ?? 'all'),
              targetMemberName: typeof d.targetMemberName === 'string' ? d.targetMemberName : undefined,
              targetMemberCode: typeof d.targetMemberCode === 'string' ? d.targetMemberCode : undefined,
              title: String(d.title ?? 'Rutina Coach'),
              frequency: freq,
              dayLabel: String(d.dayLabel ?? 'En directo'),
              coachId: String(d.coachId ?? 'coach-javi'),
              coachName: String(d.coachName ?? 'Javi Busta'),
              coachRole: String(d.coachRole ?? 'Coach'),
              goal: String(d.goal ?? ''),
              coachMessage: String(d.coachMessage ?? ''),
              machineCodes: Array.isArray(d.machineCodes) ? d.machineCodes.map(String) : [],
              exercises: Array.isArray(d.exercises)
                ? (d.exercises as import('../types/gym').CoachRoutineExercise[])
                : undefined,
              cardioBlock:
                d.cardioBlock && typeof d.cardioBlock === 'object'
                  ? (d.cardioBlock as import('../types/gym').CoachRoutineCardioBlock)
                  : undefined,
              createdByUid: String(d.createdByUid ?? ''),
              createdAtLabel: ts.label,
            },
            sortMs: ts.ms,
          };
        })
        .sort((a, b) => b.sortMs - a.sortMs)
        .map((entry) => entry.routine)
        .slice(0, 25);
      onData(list);
    },
    (error) => {
      console.error('[FitnessDreams] Error suscripción coachRoutines:', error);
    }
  );
}

export function subscribeLiveMessages(
  isAdminUser: boolean,
  uid: string,
  onData: (messages: LiveDirectMessageDoc[]) => void,
  onError?: (errorMessage: string) => void
): Unsubscribe {
  const path = 'directMessages';
  const q = isAdminUser
    ? query(collection(db, path), limit(150))
    : query(collection(db, path), where('memberId', '==', sanitizeId(uid)), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: LiveDirectMessageDoc[] = snapshot.docs
        .map((snap) => {
          const d = snap.data();
          const ts = formatTimestampLabel(d.createdAt);
          return {
            id: snap.id,
            coachId: String(d.coachId ?? 'coach-javi'),
            memberId: String(d.memberId ?? ''),
            senderRole: (d.senderRole === 'coach' ? 'coach' : 'socio') as 'socio' | 'coach',
            senderName: String(d.senderName ?? 'Socio'),
            kind: (d.kind === 'audio' ? 'audio' : 'text') as 'text' | 'audio',
            text: typeof d.text === 'string' ? d.text : undefined,
            audioDataUrl: typeof d.audioDataUrl === 'string' ? d.audioDataUrl : undefined,
            audioDurationSec:
              typeof d.audioDurationSec === 'number' ? d.audioDurationSec : undefined,
            authorUid: String(d.authorUid ?? ''),
            timestampLabel: `Hoy, ${ts.label.slice(0, 5)}`,
            createdAtMs: ts.ms,
          };
        })
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(list);
    },
    (error) => {
      console.error('[FitnessDreams] Error suscripción mensajes:', error);
      onError?.(formatFirestoreErrorMessage(error, 'sincronizar los mensajes'));
    }
  );
}
