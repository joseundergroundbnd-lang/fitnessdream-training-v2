import type {
  ActiveExercise,
  ChallengeAttempt,
  ClubFriendProfile,
  ClubMemberRecord,
  DailyQuote,
  DirectMessage,
  FeeStatus,
  FriendshipStatus,
  GymClassSession,
  HabitItem,
  MemberProfile,
  PeerChallengeStatus,
  StrengthLiftAttempt,
} from '../types/gym';

/** Standard Iron Captain Olympic plates available in FitnessDreams (kg per plate) */
export const IRON_CAPTAIN_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export interface PlateBreakdown {
  targetKg: number;
  barWeightKg: number;
  achievableKg: number;
  perSide: { plateKg: number; count: number }[];
  remainderKg: number;
}

export interface TurnstileAccessResult {
  allowed: boolean;
  status: 'granted' | 'blocked_fee_overdue';
  title: string;
  message: string;
}

/**
 * Evaluates QR turnstile access based on member fee status.
 * Triggers red alarm denial when membership fee is overdue.
 */
export function evaluateTurnstileAccess(feeStatus: FeeStatus): TurnstileAccessResult {
  if (feeStatus === 'pendiente') {
    return {
      allowed: false,
      status: 'blocked_fee_overdue',
      title: 'ACCESO DENEGADO · CUOTA PENDIENTE',
      message:
        'Tu cuota no está al día y el torno ha bloqueado la entrada. Por favor, acude al mostrador de información para ponerte al día y reactivar tu acceso.',
    };
  }
  return {
    allowed: true,
    status: 'granted',
    title: 'ACCESO AUTORIZADO',
    message: 'Cuota al día verificada. Torno desbloqueado — ¡a construir tu sueño hoy!',
  };
}

/**
 * Calculates the exact Iron Captain plates to load on each side of an Olympic bar.
 */
export function calculateBarbellPlates(
  targetKg: number,
  barWeightKg = 20
): PlateBreakdown {
  const safeTarget = Math.max(barWeightKg, Number.isFinite(targetKg) ? targetKg : barWeightKg);
  const weightToLoad = safeTarget - barWeightKg;
  let remainingPerSide = weightToLoad / 2;
  const perSide: { plateKg: number; count: number }[] = [];

  for (const plate of IRON_CAPTAIN_PLATES) {
    if (remainingPerSide >= plate - 0.001) {
      const count = Math.floor((remainingPerSide + 0.001) / plate);
      if (count > 0) {
        perSide.push({ plateKg: plate, count });
        remainingPerSide = Number((remainingPerSide - count * plate).toFixed(3));
      }
    }
  }

  const loadedPerSide = perSide.reduce((sum, item) => sum + item.plateKg * item.count, 0);
  const achievableKg = Number((barWeightKg + loadedPerSide * 2).toFixed(2));
  const remainderKg = Number(Math.max(0, safeTarget - achievableKg).toFixed(2));

  return {
    targetKg: safeTarget,
    barWeightKg,
    achievableKg,
    perSide,
    remainderKg,
  };
}

/**
 * Estimates 1-Rep Max using the Epley formula.
 */
export function calculateEstimated1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weightKg);
  return Math.round(weightKg * (1 + reps / 30));
}

/**
 * Computes total completed tonnage (volume in kg), cardio minutes, and set count for an active workout.
 */
export function calculateWorkoutStats(exercises: ActiveExercise[]): {
  completedSets: number;
  totalSets: number;
  totalVolumeKg: number;
  totalCardioMin: number;
  progressPct: number;
} {
  let completedSets = 0;
  let totalSets = 0;
  let totalVolumeKg = 0;
  let totalCardioMin = 0;

  for (const ex of exercises) {
    for (const s of ex.sets) {
      totalSets += 1;
      if (s.completed) {
        completedSets += 1;
        if (ex.trackingMode === 'cardio') {
          totalCardioMin += Math.max(0, s.reps);
        } else {
          totalVolumeKg += Math.max(0, s.weightKg) * Math.max(0, s.reps);
        }
      }
    }
  }

  const progressPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
  return {
    completedSets,
    totalSets,
    totalVolumeKg: Math.round(totalVolumeKg),
    totalCardioMin: Math.round(totalCardioMin),
    progressPct,
  };
}

/**
 * Computes the FitnessDreams Willpower & Consistency Ring score (0-100)
 * combining weekly training sessions and daily willpower habits.
 */
