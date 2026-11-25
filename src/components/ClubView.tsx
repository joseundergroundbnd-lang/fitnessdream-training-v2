import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Coffee,
  Crown,
  Dumbbell,
  ExternalLink,
  FileText,
  Flame,
  Gift,
  Play,
  QrCode,
  Square,
  Ticket,
  Trophy,
  UserPlus,
} from 'lucide-react';
import {
  CAFE_CARTA_ABIERTA_IMG,
  CAFE_DISCO_CERRADO_IMG,
  CAFE_DOSIER_PDF_URL,
  CAFE_MENU,
  CHALLENGE_70KG_EVENT_IMG,
  CHALLENGE_PEDESTAL_IMG,
} from '../data/seedData';
import type {
  ActiveExercise,
  CafeCategory,
  ChallengeAttempt,
  ClubFriendProfile,
  CoachRoutine,
  GuestPass,
  MemberProfile,
  MonthlyClubChallenge,
  PeerWorkoutChallenge,
  SharedWorkoutPost,
  StrengthLiftAttempt,
} from '../types/gym';
import {
  calculateFounderPrice,
  formatSecondsClock,
  getMancuernaChallengeTier,
  sortChallengeLeaderboard,
  sortStrengthLeaderboard,
} from '../utils/gymLogic';
import { BrandLogo } from './BrandLogo';
import { CommunitySocialPanel } from './CommunitySocialPanel';

interface ClubViewProps {
  profile: MemberProfile;
  leaderboard: ChallengeAttempt[];
  onLogChallengeAttempt: (weightKg: number, durationSec: number) => void;
  strengthLeaderboard: StrengthLiftAttempt[];
  onLogStrengthLift: (
    exercise: 'press-banca' | 'sentadilla',
    weightKg: number,
    reps: number
  ) => void;
  monthlyChallenges: MonthlyClubChallenge[];
  onToggleJoinMonthlyChallenge: (challengeId: string) => void;
  guestPasses: GuestPass[];
  onCreateGuestPass: (guestName: string) => void;
  friends: ClubFriendProfile[];
  peerChallenges: PeerWorkoutChallenge[];
  sharedWorkouts: SharedWorkoutPost[];
  activeWorkoutTitle: string;
  activeExercises: ActiveExercise[];
  coachRoutines: CoachRoutine[];
  onFriendAction: (friendId: string, action: 'send-request' | 'accept' | 'remove') => void;
  onCreatePeerChallenge: (payload: {
    opponentId: string;
    opponentName: string;
    workoutTitle: string;
    targetGoal: string;
    stakeNote: string;
  }) => void;
  onPeerChallengeAction: (challengeId: string, action: 'accept' | 'complete' | 'decline') => void;
  onShareWorkout: (payload: {
    workoutTitle: string;
    summary: string;
    machineCodes: string[];
    sharedWithLabel: string;
  }) => void;
  onToggleCheerSharedWorkout: (postId: string) => void;
  onLoadSharedWorkout: (post: SharedWorkoutPost) => void;
}

