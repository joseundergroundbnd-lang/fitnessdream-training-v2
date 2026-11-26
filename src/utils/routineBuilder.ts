import type {
  ActiveExercise,
  CoachRoutine,
  EquipmentCategory,
  MuscleGroup,
  PyramidPreset,
  PyramidSetSpec,
  RoutineFrequency,
  TeljuMachine,
} from '../types/gym';

export const ROUTINE_FREQUENCIES: RoutineFrequency[] = [
  'Diaria',
  'Semanal',
  'Mensual',
  'Trimestral',
];

export const STRENGTH_MUSCLE_GROUPS: MuscleGroup[] = [
  'Pecho',
  'Espalda',
  'Hombro',
  'Brazos',
  'Cuádriceps',
  'Glúteo / Femoral',
  'Core / Funcional',
];

export const COACH_EQUIPMENT_FILTERS: Array<
  'todos' | 'Máquinas Telju' | 'Mancuernas y Barra' | 'Polea'
> = ['todos', 'Máquinas Telju', 'Mancuernas y Barra', 'Polea'];

export const REST_SECONDS_PRESETS = [30, 45, 60, 90, 120, 150, 180] as const;

export const INTENSITY_PRESETS = [
  'Moderada (RPE 7)',
  'Alta (RPE 8 · RIR 2)',
  'Muy Alta (RPE 9 · RIR 1)',
  'Al fallo muscular',
  '70% 1RM · Técnica',
  '80% 1RM · Hipertrofia',
  '85%+ 1RM · Fuerza',
] as const;

/**
 * Clamps prescribed sets strictly to 1..10 as requested by the gym coaches.
 */
export function clampSetsCount(sets: number): number {
  if (!Number.isFinite(sets)) return 4;
  return Math.min(10, Math.max(1, Math.round(sets)));
}

/**
 * Normalizes legacy equipment strings (e.g. 'Mancuernas' from older localStorage)
 * to the expanded equipment taxonomy.
 */
export function normalizeEquipmentCategory(raw: string): EquipmentCategory {
  if (raw === 'Mancuernas' || raw === 'Mancuernas y Barra') return 'Mancuernas y Barra';
  if (raw === 'Polea') return 'Polea';
  if (raw === 'Cardio') return 'Cardio';
  if (raw === 'Funcional') return 'Funcional';
  return 'Máquinas Telju';
}

/**
 * Generates an exact per-set pyramid breakdown (1 to 10 sets) with realistic
 * reps and progressive weight increments for ascending, descending, double, or custom pyramids.
 */
