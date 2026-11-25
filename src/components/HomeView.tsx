import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Crown,
  Dumbbell,
  Flame,
  MapPin,
  QrCode,
  Quote,
  RefreshCw,
  Trophy,
  UserCog,
} from 'lucide-react';
import {
  BULL_AVATAR_URL,
  CHALLENGE_PEDESTAL_IMG,
  COACH_TEAM,
  DAILY_PHILOSOPHY_QUOTES,
  TELJU_LOGO_URL,
} from '../data/seedData';
import type {
  ChallengeAttempt,
  CoachRoutine,
  CompletedWorkout,
  GuestPass,
  GymClassSession,
  HabitItem,
  MainTab,
  MemberProfile,
} from '../types/gym';
import {
  calculateWillpowerScore,
  getDailyPhilosophyQuote,
  getMancuernaChallengeTier,
  sortChallengeLeaderboard,
} from '../utils/gymLogic';
import { BrandLogo } from './BrandLogo';

interface HomeViewProps {
  profile: MemberProfile;
  habits: HabitItem[];
  onToggleHabit: (id: string) => void;
  latestCoachRoutine: CoachRoutine;
  onStartCoachRoutine: (routine: CoachRoutine) => void;
  nextBookedClass: GymClassSession | undefined;
  recentWorkouts: CompletedWorkout[];
  leaderboard: ChallengeAttempt[];
  guestPasses: GuestPass[];
  onNavigate: (tab: MainTab) => void;
  onOpenAccessPass: () => void;
  onEditProfile: () => void;
}

