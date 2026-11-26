import test from 'node:test';
import assert from 'node:assert/strict';
import { TELJU_MACHINES, getMachineByCode } from '../data/teljuCatalog';
import { buildCoachPortalUrl } from './pwaUtils';
import {
  STRENGTH_MUSCLE_GROUPS,
  buildActiveExercisesFromCoachRoutine,
  clampSetsCount,
  filterExercisesByMuscleAndEquipment,
  filterRoutinesForMember,
  formatPyramidRepsString,
  generatePyramidSetPlan,
} from './routineBuilder';
import type { CoachRoutine } from '../types/gym';

test('clampSetsCount enforces 1 to 10 series range', () => {
  assert.equal(clampSetsCount(0), 1);
  assert.equal(clampSetsCount(-5), 1);
  assert.equal(clampSetsCount(4), 4);
  assert.equal(clampSetsCount(10), 10);
  assert.equal(clampSetsCount(18), 10);
});

test('generatePyramidSetPlan creates ascending, descending, double, and custom pyramids', () => {
  const asc = generatePyramidSetPlan(4, 'ascendente', 60);
  assert.equal(asc.length, 4);
  assert.equal(formatPyramidRepsString(asc), '15-13-11-9');
  assert.ok(asc[3].weightKg > asc[0].weightKg);

  const desc = generatePyramidSetPlan(4, 'descendente', 40);
  assert.equal(desc.length, 4);
  assert.equal(desc[0].reps, 6);
  assert.ok(desc[0].weightKg > desc[3].weightKg);

  const dbl = generatePyramidSetPlan(5, 'doble', 50);
  assert.equal(dbl.length, 5);
  assert.equal(dbl[0].reps, dbl[4].reps);
  assert.ok(dbl[2].weightKg > dbl[0].weightKg);

  const custom = generatePyramidSetPlan(4, 'personalizada', 40, '15-12-10-8');
  assert.equal(formatPyramidRepsString(custom), '15-12-10-8');
});

test('every strength muscle group has Telju, Mancuernas y Barra, and Polea exercises', () => {
  for (const muscle of STRENGTH_MUSCLE_GROUPS) {
    const telju = filterExercisesByMuscleAndEquipment(TELJU_MACHINES, muscle, 'Máquinas Telju');
    const free = filterExercisesByMuscleAndEquipment(TELJU_MACHINES, muscle, 'Mancuernas y Barra');
    const cable = filterExercisesByMuscleAndEquipment(TELJU_MACHINES, muscle, 'Polea');
    assert.ok(telju.length > 0, `Missing Máquinas Telju for ${muscle}`);
    assert.ok(free.length > 0, `Missing Mancuernas y Barra for ${muscle}`);
    assert.ok(cable.length > 0, `Missing Polea for ${muscle}`);
  }
});

test('filterRoutinesForMember isolates exclusive routines to the target member only', () => {
  const base: Omit<CoachRoutine, 'id' | 'targetMemberId' | 'targetMemberName' | 'targetMemberCode'> = {
    title: 'Rutina Pecho',
    frequency: 'Mensual',
    dayLabel: 'Mesociclo 4 semanas',
    coachId: 'coach-javi',
    coachName: 'Javi Busta',
    coachRole: 'Head Coach',
    coachAvatar: '/avatar.jpg',
    goal: 'Hipertrofia',
    sentAt: 'Hoy',
    coachMessage: 'A tope',
    exercises: [],
  };

  const routines: CoachRoutine[] = [
    { ...base, id: 'r-all', targetMemberId: 'all', targetMemberName: 'Todos los socios' },
    { ...base, id: 'r-laura', targetMemberId: 'mem-1', targetMemberName: 'Laura Gómez', targetMemberCode: 'FD-051' },
    { ...base, id: 'r-sergio', targetMemberId: 'mem-2', targetMemberName: 'Sergio Vidal', targetMemberCode: 'FD-033' },
  ];

  const lauraVisible = filterRoutinesForMember(routines, {
    memberId: 'mem-1',
    memberCode: 'FD-051',
    memberName: 'Laura Gómez',
  });
  assert.deepEqual(
    lauraVisible.map((r) => r.id),
    ['r-all', 'r-laura']
  );

  const sergioVisible = filterRoutinesForMember(routines, {
    memberId: 'mem-2',
    memberCode: 'FD-033',
    memberName: 'Sergio Vidal',
  });
  assert.deepEqual(
    sergioVisible.map((r) => r.id),
    ['r-all', 'r-sergio']
  );
});

test('buildActiveExercisesFromCoachRoutine hydrates pyramid sets and cardio block', () => {
  const pyramidSets = generatePyramidSetPlan(4, 'personalizada', 60, '15-12-10-8');
  const routine: CoachRoutine = {
    id: 'rt-test',
    title: 'Pecho Pirámide + Cinta',
    frequency: 'Trimestral',
    dayLabel: 'Bloque 1',
    targetMemberId: 'mem-1',
    targetMemberName: 'Laura Gómez',
    coachId: 'coach-javi',
    coachName: 'Javi Busta',
    coachRole: 'Head Coach',
    coachAvatar: '/avatar.jpg',
    goal: 'Fuerza',
    sentAt: 'Hoy',
    coachMessage: 'Controla el tempo',
    exercises: [
      {
        machineCode: '4SHP01/0',
        targetSets: 4,
        repScheme: 'piramide',
        targetReps: '15-12-10-8',
        pyramidPreset: 'personalizada',
        pyramidSets,
        suggestedWeightKg: 60,
        intensityLabel: 'Alta (RPE 8 · RIR 2)',
        restSeconds: 90,
      },
    ],
    cardioBlock: {
      enabled: true,
      machineCode: '4HP4TN',
      machineName: 'Cinta de Correr Health (Zona 2 / Inclinada)',
      durationMin: 20,
      intensityLabel: 'Zona 2 · 10% incl.',
    },
  };

  const active = buildActiveExercisesFromCoachRoutine(routine, getMachineByCode, 1000);
  assert.equal(active.length, 2);
  assert.equal(active[0].sets.length, 4);
  assert.deepEqual(
    active[0].sets.map((s) => s.reps),
    [15, 12, 10, 8]
  );
  assert.equal(active[1].trackingMode, 'cardio');
  assert.equal(active[1].sets[0].reps, 20);
});

test('buildCoachPortalUrl generates distinct coach links', () => {
  assert.equal(
    buildCoachPortalUrl('https://fitnessdream-training.vercel.app'),
    'https://fitnessdream-training.vercel.app/?mode=coach'
  );
  assert.equal(
    buildCoachPortalUrl('https://fitnessdream-training.vercel.app', 'javi'),
    'https://fitnessdream-training.vercel.app/?mode=coach-javi'
  );
  assert.equal(
    buildCoachPortalUrl('https://fitnessdream-training.vercel.app', 'joel'),
    'https://fitnessdream-training.vercel.app/?mode=coach-joel'
  );
});
