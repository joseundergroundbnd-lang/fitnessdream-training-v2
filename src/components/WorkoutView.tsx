import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calculator,
  Check,
  Clock,
  Dumbbell,
  MessageSquare,
  Play,
  Plus,
  Search,
  Send,
  Timer,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { COACH_TEAM, TELJU_LOGO_URL } from '../data/seedData';
import { getMachineByCode, TELJU_MACHINES } from '../data/teljuCatalog';
import type {
  ActiveExercise,
  CoachProfile,
  CoachRoutine,
  DirectMessage,
  EquipmentCategory,
  MemberProfile,
  MuscleGroup,
  TeljuMachine,
} from '../types/gym';
import { CoachMessageThread } from './CoachMessageThread';
import {
  calculateBarbellPlates,
  calculateEstimated1RM,
  calculateWorkoutStats,
  formatSecondsClock,
} from '../utils/gymLogic';

interface WorkoutViewProps {
  activeWorkoutTitle: string;
  activeExercises: ActiveExercise[];
  onUpdateExercises: (exercises: ActiveExercise[]) => void;
  onFinishWorkout: (summary: {
    title: string;
    totalVolumeKg: number;
    totalSets: number;
    durationMin: number;
  }) => void;
  activeCoach: CoachProfile;
  onSelectCoach: (coachId: string) => void;
  coachRoutines: CoachRoutine[];
  onLoadCoachRoutine: (routine: CoachRoutine) => void;
  onSendCoachRoutine: (routine: CoachRoutine) => void;
  onAddMachine: (machine: TeljuMachine) => void;
  profile: MemberProfile;
  directMessages: DirectMessage[];
  onSendDirectMessage: (msg: Omit<DirectMessage, 'id' | 'timestampLabel'>) => void;
}

const CATEGORY_FILTERS: ('Todos' | EquipmentCategory)[] = [
  'Todos',
  'Máquinas Telju',
  'Mancuernas',
  'Cardio',
  'Funcional',
];

const MUSCLE_FILTERS: ('Todos' | MuscleGroup)[] = [
  'Todos',
  'Glúteo / Femoral',
  'Cuádriceps',
  'Pecho',
  'Espalda',
  'Hombro',
  'Brazos',
  'Core / Funcional',
  'Cardio',
];

