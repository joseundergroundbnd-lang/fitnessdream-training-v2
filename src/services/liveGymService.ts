import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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
  status: 'granted' | 'blocked_fee_overdue' | 'unknown_qr';
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

export function subscribeAuthorizedStaff(
  onData: (staff: AuthorizedStaffRecord[]) => void
): Unsubscribe {
  const path = 'authorizedStaff';
  const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(30));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AuthorizedStaffRecord[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        const role: AuthorizedStaffRole =
          d.role === 'gym-main' || d.role === 'owner' || d.role === 'scanner'
            ? d.role
            : 'coach';
        return {
          staffId: snap.id,
          email: String(d.email ?? ''),
          label: String(d.label ?? 'Cuenta autorizada'),
          role,
          addedByUid: String(d.addedByUid ?? ''),
          isCloudSynced: true,
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
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
      await updateDoc(ref, {
        label: cleanLabel,
        role: cleanRole,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        staffId,
        email: cleanEmail,
        label: cleanLabel,
        role: cleanRole,
        addedByUid: sanitizeId(params.addedByUid),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
    handleFirestoreError(error, OperationType.WRITE, `authorizedStaff/${staffId}`);
  }
}

export async function removeAuthorizedStaffEmail(staffId: string): Promise<void> {
  const cleanId = sanitizeId(staffId);
  try {
    await deleteDoc(doc(db, 'authorizedStaff', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `authorizedStaff/${cleanId}`);
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
      const batch = writeBatch(db);
      batch.set(memberRef, {
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
      });
      batch.set(privateRef, {
        uid,
        email: cleanEmail,
        phone: cleanPhone,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

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
    const batch = writeBatch(db);
    batch.update(memberRef, {
      name: cleanName,
      goal: cleanGoal,
      tier: cleanTier,
      updatedAt: serverTimestamp(),
    });
    batch.set(
      privateRef,
      {
        uid,
        email: cleanEmail,
        phone: cleanPhone,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();

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
    const rawMsg = error instanceof Error ? error.message : String(error);
    if (rawMsg.toLowerCase().includes('permission')) {
      throw new Error(
        'Permiso denegado al guardar tu perfil en la nube. Vuelve a iniciar sesión con una cuenta de Google verificada e inténtalo de nuevo.'
      );
    }
    throw new Error(`No se pudo guardar el socio en la nube (${rawMsg}). Revisa tu conexión e inténtalo de nuevo.`);
  }
}

/**
 * Reception PC quick-add for real pilot test clients (creates /members/{walkinId} + private/contact).
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
    const batch = writeBatch(db);
    batch.set(memberRef, {
      uid: memberId,
      memberCode,
      name: cleanName,
      tier: cleanTier,
      goal: 'Prueba piloto en sala',
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
    });
    batch.set(privateRef, {
      uid: memberId,
      email: cleanEmail,
      phone: cleanPhone,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    return {
      id: memberId,
      uid: memberId,
      memberCode,
      name: cleanName,
      tier: cleanTier,
      goal: 'Prueba piloto en sala',
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
    const rawMsg = error instanceof Error ? error.message : String(error);
    if (rawMsg.toLowerCase().includes('permission')) {
      throw new Error(
        'Permiso denegado en la nube: conecta una cuenta de Google autorizada del gimnasio/coach para dar de alta socios en la nube.'
      );
    }
    throw new Error(`No se pudo guardar el nuevo socio en la nube (${rawMsg}). Revisa tu conexión e inténtalo de nuevo.`);
  }
}

/**
 * Reception PC 1-click fee status toggle (Al día <-> Cuota pendiente).
 * Updates Firestore immediately so client phones & the spare QR scanner phone see it in real time.
 */
export async function setLiveMemberFeeStatus(memberId: string, feeStatus: FeeStatus): Promise<void> {
  const cleanId = sanitizeId(memberId);
  const path = `members/${cleanId}`;
  try {
    await updateDoc(doc(db, 'members', cleanId), {
      feeStatus: normalizeFeeStatus(feeStatus),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
    try {
      if (parsed.memberId) {
        const snap = await getDoc(doc(db, 'members', sanitizeId(parsed.memberId)));
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
      }

      if (!matchedMember && parsed.memberCode) {
        const q = query(
          collection(db, 'members'),
          where('memberCode', '==', sanitizeMemberCode(parsed.memberCode)),
          limit(1)
        );
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          const snap = qSnap.docs[0];
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
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'members');
    }
  }

  // 2. Fallback to local state members (for instant demo testing before Google sign-in)
  if (!matchedMember) {
    matchedMember =
      params.localFallbackMembers.find(
        (m) =>
          (parsed.memberId && (m.id === parsed.memberId || m.uid === parsed.memberId)) ||
          (parsed.memberCode &&
            sanitizeMemberCode(m.memberCode) === sanitizeMemberCode(parsed.memberCode))
      ) ?? null;
  }

  if (!matchedMember) {
    return {
      found: false,
      allowed: false,
      status: 'unknown_qr',
      title: 'SOCIO NO ENCONTRADO',
      message: `No existe ningún socio activo con el código ${parsed.memberCode ?? parsed.memberId}.`,
      memberName: 'No registrado',
      memberCode: parsed.memberCode ?? parsed.memberId ?? '—',
      scannedAtLabel,
    };
  }

  const evaluation = evaluateTurnstileAccess(matchedMember.feeStatus);

  // 3. Persist immutable access log & update check-in stats in Firestore when live
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

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `accessLogs/${logId}`);
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
    await setDoc(doc(db, 'coachRoutines', routineId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `coachRoutines/${routineId}`);
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
    await setDoc(doc(db, 'directMessages', msgId), payload);
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
    throw new Error(`No se pudo enviar a la nube (${rawMsg}). Revisa tu conexión e inténtalo de nuevo.`);
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
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
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
        .map((snap) => {
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
        })
        .sort((a, b) => b.sortMs - a.sortMs)
        .map((entry) => entry.member);
      onData(list);
    },
    (error) => {
      console.error('[FitnessDreams] Error suscripción directorio de socios:', error);
      onError?.(
        error instanceof Error
          ? error.message
          : 'No se pudo sincronizar la base de datos de socios desde la nube.'
      );
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
    ? query(collection(db, path), orderBy('createdAt', 'desc'), limit(40))
    : query(collection(db, path), where('memberUid', '==', sanitizeId(uid)), limit(20));

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
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
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
    ? query(collection(db, path), orderBy('createdAt', 'desc'), limit(25))
    : query(collection(db, path), where('targetMemberId', 'in', ['all', sanitizeId(uid)]), limit(25));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: LiveCoachRoutineDoc[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        const ts = formatTimestampLabel(d.createdAt);
        const freq: LiveCoachRoutineDoc['frequency'] =
          d.frequency === 'Semanal' || d.frequency === 'Mensual' || d.frequency === 'Trimestral'
            ? d.frequency
            : 'Diaria';
        return {
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
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
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
    ? query(collection(db, path), orderBy('createdAt', 'desc'), limit(100))
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
      onError?.(
        error instanceof Error ? error.message : 'No se pudieron sincronizar los mensajes en directo.'
      );
    }
  );
}