const CAFE_CATEGORIES: ('Todas' | CafeCategory)[] = [
  'Todas',
  'Plancha & Sandwichera Fit',
  'Vitrina Fría & Bowls',
  'Café, Matcha & Batidos',
  'Dulces Fit de Vitrina',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

/** Deterministic crisp SVG QR pattern for fitnesdreamcalculator.lovable.app */
const CALCULATOR_QR_CELLS: boolean[] = (() => {
  const cells: boolean[] = [];
  let state = 702026 * 1664525 + 1013904223;
  for (let i = 0; i < 121; i++) {
    const row = Math.floor(i / 11);
    const col = i % 11;
    const inTL = row < 3 && col < 3;
    const inTR = row < 3 && col >= 8;
    const inBL = row >= 8 && col < 3;
    if (inTL || inTR || inBL) {
      const border =
        row === 0 || row === 2 || row === 8 || row === 10 || col === 0 || col === 2 || col === 8 || col === 10;
      const center = (row === 1 && col === 1) || (row === 1 && col === 9) || (row === 9 && col === 1);
      cells.push(border || center);
    } else {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      cells.push(state % 10 > 4);
    }
  }
  return cells;
})();

const MemberAvatarBadge: React.FC<{
  name: string;
  avatarUrl?: string;
  highlight?: boolean;
}> = ({ name, avatarUrl, highlight }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`w-10 h-10 rounded-xl object-cover object-top shrink-0 border ${
          highlight ? 'border-[#00A8FF]' : 'border-white/15'
        }`}
      />
    );
  }
  return (
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold font-mono shrink-0 border ${
        highlight
          ? 'bg-[#00A8FF]/20 border-[#00A8FF] text-[#33C1FF]'
          : 'bg-[#131B28] border-white/10 text-slate-300'
      }`}
    >
      {getInitials(name)}
    </div>
  );
};

export const ClubView: React.FC<ClubViewProps> = ({
  profile,
  leaderboard,
  onLogChallengeAttempt,
  strengthLeaderboard,
  onLogStrengthLift,
  monthlyChallenges,
  onToggleJoinMonthlyChallenge,
  guestPasses,
  onCreateGuestPass,
  friends,
  peerChallenges,
  sharedWorkouts,
  activeWorkoutTitle,
  activeExercises,
  coachRoutines,
  onFriendAction,
  onCreatePeerChallenge,
  onPeerChallengeAction,
  onShareWorkout,
  onToggleCheerSharedWorkout,
  onLoadSharedWorkout,
}) => {
  const [subtab, setSubtab] = useState<'challenge' | 'amigos' | 'fundador' | 'cafeteria'>('challenge');
  const [challengeKind, setChallengeKind] = useState<'mancuerna' | 'press-banca' | 'sentadilla'>(
    'mancuerna'
  );
  const pendingSocialCount =
    friends.filter((f) => f.status === 'solicitud-recibida').length +
    peerChallenges.filter((c) => c.direction === 'recibido' && c.status === 'pendiente').length;

  // Challenge de la Mancuerna 70 kg interactive logger + stopwatch
  const [challengeWeight, setChallengeWeight] = useState<number>(70);
  const [challengeSeconds, setChallengeSeconds] = useState<number>(20);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [challengeSavedMsg, setChallengeSavedMsg] = useState<string | null>(null);

  // Press Banca & Sentadilla lift form
  const [liftWeight, setLiftWeight] = useState<number>(110);
  const [liftReps, setLiftReps] = useState<number>(1);
  const [liftSavedMsg, setLiftSavedMsg] = useState<string | null>(null);

  // Guest pass form
  const [guestName, setGuestName] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);

  // Fit Café state (Dosier Disco Olímpico 20 kg)
  const [cafeViewMode, setCafeViewMode] = useState<'cerrado' | 'abierta'>('abierta');
  const [cafeCategory, setCafeCategory] = useState<'Todas' | CafeCategory>('Todas');
  const [cafeTicket, setCafeTicket] = useState<{
    itemName: string;
    price: number;
    code: string;
  } | null>(null);

  useEffect(() => {
    if (!stopwatchRunning) return;
    const id = window.setInterval(() => {
      setChallengeSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [stopwatchRunning]);

  // Adjust default suggested lift weight when switching between Press Banca and Sentadilla
  useEffect(() => {
    if (challengeKind === 'press-banca') {
      setLiftWeight(110);
      setLiftReps(1);
    } else if (challengeKind === 'sentadilla') {
      setLiftWeight(150);
      setLiftReps(1);
    }
    setLiftSavedMsg(null);
  }, [challengeKind]);

  const sortedMancuerna = useMemo(() => sortChallengeLeaderboard(leaderboard), [leaderboard]);
  const sortedPressBanca = useMemo(
    () =>
      sortStrengthLeaderboard(
        strengthLeaderboard.filter((entry) => entry.exercise === 'press-banca')
      ),
    [strengthLeaderboard]
  );
  const sortedSentadilla = useMemo(
    () =>
      sortStrengthLeaderboard(
        strengthLeaderboard.filter((entry) => entry.exercise === 'sentadilla')
      ),
    [strengthLeaderboard]
  );

  const currentUserBest = useMemo(() => {
    const mine = sortedMancuerna.find((entry) => entry.isCurrentUser);
    return mine ?? sortedMancuerna[0];
  }, [sortedMancuerna]);

  const userTier = getMancuernaChallengeTier(
    currentUserBest?.weightKg ?? 50,
    currentUserBest?.durationSec ?? 0
  );
  const previewTier = getMancuernaChallengeTier(challengeWeight, challengeSeconds);
  const remainingGuestPasses = Math.max(0, 2 - guestPasses.length);

  const filteredCafeItems = useMemo(() => {
    if (cafeCategory === 'Todas') return CAFE_MENU;
    return CAFE_MENU.filter((item) => item.category === cafeCategory);
  }, [cafeCategory]);

  const handleSaveChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    if (challengeWeight < 4 || challengeSeconds < 5) {
      setChallengeSavedMsg('Introduce al menos 4 kg y 5 segundos para registrar una marca válida.');
      return;
    }
    setStopwatchRunning(false);
    onLogChallengeAttempt(challengeWeight, challengeSeconds);
    setChallengeSavedMsg(
      `Marca registrada: ${challengeWeight} kg durante ${challengeSeconds}s (${previewTier.tierName}).`
    );
    window.setTimeout(() => setChallengeSavedMsg(null), 3500);
  };

  const handleSaveStrengthLift = (e: React.FormEvent) => {
    e.preventDefault();
    if (challengeKind === 'mancuerna') return;
    if (liftWeight < 20 || liftReps < 1) {
      setLiftSavedMsg('Introduce al menos 20 kg y 1 repetición válida.');
      return;
    }
    onLogStrengthLift(challengeKind, liftWeight, liftReps);
    const label = challengeKind === 'press-banca' ? 'Press Banca' : 'Sentadilla';
    setLiftSavedMsg(`Marca oficial de ${label} guardada: ${liftWeight} kg × ${liftReps} rep.`);
    window.setTimeout(() => setLiftSavedMsg(null), 3500);
  };

  const handleCreateGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (remainingGuestPasses <= 0) {
      setGuestError('Ya has utilizado tus 2 pases de invitado gratuitos de este mes.');
      return;
    }
    if (!guestName.trim()) {
      setGuestError('Introduce el nombre completo de tu invitado.');
      return;
    }
    setGuestError(null);
    onCreateGuestPass(guestName.trim());
    setGuestName('');
  };

  const handleOrderCafe = (itemName: string, standardPrice: number) => {
    const { finalPrice } = calculateFounderPrice(standardPrice, profile.founderDiscountCafePct);
    const code = `CAF-${Math.floor(100 + Math.random() * 899)}`;
    setCafeTicket({ itemName, price: finalPrice, code });
  };

  const activeStrengthBoard =
    challengeKind === 'press-banca' ? sortedPressBanca : sortedSentadilla;

  return (
    <div className="space-y-6">
      {/* Header & Club Subtabs */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#33C1FF]">
            Comunidad FitnessDreams · Work Your Dreams
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-[0.01em] text-white mt-1">
            Club, Challenges y Fit Café
          </h1>
        </div>

        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0D121B] border border-white/10 self-start"
          role="tablist"
          aria-label="Secciones del club"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subtab === 'challenge'}
            onClick={() => setSubtab('challenge')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              subtab === 'challenge'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Challenges &amp; Rankings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subtab === 'amigos'}
            onClick={() => setSubtab('amigos')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              subtab === 'amigos'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Amigos &amp; Retos 1v1{pendingSocialCount > 0 ? ` (${pendingSocialCount})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subtab === 'fundador'}
            onClick={() => setSubtab('fundador')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              subtab === 'fundador'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Socio Fundador
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subtab === 'cafeteria'}
            onClick={() => setSubtab('cafeteria')}
            className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              subtab === 'cafeteria'
                ? 'bg-[#00A8FF] text-[#04070D]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Cafetería Fit Café
          </button>
        </div>
      </div>

      {/* SUBTAB 1: CHALLENGES & RANKINGS (Mancuerna 70 kg + Press Banca + Sentadilla) */}
      {subtab === 'challenge' && (
        <div className="space-y-6">
          {/* Challenge Selector Bar */}
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            role="tablist"
            aria-label="Modalidad de desafío"
          >
            <button
              type="button"
              role="tab"
              aria-selected={challengeKind === 'mancuerna'}
              onClick={() => setChallengeKind('mancuerna')}
              className={`min-h-[56px] rounded-2xl px-4 py-3 text-left border flex items-center justify-between gap-3 cursor-pointer ${
                challengeKind === 'mancuerna'
                  ? 'bg-[#00A8FF]/15 border-[#00A8FF] text-white'
                  : 'bg-[#0D121B] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              <div>
                <p className="text-xs text-[#33C1FF] font-semibold">Reto Pedestal</p>
                <p className="text-base font-bold font-display tracking-wide">Mancuerna 70 kg</p>
              </div>
              <Trophy className="w-5 h-5 text-[#00A8FF] shrink-0" />
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={challengeKind === 'press-banca'}
              onClick={() => setChallengeKind('press-banca')}
              className={`min-h-[56px] rounded-2xl px-4 py-3 text-left border flex items-center justify-between gap-3 cursor-pointer ${
                challengeKind === 'press-banca'
                  ? 'bg-[#00A8FF]/15 border-[#00A8FF] text-white'
                  : 'bg-[#0D121B] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              <div>
                <p className="text-xs text-[#33C1FF] font-semibold">Telju 4SHO073/0</p>
                <p className="text-base font-bold font-display tracking-wide">Ranking Press Banca</p>
              </div>
              <Dumbbell className="w-5 h-5 text-[#00A8FF] shrink-0" />
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={challengeKind === 'sentadilla'}
              onClick={() => setChallengeKind('sentadilla')}
              className={`min-h-[56px] rounded-2xl px-4 py-3 text-left border flex items-center justify-between gap-3 cursor-pointer ${
                challengeKind === 'sentadilla'
                  ? 'bg-[#00A8FF]/15 border-[#00A8FF] text-white'
                  : 'bg-[#0D121B] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              <div>
                <p className="text-xs text-[#33C1FF] font-semibold">Rack / 4SHO004/0</p>
                <p className="text-base font-bold font-display tracking-wide">Ranking Sentadilla</p>
              </div>
              <Flame className="w-5 h-5 text-[#00A8FF] shrink-0" />
            </button>
          </div>

          {/* MODE A: RETO MANCUERNA 70 KG */}
          {challengeKind === 'mancuerna' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: Pedestal + Event Visuals & Stopwatch Logger */}
              <div className="lg:col-span-6 space-y-6">
                <div className="rounded-2xl bg-[#0D121B] border border-white/10 overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 bg-[#06080D]">
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={CHALLENGE_PEDESTAL_IMG}
                        alt="Pedestal oficial de la Mancuerna del Desafío FitnessDreams"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06080D] via-[#06080D]/60 to-transparent px-3 py-2">
                        <p className="text-[11px] font-semibold text-[#33C1FF]">
                          Pedestal Sala Central
                        </p>
                      </div>
                    </div>
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={CHALLENGE_70KG_EVENT_IMG}
                        alt="Evento mensual Reto 70 kg FitnessDreams"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06080D] via-[#06080D]/60 to-transparent px-3 py-2">
                        <p className="text-[11px] font-semibold text-[#33C1FF]">
                          Reto Oficial 70 kg
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <p className="text-xs font-medium text-[#33C1FF]">
                        Reto oficial FitnessDreams · Fuerza de agarre y voluntad
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-[0.01em] mt-0.5">
                        El Challenge de la Mancuerna
                      </h2>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                      Levanta y sostén nuestra mancuerna gigante de{' '}
                      <strong className="text-white">hasta 70 kg</strong> en el pedestal central.
                      Tu puntuación multiplica kilos por segundos y desbloquea los aros:{' '}
                      <strong className="text-white">Aro de Hierro</strong>,{' '}
                      <strong className="text-white">Aro de Acero</strong>,{' '}
                      <strong className="text-white">Aro Eléctrico</strong> y{' '}
                      <strong className="text-[#33C1FF]">Leyenda Dream</strong>.
                    </p>

                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/8">
                      <div>
                        <p className="text-xs text-slate-400">Tu nivel actual</p>
                        <p className="text-base font-bold text-[#33C1FF] mt-0.5">
                          {userTier.tierName}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Tu puntuación</p>
                        <p className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                          {userTier.score} pts
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Siguiente aro</p>
                        <p className="text-base font-bold font-mono tabular-nums text-slate-200 mt-0.5">
                          {userTier.nextMilestoneScore
                            ? `${userTier.nextMilestoneScore} pts`
                            : 'Máximo'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stopwatch Attempt Form */}
                <form
                  onSubmit={handleSaveChallenge}
                  className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-bold text-white">Registrar intento oficial</h3>
                    <span className="text-xs font-mono tabular-nums text-[#33C1FF]">
                      {previewTier.score} pts · {previewTier.tierName}
                    </span>
                  </div>

                  {challengeSavedMsg && (
                    <div
                      role="status"
                      className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 px-4 py-3 text-xs text-white"
                    >
                      {challengeSavedMsg}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="challenge-weight"
                        className="block text-xs text-slate-400 mb-1.5"
                      >
                        Peso mancuerna (kg, máx 70)
                      </label>
                      <input
                        id="challenge-weight"
                        type="number"
                        min={4}
                        max={70}
                        step={2}
                        value={challengeWeight}
                        onChange={(e) => setChallengeWeight(Number(e.target.value))}
                        className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="challenge-seconds"
                        className="block text-xs text-slate-400 mb-1.5"
                      >
                        Tiempo sostenido (segundos)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="challenge-seconds"
                          type="number"
                          min={1}
                          max={600}
                          value={challengeSeconds}
                          onChange={(e) => setChallengeSeconds(Number(e.target.value))}
                          className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!stopwatchRunning) {
                              setChallengeSeconds(0);
                              setStopwatchRunning(true);
                            } else {
                              setStopwatchRunning(false);
                            }
                          }}
                          aria-label={stopwatchRunning ? 'Detener cronómetro' : 'Iniciar cronómetro'}
                          className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                            stopwatchRunning
                              ? 'bg-rose-500 text-white'
                              : 'bg-[#131B28] text-slate-200 border border-white/10 hover:border-[#00A8FF]'
                          }`}
                        >
                          {stopwatchRunning ? (
                            <>
                              <Square className="w-3.5 h-3.5 fill-current" />
                              {formatSecondsClock(challengeSeconds)}
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Crono
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trophy className="w-4 h-4" />
                    Guardar marca en Ranking Mancuerna
                  </button>
                </form>
              </div>

              {/* Right: Mancuerna Leaderboard with Member Photos */}
              <div className="lg:col-span-6 rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                      Ranking Mancuerna 70 kg · Benidorm
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Top socios con foto de perfil oficial
                    </p>
                  </div>
                  <Trophy className="w-5 h-5 text-[#00A8FF]" />
                </div>

                <div className="divide-y divide-white/8">
                  {sortedMancuerna.map((entry, idx) => {
                    const tier = getMancuernaChallengeTier(entry.weightKg, entry.durationSec);
                    return (
                      <div
                        key={entry.id}
                        className={`py-3.5 px-3 -mx-3 rounded-xl flex items-center justify-between gap-3 ${
                          entry.isCurrentUser ? 'bg-[#00A8FF]/10 border border-[#00A8FF]/25' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-7 text-center font-mono tabular-nums font-bold text-sm shrink-0 ${
                              idx === 0 ? 'text-[#33C1FF]' : 'text-slate-400'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <MemberAvatarBadge
                            name={entry.memberName}
                            avatarUrl={entry.isCurrentUser ? profile.avatarUrl : entry.avatarUrl}
                            highlight={Boolean(entry.isCurrentUser)}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {entry.memberName}
                              {entry.isCurrentUser ? ' (Tú)' : ''}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {entry.memberTag} · {tier.tierName} · {entry.dateLabel}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold font-mono tabular-nums text-[#33C1FF]">
                            {tier.score} pts
                          </p>
                          <p className="text-xs font-mono tabular-nums text-slate-400">
                            {entry.weightKg} kg × {entry.durationSec}s
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* MODE B & C: RANKING PRESS BANCA & RANKING SENTADILLA */}
          {(challengeKind === 'press-banca' || challengeKind === 'sentadilla') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: Register Max Lift Form */}
              <div className="lg:col-span-5 space-y-6">
                <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <MemberAvatarBadge
                      name={profile.name}
                      avatarUrl={profile.avatarUrl}
                      highlight
                    />
                    <div>
                      <p className="text-xs font-medium text-[#33C1FF]">
                        {challengeKind === 'press-banca'
                          ? 'Banco Press Banca Telju · 4SHO073/0'
                          : 'Jaula / Multipower Telju · 4SHO004/0'}
                      </p>
                      <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                        {challengeKind === 'press-banca'
                          ? 'Desafío Press Banca'
                          : 'Desafío Sentadilla'}
                      </h2>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 leading-relaxed">
                    {challengeKind === 'press-banca'
                      ? 'Sube tu levantamiento máximo de Press Banca con técnica limpia (barra al pecho y extensión completa). El ranking ordena por mayor peso levantado y desempata por repeticiones.'
                      : 'Registra tu mejor marca en Sentadilla rompiendo el paralelo en Rack o Multipower Telju. Tu foto de perfil aparecerá automáticamente en el podio del club.'}
                  </p>
                </div>

                <form
                  onSubmit={handleSaveStrengthLift}
                  className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-5"
                >
                  <h3 className="text-xl font-bold text-white">
                    Registrar marca de{' '}
                    {challengeKind === 'press-banca' ? 'Press Banca' : 'Sentadilla'}
                  </h3>

                  {liftSavedMsg && (
                    <div
                      role="status"
                      className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 px-4 py-3 text-xs text-white"
                    >
                      {liftSavedMsg}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="strength-weight-kg"
                        className="block text-xs text-slate-400 mb-1.5"
                      >
                        Peso levantado (kg)
                      </label>
                      <input
                        id="strength-weight-kg"
                        type="number"
                        min={20}
                        max={350}
                        step={2.5}
                        value={liftWeight}
                        onChange={(e) => setLiftWeight(Number(e.target.value))}
                        className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="strength-reps"
                        className="block text-xs text-slate-400 mb-1.5"
                      >
                        Repeticiones válidas
                      </label>
                      <input
                        id="strength-reps"
                        type="number"
                        min={1}
                        max={20}
                        value={liftReps}
                        onChange={(e) => setLiftReps(Number(e.target.value))}
                        className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-[#00A8FF]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trophy className="w-4 h-4" />
                    Subir marca al ranking de{' '}
                    {challengeKind === 'press-banca' ? 'Press Banca' : 'Sentadilla'}
                  </button>
                </form>
              </div>

              {/* Right: Strength Leaderboard with Member Photos */}
              <div className="lg:col-span-7 rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                      {challengeKind === 'press-banca'
                        ? 'Top Press Banca · Mayor Peso'
                        : 'Top Sentadilla · Mayor Peso'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Clasificación oficial de socios FitnessDreams Benidorm
                    </p>
                  </div>
                  <Trophy className="w-5 h-5 text-[#00A8FF]" />
                </div>

                <div className="divide-y divide-white/8">
                  {activeStrengthBoard.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className={`py-3.5 px-3 -mx-3 rounded-xl flex items-center justify-between gap-3 ${
                        entry.isCurrentUser ? 'bg-[#00A8FF]/10 border border-[#00A8FF]/25' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 text-center font-mono tabular-nums font-bold text-sm shrink-0 ${
                            idx === 0 ? 'text-[#33C1FF]' : 'text-slate-400'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <MemberAvatarBadge
                          name={entry.memberName}
                          avatarUrl={entry.isCurrentUser ? profile.avatarUrl : entry.avatarUrl}
                          highlight={Boolean(entry.isCurrentUser)}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {entry.memberName}
                            {entry.isCurrentUser ? ' (Tú)' : ''}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {entry.memberTag} · {entry.dateLabel}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-base font-bold font-mono tabular-nums text-[#33C1FF]">
                          {entry.weightKg} kg
                        </p>
                        <p className="text-xs font-mono tabular-nums text-slate-400">
                          {entry.reps} {entry.reps === 1 ? 'rep' : 'reps'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Active Monthly Challenges & Official Prizes published from Owner Panel */}
          {monthlyChallenges.some((c) => c.active) && (
            <div className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/30 p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-[#33C1FF]">
                    Retos Oficiales del Mes · Publicados por Dirección FitnessDreams
                  </p>
                  <h2 className="text-2xl font-bold text-white tracking-[0.01em] mt-0.5">
                    Premios del Mes Activos
                  </h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {monthlyChallenges.filter((c) => c.active).length} retos abiertos
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {monthlyChallenges
                  .filter((c) => c.active)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl bg-[#06080D] border border-white/10 p-4 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <p className="text-xs text-slate-400">
                          {item.category} · Hasta {item.endDateLabel}
                        </p>
                        <h3 className="text-base font-bold text-white leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {item.targetDescription}
                        </p>
                        <p className="text-xs font-semibold text-[#33C1FF] pt-1">
                          Premio: {item.prize}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-white/8 flex items-center justify-between gap-2">
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          {item.participantsCount} socios
                        </span>
                        <button
                          type="button"
                          onClick={() => onToggleJoinMonthlyChallenge(item.id)}
                          className={`min-h-[38px] px-3 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                            item.joinedByUser
                              ? 'bg-[#00A8FF]/20 text-[#33C1FF] border border-[#00A8FF]/45'
                              : 'bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D]'
                          }`}
                        >
                          {item.joinedByUser ? 'Inscrito ✓' : 'Apuntarme'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: AMIGOS DEL CLUB, RETOS 1v1 Y ENTRENAMIENTOS COMPARTIDOS */}
      {subtab === 'amigos' && (
        <CommunitySocialPanel
          profile={profile}
          friends={friends}
          peerChallenges={peerChallenges}
          sharedWorkouts={sharedWorkouts}
          activeWorkoutTitle={activeWorkoutTitle}
          activeExercises={activeExercises}
          coachRoutines={coachRoutines}
          onFriendAction={onFriendAction}
          onCreatePeerChallenge={onCreatePeerChallenge}
          onPeerChallengeAction={onPeerChallengeAction}
          onShareWorkout={onShareWorkout}
          onToggleCheerSharedWorkout={onToggleCheerSharedWorkout}
          onLoadSharedWorkout={onLoadSharedWorkout}
        />
      )}

      {/* SUBTAB 3: SOCIO FUNDADOR & DESCUENTOS */}
      {subtab === 'fundador' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Founder Credential Card */}
          <div className="lg:col-span-6 rounded-2xl bg-[#0D121B] border border-[#00A8FF]/35 p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <BrandLogo variant="lockup" className="h-14 w-auto" />
                <div className="flex items-center gap-3">
                  <MemberAvatarBadge
                    name={profile.name}
                    avatarUrl={profile.avatarUrl}
                    highlight
                  />
                  <div>
                    <p className="text-xs font-medium text-[#33C1FF]">
                      Membresía Vitalicia Blindada · {profile.feeStatus === 'al-dia' ? 'Cuota al día' : 'Cuota pendiente'}
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-[0.01em]">
                      {profile.tier} {profile.founderNumber}
                    </h2>
                  </div>
                </div>
              </div>
              <Crown className="w-7 h-7 text-[#00A8FF] shrink-0" />
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/10">
              <div>
                <p className="text-xs text-slate-400">Tu cuota garantizada</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                  {profile.monthlyFee.toFixed(2)} €
                  <span className="text-xs text-slate-400">/mes</span>
                </p>
                <p className="text-xs text-slate-500 line-through font-mono tabular-nums">
                  Tarifa general {profile.standardFee.toFixed(2)} €/mes
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Ahorro anual directo</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-[#33C1FF] mt-1">
                  {((profile.standardFee - profile.monthlyFee) * 12).toFixed(0)} €/año
                </p>
                <p className="text-xs text-slate-400">Sin subidas futuras</p>
              </div>
            </div>

            <ul className="space-y-3 text-sm text-slate-200">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#00A8FF] shrink-0" />
                <span>
                  <strong className="text-white">
                    -{profile.founderDiscountCafePct}% permanente
                  </strong>{' '}
                  en toda la carta Fit Café & Protein Bar
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#00A8FF] shrink-0" />
                <span>
                  <strong className="text-white">
                    -{profile.founderDiscountMerchPct}% exclusivo
                  </strong>{' '}
                  en ropa FitnessDreams y suplementación
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#00A8FF] shrink-0" />
                <span>
                  <strong className="text-white">Prioridad 48h</strong> en reservas de Jiu-Jitsu,
                  Boxeo y Jumping Fitness
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[#00A8FF] shrink-0" />
                <span>
                  <strong className="text-white">2 pases de invitado gratis cada mes</strong> para
                  entrenar con quien quieras
                </span>
              </li>
            </ul>
          </div>

          {/* Interactive Guest Pass Generator */}
          <div className="lg:col-span-6 rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white tracking-[0.01em]">
                  Pases de Invitado Mensuales
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Te quedan{' '}
                  <strong className="text-[#33C1FF] font-mono tabular-nums">
                    {remainingGuestPasses} de 2
                  </strong>{' '}
                  invitaciones disponibles este mes.
                </p>
              </div>
              <Gift className="w-5 h-5 text-[#00A8FF]" />
            </div>

            <form onSubmit={handleCreateGuest} className="space-y-3">
              <div>
                <label htmlFor="guest-name-input" className="block text-xs text-slate-400 mb-1.5">
                  Nombre de tu invitado
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    id="guest-name-input"
                    type="text"
                    placeholder="Ej. María López"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="flex-1 min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                  />
                  <button
                    type="submit"
                    disabled={remainingGuestPasses <= 0}
                    className="min-h-[44px] px-4 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] disabled:opacity-40 text-[#04070D] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-4 h-4" />
                    Generar pase
                  </button>
                </div>
              </div>
              {guestError && (
                <p role="alert" className="text-xs text-rose-400">
                  {guestError}
                </p>
              )}
            </form>

            <div className="divide-y divide-white/8 border-t border-white/8 pt-2">
              {guestPasses.map((pass) => (
                <div key={pass.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{pass.guestName}</p>
                    <p className="text-xs text-slate-400">
                      Creado {pass.createdAt} · Estado: {pass.status}
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#33C1FF] flex items-center gap-1.5">
                    <Ticket className="w-3.5 h-3.5" />
                    {pass.code}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: FIT CAFÉ — ESTÉTICA DOSIER DISCO OLÍMPICO 20 KG + QR MACROS */}
      {subtab === 'cafeteria' && (
        <div className="space-y-6">
          {/* Top Dosier Showcase: Disco 20 kg + QR Calculadora de Calorías y Macros */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left 8 cols: Disco Olímpico 20 kg Interactive Showcase */}
            <div className="lg:col-span-8 rounded-2xl bg-[#0D121B] border border-white/10 overflow-hidden flex flex-col justify-between">
              <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/8">
                <div>
                  <p className="text-xs font-semibold text-[#33C1FF]">
                    Dosier Fit Café · Carta Física Disco Olímpico 20 kg
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-[0.01em] mt-0.5 flex items-center gap-2">
                    <Coffee className="w-5 h-5 text-[#00A8FF]" />
                    Carta Fit Café FitnessDreams
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Sin humos · Plancha 3 min, Vitrina Fría y Barra Líquida · Descuento automático{' '}
                    <strong className="text-[#33C1FF]">-{profile.founderDiscountCafePct}%</strong>{' '}
                    Socio Fundador.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#06080D] border border-white/10 self-start shrink-0">
                  <button
                    type="button"
                    onClick={() => setCafeViewMode('abierta')}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      cafeViewMode === 'abierta'
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Carta abierta
                  </button>
                  <button
                    type="button"
                    onClick={() => setCafeViewMode('cerrado')}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      cafeViewMode === 'cerrado'
                        ? 'bg-[#00A8FF] text-[#04070D]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Disco 20 kg
                  </button>
                </div>
              </div>

              <div className="bg-[#06080D] p-4 flex items-center justify-center">
                <img
                  src={
                    cafeViewMode === 'abierta' ? CAFE_CARTA_ABIERTA_IMG : CAFE_DISCO_CERRADO_IMG
                  }
                  alt={
                    cafeViewMode === 'abierta'
                      ? 'Carta abierta doble disco olímpico Fit Café FitnessDreams'
                      : 'Portada física Disco Olímpico 20 kg Fit Café FitnessDreams'
                  }
                  className="w-full max-h-[320px] object-contain rounded-xl"
                />
              </div>

              <div className="px-5 py-3.5 border-t border-white/8 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <span>Horario barra 07:30 – 22:00 · Pide desde sala y recoge sin esperar</span>
                <a
                  href={CAFE_DOSIER_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#33C1FF] font-semibold hover:underline"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Abrir Dosier PDF completo
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Right 4 cols: QR Calculadora de Calorías y Macros (from Page 1 of Dosier) */}
            <div className="lg:col-span-4 rounded-2xl bg-[#0D121B] border border-[#00A8FF]/35 p-6 flex flex-col justify-between gap-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#33C1FF] flex items-center gap-1.5">
                  <QrCode className="w-4 h-4" />
                  Exclusivo Socios · Gratis en la Carta
                </p>
                <h3 className="text-2xl font-bold text-white tracking-[0.01em] leading-tight">
                  «¿Sabes lo que comes?»
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tu nutrición, bajo control. Escanea el código QR impreso en nuestra carta Disco
                  20 kg para abrir la <strong className="text-white">Calculadora de Calorías y Macros</strong>{' '}
                  y cuadrar cada batido o panini en tu objetivo.
                </p>
              </div>

              {/* Crisp SVG QR Card */}
              <div className="rounded-2xl bg-[#06080D] border border-white/10 p-4 flex flex-col items-center gap-3">
                <div className="bg-white p-3 rounded-xl">
                  <svg
                    viewBox="0 0 110 110"
                    className="w-32 h-32 block"
                    role="img"
                    aria-label="Código QR Calculadora de Calorías y Macros FitnessDreams"
                  >
                    <rect width="110" height="110" fill="#FFFFFF" />
                    {CALCULATOR_QR_CELLS.map((filled, idx) => {
                      if (!filled) return null;
                      const row = Math.floor(idx / 11);
                      const col = idx % 11;
                      return (
                        <rect
                          key={idx}
                          x={col * 10 + 1}
                          y={row * 10 + 1}
                          width="8.4"
                          height="8.4"
                          rx="1"
                          fill="#06080D"
                        />
                      );
                    })}
                  </svg>
                </div>
                <p className="text-[11px] font-mono text-[#33C1FF] text-center break-all">
                  fitnesdreamcalculator.lovable.app
                </p>
              </div>

              <a
                href="https://fitnesdreamcalculator.lovable.app"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[44px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                Abrir Calculadora de Macros
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Active Order Ticket Notice */}
          {cafeTicket && (
            <div
              role="status"
              className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/45 p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  Pedido enviado a barra Fit Café: {cafeTicket.itemName}
                </p>
                <p className="text-xs text-slate-300 mt-0.5">
                  Total Socio Fundador:{' '}
                  <strong className="font-mono tabular-nums">
                    {cafeTicket.price.toFixed(2)} €
                  </strong>{' '}
                  · Enseña este código en Cafetería
                </p>
              </div>
              <span className="text-base font-bold font-mono tabular-nums text-[#33C1FF]">
                {cafeTicket.code}
              </span>
            </div>
          )}

          {/* Category Filter Tabs matching Dosier Sections */}
          <div className="flex flex-wrap items-center gap-2">
            {CAFE_CATEGORIES.map((category) => {
              const isActive = cafeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCafeCategory(category)}
                  aria-pressed={isActive}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                    isActive
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'bg-[#0D121B] text-slate-300 border border-white/10 hover:text-white'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          {/* Full Dosier Menu Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCafeItems.map((item) => {
              const pricing = calculateFounderPrice(
                item.standardPrice,
                profile.founderDiscountCafePct
              );
              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400 truncate">{item.category}</span>
                      <span className="font-mono text-[#33C1FF] shrink-0">{item.prepTag}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white leading-snug">{item.name}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                    <p className="text-xs text-[#33C1FF] font-mono pt-1">{item.macros}</p>
                  </div>

                  <div className="pt-3 border-t border-white/8 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-lg font-bold font-mono tabular-nums text-white">
                        {pricing.finalPrice.toFixed(2)} €
                      </span>
                      <span className="text-xs text-slate-500 line-through font-mono tabular-nums ml-2">
                        {item.standardPrice.toFixed(2)} €
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOrderCafe(item.name, item.standardPrice)}
                      className="min-h-[42px] px-3.5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Pedir ahora
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