export function calculateWillpowerScore(
  profile: Pick<MemberProfile, 'weeklyCompletedSessions' | 'weeklyGoalSessions'>,
  habits: HabitItem[]
): {
  overallPct: number;
  habitsDone: number;
  habitsTotal: number;
  sessionsPct: number;
} {
  const habitsTotal = habits.length;
  const habitsDone = habits.filter((h) => h.completed).length;
  const habitsRatio = habitsTotal > 0 ? habitsDone / habitsTotal : 0;

  const goal = Math.max(1, profile.weeklyGoalSessions);
  const sessionsRatio = Math.min(1, profile.weeklyCompletedSessions / goal);

  const overallPct = Math.round((sessionsRatio * 0.65 + habitsRatio * 0.35) * 100);
  return {
    overallPct,
    habitsDone,
    habitsTotal,
    sessionsPct: Math.round(sessionsRatio * 100),
  };
}

/**
 * Toggles a class reservation while enforcing capacity boundaries.
 */
export function toggleClassBooking(
  session: GymClassSession
): { updated: GymClassSession; error: string | null } {
  if (session.isBookedByUser) {
    return {
      updated: {
        ...session,
        isBookedByUser: false,
        bookedCount: Math.max(0, session.bookedCount - 1),
      },
      error: null,
    };
  }

  if (session.bookedCount >= session.capacity) {
    return {
      updated: session,
      error: 'Esta clase ya está completa. Puedes activar aviso de plaza libre.',
    };
  }

  return {
    updated: {
      ...session,
      isBookedByUser: true,
      bookedCount: session.bookedCount + 1,
    },
    error: null,
  };
}

/**
 * Calculates the Challenge de la Mancuerna 70 kg tier & score (weight * seconds).
 */
export function getMancuernaChallengeTier(weightKg: number, durationSec: number): {
  tierName: 'Aro de Hierro' | 'Aro de Acero' | 'Aro Eléctrico' | 'Leyenda Dream';
  score: number;
  nextMilestoneScore: number | null;
} {
  const score = Math.max(0, Math.round(weightKg * durationSec));
  if (score >= 1800) {
    return { tierName: 'Leyenda Dream', score, nextMilestoneScore: null };
  }
  if (score >= 1200) {
    return { tierName: 'Aro Eléctrico', score, nextMilestoneScore: 1800 };
  }
  if (score >= 700) {
    return { tierName: 'Aro de Acero', score, nextMilestoneScore: 1200 };
  }
  return { tierName: 'Aro de Hierro', score, nextMilestoneScore: 700 };
}

/**
 * Ranks Challenge de la Mancuerna entries descending by score (weightKg * durationSec).
 */
export function sortChallengeLeaderboard(entries: ChallengeAttempt[]): ChallengeAttempt[] {
  return [...entries].sort((a, b) => {
    const scoreDiff = b.weightKg * b.durationSec - a.weightKg * a.durationSec;
    if (scoreDiff !== 0) return scoreDiff;
    return b.durationSec - a.durationSec;
  });
}

/**
 * Ranks Press Banca & Sentadilla strength attempts descending by weight lifted, then reps.
 */
export function sortStrengthLeaderboard(entries: StrengthLiftAttempt[]): StrengthLiftAttempt[] {
  return [...entries].sort((a, b) => {
    const weightDiff = b.weightKg - a.weightKg;
    if (weightDiff !== 0) return weightDiff;
    return b.reps - a.reps;
  });
}

/**
 * Applies the Socio Fundador discount percentage to any cafeteria or store item.
 */
export function calculateFounderPrice(standardPrice: number, discountPct: number): {
  finalPrice: number;
  savings: number;
} {
  const safePrice = Math.max(0, standardPrice);
  const clampedDiscount = Math.min(100, Math.max(0, discountPct));
  const savings = Number(((safePrice * clampedDiscount) / 100).toFixed(2));
  const finalPrice = Number((safePrice - savings).toFixed(2));
  return { finalPrice, savings };
}

/**
 * Formats seconds into mm:ss for rest timers and challenge stopwatches.
 */
export function formatSecondsClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Filters members who have not visited the gym in at least `thresholdDays` (default 10 days)
 * and sorts them from highest absence risk to lowest.
 */
export function getAtRiskMembers(
  members: ClubMemberRecord[],
  thresholdDays = 10
): ClubMemberRecord[] {
  return members
    .filter((m) => m.daysSinceLastVisit >= thresholdDays && m.outreachStatus !== 'reactivado')
    .sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);
}

/**
 * Calculates monthly and annualized revenue at risk vs protected through coach outreach.
 */
export function calculateRetentionFinancials(
  members: ClubMemberRecord[],
  thresholdDays = 10
): {
  atRiskCount: number;
  uncontactedCount: number;
  contactedCount: number;
  monthlyRevenueAtRisk: number;
  annualRevenueAtRisk: number;
  monthlyRevenueProtected: number;
} {
  const atRisk = getAtRiskMembers(members, thresholdDays);
  const uncontacted = atRisk.filter((m) => m.outreachStatus === 'pendiente');
  const contacted = atRisk.filter((m) => m.outreachStatus === 'contactado');
  const reactivated = members.filter((m) => m.outreachStatus === 'reactivado');

  const monthlyRevenueAtRisk = Number(
    uncontacted.reduce((sum, m) => sum + m.monthlyFee, 0).toFixed(2)
  );
  const annualRevenueAtRisk = Number((monthlyRevenueAtRisk * 12).toFixed(2));
  const monthlyRevenueProtected = Number(
    [...contacted, ...reactivated].reduce((sum, m) => sum + m.monthlyFee, 0).toFixed(2)
  );

  return {
    atRiskCount: atRisk.length,
    uncontactedCount: uncontacted.length,
    contactedCount: contacted.length,
    monthlyRevenueAtRisk,
    annualRevenueAtRisk,
    monthlyRevenueProtected,
  };
}

