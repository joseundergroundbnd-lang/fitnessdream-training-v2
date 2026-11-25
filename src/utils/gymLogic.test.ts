import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBarbellPlates,
  calculateEstimated1RM,
  calculateFounderPrice,
  calculateRetentionFinancials,
  calculateWillpowerScore,
  calculateWorkoutStats,
  classifyHourlySaturation,
  computeClassOccupancyMetrics,
  evaluateTurnstileAccess,
  formatSecondsClock,
  getAtRiskMembers,
  getMancuernaChallengeTier,
  sortChallengeLeaderboard,
  sortStrengthLeaderboard,
  toggleClassBooking,
} from './gymLogic';
import type {
  ActiveExercise,
  ChallengeAttempt,
  ClubMemberRecord,
  GymClassSession,
  HabitItem,
  StrengthLiftAttempt,
} from '../types/gym';

test('evaluateTurnstileAccess denies access with alarm message when fee is pending', () => {
  const denied = evaluateTurnstileAccess('pendiente');
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, 'blocked_fee_overdue');
  assert.match(denied.message, /mostrador de información/i);

  const granted = evaluateTurnstileAccess('al-dia');
  assert.equal(granted.allowed, true);
  assert.equal(granted.status, 'granted');
});

test('calculateBarbellPlates calculates exact Iron Captain plates per side', () => {
  const result = calculateBarbellPlates(100, 20);
  assert.equal(result.achievableKg, 100);
  assert.equal(result.remainderKg, 0);
  assert.deepEqual(result.perSide, [
    { plateKg: 25, count: 1 },
    { plateKg: 15, count: 1 },
  ]);
});

test('calculateEstimated1RM returns Epley 1RM and handles 1 rep', () => {
  assert.equal(calculateEstimated1RM(120, 1), 120);
  assert.equal(calculateEstimated1RM(80, 10), 107);
  assert.equal(calculateEstimated1RM(0, 10), 0);
});

test('calculateWorkoutStats aggregates strength tonnage and cardio minutes separately', () => {
  const exercises: ActiveExercise[] = [
    {
      id: 'ex-1',
      machineCode: '4SHP01/0',
      machineName: 'Press Banca Convergente Discos',
      category: 'Máquinas Telju',
      trackingMode: 'strength',
      muscleGroup: 'Pecho',
      restSeconds: 90,
      sets: [
        { id: 's1', weightKg: 80, reps: 10, rir: 2, completed: true },
        { id: 's2', weightKg: 85, reps: 8, rir: 1, completed: false },
      ],
    },
    {
      id: 'ex-2',
      machineCode: '4HP4TN',
      machineName: 'Cinta de Correr Health',
      category: 'Cardio',
      trackingMode: 'cardio',
      muscleGroup: 'Cardio',
      restSeconds: 60,
      sets: [{ id: 's3', weightKg: 10, reps: 25, rir: 2, completed: true }],
    },
  ];
  const stats = calculateWorkoutStats(exercises);
  assert.equal(stats.completedSets, 2);
  assert.equal(stats.totalSets, 3);
  assert.equal(stats.totalVolumeKg, 800);
  assert.equal(stats.totalCardioMin, 25);
});

test('calculateWillpowerScore balances weekly sessions and daily habits', () => {
  const habits: HabitItem[] = [
    { id: 'h1', label: 'Entreno', detail: '', completed: true },
    { id: 'h2', label: 'Agua', detail: '', completed: true },
    { id: 'h3', label: 'Sueño', detail: '', completed: false },
    { id: 'h4', label: 'Proteína', detail: '', completed: false },
  ];
  const score = calculateWillpowerScore(
    { weeklyCompletedSessions: 4, weeklyGoalSessions: 4 },
    habits
  );
  assert.equal(score.sessionsPct, 100);
  assert.equal(score.habitsDone, 2);
  assert.equal(score.overallPct, 83);
});

test('toggleClassBooking reserves, cancels, and blocks when class is full', () => {
  const openClass: GymClassSession = {
    id: 'c1',
    discipline: 'Boxeo',
    title: 'Boxeo Técnico',
    instructor: 'Diego',
    day: 'Lun',
    time: '19:00',
    durationMin: 60,
    capacity: 14,
    bookedCount: 13,
    isBookedByUser: false,
    level: 'Todos los niveles',
    description: 'Técnica y saco',
  };

  const booked = toggleClassBooking(openClass);
  assert.equal(booked.error, null);
  assert.equal(booked.updated.isBookedByUser, true);
  assert.equal(booked.updated.bookedCount, 14);

  const fullClass: GymClassSession = { ...openClass, bookedCount: 14, isBookedByUser: false };
  const blocked = toggleClassBooking(fullClass);
  assert.ok(blocked.error);
});

