import React, { useMemo, useState } from 'react';
import {
  Check,
  Dumbbell,
  Flame,
  Lock,
  Play,
  Send,
  Share2,
  Swords,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { getMachineByCode } from '../data/teljuCatalog';
import type {
  ActiveExercise,
  ClubFriendProfile,
  CoachRoutine,
  MemberProfile,
  PeerWorkoutChallenge,
  SharedWorkoutPost,
} from '../types/gym';
import { canShareWorkoutWithMember } from '../utils/gymLogic';

interface CommunitySocialPanelProps {
  profile: MemberProfile;
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

const CHALLENGE_PRESETS = [
  {
    title: 'Duelo Press Banca Telju 4SHO073/0',
    goal: '4 series × 8 reps o mejor marca 1RM de la semana',
    stake: 'Quien pierda invita al Pro-Coffee en el Fit Café',
  },
  {
    title: 'Reto Pedestal Mancuerna 70 kg',
    goal: 'Superar el tiempo máximo sostenido con agarre limpio',
    stake: 'Foto oficial en el pedestal y batido Blue Power',
  },
  {
    title: 'Circuito Tren Inferior Telju + Cardio',
    goal: 'Completar Glute-Up, Prensa 45° y 15 min de cinta inclinada',
    stake: 'Sumar sesión al Aro de Constancia juntos esta semana',
  },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

export const CommunitySocialPanel: React.FC<CommunitySocialPanelProps> = ({
  profile,
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
  const acceptedFriends = useMemo(
    () => friends.filter((f) => f.status === 'amigo'),
    [friends]
  );
  const incomingRequests = useMemo(
    () => friends.filter((f) => f.status === 'solicitud-recibida'),
    [friends]
  );

  // 1v1 Workout Challenge Form State
  const [challengeOpponentId, setChallengeOpponentId] = useState<string>(friends[0]?.id ?? '');
  const [challengeTitle, setChallengeTitle] = useState<string>(CHALLENGE_PRESETS[0].title);
  const [challengeGoal, setChallengeGoal] = useState<string>(CHALLENGE_PRESETS[0].goal);
  const [challengeStake, setChallengeStake] = useState<string>(CHALLENGE_PRESETS[0].stake);
  const [challengeFeedback, setChallengeFeedback] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  // Friend-Gated Workout Share Form State
  const [shareSource, setShareSource] = useState<string>('active-workout');
  const [shareRecipientId, setShareRecipientId] = useState<string>('all-friends');
  const [shareNote, setShareNote] = useState<string>('');
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const selectedShareTargetFriend = useMemo(
    () => friends.find((f) => f.id === shareRecipientId) ?? null,
    [friends, shareRecipientId]
  );

  const sharePermission = useMemo(() => {
    if (shareRecipientId === 'all-friends') {
      if (acceptedFriends.length === 0) {
        return {
          allowed: false,
          reason:
            'Necesitas al menos 1 amigo aceptado en FitnessDreams para poder compartir tus entrenamientos.',
        };
      }
      return { allowed: true, reason: null };
    }
    if (!selectedShareTargetFriend) {
      return { allowed: false, reason: 'Selecciona un amigo válido para compartir el entreno.' };
    }
    return canShareWorkoutWithMember(selectedShareTargetFriend);
  }, [acceptedFriends.length, selectedShareTargetFriend, shareRecipientId]);

  const handleSubmitPeerChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    const opponent = friends.find((f) => f.id === challengeOpponentId);
    if (!opponent) {
      setChallengeError('Selecciona un socio al que lanzar el reto.');
      return;
    }
    if (!challengeTitle.trim() || !challengeGoal.trim()) {
      setChallengeError('Indica el entrenamiento y el objetivo del reto.');
      return;
    }
    setChallengeError(null);
    onCreatePeerChallenge({
      opponentId: opponent.id,
      opponentName: opponent.name,
      workoutTitle: challengeTitle.trim(),
      targetGoal: challengeGoal.trim(),
      stakeNote: challengeStake.trim() || 'Reto amistoso de superación FitnessDreams',
    });
    setChallengeFeedback(
      `Reto «${challengeTitle.trim()}» enviado a ${opponent.name}.`
    );
    window.setTimeout(() => setChallengeFeedback(null), 4000);
  };

  const handleSubmitShareWorkout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharePermission.allowed) {
      setShareError(
        sharePermission.reason ?? 'Hazte amigo primero para compartir entrenamientos.'
      );
      return;
    }
    setShareError(null);

    let workoutTitle = activeWorkoutTitle;
    let machineCodes = activeExercises.map((ex) => ex.machineCode);
    let baseSummary =
      activeExercises.length > 0
        ? activeExercises
            .map((ex) => `${ex.sets.length}× ${ex.machineName}`)
            .slice(0, 4)
            .join(' · ')
        : 'Sesión personalizada FitnessDreams';

    if (shareSource !== 'active-workout') {
      const routine = coachRoutines.find((r) => r.id === shareSource);
      if (routine) {
        workoutTitle = routine.title;
        machineCodes = routine.exercises.map((ex) => ex.machineCode);
        baseSummary = routine.exercises
          .map((ex) => {
            const m = getMachineByCode(ex.machineCode);
            return `${ex.targetSets}×${ex.targetReps} ${m?.name ?? ex.machineCode}`;
          })
          .slice(0, 4)
          .join(' · ');
      }
    }

    const finalSummary = shareNote.trim()
      ? `${shareNote.trim()} — ${baseSummary}`
      : baseSummary;

    const sharedWithLabel =
      shareRecipientId === 'all-friends'
        ? `Compartido con todos tus amigos (${acceptedFriends.length})`
        : `Compartido con ${selectedShareTargetFriend?.name ?? 'tu amigo'}`;

    onShareWorkout({
      workoutTitle,
      summary: finalSummary,
      machineCodes,
      sharedWithLabel,
    });

    setShareNote('');
    setShareFeedback(`Entrenamiento «${workoutTitle}» compartido (${sharedWithLabel}).`);
    window.setTimeout(() => setShareFeedback(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top 12-Col Grid: Friends Directory (5 cols) + 1v1 Workout Challenges (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT 5 COLS: CLUB FRIENDS & REQUESTS */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[#33C1FF]">
                Red social interna · Solo amigos pueden compartir entrenamientos
              </p>
              <h2 className="text-2xl font-bold text-white tracking-[0.01em] mt-0.5 flex items-center gap-2">
                <Users className="w-5 h-5 text-[#00A8FF]" />
                Amigos del Club ({acceptedFriends.length})
              </h2>
            </div>
            {incomingRequests.length > 0 && (
              <span className="text-xs font-mono tabular-nums text-[#33C1FF] shrink-0">
                {incomingRequests.length} solicitud{incomingRequests.length > 1 ? 'es' : ''}
              </span>
            )}
          </div>

          <div className="divide-y divide-white/8 border-t border-white/8">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold font-mono shrink-0 border ${
                      friend.status === 'amigo'
                        ? 'bg-[#00A8FF]/18 border-[#00A8FF] text-[#33C1FF]'
                        : 'bg-[#131B28] border-white/10 text-slate-300'
                    }`}
                  >
                    {getInitials(friend.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{friend.name}</p>
                      <span className="text-[11px] font-mono text-slate-400">
                        {friend.memberTag}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {friend.specialty} · Racha {friend.streakDays}d
                    </p>
                    <p className="text-[11px] mt-0.5">
                      {friend.status === 'amigo' && (
                        <span className="text-[#33C1FF] font-medium">
                          Amigo conectado · Entrenos compartibles
                        </span>
                      )}
                      {friend.status === 'solicitud-recibida' && (
                        <span className="text-amber-300 font-medium">
                          Quiere hacerse amigo tuyo
                        </span>
                      )}
                      {friend.status === 'solicitud-enviada' && (
                        <span className="text-slate-400">Solicitud de amistad enviada</span>
                      )}
                      {friend.status === 'ninguno' && (
                        <span className="text-slate-500">
                          Hazte amigo para compartir entrenamientos
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {friend.status === 'solicitud-recibida' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onFriendAction(friend.id, 'accept')}
                        aria-label={`Aceptar amistad de ${friend.name}`}
                        className="min-h-[38px] px-3 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => onFriendAction(friend.id, 'remove')}
                        aria-label={`Rechazar solicitud de ${friend.name}`}
                        className="min-h-[38px] min-w-[38px] rounded-xl bg-[#131B28] text-slate-400 hover:text-rose-400 border border-white/10 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {friend.status === 'ninguno' && (
                    <button
                      type="button"
                      onClick={() => onFriendAction(friend.id, 'send-request')}
                      aria-label={`Enviar solicitud de amistad a ${friend.name}`}
                      className="min-h-[38px] px-3 rounded-xl bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#00A8FF]" />
                      Añadir amigo
                    </button>
                  )}

                  {friend.status === 'solicitud-enviada' && (
                    <button
                      type="button"
                      onClick={() => onFriendAction(friend.id, 'remove')}
                      aria-label={`Cancelar solicitud a ${friend.name}`}
                      className="min-h-[38px] px-3 rounded-xl bg-[#06080D] border border-white/10 text-slate-400 hover:text-white text-xs cursor-pointer whitespace-nowrap"
                    >
                      Pendiente
                    </button>
                  )}

                  {friend.status === 'amigo' && (
                    <button
                      type="button"
                      onClick={() => setChallengeOpponentId(friend.id)}
                      aria-label={`Retar a ${friend.name} a un entrenamiento`}
                      className="min-h-[38px] px-3 rounded-xl bg-[#131B28] hover:bg-[#00A8FF] hover:text-[#04070D] border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      Retar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT 7 COLS: 1v1 PEER WORKOUT CHALLENGES */}
        <div className="lg:col-span-7 space-y-6">
          {/* Launch 1v1 Challenge Form */}
          <form
            onSubmit={handleSubmitPeerChallenge}
            className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-4"
          >
            <div>
              <p className="text-xs font-medium text-[#33C1FF]">
                Pique sano en sala · Duelos 1 contra 1 entre socios
              </p>
              <h2 className="text-2xl font-bold text-white tracking-[0.01em] mt-0.5 flex items-center gap-2">
                <Swords className="w-5 h-5 text-[#00A8FF]" />
                Retar a un socio a un entrenamiento
              </h2>
            </div>

            {/* Quick Challenge Presets */}
            <div className="flex flex-wrap gap-1.5">
              {CHALLENGE_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    setChallengeTitle(preset.title);
                    setChallengeGoal(preset.goal);
                    setChallengeStake(preset.stake);
                  }}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#06080D] hover:border-[#00A8FF] border border-white/10 text-[11px] text-slate-300 hover:text-white cursor-pointer"
                >
                  {preset.title}
                </button>
              ))}
            </div>

            {challengeError && (
              <p role="alert" className="text-xs text-rose-400 font-medium">
                {challengeError}
              </p>
            )}
            {challengeFeedback && (
              <div
                role="status"
                className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 px-3.5 py-2.5 text-xs text-white"
              >
                {challengeFeedback}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="peer-opponent"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Socio al que retas
                </label>
                <select
                  id="peer-opponent"
                  value={challengeOpponentId}
                  onChange={(e) => setChallengeOpponentId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
                >
                  {friends.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.status === 'amigo' ? 'Amigo' : f.memberTag})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="peer-workout-title"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Entrenamiento del reto
                </label>
                <input
                  id="peer-workout-title"
                  type="text"
                  value={challengeTitle}
                  onChange={(e) => setChallengeTitle(e.target.value)}
                  placeholder="Ej. Duelo Press Banca o Cardio 20 min"
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="peer-target-goal"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Objetivo a superar
                </label>
                <input
                  id="peer-target-goal"
                  type="text"
                  value={challengeGoal}
                  onChange={(e) => setChallengeGoal(e.target.value)}
                  placeholder="Ej. 4×10 en Telju o 25s con mancuerna 70 kg"
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>

              <div>
                <label
                  htmlFor="peer-stake-note"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Apuesta amistosa / nota
                </label>
                <input
                  id="peer-stake-note"
                  type="text"
                  value={challengeStake}
                  onChange={(e) => setChallengeStake(e.target.value)}
                  placeholder="Ej. Quien pierda invita al Pro-Coffee"
                  className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Lanzar reto de entrenamiento
            </button>
          </form>

          {/* Active & Incoming 1v1 Duels */}
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xl font-bold text-white">
                Tus retos 1v1 activos ({peerChallenges.length})
              </h3>
              <span className="text-xs text-slate-400">Recibidos y enviados</span>
            </div>

            <div className="divide-y divide-white/8 border-t border-white/8">
              {peerChallenges.map((duel) => {
                const statusColor =
                  duel.status === 'completado'
                    ? 'text-emerald-400'
                    : duel.status === 'aceptado'
                      ? 'text-[#33C1FF]'
                      : duel.status === 'rechazado'
                        ? 'text-rose-400'
                        : 'text-amber-300';

                const statusLabel =
                  duel.status === 'completado'
                    ? 'Completado'
                    : duel.status === 'aceptado'
                      ? 'Aceptado · En curso'
                      : duel.status === 'rechazado'
                        ? 'Rechazado'
                        : 'Pendiente';

                return (
                  <div
                    key={duel.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs">
                        <span className="font-semibold text-white">
                          {duel.direction === 'recibido'
                            ? `${duel.opponentName} te reta`
                            : `Retaste a ${duel.opponentName}`}
                        </span>
                        <span className="text-slate-500" aria-hidden="true">
                          ·
                        </span>
                        <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                        <span className="text-slate-500" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-slate-400">{duel.createdAt}</span>
                      </div>
                      <p className="text-sm font-bold text-white">{duel.workoutTitle}</p>
                      <p className="text-xs text-slate-300">{duel.targetGoal}</p>
                      <p className="text-[11px] text-slate-400">{duel.stakeNote}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {duel.status === 'pendiente' && duel.direction === 'recibido' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onPeerChallengeAction(duel.id, 'accept')}
                            aria-label={`Aceptar reto ${duel.workoutTitle}`}
                            className="min-h-[38px] px-3.5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold cursor-pointer whitespace-nowrap"
                          >
                            Aceptar reto
                          </button>
                          <button
                            type="button"
                            onClick={() => onPeerChallengeAction(duel.id, 'decline')}
                            aria-label={`Rechazar reto ${duel.workoutTitle}`}
                            className="min-h-[38px] px-3 rounded-xl bg-[#131B28] border border-white/10 text-slate-300 hover:text-rose-400 text-xs cursor-pointer whitespace-nowrap"
                          >
                            Rechazar
                          </button>
                        </>
                      )}

                      {duel.status === 'aceptado' && (
                        <button
                          type="button"
                          onClick={() => onPeerChallengeAction(duel.id, 'complete')}
                          aria-label={`Marcar completado el reto ${duel.workoutTitle}`}
                          className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/45 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Marcar completado
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM FULL-WIDTH SECTION: SHARE WORKOUTS ONLY WITH ACCEPTED FRIENDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 cols: Share Workout Composer (Strictly Friend-Gated) */}
        <form
          onSubmit={handleSubmitShareWorkout}
          className="lg:col-span-5 rounded-2xl bg-[#0D121B] border border-[#00A8FF]/30 p-5 sm:p-6 space-y-4"
        >
          <div>
            <p className="text-xs font-medium text-[#33C1FF]">
              Exclusivo entre amigos aceptados · Comparte y carga rutinas al instante
            </p>
            <h2 className="text-2xl font-bold text-white tracking-[0.01em] mt-0.5 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-[#00A8FF]" />
              Compartir entrenamiento
            </h2>
          </div>

          {shareError && (
            <div
              role="alert"
              className="rounded-xl bg-rose-950/50 border border-rose-500/40 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2"
            >
              <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{shareError}</span>
            </div>
          )}

          {shareFeedback && (
            <div
              role="status"
              className="rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 px-3.5 py-2.5 text-xs text-white"
            >
              {shareFeedback}
            </div>
          )}

          <div>
            <label htmlFor="share-workout-source" className="block text-xs text-slate-400 mb-1.5">
              Qué entrenamiento quieres compartir
            </label>
            <select
              id="share-workout-source"
              value={shareSource}
              onChange={(e) => setShareSource(e.target.value)}
              className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
            >
              <option value="active-workout">
                Mi entreno activo: {activeWorkoutTitle}
              </option>
              {coachRoutines.map((r) => (
                <option key={r.id} value={r.id}>
                  Rutina Coach {r.coachName}: {r.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="share-recipient" className="block text-xs text-slate-400 mb-1.5">
              Con qué amigo compartirlo (solo amigos aceptados)
            </label>
            <select
              id="share-recipient"
              value={shareRecipientId}
              onChange={(e) => {
                setShareRecipientId(e.target.value);
                setShareError(null);
              }}
              className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-sm text-white focus:outline-none focus:border-[#00A8FF]"
            >
              <option value="all-friends">
                Todos mis amigos ({acceptedFriends.length} conectados)
              </option>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.status === 'amigo' ? 'Amigo ✓' : 'No es amigo todavía'}
                </option>
              ))}
            </select>
            {!sharePermission.allowed && sharePermission.reason && (
              <p className="text-xs text-amber-300 mt-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                {sharePermission.reason}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="share-note" className="block text-xs text-slate-400 mb-1.5">
              Comentario para tus amigos (opcional)
            </label>
            <input
              id="share-note"
              type="text"
              value={shareNote}
              onChange={(e) => setShareNote(e.target.value)}
              placeholder="Ej. Brutal el bombeo hoy en la sala Telju, probadlo"
              className="w-full min-h-[44px] rounded-xl bg-[#06080D] border border-white/12 px-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00A8FF]"
            />
          </div>

          <button
            type="submit"
            disabled={!sharePermission.allowed}
            className="w-full min-h-[46px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] disabled:opacity-40 disabled:cursor-not-allowed text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            Compartir con mis amigos
          </button>
        </form>

        {/* Right 7 cols: Shared Workouts Wall from Friends */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0D121B] border border-white/10 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-[#00A8FF]" />
                Entrenamientos compartidos entre amigos
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Solo ves y puedes copiar entrenos de socios con los que ya eres amigo ({profile.name})
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {sharedWorkouts.length} sesiones
            </span>
          </div>

          <div className="divide-y divide-white/8 border-t border-white/8">
            {sharedWorkouts.map((post) => (
              <article key={post.id} className="py-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {post.authorAvatar ? (
                      <img
                        src={post.authorAvatar}
                        alt={post.authorName}
                        className="w-10 h-10 rounded-xl object-cover object-top border border-[#00A8FF]/60 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#131B28] border border-white/10 flex items-center justify-center text-xs font-bold font-mono text-[#33C1FF] shrink-0">
                        {getInitials(post.authorName)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {post.authorName}{' '}
                        <span className="text-xs font-mono text-slate-400">{post.authorTag}</span>
                      </p>
                      <p className="text-xs text-[#33C1FF]">
                        {post.sharedWithLabel} · <span className="text-slate-400">{post.sharedAt}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">{post.workoutTitle}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{post.summary}</p>
                  {post.machineCodes.length > 0 && (
                    <p className="text-[11px] font-mono text-slate-400 pt-0.5">
                      Bloques:{' '}
                      {post.machineCodes
                        .map((code) => getMachineByCode(code)?.name ?? code)
                        .join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onToggleCheerSharedWorkout(post.id)}
                    aria-pressed={post.cheeredByUser}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      post.cheeredByUser
                        ? 'bg-[#00A8FF]/18 border border-[#00A8FF]/50 text-[#33C1FF]'
                        : 'bg-[#131B28] border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    Animar ({post.cheersCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoadSharedWorkout(post)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Cargar en mi entreno
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