export interface ClassOccupancyMetric {
  session: GymClassSession;
  occupancyPct: number;
  status: 'Llena' | 'Alta demanda' | 'Disponible';
}

/**
 * Ranks gym classes by fill percentage descending to show which classes sell out.
 */
export function computeClassOccupancyMetrics(
  classes: GymClassSession[]
): ClassOccupancyMetric[] {
  return [...classes]
    .map((session) => {
      const cap = Math.max(1, session.capacity);
      const occupancyPct = Math.min(100, Math.round((session.bookedCount / cap) * 100));
      const status: ClassOccupancyMetric['status'] =
        occupancyPct >= 100 ? 'Llena' : occupancyPct >= 80 ? 'Alta demanda' : 'Disponible';
      return { session, occupancyPct, status };
    })
    .sort((a, b) => b.occupancyPct - a.occupancyPct || b.session.bookedCount - a.session.bookedCount);
}

/**
 * Classifies an hourly attendance slot against club max capacity.
 */
export function classifyHourlySaturation(
  avgAttendance: number,
  maxCapacity: number
): { pct: number; status: 'Saturada' | 'Alta' | 'Óptima' } {
  const cap = Math.max(1, maxCapacity);
  const pct = Math.min(100, Math.round((Math.max(0, avgAttendance) / cap) * 100));
  if (pct >= 85) return { pct, status: 'Saturada' };
  if (pct >= 65) return { pct, status: 'Alta' };
  return { pct, status: 'Óptima' };
}

const SPANISH_MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/**
 * Deterministically selects the daily FitnessDreams philosophy quote based on the calendar day
 * (changes automatically every day, with optional offset for browsing).
 */
export function getDailyPhilosophyQuote(
  quotes: DailyQuote[],
  date: Date = new Date(),
  dayOffset = 0
): { quote: DailyQuote; dayOfYear: number; dateLabel: string } {
  if (quotes.length === 0) {
    throw new Error('DAILY_PHILOSOPHY_QUOTES must contain at least one quote.');
  }
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const diffMs = date.getTime() - startOfYear.getTime();
  const oneDayMs = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.max(1, Math.floor(diffMs / oneDayMs));
  const rawIndex = (dayOfYear - 1 + dayOffset) % quotes.length;
  const index = (rawIndex + quotes.length) % quotes.length;
  const dateLabel = `${date.getDate()} ${SPANISH_MONTHS_SHORT[date.getMonth()]}`;

  return {
    quote: quotes[index],
    dayOfYear,
    dateLabel,
  };
}

/**
 * Filters messages belonging to a specific coach <-> member conversation thread.
 */
export function getConversationMessages(
  messages: DirectMessage[],
  coachId: string,
  memberId: string
): DirectMessage[] {
  return messages.filter((m) => m.coachId === coachId && m.memberId === memberId);
}

/**
 * Enforces that workouts can only be shared with club members who are accepted friends.
 */
export function canShareWorkoutWithMember(friend: Pick<ClubFriendProfile, 'name' | 'status'>): {
  allowed: boolean;
  reason: string | null;
} {
  if (friend.status === 'amigo') {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason: `Hazte amigo de ${friend.name} primero para poder compartir entrenamientos entre vosotros.`,
  };
}

/**
 * Transitions friendship status deterministically across user actions.
 */
export function transitionFriendshipStatus(
  current: FriendshipStatus,
  action: 'send-request' | 'accept' | 'remove'
): FriendshipStatus {
  if (action === 'accept' && current === 'solicitud-recibida') return 'amigo';
  if (action === 'send-request' && current === 'ninguno') return 'solicitud-enviada';
  if (action === 'remove') return 'ninguno';
  return current;
}

/**
 * Transitions a 1v1 peer workout challenge status deterministically.
 */
export function transitionPeerChallengeStatus(
  current: PeerChallengeStatus,
  action: 'accept' | 'complete' | 'decline'
): PeerChallengeStatus {
  if (action === 'accept' && current === 'pendiente') return 'aceptado';
  if (action === 'decline' && current === 'pendiente') return 'rechazado';
  if (action === 'complete' && (current === 'aceptado' || current === 'pendiente')) {
    return 'completado';
  }
  return current;
}