export const WorkoutView: React.FC<WorkoutViewProps> = ({
  activeWorkoutTitle,
  activeExercises,
  onUpdateExercises,
  onFinishWorkout,
  activeCoach,
  onSelectCoach,
  coachRoutines,
  onLoadCoachRoutine,
  onSendCoachRoutine,
  onAddMachine,
  profile,
  directMessages,
  onSendDirectMessage,
}) => {
  const [subtab, setSubtab] = useState<'activo' | 'coach' | 'mensajes' | 'catalogo'>('activo');
  const memberMessagesCount = useMemo(
    () => directMessages.filter((m) => m.memberId === 'current-user').length,
    [directMessages]
  );
  const [restSecondsLeft, setRestSecondsLeft] = useState<number>(0);
  const [restTotal, setRestTotal] = useState<number>(90);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [plateTargetKg, setPlateTargetKg] = useState<number>(100);
  const [plateBarKg, setPlateBarKg] = useState<number>(20);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Catalog filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Todos' | EquipmentCategory>('Todos');
  const [muscleFilter, setMuscleFilter] = useState<'Todos' | MuscleGroup>('Todos');

  // Coach filter & composer state
  const [coachFilterId, setCoachFilterId] = useState<'todos' | string>('todos');
  const [showCoachComposer, setShowCoachComposer] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftFrequency, setDraftFrequency] = useState<'Diaria' | 'Semanal'>('Diaria');
  const [draftGoal, setDraftGoal] = useState('Hipertrofia, mancuernas y cardio');
  const [draftMessage, setDraftMessage] = useState('');
  const [draftSelectedCodes, setDraftSelectedCodes] = useState<string[]>([
    '4SHP10/0',
    'MANC-01',
    '4HP4TN',
  ]);
  const [coachFormError, setCoachFormError] = useState<string | null>(null);

  useEffect(() => {
    if (restSecondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setRestSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [restSecondsLeft]);

  const stats = useMemo(() => calculateWorkoutStats(activeExercises), [activeExercises]);
  const plateBreakdown = useMemo(
    () => calculateBarbellPlates(plateTargetKg, plateBarKg),
    [plateTargetKg, plateBarKg]
  );

  const filteredMachines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return TELJU_MACHINES.filter((m) => {
      const matchesCat = categoryFilter === 'Todos' || m.category === categoryFilter;
      const matchesMuscle = muscleFilter === 'Todos' || m.muscleGroup === muscleFilter;
      const matchesQuery =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.line.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q);
      return matchesCat && matchesMuscle && matchesQuery;
    });
  }, [searchQuery, categoryFilter, muscleFilter]);

  const showToast = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => setFeedbackBanner(null), 3200);
  };

  const handleToggleSet = (exId: string, setId: string, restSec: number) => {
    let becameCompleted = false;
    const next = activeExercises.map((ex) => {
      if (ex.id !== exId) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s) => {
          if (s.id !== setId) return s;
          becameCompleted = !s.completed;
          return { ...s, completed: !s.completed };
        }),
      };
    });
    onUpdateExercises(next);
    if (becameCompleted) {
      setRestTotal(restSec);
      setRestSecondsLeft(restSec);
    }
  };

  const handleUpdateSetField = (
    exId: string,
    setId: string,
    field: 'weightKg' | 'reps' | 'rir',
    value: number
  ) => {
    const safeVal = Number.isFinite(value) ? Math.max(0, value) : 0;
    onUpdateExercises(
      activeExercises.map((ex) =>
        ex.id !== exId
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s) => (s.id === setId ? { ...s, [field]: safeVal } : s)),
            }
      )
    );
  };

  const handleAddSet = (exId: string) => {
    onUpdateExercises(
      activeExercises.map((ex) => {
        if (ex.id !== exId) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              weightKg: last ? last.weightKg : ex.trackingMode === 'cardio' ? 8 : 30,
              reps: last ? last.reps : ex.trackingMode === 'cardio' ? 15 : 10,
              rir: last ? last.rir : 2,
              completed: false,
              previous: last
                ? ex.trackingMode === 'cardio'
                  ? `Nivel ${last.weightKg} · ${last.reps} min`
                  : `${last.weightKg} kg × ${last.reps}`
                : 'Nueva',
            },
          ],
        };
      })
    );
  };

  const handleRemoveExercise = (exId: string) => {
    onUpdateExercises(activeExercises.filter((ex) => ex.id !== exId));
  };

  const handleFinishSession = () => {
    if (stats.completedSets === 0) {
      showToast('Marca al menos una serie o bloque completado antes de finalizar la sesión.');
      return;
    }
    onFinishWorkout({
      title: activeWorkoutTitle,
      totalVolumeKg: stats.totalVolumeKg,
      totalSets: stats.completedSets,
      durationMin: Math.max(25, stats.completedSets * 4 + stats.totalCardioMin),
    });
    setRestSecondsLeft(0);
    showToast(
      `Sesión guardada en tu perfil: ${stats.totalVolumeKg.toLocaleString('es-ES')} kg${
        stats.totalCardioMin > 0 ? ` + ${stats.totalCardioMin} min cardio` : ''
      }. ¡Aro actualizado!`
    );
  };

  const handleToggleDraftMachine = (code: string) => {
    setDraftSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handlePublishCoachRoutine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) {
      setCoachFormError('Escribe un título para la rutina.');
      return;
    }
    if (draftSelectedCodes.length === 0) {
      setCoachFormError('Selecciona al menos una máquina Telju, ejercicio de mancuerna o cardio.');
      return;
    }
    setCoachFormError(null);

    const newRoutine: CoachRoutine = {
      id: `cr-${Date.now()}`,
      title: draftTitle.trim(),
      frequency: draftFrequency,
      dayLabel: draftFrequency === 'Diaria' ? 'Hoy · Enviada al móvil' : 'Plan Semanal Activo',
      coachId: activeCoach.id,
      coachName: activeCoach.name,
      coachRole: activeCoach.role,
      coachAvatar: activeCoach.avatarUrl,
      goal: draftGoal.trim() || 'Fuerza y constancia',
      sentAt: 'Ahora mismo',
      isNew: true,
      coachMessage:
        draftMessage.trim() ||
        'Concéntrate en la técnica en cada serie y cierra tu sesión de hoy con disciplina.',
      exercises: draftSelectedCodes.map((code) => {
        const machine = getMachineByCode(code);
        const isCardio = machine?.trackingMode === 'cardio';
        return {
          machineCode: code,
          targetSets: isCardio ? 1 : 4,
          targetReps: isCardio ? '20 min' : '10-12',
          suggestedWeightKg: isCardio ? 8 : machine?.category === 'Mancuernas' ? 16 : 50,
          restSeconds: isCardio ? 60 : 90,
        };
      }),
    };

    onSendCoachRoutine(newRoutine);
    setDraftTitle('');
    setDraftMessage('');
    setShowCoachComposer(false);
    showToast(`Coach ${activeCoach.name} envió "${newRoutine.title}" al móvil del socio.`);
  };

  const supervisingCoachAvatar =
    activeExercises.find((e) => e.coachAvatar)?.coachAvatar ?? activeCoach.avatarUrl;
  const supervisingCoachName =
    activeExercises.find((e) => e.coachName)?.coachName ?? activeCoach.name;

  const visibleCoachRoutines = useMemo(() => {
    if (coachFilterId === 'todos') return coachRoutines;
    return coachRoutines.filter((r) => r.coachId === coachFilterId);
  }, [coachFilterId, coachRoutines]);

  return (
    <div className="space-y-6">
      {/* Header & Subtabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs font-medium text-[#33C1FF]">
              Máquinas Telju Fitness · Mancuernas Iron Captain · Cardio Health
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.01em] text-white mt-1">
              Sala de Entrenamiento
            </h1>
          </div>
          <img
            src={TELJU_LOGO_URL}
            alt="Telju Fitness"
            referrerPolicy="no-referrer"
            className="hidden sm:block h-12 w-auto rounded-lg object-contain border border-white/10"
          />
        </div>

        {/* Segmented Subtabs */}
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0D121B] border border-white/10 self-start"
          role="tablist"
          aria-label="Secciones de entrenamiento"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subtab === 'activo'}
            onClick={() => setSubtab('activo')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subtab === 'activo'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Entreno activo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subtab === 'coach'}
            onClick={() => setSubtab('coach')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subtab === 'coach'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Coaches ({coachRoutines.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subtab === 'mensajes'}
            onClick={() => setSubtab('mensajes')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subtab === 'mensajes'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Chat Coach ({memberMessagesCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subtab === 'catalogo'}
            onClick={() => setSubtab('catalogo')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              subtab === 'catalogo'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Ejercicios ({TELJU_MACHINES.length})
          </button>
        </div>
      </div>

      {feedbackBanner && (
        <div
          role="status"
          className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 px-4 py-3 text-sm text-white flex items-center justify-between gap-3"
        >
          <span>{feedbackBanner}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            aria-label="Cerrar aviso"
            className="text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUBTAB 1: ACTIVE WORKOUT LOGGER */}
      {subtab === 'activo' && (
        <div className="space-y-6">
          {/* Session KPI Bar + Coach Javi Assigned Banner */}
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <img
                src={supervisingCoachAvatar}
                alt={`Coach ${supervisingCoachName} uniformado de FitnessDreams`}
                referrerPolicy="no-referrer"
                className="w-14 h-16 rounded-xl object-cover object-top border border-[#00A8FF]/50 shrink-0"
              />
              <div className="space-y-1">
                <p className="text-xs text-[#33C1FF]">
                  Plan activo · Supervisado por Coach {supervisingCoachName}
                </p>
                <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                  {activeWorkoutTitle}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                  <span>
                    Bloques:{' '}
                    <strong className="font-mono tabular-nums text-white">
                      {stats.completedSets}/{stats.totalSets}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Volumen:{' '}
                    <strong className="font-mono tabular-nums text-[#33C1FF]">
                      {stats.totalVolumeKg.toLocaleString('es-ES')} kg
                    </strong>
                  </span>
                  {stats.totalCardioMin > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Cardio:{' '}
                        <strong className="font-mono tabular-nums text-[#33C1FF]">
                          {stats.totalCardioMin} min
                        </strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSubtab('mensajes')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#131B28] hover:border-[#00A8FF] text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <MessageSquare className="w-4 h-4 text-[#00A8FF]" />
                Consultar al Coach
              </button>
              <button
                type="button"
                onClick={() => setShowPlateCalc((v) => !v)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#131B28] hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Calculator className="w-4 h-4 text-[#00A8FF]" />
                Calculadora discos
              </button>
              <button
                type="button"
                onClick={() => {
                  setRestTotal(90);
                  setRestSecondsLeft(90);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#131B28] hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Timer className="w-4 h-4 text-[#00A8FF]" />
                Descanso 90s
              </button>
              <button
                type="button"
                onClick={handleFinishSession}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                Finalizar entreno
              </button>
            </div>
          </div>

          {/* Active Rest Timer Strip */}
          {restSecondsLeft > 0 && (
            <div className="rounded-xl bg-[#0D121B] border border-[#00A8FF]/50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-[#00A8FF]" />
                <div>
                  <p className="text-xs text-slate-400">Temporizador de descanso</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-white">
                    {formatSecondsClock(restSecondsLeft)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRestSecondsLeft((s) => s + 30)}
                  className="min-h-[40px] px-3 rounded-lg bg-[#131B28] text-xs font-mono text-white hover:bg-white/10 cursor-pointer"
                >
                  +30s
                </button>
                <button
                  type="button"
                  onClick={() => setRestSecondsLeft(0)}
                  className="min-h-[40px] px-3 rounded-lg bg-white/8 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  Omitir
                </button>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#131B28] overflow-hidden">
                <div
                  className="h-full bg-[#00A8FF] transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (restSecondsLeft / Math.max(1, restTotal)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Iron Captain Barbell Plate Calculator */}
          {showPlateCalc && (
            <div className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/30 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Calculadora de Discos Iron Captain
                  </h3>
                  <p className="text-xs text-slate-400">
                    Discos disponibles en FitnessDreams: 25 · 20 · 15 · 10 · 5 · 2,5 · 1,25 kg
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlateCalc(false)}
                  aria-label="Cerrar calculadora de discos"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label htmlFor="plate-target" className="block text-xs text-slate-400 mb-1.5">
                    Peso total objetivo (kg)
                  </label>
                  <input
                    id="plate-target"
                    type="number"
                    min={20}
                    step={2.5}
                    value={plateTargetKg}
                    onChange={(e) => setPlateTargetKg(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                  />
                </div>
                <div>
                  <label htmlFor="bar-weight" className="block text-xs text-slate-400 mb-1.5">
                    Peso barra / carro (kg)
                  </label>
                  <select
                    id="bar-weight"
                    value={plateBarKg}
                    onChange={(e) => setPlateBarKg(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono text-white focus:outline-none focus:border-[#00A8FF]"
                  >
                    <option value={20}>Barra Olímpica (20 kg)</option>
                    <option value={15}>Barra Técnica (15 kg)</option>
                    <option value={0}>Máquina palanca (0 kg base)</option>
                  </select>
                </div>
                <div className="rounded-xl bg-[#131B28] px-4 py-3 border border-white/8">
                  <p className="text-xs text-slate-400">Carga por cada lado</p>
                  <p className="text-sm font-mono tabular-nums font-semibold text-[#33C1FF] mt-0.5">
                    {plateBreakdown.perSide.length > 0
                      ? plateBreakdown.perSide.map((p) => `${p.count}× ${p.plateKg} kg`).join(' + ')
                      : 'Solo barra / sin discos'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Exercise Cards (Strength: Telju & Dumbbells | Cardio: Minutes & Level) */}
          {activeExercises.length === 0 ? (
            <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-10 text-center space-y-3">
              <p className="text-lg font-semibold text-white">No hay ejercicios cargados</p>
              <p className="text-sm text-slate-400">
                Carga una rutina de Javi o Joel, o añade máquinas Telju, mancuernas o cardio desde
                el catálogo.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSubtab('coach')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#00A8FF] text-[#04070D] text-xs font-bold cursor-pointer"
                >
                  Ver rutinas de Coaches
                </button>
                <button
                  type="button"
                  onClick={() => setSubtab('catalogo')}
                  className="min-h-[44px] px-4 rounded-xl bg-white/8 text-white text-xs font-semibold cursor-pointer"
                >
                  Añadir máquinas / mancuernas / cardio
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeExercises.map((ex) => {
                const isCardio = ex.trackingMode === 'cardio';
                const bestSet = isCardio
                  ? ex.sets.reduce((acc, s) => acc + s.reps, 0)
                  : ex.sets.reduce((best, s) => {
                      const est = calculateEstimated1RM(s.weightKg, s.reps);
                      return est > best ? est : best;
                    }, 0);

                return (
                  <div
                    key={ex.id}
                    className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#33C1FF] font-mono">
                          {ex.category} · {ex.machineCode} · {ex.muscleGroup}
                        </p>
                        <h3 className="text-xl font-bold text-white mt-0.5">{ex.machineName}</h3>
                        {ex.coachNote && (
                          <p className="text-xs text-slate-400 mt-1">Nota técnica: {ex.coachNote}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-mono tabular-nums">
                          {isCardio ? `Total ${bestSet} min` : `1RM est. ${bestSet} kg`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(ex.id)}
                          aria-label={`Quitar ${ex.machineName} del entreno`}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Sets Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[480px]">
                        <thead>
                          <tr className="border-b border-white/8 text-[11px] text-slate-400">
                            <th className="py-2 pr-2 font-medium w-12">
                              {isCardio ? 'Bloque' : 'Serie'}
                            </th>
                            <th className="py-2 px-2 font-medium">Anterior</th>
                            <th className="py-2 px-2 font-medium w-28">
                              {isCardio ? 'Nivel / Incl.' : 'Peso (kg)'}
                            </th>
                            <th className="py-2 px-2 font-medium w-24">
                              {isCardio ? 'Minutos' : 'Reps'}
                            </th>
                            <th className="py-2 px-2 font-medium w-20">
                              {isCardio ? 'Zona' : 'RIR'}
                            </th>
                            <th className="py-2 pl-2 font-medium text-right w-24">Hecha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/6">
                          {ex.sets.map((s, idx) => (
                            <tr
                              key={s.id}
                              className={s.completed ? 'bg-[#00A8FF]/[0.06]' : undefined}
                            >
                              <td className="py-2.5 pr-2 font-mono tabular-nums text-xs text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-2 font-mono tabular-nums text-xs text-slate-400">
                                {s.previous ?? '—'}
                              </td>
                              <td className="py-2.5 px-2">
                                <input
                                  type="number"
                                  min={0}
                                  step={isCardio ? 1 : 2.5}
                                  aria-label={`${
                                    isCardio ? 'Nivel' : 'Peso'
                                  } serie ${idx + 1} de ${ex.machineName}`}
                                  value={s.weightKg}
                                  onChange={(e) =>
                                    handleUpdateSetField(
                                      ex.id,
                                      s.id,
                                      'weightKg',
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-24 min-h-[40px] rounded-lg bg-[#06080D] border border-white/10 px-2.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                                />
                              </td>
                              <td className="py-2.5 px-2">
                                <input
                                  type="number"
                                  min={0}
                                  aria-label={`${
                                    isCardio ? 'Minutos' : 'Repeticiones'
                                  } serie ${idx + 1} de ${ex.machineName}`}
                                  value={s.reps}
                                  onChange={(e) =>
                                    handleUpdateSetField(
                                      ex.id,
                                      s.id,
                                      'reps',
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-20 min-h-[40px] rounded-lg bg-[#06080D] border border-white/10 px-2.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                                />
                              </td>
                              <td className="py-2.5 px-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={5}
                                  aria-label={`${
                                    isCardio ? 'Zona' : 'RIR'
                                  } serie ${idx + 1} de ${ex.machineName}`}
                                  value={s.rir}
                                  onChange={(e) =>
                                    handleUpdateSetField(
                                      ex.id,
                                      s.id,
                                      'rir',
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-16 min-h-[40px] rounded-lg bg-[#06080D] border border-white/10 px-2.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                                />
                              </td>
                              <td className="py-2.5 pl-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSet(ex.id, s.id, ex.restSeconds)}
                                  aria-label={`Completar serie ${idx + 1} de ${ex.machineName}`}
                                  aria-pressed={s.completed}
                                  className={`min-h-[40px] min-w-[44px] inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                                    s.completed
                                      ? 'bg-[#00A8FF] text-[#04070D]'
                                      : 'bg-[#131B28] text-slate-400 hover:text-white border border-white/10'
                                  }`}
                                >
                                  <Check className="w-4 h-4 stroke-[2.5]" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleAddSet(ex.id)}
                        className="min-h-[40px] px-3.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#00A8FF]" />
                        {isCardio ? 'Añadir bloque cardio' : 'Añadir serie'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubtab('catalogo')}
                        className="text-xs text-slate-400 hover:text-[#33C1FF] cursor-pointer"
                      >
                        + Añadir máquina, mancuerna o cardio
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: COACH TEAM (JAVI BUSTA & JOEL) + COACH SENDER MODE */}
      {subtab === 'coach' && (
        <div className="space-y-6">
          {/* Featured Coaching Team Banner (Javi Busta & Joel — Both Full Access) */}
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#33C1FF]">
                  Equipo Oficial FitnessDreams · Acceso total a la app y envío de rutinas
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-[0.01em] mt-0.5">
                  Coaches Javi Busta &amp; Joel
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowCoachComposer((v) => !v)}
                className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap self-start lg:self-auto"
              >
                <Send className="w-4 h-4" />
                {showCoachComposer
                  ? 'Cerrar Panel Coach'
                  : `Enviar rutina como ${activeCoach.name}`}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {COACH_TEAM.map((coach) => {
                const isSelected = activeCoach.id === coach.id;
                return (
                  <div
                    key={coach.id}
                    className={`rounded-2xl p-4 border flex items-center gap-4 transition-colors ${
                      isSelected
                        ? 'bg-[#00A8FF]/8 border-[#00A8FF]/50'
                        : 'bg-[#06080D] border-white/10'
                    }`}
                  >
                    <img
                      src={coach.avatarUrl}
                      alt={`Coach ${coach.name} con uniforme oficial FitnessDreams`}
                      referrerPolicy="no-referrer"
                      className="w-20 h-24 rounded-xl object-cover object-top border-2 border-[#00A8FF] shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div>
                        <p className="text-xs text-[#33C1FF] font-medium">{coach.role}</p>
                        <h3 className="text-xl font-bold text-white leading-tight">{coach.name}</h3>
                      </div>
                      <p className="text-xs text-slate-300">{coach.specialty}</p>
                      <p className="text-[11px] text-slate-400">{coach.accessLevel}</p>
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectCoach(coach.id);
                            setSubtab('mensajes');
                          }}
                          className="min-h-[34px] px-3 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Mensaje / Audio
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectCoach(coach.id);
                            setShowCoachComposer(true);
                          }}
                          className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'bg-[#131B28] border border-[#00A8FF] text-[#33C1FF]'
                              : 'bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-slate-200'
                          }`}
                        >
                          {isSelected ? `Enviar rutina (${coach.name})` : `Usar como ${coach.name}`}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Coach Routine Sender (Supports both Javi Busta & Joel) */}
          {showCoachComposer && (
            <form
              onSubmit={handlePublishCoachRoutine}
              className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/35 p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={activeCoach.avatarUrl}
                    alt={`Coach ${activeCoach.name}`}
                    referrerPolicy="no-referrer"
                    className="w-12 h-14 rounded-xl object-cover object-top border border-[#00A8FF]"
                  />
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      Panel de Coach {activeCoach.name} — Enviar rutina al socio
                    </h3>
                    <p className="text-xs text-slate-400">
                      La rutina llegará al móvil del socio firmada con la foto oficial de{' '}
                      {activeCoach.name}.
                    </p>
                  </div>
                </div>

                <div
                  className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#06080D] border border-white/10 self-start"
                  role="group"
                  aria-label="Elegir entrenador emisor"
                >
                  {COACH_TEAM.map((coach) => (
                    <button
                      key={coach.id}
                      type="button"
                      onClick={() => onSelectCoach(coach.id)}
                      aria-pressed={activeCoach.id === coach.id}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        activeCoach.id === coach.id
                          ? 'bg-[#00A8FF] text-[#04070D]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {coach.name}
                    </button>
                  ))}
                </div>
              </div>

              {coachFormError && (
                <p role="alert" className="text-xs text-rose-400 font-medium">
                  {coachFormError}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="coach-title" className="block text-xs text-slate-400 mb-1.5">
                    Nombre de la rutina
                  </label>
                  <input
                    id="coach-title"
                    type="text"
                    placeholder="Ej. Fuerza Telju + Mancuernas + Cinta"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                  />
                </div>
                <div>
                  <label htmlFor="coach-freq" className="block text-xs text-slate-400 mb-1.5">
                    Frecuencia
                  </label>
                  <select
                    id="coach-freq"
                    value={draftFrequency}
                    onChange={(e) => setDraftFrequency(e.target.value as 'Diaria' | 'Semanal')}
                    className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
                  >
                    <option value="Diaria">Rutina Diaria</option>
                    <option value="Semanal">Plan Semanal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="coach-goal" className="block text-xs text-slate-400 mb-1.5">
                    Objetivo
                  </label>
                  <input
                    id="coach-goal"
                    type="text"
                    value={draftGoal}
                    onChange={(e) => setDraftGoal(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
                  />
                </div>
                <div>
                  <label htmlFor="coach-msg" className="block text-xs text-slate-400 mb-1.5">
                    Indicaciones de {activeCoach.name} para el socio
                  </label>
                  <input
                    id="coach-msg"
                    type="text"
                    placeholder="Ej. Técnica limpia y 15 min finales en cinta inclinada"
                    value={draftMessage}
                    onChange={(e) => setDraftMessage(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Selecciona máquinas Telju, mancuernas o cardio ({draftSelectedCodes.length}{' '}
                  seleccionados)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                  {TELJU_MACHINES.map((m) => {
                    const selected = draftSelectedCodes.includes(m.code);
                    return (
                      <button
                        key={m.code}
                        type="button"
                        onClick={() => handleToggleDraftMachine(m.code)}
                        aria-pressed={selected}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-left text-xs border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#00A8FF]/18 border-[#00A8FF] text-white'
                            : 'bg-[#06080D] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <p className="font-semibold truncate">{m.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">
                          {m.category} · {m.code}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-white/8">
                <button
                  type="button"
                  onClick={() => setShowCoachComposer(false)}
                  className="min-h-[44px] px-4 rounded-xl bg-white/6 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Enviar al móvil del socio
                </button>
              </div>
            </form>
          )}

          {/* Filter Routines by Coach */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0D121B] border border-white/10">
              <button
                type="button"
                onClick={() => setCoachFilterId('todos')}
                aria-pressed={coachFilterId === 'todos'}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  coachFilterId === 'todos'
                    ? 'bg-[#00A8FF] text-[#04070D]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Todas ({coachRoutines.length})
              </button>
              {COACH_TEAM.map((coach) => {
                const count = coachRoutines.filter((r) => r.coachId === coach.id).length;
                return (
                  <button
                    key={coach.id}
                    type="button"
                    onClick={() => setCoachFilterId(coach.id)}
                    aria-pressed={coachFilterId === coach.id}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      coachFilterId === coach.id
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {coach.name} ({count})
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-[#00A8FF]" />
              Javi Busta y Joel · Rutinas sincronizadas en directo
            </span>
          </div>

          {/* Coach Inbox Cards featuring uniformed FitnessDreams portraits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {visibleCoachRoutines.map((routine) => (
              <article
                key={routine.id}
                className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={routine.coachAvatar}
                      alt={`Coach ${routine.coachName} uniformado FitnessDreams`}
                      referrerPolicy="no-referrer"
                      className="w-16 h-20 rounded-xl object-cover object-top border border-[#00A8FF]/50 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#33C1FF] font-semibold">
                          {routine.frequency} · {routine.dayLabel}
                        </span>
                        <span className="text-slate-400">{routine.sentAt}</span>
                      </div>
                      <h3 className="text-2xl font-bold text-white tracking-[0.01em] leading-tight mt-1">
                        {routine.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-[#00A8FF]" />
                        {routine.coachName} · {routine.goal}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 leading-relaxed">
                    “{routine.coachMessage}”
                  </p>

                  <div className="divide-y divide-white/8 border-t border-white/8 pt-2">
                    {routine.exercises.map((item) => {
                      const machine = getMachineByCode(item.machineCode);
                      return (
                        <div
                          key={item.machineCode}
                          className="py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">
                              {machine ? machine.name : item.machineCode}
                            </p>
                            <p className="font-mono text-slate-400">
                              {machine?.category ?? 'Telju'} · {item.machineCode}
                              {item.note ? ` · ${item.note}` : ''}
                            </p>
                          </div>
                          <span className="font-mono tabular-nums text-slate-300 shrink-0">
                            {item.targetSets} × {item.targetReps}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onLoadCoachRoutine(routine);
                    setSubtab('activo');
                    showToast(`Rutina "${routine.title}" cargada en tu Entreno Activo.`);
                  }}
                  className="w-full min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Cargar y entrenar ahora
                </button>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 3: CHAT & AUDIO NOTES WITH COACHES (JAVI BUSTA & JOEL) */}
      {subtab === 'mensajes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 4 cols: Choose Coach to message or send voice audio */}
          <div className="lg:col-span-4 rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-4">
            <div>
              <p className="text-xs font-medium text-[#33C1FF]">
                Contacto directo con entrenadores
              </p>
              <h2 className="text-xl font-bold text-white mt-0.5">Elige tu Coach</h2>
              <p className="text-xs text-slate-400 mt-1">
                Pide tu próxima rutina o consulta cualquier duda por mensaje escrito o nota de voz.
              </p>
            </div>

            <div className="space-y-2.5">
              {COACH_TEAM.map((coach) => {
                const isSelected = activeCoach.id === coach.id;
                const count = directMessages.filter(
                  (m) => m.coachId === coach.id && m.memberId === 'current-user'
                ).length;

                return (
                  <button
                    key={coach.id}
                    type="button"
                    onClick={() => onSelectCoach(coach.id)}
                    aria-pressed={isSelected}
                    className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#00A8FF]/14 border-[#00A8FF]'
                        : 'bg-[#06080D] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <img
                      src={coach.avatarUrl}
                      alt={`Coach ${coach.name}`}
                      referrerPolicy="no-referrer"
                      className="w-12 h-14 rounded-lg object-cover object-top border border-[#00A8FF]/50 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">Coach {coach.name}</p>
                      <p className="text-xs text-slate-400 truncate">{coach.specialty}</p>
                      <p className="text-[11px] font-mono tabular-nums text-[#33C1FF] mt-0.5">
                        {count} {count === 1 ? 'mensaje' : 'mensajes'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 8 cols: Bidirectional Text + Voice Audio Thread */}
          <div className="lg:col-span-8">
            <CoachMessageThread
              viewerRole="member"
              coach={activeCoach}
              memberId="current-user"
              memberName={profile.name}
              memberAvatar={profile.avatarUrl}
              messages={directMessages}
              onSendMessage={onSendDirectMessage}
            />
          </div>
        </div>
      )}

      {/* SUBTAB 4: COMPLETE CATALOG (MÁQUINAS TELJU + MANCUERNAS + CARDIO + FUNCIONAL) */}
      {subtab === 'catalogo' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo de entrenamiento">
              {CATEGORY_FILTERS.map((cat) => {
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'bg-[#131B28] text-slate-300 hover:text-white border border-white/8'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Buscar ejercicio, máquina Telju, mancuerna o cardio"
                placeholder="Buscar máquina Telju, mancuernas o cardio (ej. Glute-Up, Mancuernas, Cinta, 4SHP...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00A8FF]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {MUSCLE_FILTERS.map((group) => {
                const active = muscleFilter === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setMuscleFilter(group)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white text-[#06080D] font-bold'
                        : 'bg-[#06080D] text-slate-400 hover:text-white border border-white/8'
                    }`}
                  >
                    {group}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMachines.map((machine) => (
              <div
                key={machine.code}
                className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span className="text-[#33C1FF]">
                      {machine.category} · {machine.code}
                    </span>
                    <span>{machine.muscleGroup}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white leading-snug">{machine.name}</h3>
                  <p className="text-xs text-slate-400">
                    {machine.line}
                    {machine.maxLoad ? ` · ${machine.maxLoad}` : ''}
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed pt-1">{machine.tip}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onAddMachine(machine);
                    setSubtab('activo');
                    showToast(`${machine.name} añadida a tu sesión.`);
                  }}
                  className="w-full min-h-[42px] rounded-xl bg-[#131B28] hover:bg-[#00A8FF] hover:text-[#04070D] text-slate-200 border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {machine.trackingMode === 'cardio' ? (
                    <Activity className="w-3.5 h-3.5" />
                  ) : (
                    <Dumbbell className="w-3.5 h-3.5" />
                  )}
                  Añadir al entreno
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