export function generatePyramidSetPlan(
  setsCountInput: number,
  preset: PyramidPreset,
  baseWeightKgInput: number,
  customRepsPattern?: string
): PyramidSetSpec[] {
  const setsCount = clampSetsCount(setsCountInput);
  const baseWeight = Math.max(0, Math.round(baseWeightKgInput * 2) / 2);
  const weightStep = baseWeight >= 60 ? 5 : baseWeight >= 20 ? 2.5 : baseWeight > 0 ? 2 : 0;

  if (preset === 'personalizada' && customRepsPattern) {
    const parsed = customRepsPattern
      .split(/[-,/\s→]+/)
      .map((token) => Number.parseInt(token.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 100);

    if (parsed.length > 0) {
      return Array.from({ length: setsCount }, (_, idx) => {
        const reps = parsed[Math.min(idx, parsed.length - 1)];
        const prevReps = parsed[0];
        const deltaSets = reps < prevReps ? idx : 0;
        return {
          setNumber: idx + 1,
          reps,
          weightKg: Math.max(0, Math.round((baseWeight + deltaSets * weightStep) * 2) / 2),
        };
      });
    }
  }

  if (preset === 'descendente') {
    // Starts heavy with low reps, drops weight & raises reps each set
    const startReps = 6;
    const peakWeight = Math.round((baseWeight + (setsCount - 1) * weightStep) * 2) / 2;
    return Array.from({ length: setsCount }, (_, idx) => ({
      setNumber: idx + 1,
      reps: Math.min(24, startReps + idx * 2),
      weightKg: Math.max(0, Math.round((peakWeight - idx * weightStep) * 2) / 2),
    }));
  }

  if (preset === 'doble') {
    // Ascending to midpoint peak load, then back down in weight / up in reps
    const mid = Math.floor((setsCount - 1) / 2);
    const startReps = 12 + Math.min(4, mid * 2);
    return Array.from({ length: setsCount }, (_, idx) => {
      const distFromEdge = idx <= mid ? idx : Math.max(0, setsCount - 1 - idx);
      const reps = Math.max(4, startReps - distFromEdge * 2);
      return {
        setNumber: idx + 1,
        reps,
        weightKg: Math.max(0, Math.round((baseWeight + distFromEdge * weightStep) * 2) / 2),
      };
    });
  }

  // Default: 'ascendente' (classic bodybuilding pyramid: reps drop 15 -> 12 -> 10 -> 8 -> 6, weight climbs)
  const classicTopReps = setsCount <= 3 ? 12 : setsCount <= 5 ? 15 : 18;
  return Array.from({ length: setsCount }, (_, idx) => {
    const reps = Math.max(4, classicTopReps - idx * 2);
    return {
      setNumber: idx + 1,
      reps,
      weightKg: Math.max(0, Math.round((baseWeight + idx * weightStep) * 2) / 2),
    };
  });
}

export function formatPyramidRepsString(sets: PyramidSetSpec[]): string {
  if (sets.length === 0) return '12-10-8';
  return sets.map((s) => s.reps).join('-');
}

export function formatPyramidSummary(sets: PyramidSetSpec[]): string {
  if (sets.length === 0) return '';
  return sets.map((s) => `${s.reps}`).join(' → ') + ' reps';
}

/**
 * Filters exercises by selected muscle group and equipment category (Telju, Mancuernas y Barra, Polea).
 */
export function filterExercisesByMuscleAndEquipment(
  machines: TeljuMachine[],
  muscleGroup: MuscleGroup,
  equipment: 'todos' | 'Máquinas Telju' | 'Mancuernas y Barra' | 'Polea'
): TeljuMachine[] {
  return machines.filter((m) => {
    if (m.muscleGroup !== muscleGroup) return false;
    if (equipment === 'todos') return true;
    return normalizeEquipmentCategory(m.category) === equipment;
  });
}

/**
 * Ensures each member sees ONLY routines assigned exclusively to them plus general ('all') club routines.
 */
export function filterRoutinesForMember(
  routines: CoachRoutine[],
  member: {
    uid?: string | null;
    memberId?: string | null;
    memberCode?: string | null;
    memberName?: string | null;
  }
): CoachRoutine[] {
  const uid = (member.uid ?? '').trim();
  const memberId = (member.memberId ?? '').trim();
  const memberCode = (member.memberCode ?? '').trim().toUpperCase();
  const memberName = (member.memberName ?? '').trim().toLowerCase();

  return routines.filter((r) => {
    const target = (r.targetMemberId ?? 'all').trim();
    if (!target || target === 'all' || target === 'current-user') return true;
    if (uid && target === uid) return true;
    if (memberId && target === memberId) return true;
    if (memberCode && r.targetMemberCode && r.targetMemberCode.toUpperCase() === memberCode) {
      return true;
    }
    if (memberName && r.targetMemberName && r.targetMemberName.trim().toLowerCase() === memberName) {
      return true;
    }
    return false;
  });
}

/**
 * Converts a full CoachRoutine (including pyramid per-set plans and optional Cardio block)
 * into live ActiveExercise entries for the member's workout tracker.
 */
export function buildActiveExercisesFromCoachRoutine(
  routine: CoachRoutine,
  lookupMachine: (code: string) => TeljuMachine | undefined,
  timestampSeed = Date.now()
): ActiveExercise[] {
  const mapped: ActiveExercise[] = routine.exercises.map((item, idx) => {
    const machine = lookupMachine(item.machineCode);
    const isCardio = machine?.trackingMode === 'cardio';
    const setsCount = clampSetsCount(item.targetSets);
    const parsedReps = Number.parseInt(item.targetReps, 10) || 10;

    const pyramidPlan =
      item.repScheme === 'piramide'
        ? item.pyramidSets && item.pyramidSets.length > 0
          ? item.pyramidSets
          : generatePyramidSetPlan(
              setsCount,
              item.pyramidPreset ?? 'personalizada',
              item.suggestedWeightKg,
              item.targetReps
            )
        : null;

    const sets = pyramidPlan
      ? pyramidPlan.map((ps, sIdx) => ({
          id: `s-${idx}-${sIdx}-${timestampSeed}`,
          weightKg: ps.weightKg,
          reps: ps.reps,
          rir: sIdx === pyramidPlan.length - 1 ? 1 : 2,
          completed: false,
          previous: `Pirámide S${ps.setNumber} · ${ps.weightKg} kg × ${ps.reps}`,
        }))
      : Array.from({ length: setsCount }, (_, sIdx) => ({
          id: `s-${idx}-${sIdx}-${timestampSeed}`,
          weightKg: item.suggestedWeightKg,
          reps: parsedReps,
          rir: sIdx === setsCount - 1 ? 1 : 2,
          completed: false,
          previous: isCardio
            ? `Nivel ${item.suggestedWeightKg} · ${parsedReps} min`
            : `${item.suggestedWeightKg} kg × ${parsedReps}`,
        }));

    const noteParts = [
      item.repScheme === 'piramide'
        ? `Pirámide (${formatPyramidRepsString(pyramidPlan ?? [])})`
        : null,
      item.intensityLabel ? `Intensidad: ${item.intensityLabel}` : null,
      item.note ?? machine?.tip ?? null,
    ].filter(Boolean);

    return {
      id: `loaded-${routine.id}-${idx}-${timestampSeed}`,
      machineCode: item.machineCode,
      machineName: item.exerciseName ?? machine?.name ?? item.machineCode,
      category: normalizeEquipmentCategory(item.equipmentType ?? machine?.category ?? 'Máquinas Telju'),
      trackingMode: isCardio ? 'cardio' : 'strength',
      muscleGroup: item.muscleGroup ?? machine?.muscleGroup ?? 'Pecho',
      restSeconds: item.restSeconds || 90,
      coachNote: noteParts.join(' · '),
      coachName: routine.coachName,
      coachAvatar: routine.coachAvatar,
      intensityLabel: item.intensityLabel,
      repScheme: item.repScheme ?? 'fijas',
      sets,
    };
  });

  if (routine.cardioBlock?.enabled) {
    const cardioMachine = lookupMachine(routine.cardioBlock.machineCode);
    mapped.push({
      id: `loaded-${routine.id}-cardio-${timestampSeed}`,
      machineCode: routine.cardioBlock.machineCode,
      machineName: routine.cardioBlock.machineName || cardioMachine?.name || 'Cardio Telju',
      category: 'Cardio',
      trackingMode: 'cardio',
      muscleGroup: 'Cardio',
      restSeconds: 60,
      coachNote: [
        `Cardio ${routine.cardioBlock.durationMin} min`,
        routine.cardioBlock.intensityLabel,
        routine.cardioBlock.note,
      ]
        .filter(Boolean)
        .join(' · '),
      coachName: routine.coachName,
      coachAvatar: routine.coachAvatar,
      intensityLabel: routine.cardioBlock.intensityLabel,
      sets: [
        {
          id: `s-cardio-0-${timestampSeed}`,
          weightKg: 10,
          reps: Math.max(1, routine.cardioBlock.durationMin),
          rir: 2,
          completed: false,
          previous: `${routine.cardioBlock.durationMin} min · ${routine.cardioBlock.intensityLabel}`,
        },
      ],
    });
  }

  return mapped;
}

export function getFrequencyDescription(freq: RoutineFrequency): string {
  switch (freq) {
    case 'Diaria':
      return 'Sesión puntual de hoy';
    case 'Semanal':
      return 'Plan semanal (7 días)';
    case 'Mensual':
      return 'Mesociclo de 4 semanas';
    case 'Trimestral':
      return 'Macrociclo de 12 semanas';
  }
}