test('sortStrengthLeaderboard and sortChallengeLeaderboard rank highest lifts first', () => {
  const lifts: StrengthLiftAttempt[] = [
    { id: '1', exercise: 'press-banca', memberName: 'Ana', memberTag: 'FD-012', weightKg: 75, reps: 1, dateLabel: 'Hoy' },
    { id: '2', exercise: 'press-banca', memberName: 'Luis', memberTag: 'FD-007', weightKg: 135, reps: 1, dateLabel: 'Hoy' },
    { id: '3', exercise: 'press-banca', memberName: 'Carlos', memberTag: 'FD-018', weightKg: 135, reps: 3, dateLabel: 'Hoy' },
  ];
  const sortedLifts = sortStrengthLeaderboard(lifts);
  assert.equal(sortedLifts[0].memberName, 'Carlos');
  assert.equal(sortedLifts[1].memberName, 'Luis');

  const entries: ChallengeAttempt[] = [
    { id: '1', memberName: 'Ana', memberTag: 'FD-012', weightKg: 30, durationSec: 40, dateLabel: 'Hoy' },
    { id: '2', memberName: 'Luis', memberTag: 'FD-007', weightKg: 70, durationSec: 32, dateLabel: 'Hoy' },
  ];
  const sorted = sortChallengeLeaderboard(entries);
  assert.equal(sorted[0].memberName, 'Luis');
  assert.equal(getMancuernaChallengeTier(70, 32).tierName, 'Leyenda Dream');
});

test('calculateFounderPrice computes exact 15% savings and formatSecondsClock formats mm:ss', () => {
  const cafe = calculateFounderPrice(5.2, 15);
  assert.equal(cafe.savings, 0.78);
  assert.equal(cafe.finalPrice, 4.42);
  assert.equal(formatSecondsClock(95), '01:35');
});

test('getAtRiskMembers and calculateRetentionFinancials flag 10+ day absent members and compute revenue at risk', () => {
  const sampleMembers: ClubMemberRecord[] = [
    {
      id: 'm1',
      name: 'Laura Gómez',
      memberTag: 'FD-051',
      phone: '611 111 111',
      plan: 'Socio Club',
      monthlyFee: 46.9,
      daysSinceLastVisit: 17,
      lastVisitLabel: 'Hace 17 días',
      assignedCoach: 'Javi Busta',
      preferredActivity: 'Fuerza Telju',
      challengesCompleted: 0,
      streakDays: 0,
      outreachStatus: 'pendiente',
    },
    {
      id: 'm2',
      name: 'Sergio Vidal',
      memberTag: 'FD-033',
      phone: '622 222 222',
      plan: 'Socio Fundador',
      monthlyFee: 34.9,
      daysSinceLastVisit: 12,
      lastVisitLabel: 'Hace 12 días',
      assignedCoach: 'Javi Busta',
      preferredActivity: 'Boxeo',
      challengesCompleted: 1,
      streakDays: 0,
      outreachStatus: 'contactado',
    },
    {
      id: 'm3',
      name: 'Elena Costa',
      memberTag: 'FD-019',
      phone: '633 333 333',
      plan: 'Socio Fundador',
      monthlyFee: 34.9,
      daysSinceLastVisit: 1,
      lastVisitLabel: 'Ayer',
      assignedCoach: 'Javi Busta',
      preferredActivity: 'Jumping Fitness',
      challengesCompleted: 3,
      streakDays: 21,
      outreachStatus: 'pendiente',
    },
  ];

  const atRisk = getAtRiskMembers(sampleMembers, 10);
  assert.equal(atRisk.length, 2);
  assert.equal(atRisk[0].name, 'Laura Gómez');

  const financials = calculateRetentionFinancials(sampleMembers, 10);
  assert.equal(financials.uncontactedCount, 1);
  assert.equal(financials.contactedCount, 1);
  assert.equal(financials.monthlyRevenueAtRisk, 46.9);
  assert.equal(financials.annualRevenueAtRisk, 562.8);
  assert.equal(financials.monthlyRevenueProtected, 34.9);
});

test('computeClassOccupancyMetrics ranks classes by fill percentage and classifyHourlySaturation detects peak hours', () => {
  const sessions: GymClassSession[] = [
    {
      id: 'c1',
      discipline: 'Boxeo',
      title: 'Boxeo Técnico',
      instructor: 'Diego',
      day: 'Lun',
      time: '19:00',
      durationMin: 60,
      capacity: 14,
      bookedCount: 11,
      isBookedByUser: false,
      level: 'Todos los niveles',
      description: '',
    },
    {
      id: 'c2',
      discipline: 'Jumping Fitness',
      title: 'Jumping Core',
      instructor: 'Sofía',
      day: 'Mar',
      time: '20:00',
      durationMin: 50,
      capacity: 16,
      bookedCount: 16,
      isBookedByUser: false,
      level: 'Todos los niveles',
      description: '',
    },
  ];
  const ranked = computeClassOccupancyMetrics(sessions);
  assert.equal(ranked[0].session.id, 'c2');
  assert.equal(ranked[0].occupancyPct, 100);
  assert.equal(ranked[0].status, 'Llena');
  assert.equal(ranked[1].status, 'Disponible');

  assert.equal(classifyHourlySaturation(134, 140).status, 'Saturada');
  assert.equal(classifyHourlySaturation(100, 140).status, 'Alta');
  assert.equal(classifyHourlySaturation(50, 140).status, 'Óptima');
});