const WEEK_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  habits,
  onToggleHabit,
  latestCoachRoutine,
  onStartCoachRoutine,
  nextBookedClass,
  recentWorkouts,
  leaderboard,
  guestPasses,
  onNavigate,
  onOpenAccessPass,
  onEditProfile,
}) => {
  const [quoteOffset, setQuoteOffset] = useState(0);
  const dailyQuote = getDailyPhilosophyQuote(DAILY_PHILOSOPHY_QUOTES, new Date(), quoteOffset);

  const willpower = calculateWillpowerScore(profile, habits);
  const sortedLeaderboard = sortChallengeLeaderboard(leaderboard);
  const myRankIndex = sortedLeaderboard.findIndex((e) => e.isCurrentUser);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : sortedLeaderboard.length;
  const myEntry = myRankIndex >= 0 ? sortedLeaderboard[myRankIndex] : sortedLeaderboard[0];
  const myChallengeTier = getMancuernaChallengeTier(
    myEntry?.weightKg ?? 50,
    myEntry?.durationSec ?? 26
  );
  const remainingGuestPasses = Math.max(0, 2 - guestPasses.length);
  const ringRadius = 56;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - willpower.overallPct / 100);

  return (
    <div className="space-y-8">
      {/* Daily Philosophy Quote Banner (Rotates automatically every calendar day) */}
      <section
        aria-label="Frase motivadora del día"
        className="rounded-2xl bg-[#0D121B] border border-[#00A8FF]/25 px-5 py-4 sm:px-7 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#00A8FF]/12 border border-[#00A8FF]/30 flex items-center justify-center shrink-0 mt-0.5">
            <Quote className="w-4 h-4 text-[#33C1FF]" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
              <span className="font-semibold text-[#33C1FF]">Frase del día</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{dailyQuote.dateLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{dailyQuote.quote.pillar}</span>
            </div>
            <p className="text-base sm:text-lg font-semibold text-white leading-snug text-balance">
              “{dailyQuote.quote.text}”
            </p>
            <p className="text-xs text-slate-400">{dailyQuote.quote.signature}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {quoteOffset !== 0 && (
            <button
              type="button"
              onClick={() => setQuoteOffset(0)}
              className="min-h-[38px] px-3 rounded-lg bg-[#131B28] hover:bg-white/10 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Volver a hoy
            </button>
          )}
          <button
            type="button"
            onClick={() => setQuoteOffset((prev) => prev + 1)}
            aria-label="Leer otra frase de filosofía FitnessDreams"
            className="min-h-[38px] px-3 rounded-lg bg-[#131B28] hover:border-[#00A8FF] border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#33C1FF]" />
            Otra frase
          </button>
        </div>
      </section>

      {/* Hero Philosophy + Member Profile + Willpower Ring */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Original FitnessDreams Dark Logo + Philosophy + Member Welcome */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0D121B] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <BrandLogo variant="lockup" className="h-20 sm:h-24 w-auto -ml-2" />

              <button
                type="button"
                onClick={onEditProfile}
                aria-label="Editar perfil y foto de socio"
                className="flex items-center gap-3 rounded-xl bg-[#06080D] hover:bg-white/[0.04] border border-white/10 px-3 py-2 transition-colors cursor-pointer"
              >
                <img
                  src={profile.avatarUrl}
                  alt={`Perfil de ${profile.name}`}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-[#00A8FF]"
                />
                <div className="text-left">
                  <p className="text-xs font-semibold text-white">{profile.name}</p>
                  <p className="text-[11px] text-[#33C1FF] font-mono">
                    {profile.tier} · {profile.founderNumber}
                  </p>
                </div>
                <UserCog className="w-4 h-4 text-slate-400 ml-1" />
              </button>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl sm:text-5xl font-bold tracking-[0.01em] text-white leading-[1.06] text-balance">
                Construye tu sueño con voluntad y constancia
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                Aquí fortaleces el cuerpo y el hábito. Cada vez que pasas el torno y cumples tu
                sesión en máquinas Telju, mancuernas, cardio o sala multifunción, cierras un día
                más en tu aro.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/8">
            <button
              type="button"
              onClick={onOpenAccessPass}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <QrCode className="w-4 h-4" />
              {profile.checkedInToday ? 'Ver mi pase QR' : 'Abrir torno QR'}
            </button>
            <button
              type="button"
              onClick={() => onStartCoachRoutine(latestCoachRoutine)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white/6 hover:bg-white/12 text-white font-medium text-sm flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Dumbbell className="w-4 h-4 text-[#33C1FF]" />
              Entrenar rutina de hoy
            </button>
          </div>
        </div>

        {/* Right: Aro de Constancia Semanal */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0D121B] border border-white/10 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                Tu Aro de Constancia
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Objetivo semanal: {profile.weeklyCompletedSessions} de {profile.weeklyGoalSessions}{' '}
                sesiones · {profile.goal}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center justify-end gap-1.5 text-[#33C1FF] font-mono tabular-nums font-bold text-lg">
                <Flame className="w-4 h-4" />
                {profile.streakDays} días
              </div>
              <p className="text-xs text-slate-400">Racha activa</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 132 132" aria-hidden="true">
                <circle
                  cx="66"
                  cy="66"
                  r={ringRadius}
                  fill="none"
                  stroke="#1A2233"
                  strokeWidth="10"
                />
                <circle
                  cx="66"
                  cy="66"
                  r={ringRadius}
                  fill="none"
                  stroke="#00A8FF"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold font-mono tabular-nums text-white">
                  {willpower.overallPct}%
                </span>
                <span className="text-[11px] text-slate-400">Voluntad</span>
              </div>
            </div>

            <div className="flex-1 space-y-3 min-w-0">
              <p className="text-xs text-slate-400">Semana actual</p>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEK_LABELS.map((day, idx) => {
                  const done = profile.weeklyDaysDone[idx];
                  return (
                    <div key={day} className="flex flex-col items-center gap-1">
                      <span className="text-[11px] text-slate-400 font-medium">{day}</span>
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono ${
                          done
                            ? 'bg-[#00A8FF] text-[#04070D] font-bold'
                            : 'bg-[#131B28] text-slate-500 border border-white/8'
                        }`}
                        aria-label={`${day}: ${done ? 'completado' : 'pendiente'}`}
                      >
                        {done ? <Check className="w-3.5 h-3.5" /> : '·'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-300">
                Hábitos de hoy:{' '}
                <span className="font-mono tabular-nums text-white">
                  {willpower.habitsDone}/{willpower.habitsTotal}
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Visual Duo: La Mancuerna del Desafío + Nuestro Avatar Toro (Fusión FitnessDreams × Telju) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 relative rounded-2xl overflow-hidden border border-white/10 bg-[#0D121B] min-h-[260px] flex items-end">
          <img
            src={CHALLENGE_PEDESTAL_IMG}
            alt="La Mancuerna del Desafío FitnessDreams sobre su pedestal iluminado en azul neón"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06080D] via-[#06080D]/55 to-transparent" />
          <div className="relative z-10 p-6 w-full flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1 max-w-lg">
              <p className="text-xs font-medium text-[#33C1FF]">
                Símbolo de sala · Reto 70 kg + Rankings Press Banca y Sentadilla
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-[0.01em]">
                La Mancuerna del Desafío FitnessDreams
              </h2>
              <p className="text-xs sm:text-sm text-slate-200">
                Acepta el reto oficial en el pedestal de sala y compite con tu foto en los rankings
                de Mancuerna 70 kg, Press Banca y Sentadilla.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('club')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-end"
            >
              Ver rankings
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Official Bull Avatar (Fusion of FitnessDreams + Telju) */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0D121B] border border-white/10 p-5 flex flex-col sm:flex-row lg:flex-row items-center gap-5">
          <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-xl overflow-hidden border border-[#00A8FF]/35 bg-[#06080D] shrink-0">
            <img
              src={BULL_AVATAR_URL}
              alt="Avatar oficial Toro FitnessDreams — Fusión de los logos FitnessDreams y Telju"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="space-y-2.5 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[#33C1FF]">Nuestro Avatar Oficial</p>
              <img
                src={TELJU_LOGO_URL}
                alt="Telju Fitness"
                referrerPolicy="no-referrer"
                className="h-8 w-auto rounded object-contain"
              />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-[0.01em] leading-tight">
              Fuerza del Toro × Mancuerna Dream
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              La fusión oficial de <strong className="text-white">FitnessDreams</strong> y{' '}
              <strong className="text-white">Telju Fitness</strong>: potencia industrial,
              biomecánica española y disciplina inquebrantable.
            </p>
          </div>
        </div>
      </section>

      {/* 4-column Quick Navigation & Live Status Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('entreno')}
          className="text-left rounded-2xl bg-[#0D121B] hover:bg-[#131B28] border border-white/10 p-5 transition-colors cursor-pointer flex flex-col justify-between gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Rutina de Coach {latestCoachRoutine.coachName}</span>
            <Dumbbell className="w-4 h-4 text-[#00A8FF]" />
          </div>
          <div>
            <p className="text-base font-semibold text-white truncate">{latestCoachRoutine.title}</p>
            <p className="text-xs text-slate-400 mt-1">
              Máquinas Telju · Mancuernas · Cardio
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('clases')}
          className="text-left rounded-2xl bg-[#0D121B] hover:bg-[#131B28] border border-white/10 p-5 transition-colors cursor-pointer flex flex-col justify-between gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Sala Multifunción</span>
            <CalendarCheck className="w-4 h-4 text-[#00A8FF]" />
          </div>
          <div>
            <p className="text-base font-semibold text-white truncate">
              {nextBookedClass ? nextBookedClass.title : 'Reserva tu próxima clase'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {nextBookedClass
                ? `${nextBookedClass.day} ${nextBookedClass.time} · ${nextBookedClass.discipline}`
                : 'Jiu-Jitsu · Boxeo · Jumping Fitness'}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('club')}
          className="text-left rounded-2xl bg-[#0D121B] hover:bg-[#131B28] border border-white/10 p-5 transition-colors cursor-pointer flex flex-col justify-between gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Challenge Mancuerna</span>
            <Trophy className="w-4 h-4 text-[#00A8FF]" />
          </div>
          <div>
            <p className="text-base font-semibold text-white">Puesto #{myRank} del Club</p>
            <p className="text-xs text-slate-400 mt-1">
              Nivel {myChallengeTier.tierName} · {myChallengeTier.score} pts
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('club')}
          className="text-left rounded-2xl bg-[#0D121B] hover:bg-[#131B28] border border-white/10 p-5 transition-colors cursor-pointer flex flex-col justify-between gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{profile.tier}</span>
            <Crown className="w-4 h-4 text-[#00A8FF]" />
          </div>
          <div>
            <p className="text-base font-semibold text-white font-mono tabular-nums">
              {profile.monthlyFee.toFixed(2)} €/mes blindados
            </p>
            <p className="text-xs text-slate-400 mt-1">
              -{profile.founderDiscountCafePct}% Fit Café · {remainingGuestPasses}{' '}
              {remainingGuestPasses === 1 ? 'pase invitado libre' : 'pases invitado libres'}
            </p>
          </div>
        </button>
      </section>

      {/* Main Content Split: Daily Habit Forging + Coach Javi Routine Card */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Fortalece el Hábito */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-[0.01em]">
                Fortalece el hábito diario
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                La motivación arranca; la constancia construye el resultado.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#33C1FF]">
              {willpower.habitsDone}/{willpower.habitsTotal} hoy
            </span>
          </div>

          <div className="divide-y divide-white/8">
            {habits.map((habit) => (
              <button
                key={habit.id}
                type="button"
                onClick={() => onToggleHabit(habit.id)}
                aria-label={`${habit.label} (${habit.completed ? 'completado' : 'pendiente'})`}
                className="w-full min-h-[56px] py-3.5 flex items-center gap-4 text-left hover:bg-white/[0.03] px-2 -mx-2 rounded-xl transition-colors cursor-pointer"
                aria-pressed={habit.completed}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    habit.completed
                      ? 'bg-[#00A8FF] text-[#04070D]'
                      : 'border border-slate-600 bg-[#06080D]'
                  }`}
                >
                  {habit.completed && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      habit.completed ? 'text-slate-400 line-through' : 'text-white'
                    }`}
                  >
                    {habit.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{habit.detail}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Coach Javi (uniformed in FitnessDreams) sending Today's Routine + Recent Sessions */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-4">
            <div className="flex items-center gap-4">
              <img
                src={latestCoachRoutine.coachAvatar}
                alt={`Coach ${latestCoachRoutine.coachName} con uniforme oficial FitnessDreams`}
                referrerPolicy="no-referrer"
                className="w-16 h-20 rounded-xl object-cover object-top border border-[#00A8FF]/50 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs text-[#33C1FF] font-medium">
                  Rutina enviada por {latestCoachRoutine.coachName} · {latestCoachRoutine.sentAt}
                </p>
                <h2 className="text-2xl font-bold text-white tracking-[0.01em] leading-tight mt-0.5">
                  {latestCoachRoutine.title}
                </h2>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              “{latestCoachRoutine.coachMessage}”
            </p>

            <div className="pt-3 flex items-center justify-between border-t border-white/8">
              <span className="text-xs text-slate-400">
                {latestCoachRoutine.frequency} · {latestCoachRoutine.exercises.length} bloques
              </span>
              <button
                type="button"
                onClick={() => onStartCoachRoutine(latestCoachRoutine)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                Iniciar ahora
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Equipo de Coaches Oficiales (Javi Busta & Joel) */}
          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-white">Tus Coaches FitnessDreams</h3>
                <p className="text-xs text-slate-400">
                  Javi y Joel envían tus rutinas y siguen tu progreso
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('entreno')}
                className="text-xs font-medium text-[#33C1FF] hover:underline whitespace-nowrap cursor-pointer"
              >
                Ver rutinas
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {COACH_TEAM.map((coach) => (
                <div
                  key={coach.id}
                  className="flex items-center gap-3 rounded-xl bg-[#06080D] border border-white/8 p-3"
                >
                  <img
                    src={coach.avatarUrl}
                    alt={`Coach ${coach.name} con uniforme oficial FitnessDreams`}
                    referrerPolicy="no-referrer"
                    className="w-12 h-14 rounded-lg object-cover object-top border border-[#00A8FF]/50 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{coach.name}</p>
                    <p className="text-[11px] text-[#33C1FF] truncate">Coach · Acceso total</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#0D121B] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Últimas sesiones guardadas</h3>
              <button
                type="button"
                onClick={() => onNavigate('mapa')}
                className="text-xs font-medium text-[#33C1FF] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                Explorar mapa
              </button>
            </div>

            <div className="divide-y divide-white/8">
              {recentWorkouts.slice(0, 3).map((w) => (
                <div key={w.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{w.title}</p>
                    <p className="text-xs text-slate-400">
                      {w.dateLabel} · {w.durationMin} min · {w.totalSets} series
                    </p>
                  </div>
                  <span className="text-sm font-mono tabular-nums text-[#33C1FF] shrink-0">
                    {w.totalVolumeKg.toLocaleString('es-ES')} kg
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