test('getDailyPhilosophyQuote rotates deterministically by calendar day and supports offset browsing', async () => {
  const { getDailyPhilosophyQuote } = await import('./gymLogic');
  const sampleQuotes = [
    { id: 'q1', text: 'Frase 1', pillar: 'Superación' as const, signature: 'FitnessDreams' },
    { id: 'q2', text: 'Frase 2', pillar: 'Fuerza de voluntad' as const, signature: 'FitnessDreams' },
    { id: 'q3', text: 'Frase 3', pillar: 'Perseverancia' as const, signature: 'FitnessDreams' },
  ];

  const dayA = getDailyPhilosophyQuote(sampleQuotes, new Date(2026, 10, 25));
  const dayASame = getDailyPhilosophyQuote(sampleQuotes, new Date(2026, 10, 25));
  const dayB = getDailyPhilosophyQuote(sampleQuotes, new Date(2026, 10, 26));
  const dayC = getDailyPhilosophyQuote(sampleQuotes, new Date(2026, 10, 27));
  const dayNextByOffset = getDailyPhilosophyQuote(sampleQuotes, new Date(2026, 10, 25), 1);

  assert.equal(dayA.quote.id, dayASame.quote.id);
  assert.equal(dayA.dateLabel, '25 nov');
  assert.notEqual(dayA.quote.id, dayB.quote.id);
  assert.notEqual(dayB.quote.id, dayC.quote.id);
  assert.equal(dayNextByOffset.quote.id, dayB.quote.id);
});

test('getConversationMessages isolates threads by coachId and memberId', async () => {
  const { getConversationMessages } = await import('./gymLogic');
  const msgs = [
    {
      id: 'm1',
      coachId: 'coach-javi',
      memberId: 'current-user',
      senderRole: 'member' as const,
      senderName: 'Alex',
      kind: 'text' as const,
      text: 'Hola Javi',
      timestampLabel: '10:00',
    },
    {
      id: 'm2',
      coachId: 'coach-joel',
      memberId: 'current-user',
      senderRole: 'coach' as const,
      senderName: 'Joel',
      kind: 'audio' as const,
      audioDurationSec: 12,
      timestampLabel: '10:05',
    },
  ];

  assert.equal(getConversationMessages(msgs, 'coach-javi', 'current-user').length, 1);
  assert.equal(getConversationMessages(msgs, 'coach-joel', 'current-user')[0].kind, 'audio');
});

test('canShareWorkoutWithMember requires accepted friendship and transitions work cleanly', async () => {
  const {
    canShareWorkoutWithMember,
    transitionFriendshipStatus,
    transitionPeerChallengeStatus,
  } = await import('./gymLogic');

  assert.equal(canShareWorkoutWithMember({ name: 'Dani', status: 'amigo' }).allowed, true);
  assert.equal(canShareWorkoutWithMember({ name: 'Raúl', status: 'ninguno' }).allowed, false);
  assert.equal(
    canShareWorkoutWithMember({ name: 'Marta', status: 'solicitud-recibida' }).allowed,
    false
  );

  assert.equal(transitionFriendshipStatus('solicitud-recibida', 'accept'), 'amigo');
  assert.equal(transitionFriendshipStatus('ninguno', 'send-request'), 'solicitud-enviada');
  assert.equal(transitionFriendshipStatus('amigo', 'remove'), 'ninguno');

  assert.equal(transitionPeerChallengeStatus('pendiente', 'accept'), 'aceptado');
  assert.equal(transitionPeerChallengeStatus('aceptado', 'complete'), 'completado');
  assert.equal(transitionPeerChallengeStatus('pendiente', 'decline'), 'rechazado');
});

test('qrPass encodes and parses real scannable turnstile payloads and manual member codes', async () => {
  const {
    buildMemberQrPayload,
    clampText,
    generateMemberCodeFromUid,
    parseMemberQrPayload,
    sanitizeId,
    sanitizeMemberCode,
  } = await import('./qrPass');

  const payload = buildMemberQrPayload('uid_carlos_99', 'FD-0042');
  assert.equal(payload, 'FD:MEMBER:uid_carlos_99|FD-0042');

  const parsed = parseMemberQrPayload(payload);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.memberId, 'uid_carlos_99');
  assert.equal(parsed.memberCode, 'FD-0042');

  const manualCode = parseMemberQrPayload('#0042');
  assert.equal(manualCode.valid, true);
  assert.equal(manualCode.memberCode, 'FD-0042');

  const invalid = parseMemberQrPayload('https://random-website.com');
  assert.equal(invalid.valid, false);

  const generatedA = generateMemberCodeFromUid('firebase_uid_abc');
  const generatedB = generateMemberCodeFromUid('firebase_uid_abc');
  assert.equal(generatedA, generatedB);
  assert.match(generatedA, /^FD-\d{4}$/);

  assert.equal(sanitizeId('bad/id with spaces!'), 'badidwithspaces');
  assert.equal(sanitizeMemberCode('#019'), 'FD-019');
  assert.equal(clampText('  Hola mundo  ', 4), 'Hola');
});



