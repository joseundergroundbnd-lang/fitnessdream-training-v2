import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  CalendarCheck,
  Camera,
  Dumbbell,
  FileText,
  Home,
  MapPin,
  PlayCircle,
  QrCode,
  ShieldCheck,
  Trophy,
  User as UserIcon,
} from 'lucide-react';
import { AccessPassModal } from './components/AccessPassModal';
import { AdminDashboardView } from './components/AdminDashboardView';
import { BrandLogo } from './components/BrandLogo';
import { ClassesView } from './components/ClassesView';
import { ClubView } from './components/ClubView';
import { CoachRoutineBuilder } from './components/CoachRoutineBuilder';
import { GymMapView } from './components/GymMapView';
import { HomeView } from './components/HomeView';
import {
  PresentationKitModal,
  type PresentationKitTab,
} from './components/PresentationKitModal';
import { PWAEntryManager, PWAInstallButton } from './components/PWAInstallPrompt';
import { RegistrationView } from './components/RegistrationView';
import { TurnstileScannerView } from './components/TurnstileScannerView';
import { WorkoutView } from './components/WorkoutView';
import { auth, signInWithGoogleAccount, signOutGoogleAccount } from './firebase';
import {
  checkIsLiveAdmin,
  createWalkInPilotMember,
  publishLiveRoutine,
  sendLiveMessage,
  setLiveMemberFeeStatus,
  subscribeAllLiveMembers,
  subscribeLiveAccessLogs,
  subscribeLiveMemberSelf,
  subscribeLiveMessages,
  subscribeLiveRoutines,
  upsertSignedInMemberProfile,
  type LiveAccessLog,
  type LiveCoachRoutineDoc,
  type LiveDirectMessageDoc,
  type LiveGymMember,
} from './services/liveGymService';
import { generateMemberCodeFromUid, sanitizeMemberCode } from './utils/qrPass';
import {
  COACH_TEAM,
  INITIAL_ACTIVE_WORKOUT,
  INITIAL_CHALLENGE_LEADERBOARD,
  INITIAL_CLASSES,
  INITIAL_CLUB_FRIENDS,
  INITIAL_CLUB_MEMBERS,
  INITIAL_COACH_ROUTINES,
  INITIAL_COMPLETED_WORKOUTS,
  INITIAL_DIRECT_MESSAGES,
  INITIAL_GUEST_PASSES,
  INITIAL_HABITS,
  INITIAL_MEMBER_PROFILE,
  INITIAL_MONTHLY_CHALLENGES,
  INITIAL_PEER_CHALLENGES,
  INITIAL_SHARED_WORKOUTS,
  INITIAL_STRENGTH_LEADERBOARD,
} from './data/seedData';
import { getMachineByCode } from './data/teljuCatalog';
import type {
  ActiveExercise,
  AppWorkspaceMode,
  ChallengeAttempt,
  ClubFriendProfile,
  ClubMemberRecord,
  CoachRoutine,
  CompletedWorkout,
  DirectMessage,
  FeeStatus,
  GuestPass,
  GymClassSession,
  HabitItem,
  MainTab,
  MemberProfile,
  MonthlyChallengeCategory,
  MonthlyClubChallenge,
  PeerWorkoutChallenge,
  SharedWorkoutPost,
  StrengthLiftAttempt,
  TeljuMachine,
} from './types/gym';
import {
  getAtRiskMembers,
  toggleClassBooking,
  transitionFriendshipStatus,
  transitionPeerChallengeStatus,
} from './utils/gymLogic';
import {
  buildActiveExercisesFromCoachRoutine,
  filterRoutinesForMember,
} from './utils/routineBuilder';

const STORAGE_KEY = 'fitnessdreams_app_state_v5';
const PREVIOUS_STORAGE_KEY_V4 = 'fitnessdreams_app_state_v4';
const PREVIOUS_STORAGE_KEY_V3 = 'fitnessdreams_app_state_v3';

interface PersistedState {
  activeCoachId: string;
  profile: MemberProfile;
  habits: HabitItem[];
  coachRoutines: CoachRoutine[];
  activeWorkoutTitle: string;
  activeExercises: ActiveExercise[];
  completedWorkouts: CompletedWorkout[];
  classes: GymClassSession[];
  leaderboard: ChallengeAttempt[];
  strengthLeaderboard: StrengthLiftAttempt[];
  guestPasses: GuestPass[];
  clubMembers: ClubMemberRecord[];
  monthlyChallenges: MonthlyClubChallenge[];
  directMessages: DirectMessage[];
  clubFriends: ClubFriendProfile[];
  peerChallenges: PeerWorkoutChallenge[];
  sharedWorkouts: SharedWorkoutPost[];
}

function getInitialWorkspaceMode(): AppWorkspaceMode {
  if (typeof window === 'undefined') return 'socio';
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'lector') return 'lector';
  if (mode === 'direccion') return 'direccion';
  if (mode === 'coach' || mode === 'coach-javi' || mode === 'coach-joel') return 'coach';
  return 'socio';
}

function getInitialCoachIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'coach-javi') return 'coach-javi';
  if (mode === 'coach-joel') return 'coach-joel';
  const coachParam = new URLSearchParams(window.location.search).get('coach');
  if (coachParam === 'javi' || coachParam === 'coach-javi') return 'coach-javi';
  if (coachParam === 'joel' || coachParam === 'coach-joel') return 'coach-joel';
  return null;
}

function loadInitialState(): PersistedState {
  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const modeParam = params?.get('mode');
  const urlCoachId = getInitialCoachIdFromUrl();
  const autostart =
    params?.get('autostart') === '1' ||
    modeParam === 'direccion' ||
    modeParam === 'lector' ||
    modeParam === 'coach' ||
    modeParam === 'coach-javi' ||
    modeParam === 'coach-joel';

  const defaults: PersistedState = {
    activeCoachId: urlCoachId ?? COACH_TEAM[0].id,
    profile: {
      ...INITIAL_MEMBER_PROFILE,
      isRegistered: autostart ? true : INITIAL_MEMBER_PROFILE.isRegistered,
    },
    habits: INITIAL_HABITS,
    coachRoutines: INITIAL_COACH_ROUTINES,
    activeWorkoutTitle: INITIAL_COACH_ROUTINES[0].title,
    activeExercises: INITIAL_ACTIVE_WORKOUT,
    completedWorkouts: INITIAL_COMPLETED_WORKOUTS,
    classes: INITIAL_CLASSES,
    leaderboard: INITIAL_CHALLENGE_LEADERBOARD,
    strengthLeaderboard: INITIAL_STRENGTH_LEADERBOARD,
    guestPasses: INITIAL_GUEST_PASSES,
    clubMembers: INITIAL_CLUB_MEMBERS,
    monthlyChallenges: INITIAL_MONTHLY_CHALLENGES,
    directMessages: INITIAL_DIRECT_MESSAGES,
    clubFriends: INITIAL_CLUB_FRIENDS,
    peerChallenges: INITIAL_PEER_CHALLENGES,
    sharedWorkouts: INITIAL_SHARED_WORKOUTS,
  };

  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(PREVIOUS_STORAGE_KEY_V4) ??
      window.localStorage.getItem(PREVIOUS_STORAGE_KEY_V3);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const mergedProfile: MemberProfile = {
      ...defaults.profile,
      ...(parsed.profile ?? {}),
      isRegistered: autostart ? true : Boolean(parsed.profile?.isRegistered),
    };
    const existingRoutines = parsed.coachRoutines ?? defaults.coachRoutines;
    const joelSeedRoutine = INITIAL_COACH_ROUTINES.find((r) => r.coachId === 'coach-joel');
    const mergedRoutines =
      joelSeedRoutine && !existingRoutines.some((r) => r.coachId === 'coach-joel')
        ? [existingRoutines[0], joelSeedRoutine, ...existingRoutines.slice(1)].filter(Boolean)
        : existingRoutines;

    return {
      ...defaults,
      ...parsed,
      activeCoachId: urlCoachId ?? parsed.activeCoachId ?? defaults.activeCoachId,
      coachRoutines: mergedRoutines,
      profile: mergedProfile,
      directMessages: parsed.directMessages ?? defaults.directMessages,
      clubFriends: parsed.clubFriends ?? defaults.clubFriends,
      peerChallenges: parsed.peerChallenges ?? defaults.peerChallenges,
      sharedWorkouts: parsed.sharedWorkouts ?? defaults.sharedWorkouts,
    };
  } catch {
    return defaults;
  }
}

const NAV_ITEMS: { id: MainTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'entreno', label: 'Entreno', icon: Dumbbell },
  { id: 'clases', label: 'Clases', icon: CalendarCheck },
  { id: 'mapa', label: 'Mapa', icon: MapPin },
  { id: 'club', label: 'Club', icon: Trophy },
];

export default function App() {
  const [state, setState] = useState<PersistedState>(loadInitialState);
  const [workspaceMode, setWorkspaceMode] = useState<AppWorkspaceMode>(getInitialWorkspaceMode);
  const [activeTab, setActiveTab] = useState<MainTab>('inicio');
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [presentationKitTab, setPresentationKitTab] = useState<PresentationKitTab | null>(null);

  // Firebase Auth & Real-Time Cloud Pilot State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isLiveAdmin, setIsLiveAdmin] = useState(false);
  const [liveMembers, setLiveMembers] = useState<LiveGymMember[]>([]);
  const [liveAccessLogs, setLiveAccessLogs] = useState<LiveAccessLog[]>([]);
  const [liveRoutines, setLiveRoutines] = useState<LiveCoachRoutineDoc[]>([]);
  const [liveMessages, setLiveMessages] = useState<LiveDirectMessageDoc[]>([]);
  const [localDemoFeeOverrides, setLocalDemoFeeOverrides] = useState<Record<string, FeeStatus>>(
    () => (INITIAL_CLUB_MEMBERS[0] ? { [INITIAL_CLUB_MEMBERS[0].id]: 'pendiente' } : {})
  );
  const [localWalkInMembers, setLocalWalkInMembers] = useState<LiveGymMember[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors in private mode
    }
  }, [state]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (!user) {
        setIsLiveAdmin(false);
        setLiveMembers([]);
        setLiveAccessLogs([]);
        setLiveRoutines([]);
        setLiveMessages([]);
        return;
      }
      void checkIsLiveAdmin(user).then((adminFlag) => {
        setIsLiveAdmin(adminFlag);
      });
    });
    return unsub;
  }, []);

  // Attach real-time Firestore listeners ONLY when authenticated
  useEffect(() => {
    if (!authUser) return;

    const unsubs: Array<() => void> = [];

    // 1. Sync current member's live fee status & memberCode
    unsubs.push(
      subscribeLiveMemberSelf(authUser.uid, (selfDoc) => {
        if (!selfDoc) return;
        setState((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            memberId: selfDoc.id,
            name: selfDoc.name || prev.profile.name,
            tier: selfDoc.tier,
            goal: selfDoc.goal || prev.profile.goal,
            feeStatus: selfDoc.feeStatus,
            monthlyFee: selfDoc.monthlyFee,
            founderNumber: selfDoc.memberCode,
            streakDays: Math.max(prev.profile.streakDays, selfDoc.streakDays),
          },
        }));
      })
    );

    // 2. Live routines & direct messages
    unsubs.push(subscribeLiveRoutines(isLiveAdmin, authUser.uid, setLiveRoutines));
    unsubs.push(subscribeLiveMessages(isLiveAdmin, authUser.uid, setLiveMessages));
    unsubs.push(subscribeLiveAccessLogs(isLiveAdmin, authUser.uid, setLiveAccessLogs));

    // 3. Admin-only real members directory
    if (isLiveAdmin) {
      unsubs.push(subscribeAllLiveMembers(setLiveMembers));
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authUser, isLiveAdmin]);

  // Local demo members list for offline/instant preview of Reception & Turnstile Scanner
  const localDemoMembers = useMemo<LiveGymMember[]>(() => {
    const selfMember: LiveGymMember = {
      id: state.profile.memberId || 'current-user',
      uid: state.profile.memberId || 'current-user',
      memberCode: sanitizeMemberCode(state.profile.founderNumber),
      name: state.profile.name,
      tier: state.profile.tier,
      goal: state.profile.goal,
      feeStatus: state.profile.feeStatus,
      monthlyFee: state.profile.monthlyFee,
      streakDays: state.profile.streakDays,
      totalCheckIns: state.profile.checkedInToday ? 1 : 0,
      lastCheckInLabel: state.profile.lastCheckInTime
        ? `Hoy ${state.profile.lastCheckInTime}`
        : 'Pendiente hoy',
      daysSinceLastVisit: 0,
      outreachStatus: 'pendiente',
      assignedCoach: 'Javi Busta',
      isRealMember: false,
    };

    const seeded: LiveGymMember[] = state.clubMembers.slice(0, 5).map((m) => ({
      id: m.id,
      uid: m.id,
      memberCode: sanitizeMemberCode(m.memberTag),
      name: m.name,
      tier: m.plan,
      goal: m.preferredActivity,
      feeStatus: localDemoFeeOverrides[m.id] ?? 'al-dia',
      monthlyFee: m.monthlyFee,
      streakDays: m.streakDays,
      totalCheckIns: Math.max(1, m.streakDays),
      lastCheckInLabel: m.lastVisitLabel,
      daysSinceLastVisit: m.daysSinceLastVisit,
      outreachStatus: m.outreachStatus,
      assignedCoach: m.assignedCoach,
      isRealMember: false,
    }));

    return [...localWalkInMembers, selfMember, ...seeded];
  }, [localDemoFeeOverrides, localWalkInMembers, state.clubMembers, state.profile]);

  // Merge live Firestore routines with local seed items (preserving full exercises, pyramids, cardio & exclusive recipient)
  const mergedCoachRoutines = useMemo<CoachRoutine[]>(() => {
    if (liveRoutines.length === 0) return state.coachRoutines;
    const mappedLive: CoachRoutine[] = liveRoutines.map((lr) => {
      const matchedCoach = COACH_TEAM.find((c) => c.id === lr.coachId) ?? COACH_TEAM[0];
      const hydratedExercises =
        lr.exercises && lr.exercises.length > 0
          ? lr.exercises
          : lr.machineCodes.map((code) => {
              const machine = getMachineByCode(code);
              const isCardio = machine?.trackingMode === 'cardio';
              return {
                machineCode: code,
                exerciseName: machine?.name ?? code,
                muscleGroup: machine?.muscleGroup,
                equipmentType: machine?.category,
                targetSets: isCardio ? 1 : 4,
                targetReps: isCardio ? '15 min' : '10-12',
                repScheme: 'fijas' as const,
                suggestedWeightKg: isCardio
                  ? 8
                  : machine?.category === 'Mancuernas y Barra'
                    ? 18
                    : 55,
                restSeconds: isCardio ? 60 : 90,
              };
            });

      return {
        id: lr.id,
        title: lr.title,
        frequency: lr.frequency,
        dayLabel: `${lr.dayLabel} · En vivo`,
        coachId: lr.coachId,
        coachName: lr.coachName,
        coachRole: lr.coachRole,
        coachAvatar: matchedCoach.avatarUrl,
        targetMemberId: lr.targetMemberId,
        targetMemberName: lr.targetMemberName,
        targetMemberCode: lr.targetMemberCode,
        goal: lr.goal,
        sentAt: lr.createdAtLabel,
        isNew: true,
        coachMessage: lr.coachMessage,
        exercises: hydratedExercises,
        cardioBlock: lr.cardioBlock,
      };
    });
    const liveIds = new Set(mappedLive.map((r) => r.id));
    return [...mappedLive, ...state.coachRoutines.filter((r) => !liveIds.has(r.id))];
  }, [liveRoutines, state.coachRoutines]);

  // Routines exclusively visible to the active member (only general 'all' + routines addressed specifically to this member)
  const memberVisibleCoachRoutines = useMemo(
    () =>
      filterRoutinesForMember(mergedCoachRoutines, {
        uid: authUser?.uid ?? null,
        memberId: state.profile.memberId || 'current-user',
        memberCode: sanitizeMemberCode(state.profile.founderNumber),
        memberName: state.profile.name,
      }),
    [
      authUser?.uid,
      mergedCoachRoutines,
      state.profile.founderNumber,
      state.profile.memberId,
      state.profile.name,
    ]
  );

  const mergedDirectMessages = useMemo<DirectMessage[]>(() => {
    if (liveMessages.length === 0) return state.directMessages;
    const mappedLive: DirectMessage[] = liveMessages.map((lm) => ({
      id: lm.id,
      coachId: lm.coachId,
      memberId: authUser && lm.memberId === authUser.uid ? 'current-user' : lm.memberId,
      senderRole: lm.senderRole === 'coach' ? 'coach' : 'member',
      senderName: lm.senderName,
      kind: lm.kind,
      text: lm.text,
      audioUrl: lm.audioDataUrl,
      audioDurationSec: lm.audioDurationSec,
      timestampLabel: lm.timestampLabel,
    }));
    const liveIds = new Set(mappedLive.map((m) => m.id));
    return [...state.directMessages.filter((m) => !liveIds.has(m.id)), ...mappedLive];
  }, [authUser, liveMessages, state.directMessages]);

  const handleSignInGoogle = async () => {
    try {
      const user = await signInWithGoogleAccount();
      setAuthUser(user);
      const adminFlag = await checkIsLiveAdmin(user);
      setIsLiveAdmin(adminFlag);
      const synced = await upsertSignedInMemberProfile(user, {
        name: state.profile.isRegistered
          ? state.profile.name
          : user.displayName || 'Socio FitnessDreams',
        email: user.email || state.profile.email,
        phone: state.profile.phone,
        goal: state.profile.goal,
        tier: state.profile.tier,
      });
      setState((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          memberId: synced.id,
          name: synced.name,
          email: user.email || prev.profile.email,
          founderNumber: synced.memberCode,
          feeStatus: synced.feeStatus,
          tier: synced.tier,
          monthlyFee: synced.monthlyFee,
        },
      }));
    } catch {
      // Popup closed by user
    }
  };

  const handleSignOutGoogle = async () => {
    await signOutGoogleAccount();
  };

  const handleToggleLiveMemberFee = async (memberId: string, nextStatus: FeeStatus) => {
    if (isLiveAdmin && liveMembers.some((m) => m.id === memberId)) {
      await setLiveMemberFeeStatus(memberId, nextStatus);
      return;
    }
    if (memberId === (state.profile.memberId || 'current-user')) {
      handleSetFeeStatus(nextStatus);
      return;
    }
    setLocalWalkInMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, feeStatus: nextStatus } : m))
    );
    setLocalDemoFeeOverrides((prev) => ({ ...prev, [memberId]: nextStatus }));
  };

  const handleCreateWalkInMember = async (input: {
    name: string;
    phone: string;
    email?: string;
    tier: 'Socio Fundador' | 'Socio Club';
    feeStatus: FeeStatus;
    assignedCoach: string;
  }) => {
    if (isLiveAdmin && authUser) {
      await createWalkInPilotMember(input);
      return;
    }
    const localId = `local_pilot_${Date.now()}`;
    const created: LiveGymMember = {
      id: localId,
      uid: localId,
      memberCode: generateMemberCodeFromUid(localId),
      name: input.name,
      tier: input.tier,
      goal: 'Prueba piloto en sala',
      feeStatus: input.feeStatus,
      monthlyFee: input.tier === 'Socio Fundador' ? 34.9 : 46.9,
      streakDays: 0,
      totalCheckIns: 0,
      lastCheckInLabel: 'Alta en mostrador (local)',
      daysSinceLastVisit: 0,
      outreachStatus: 'pendiente',
      assignedCoach: input.assignedCoach,
      isRealMember: false,
      phone: input.phone,
      email: input.email,
    };
    setLocalWalkInMembers((prev) => [created, ...prev]);
  };

  const activeCoach =
    COACH_TEAM.find((c) => c.id === state.activeCoachId) ?? COACH_TEAM[0];

  const handleSelectCoach = (coachId: string) => {
    setState((prev) => ({
      ...prev,
      activeCoachId: coachId,
    }));
  };

  const uncontactedRiskCount = getAtRiskMembers(state.clubMembers, 10).filter(
    (m) => m.outreachStatus === 'pendiente'
  ).length;

  const handleCompleteRegistration = (data: {
    name: string;
    email: string;
    phone: string;
    goal: string;
    tier: 'Socio Fundador' | 'Socio Club';
    avatarUrl: string;
  }) => {
    setState((prev) => {
      const nextProfile: MemberProfile = {
        ...prev.profile,
        isRegistered: true,
        name: data.name,
        email: data.email,
        phone: data.phone,
        goal: data.goal,
        tier: data.tier,
        avatarUrl: data.avatarUrl,
        monthlyFee: data.tier === 'Socio Fundador' ? 34.9 : 46.9,
        founderDiscountCafePct: data.tier === 'Socio Fundador' ? 15 : 5,
      };
      return {
        ...prev,
        profile: nextProfile,
        leaderboard: prev.leaderboard.map((entry) =>
          entry.isCurrentUser
            ? {
                ...entry,
                memberName: data.name,
                avatarUrl: data.avatarUrl,
              }
            : entry
        ),
        strengthLeaderboard: prev.strengthLeaderboard.map((entry) =>
          entry.isCurrentUser
            ? {
                ...entry,
                memberName: data.name,
                avatarUrl: data.avatarUrl,
              }
            : entry
        ),
      };
    });
    setEditingProfile(false);
    setWorkspaceMode('socio');
    setActiveTab('inicio');

    if (authUser) {
      void upsertSignedInMemberProfile(authUser, {
        name: data.name,
        email: data.email,
        phone: data.phone,
        goal: data.goal,
        tier: data.tier,
      }).then((synced) => {
        setState((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            memberId: synced.id,
            founderNumber: synced.memberCode,
            feeStatus: synced.feeStatus,
          },
        }));
      });
    }
  };

  const handleQuickDemoEnter = () => {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        isRegistered: true,
      },
    }));
    setEditingProfile(false);
    setWorkspaceMode('socio');
  };

  const handleEnterOwnerPanelFromStart = () => {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        isRegistered: true,
      },
    }));
    setEditingProfile(false);
    setWorkspaceMode('direccion');
  };

  const handleSetFeeStatus = (status: FeeStatus) => {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        feeStatus: status,
      },
    }));
  };

  const handleToggleHabit = (habitId: string) => {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.map((h) =>
        h.id === habitId ? { ...h, completed: !h.completed } : h
      ),
    }));
  };

  const handleCheckIn = () => {
    if (state.profile.feeStatus === 'pendiente') return;
    const now = new Date();
    const formatted = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    setState((prev) => {
      if (prev.profile.checkedInToday) return prev;
      const nextDays = [...prev.profile.weeklyDaysDone];
      const nextSlot = nextDays.findIndex((d) => !d);
      if (nextSlot !== -1) nextDays[nextSlot] = true;

      return {
        ...prev,
        profile: {
          ...prev.profile,
          checkedInToday: true,
          lastCheckInTime: formatted,
          streakDays: prev.profile.streakDays + 1,
          weeklyCompletedSessions: Math.min(
            prev.profile.weeklyGoalSessions,
            prev.profile.weeklyCompletedSessions + 1
          ),
          weeklyDaysDone: nextDays,
        },
        habits: prev.habits.map((h) =>
          h.id === 'hab-1' ? { ...h, completed: true } : h
        ),
      };
    });
  };

  const handleLoadCoachRoutine = (routine: CoachRoutine) => {
    const mappedExercises = buildActiveExercisesFromCoachRoutine(routine, getMachineByCode);

    setState((prev) => ({
      ...prev,
      activeWorkoutTitle: routine.title,
      activeExercises: mappedExercises,
    }));
    setWorkspaceMode('socio');
    setActiveTab('entreno');
  };

  const handleSendCoachRoutine = (routine: CoachRoutine) => {
    setState((prev) => ({
      ...prev,
      coachRoutines: [routine, ...prev.coachRoutines],
    }));

    if (authUser && isLiveAdmin) {
      void publishLiveRoutine({
        authorUid: authUser.uid,
        targetMemberId: routine.targetMemberId ?? 'all',
        targetMemberName: routine.targetMemberName,
        targetMemberCode: routine.targetMemberCode,
        title: routine.title,
        frequency: routine.frequency,
        dayLabel: routine.dayLabel,
        coachId: routine.coachId,
        coachName: routine.coachName,
        coachRole: routine.coachRole,
        goal: routine.goal,
        coachMessage: routine.coachMessage,
        machineCodes: routine.exercises.map((e) => e.machineCode),
        exercises: routine.exercises,
        cardioBlock: routine.cardioBlock,
      });
    }
  };

  const handleAddMachineToWorkout = (machine: TeljuMachine) => {
    const isCardio = machine.trackingMode === 'cardio';
    const newExercise: ActiveExercise = {
      id: `ex-${machine.code}-${Date.now()}`,
      machineCode: machine.code,
      machineName: machine.name,
      category: machine.category,
      trackingMode: machine.trackingMode,
      muscleGroup: machine.muscleGroup,
      restSeconds: isCardio ? 60 : 90,
      coachNote: machine.tip,
      sets: isCardio
        ? [
            {
              id: `s1-${Date.now()}`,
              weightKg: 8,
              reps: 15,
              rir: 2,
              completed: false,
              previous: 'Primera vez',
            },
          ]
        : [
            {
              id: `s1-${Date.now()}`,
              weightKg: machine.category === 'Mancuernas y Barra' ? 16 : machine.isPlateLoaded ? 40 : 30,
              reps: 12,
              rir: 2,
              completed: false,
              previous: 'Primera vez',
            },
            {
              id: `s2-${Date.now() + 1}`,
              weightKg: machine.category === 'Mancuernas y Barra' ? 16 : machine.isPlateLoaded ? 40 : 30,
              reps: 10,
              rir: 1,
              completed: false,
              previous: 'Primera vez',
            },
          ],
    };

    setState((prev) => ({
      ...prev,
      activeExercises: [...prev.activeExercises, newExercise],
    }));
  };

  const handleFinishWorkout = (summary: {
    title: string;
    totalVolumeKg: number;
    totalSets: number;
    durationMin: number;
  }) => {
    const completed: CompletedWorkout = {
      id: `cw-${Date.now()}`,
      title: summary.title,
      dateLabel: 'Hoy',
      totalVolumeKg: summary.totalVolumeKg,
      totalSets: summary.totalSets,
      durationMin: summary.durationMin,
    };

    setState((prev) => {
      const nextDays = [...prev.profile.weeklyDaysDone];
      if (!prev.profile.checkedInToday) {
        const nextSlot = nextDays.findIndex((d) => !d);
        if (nextSlot !== -1) nextDays[nextSlot] = true;
      }

      return {
        ...prev,
        completedWorkouts: [completed, ...prev.completedWorkouts],
        profile: {
          ...prev.profile,
          weeklyCompletedSessions: Math.min(
            prev.profile.weeklyGoalSessions,
            prev.profile.checkedInToday
              ? prev.profile.weeklyCompletedSessions
              : prev.profile.weeklyCompletedSessions + 1
          ),
          weeklyDaysDone: nextDays,
        },
        habits: prev.habits.map((h) =>
          h.id === 'hab-1' ? { ...h, completed: true } : h
        ),
        activeExercises: prev.activeExercises.map((ex) => ({
          ...ex,
          sets: ex.sets.map((s) => ({ ...s, completed: false })),
        })),
      };
    });
  };

  const handleToggleClassBooking = (classId: string): string | null => {
    let bookingError: string | null = null;
    setState((prev) => {
      const nextClasses = prev.classes.map((session) => {
        if (session.id !== classId) return session;
        const result = toggleClassBooking(session);
        bookingError = result.error;
        return result.updated;
      });
      return { ...prev, classes: nextClasses };
    });
    return bookingError;
  };

  const handleLogChallengeAttempt = (weightKg: number, durationSec: number) => {
    setState((prev) => {
      const existing = prev.leaderboard.find((e) => e.isCurrentUser);
      const newScore = weightKg * durationSec;
      const existingScore = existing ? existing.weightKg * existing.durationSec : 0;

      if (existing && newScore <= existingScore) {
        return {
          ...prev,
          leaderboard: prev.leaderboard.map((e) =>
            e.isCurrentUser
              ? {
                  ...e,
                  memberName: prev.profile.name,
                  avatarUrl: prev.profile.avatarUrl,
                  dateLabel: 'Hoy (mejor conservada)',
                }
              : e
          ),
        };
      }

      const withoutMine = prev.leaderboard.filter((e) => !e.isCurrentUser);
      const updatedMine: ChallengeAttempt = {
        id: `ch-user-${Date.now()}`,
        memberName: prev.profile.name,
        memberTag: prev.profile.founderNumber,
        avatarUrl: prev.profile.avatarUrl,
        weightKg,
        durationSec,
        dateLabel: 'Hoy',
        isCurrentUser: true,
      };
      return {
        ...prev,
        leaderboard: [...withoutMine, updatedMine],
      };
    });
  };

  const handleLogStrengthLift = (
    exercise: 'press-banca' | 'sentadilla',
    weightKg: number,
    reps: number
  ) => {
    setState((prev) => {
      const withoutMine = prev.strengthLeaderboard.filter(
        (e) => !(e.isCurrentUser && e.exercise === exercise)
      );
      const updatedMine: StrengthLiftAttempt = {
        id: `${exercise}-user-${Date.now()}`,
        exercise,
        memberName: prev.profile.name,
        memberTag: prev.profile.founderNumber,
        avatarUrl: prev.profile.avatarUrl,
        weightKg,
        reps,
        dateLabel: 'Hoy',
        isCurrentUser: true,
      };
      return {
        ...prev,
        strengthLeaderboard: [...withoutMine, updatedMine],
      };
    });
  };

  const handleCreateGuestPass = (guestName: string) => {
    const newPass: GuestPass = {
      id: `gp-${Date.now()}`,
      code: `FD-INV-${Math.floor(1000 + Math.random() * 8999)}`,
      guestName,
      createdAt: 'Hoy',
      status: 'Activo',
    };
    setState((prev) => ({
      ...prev,
      guestPasses: [newPass, ...prev.guestPasses],
    }));
  };

  // Owner & Coach Panel handlers
  const handleSendOutreach = (memberId: string, note: string) => {
    const now = new Date();
    const timeStr = `Hoy, ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    setState((prev) => ({
      ...prev,
      clubMembers: prev.clubMembers.map((m) =>
        m.id === memberId
          ? {
              ...m,
              outreachStatus: 'contactado',
              lastOutreachNote: note,
              lastOutreachTime: timeStr,
            }
          : m
      ),
    }));
  };

  const handleMarkReactivated = (memberId: string) => {
    setState((prev) => ({
      ...prev,
      clubMembers: prev.clubMembers.map((m) =>
        m.id === memberId
          ? {
              ...m,
              outreachStatus: 'reactivado',
              daysSinceLastVisit: 0,
              lastVisitLabel: 'Hoy · Reactivado',
              streakDays: Math.max(1, m.streakDays),
            }
          : m
      ),
    }));
  };

  const handleCreateMonthlyChallenge = (data: {
    title: string;
    category: MonthlyChallengeCategory;
    targetDescription: string;
    prize: string;
    endDateLabel: string;
  }) => {
    const created: MonthlyClubChallenge = {
      id: `mc-${Date.now()}`,
      title: data.title,
      category: data.category,
      targetDescription: data.targetDescription,
      prize: data.prize,
      endDateLabel: data.endDateLabel,
      active: true,
      participantsCount: 1,
      completedCount: 0,
      joinedByUser: false,
    };
    setState((prev) => ({
      ...prev,
      monthlyChallenges: [created, ...prev.monthlyChallenges],
    }));
  };

  const handleToggleChallengeActive = (challengeId: string) => {
    setState((prev) => ({
      ...prev,
      monthlyChallenges: prev.monthlyChallenges.map((c) =>
        c.id === challengeId ? { ...c, active: !c.active } : c
      ),
    }));
  };

  const handleDeleteChallenge = (challengeId: string) => {
    setState((prev) => ({
      ...prev,
      monthlyChallenges: prev.monthlyChallenges.filter((c) => c.id !== challengeId),
    }));
  };

  const handleToggleJoinMonthlyChallenge = (challengeId: string) => {
    setState((prev) => ({
      ...prev,
      monthlyChallenges: prev.monthlyChallenges.map((c) =>
        c.id === challengeId
          ? {
              ...c,
              joinedByUser: !c.joinedByUser,
              participantsCount: c.joinedByUser
                ? Math.max(0, c.participantsCount - 1)
                : c.participantsCount + 1,
            }
          : c
      ),
    }));
  };

  // Bidirectional Member <-> Coach Messaging & Voice Audio Handler
  const handleSendDirectMessage = (msg: Omit<DirectMessage, 'id' | 'timestampLabel'>) => {
    const now = new Date();
    const timeLabel = `Hoy, ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const created: DirectMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestampLabel: timeLabel,
    };
    setState((prev) => ({
      ...prev,
      directMessages: [...prev.directMessages, created],
    }));

    if (authUser) {
      const targetMemberUid =
        msg.memberId === 'current-user' ? authUser.uid : msg.memberId;
      void sendLiveMessage({
        authorUid: authUser.uid,
        coachId: msg.coachId,
        memberId: targetMemberUid,
        senderRole: msg.senderRole === 'coach' ? 'coach' : 'socio',
        senderName: msg.senderName,
        kind: msg.kind,
        text: msg.text,
        audioDataUrl:
          msg.audioUrl && msg.audioUrl.startsWith('data:') ? msg.audioUrl : undefined,
        audioDurationSec: msg.audioDurationSec,
      });
    }
  };

  // Community Friends, 1v1 Workout Challenges & Friend-Gated Workout Sharing
  const handleFriendAction = (friendId: string, action: 'send-request' | 'accept' | 'remove') => {
    setState((prev) => ({
      ...prev,
      clubFriends: prev.clubFriends.map((f) =>
        f.id === friendId
          ? { ...f, status: transitionFriendshipStatus(f.status, action) }
          : f
      ),
    }));
  };

  const handleCreatePeerChallenge = (payload: {
    opponentId: string;
    opponentName: string;
    workoutTitle: string;
    targetGoal: string;
    stakeNote: string;
  }) => {
    const created: PeerWorkoutChallenge = {
      id: `pc-${Date.now()}`,
      challengerName: state.profile.name,
      opponentId: payload.opponentId,
      opponentName: payload.opponentName,
      direction: 'enviado',
      workoutTitle: payload.workoutTitle,
      targetGoal: payload.targetGoal,
      stakeNote: payload.stakeNote,
      status: 'pendiente',
      createdAt: 'Ahora mismo',
    };
    setState((prev) => ({
      ...prev,
      peerChallenges: [created, ...prev.peerChallenges],
    }));
  };

  const handlePeerChallengeAction = (
    challengeId: string,
    action: 'accept' | 'complete' | 'decline'
  ) => {
    setState((prev) => ({
      ...prev,
      peerChallenges: prev.peerChallenges.map((c) =>
        c.id === challengeId
          ? { ...c, status: transitionPeerChallengeStatus(c.status, action) }
          : c
      ),
    }));
  };

  const handleShareWorkout = (payload: {
    workoutTitle: string;
    summary: string;
    machineCodes: string[];
    sharedWithLabel: string;
  }) => {
    const now = new Date();
    const sharedAt = `Hoy, ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const created: SharedWorkoutPost = {
      id: `sw-${Date.now()}`,
      authorId: 'current-user',
      authorName: state.profile.name,
      authorTag: state.profile.founderNumber,
      authorAvatar: state.profile.avatarUrl,
      workoutTitle: payload.workoutTitle,
      summary: payload.summary,
      machineCodes: payload.machineCodes,
      sharedWithLabel: payload.sharedWithLabel,
      sharedAt,
      cheersCount: 1,
      cheeredByUser: true,
    };
    setState((prev) => ({
      ...prev,
      sharedWorkouts: [created, ...prev.sharedWorkouts],
    }));
  };

  const handleToggleCheerSharedWorkout = (postId: string) => {
    setState((prev) => ({
      ...prev,
      sharedWorkouts: prev.sharedWorkouts.map((post) =>
        post.id === postId
          ? {
              ...post,
              cheeredByUser: !post.cheeredByUser,
              cheersCount: post.cheeredByUser
                ? Math.max(0, post.cheersCount - 1)
                : post.cheersCount + 1,
            }
          : post
      ),
    }));
  };

  const handleLoadSharedWorkout = (post: SharedWorkoutPost) => {
    const codes = post.machineCodes.length > 0 ? post.machineCodes : ['4SHP01/0', 'MANC-01'];
    const mappedExercises: ActiveExercise[] = codes.map((code, idx) => {
      const machine = getMachineByCode(code);
      const isCardio = machine?.trackingMode === 'cardio';
      return {
        id: `shared-${post.id}-${idx}-${Date.now()}`,
        machineCode: code,
        machineName: machine ? machine.name : code,
        category: machine ? machine.category : 'Máquinas Telju',
        trackingMode: isCardio ? 'cardio' : 'strength',
        muscleGroup: machine ? machine.muscleGroup : 'Pecho',
        restSeconds: isCardio ? 60 : 90,
        coachNote: `Entreno compartido por tu amigo ${post.authorName}`,
        sets: isCardio
          ? [
              {
                id: `sh-s-${idx}-0-${Date.now()}`,
                weightKg: 8,
                reps: 15,
                rir: 2,
                completed: false,
                previous: 'Nivel 8 · 15 min',
              },
            ]
          : Array.from({ length: 3 }, (_, sIdx) => ({
              id: `sh-s-${idx}-${sIdx}-${Date.now()}`,
              weightKg: machine?.category === 'Mancuernas y Barra' ? 18 : 50,
              reps: 10,
              rir: 2,
              completed: false,
              previous: `${machine?.category === 'Mancuernas y Barra' ? 18 : 50} kg × 10`,
            })),
      };
    });

    setState((prev) => ({
      ...prev,
      activeWorkoutTitle: `${post.workoutTitle} (de ${post.authorName})`,
      activeExercises: mappedExercises,
    }));
    setWorkspaceMode('socio');
    setActiveTab('entreno');
  };

  // Full-screen Spare Phone Turnstile QR Scanner Mode (?mode=lector)
  if (workspaceMode === 'lector') {
    return (
      <TurnstileScannerView
        authUser={authUser}
        isLiveAdmin={isLiveAdmin}
        onSignInGoogle={handleSignInGoogle}
        liveMembers={liveMembers}
        localFallbackMembers={localDemoMembers}
        liveAccessLogs={liveAccessLogs}
        onExitScanner={() => setWorkspaceMode('direccion')}
      />
    );
  }

  // Show Registration & Camera Photo Capture view on first entry or when editing profile
  if (!state.profile.isRegistered || editingProfile) {
    return (
      <>
        <RegistrationView
          initialProfile={state.profile}
          authUser={authUser}
          onSignInGoogle={handleSignInGoogle}
          onCompleteRegistration={handleCompleteRegistration}
          onQuickDemoEnter={handleQuickDemoEnter}
          onEnterOwnerPanel={handleEnterOwnerPanelFromStart}
          onOpenTurnstileScanner={() => {
            setState((prev) => ({
              ...prev,
              profile: { ...prev.profile, isRegistered: true },
            }));
            setWorkspaceMode('lector');
          }}
          onOpenPresentationKit={(tab) => setPresentationKitTab(tab)}
        />
        {presentationKitTab && (
          <PresentationKitModal
            initialTab={presentationKitTab}
            onClose={() => setPresentationKitTab(null)}
          />
        )}
        <PWAEntryManager />
      </>
    );
  }

  const nextBookedClass = state.classes.find((c) => c.isBookedByUser);

  return (
    <div className="min-h-screen bg-[#06080D] text-[#F1F5F9] flex flex-col">
      {/* 3-Zone Top Bar Contract: Original Brand Wordmark — 5 nav links — 1 primary CTA */}
      <header className="sticky top-0 z-30 h-14 md:h-16 bg-[#06080D]/90 backdrop-blur-md border-b border-white/8">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Original FitnessDreams Brand Lockup */}
          <button
            type="button"
            onClick={() => {
              setWorkspaceMode('socio');
              setActiveTab('inicio');
            }}
            aria-label="Ir a inicio de FitnessDreams"
            className="flex items-center whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BrandLogo variant="navbar" size={38} />
          </button>

          {/* Zone 2: 5 concise single-line nav links (desktop) */}
          <nav
            aria-label="Navegación principal"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = workspaceMode === 'socio' && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setWorkspaceMode('socio');
                    setActiveTab(item.id);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-[#33C1FF] border-b-2 border-[#00A8FF]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action (QR Access Pass) */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setIsAccessModalOpen(true)}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                state.profile.feeStatus === 'pendiente'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D]'
              }`}
            >
              <QrCode className="w-4 h-4" />
              Pase QR
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-7 pb-24 md:pb-12 space-y-6">
        {/* Non-sticky Workspace Role Switcher (Member View <-> Dedicated Coach Portal <-> Owner Panel) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/8">
          <div
            className="w-full sm:w-auto flex flex-wrap sm:inline-flex items-center gap-1 p-1 rounded-xl bg-[#0D121B] border border-white/10"
            role="group"
            aria-label="Cambiar entre vista de socio, portal de coaches y panel de dirección"
          >
            <button
              type="button"
              onClick={() => setWorkspaceMode('socio')}
              aria-pressed={workspaceMode === 'socio'}
              className={`min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                workspaceMode === 'socio'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5 shrink-0" />
              App Socio
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('coach')}
              aria-pressed={workspaceMode === 'coach'}
              className={`min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                workspaceMode === 'coach'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5 shrink-0" />
              Portal Coaches
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('direccion')}
              aria-pressed={workspaceMode === 'direccion'}
              className={`min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                workspaceMode === 'direccion'
                  ? 'bg-[#00A8FF] text-[#04070D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Dirección</span>
              {uncontactedRiskCount > 0 && (
                <span
                  className={`font-mono tabular-nums shrink-0 ${
                    workspaceMode === 'direccion' ? 'text-[#04070D]/80' : 'text-red-400'
                  }`}
                >
                  · {uncontactedRiskCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('lector')}
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35"
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>Lector QR</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex flex-wrap items-center gap-2">
              <PWAInstallButton compact />
              <button
                type="button"
                onClick={() => setPresentationKitTab('poster')}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-[#00A8FF]/45 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <QrCode className="w-3.5 h-3.5 text-[#00A8FF] shrink-0" />
                <span>Cartel A3</span>
              </button>
              <button
                type="button"
                onClick={() => setPresentationKitTab('coach-pdf')}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 text-[#33C1FF] shrink-0" />
                <span>Guías PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setPresentationKitTab('coach-video')}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <PlayCircle className="w-3.5 h-3.5 text-[#33C1FF] shrink-0" />
                <span>Vídeos</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 hidden lg:block">
              {workspaceMode === 'direccion' || workspaceMode === 'coach'
                ? `Coach ${activeCoach.name} · Acceso total`
                : `${state.profile.name} · ${state.profile.tier}`}
            </p>
          </div>
        </div>

        {/* DEDICATED COACH PORTAL (?mode=coach / ?mode=coach-javi / ?mode=coach-joel) */}
        {workspaceMode === 'coach' ? (
          <CoachRoutineBuilder
            isStandaloneCoachPortal
            activeCoach={activeCoach}
            onSelectCoach={handleSelectCoach}
            authUser={authUser}
            isLiveAdmin={isLiveAdmin}
            onSignInGoogle={handleSignInGoogle}
            liveMembers={liveMembers}
            localDemoMembers={localDemoMembers}
            coachRoutines={mergedCoachRoutines}
            onSendCoachRoutine={handleSendCoachRoutine}
            onPreviewRoutinesInMemberView={() => {
              setWorkspaceMode('socio');
              setActiveTab('entreno');
            }}
            onOpenPresentationKit={(tab) => setPresentationKitTab(tab)}
          />
        ) : workspaceMode === 'direccion' ? (
          <AdminDashboardView
            activeCoach={activeCoach}
            onSelectCoach={handleSelectCoach}
            members={state.clubMembers}
            classes={state.classes}
            monthlyChallenges={state.monthlyChallenges}
            coachRoutines={mergedCoachRoutines}
            mancuernaLeaderboard={state.leaderboard}
            strengthLeaderboard={state.strengthLeaderboard}
            onSendOutreach={handleSendOutreach}
            onMarkReactivated={handleMarkReactivated}
            onCreateMonthlyChallenge={handleCreateMonthlyChallenge}
            onToggleChallengeActive={handleToggleChallengeActive}
            onDeleteChallenge={handleDeleteChallenge}
            onSendCoachRoutine={handleSendCoachRoutine}
            onPreviewInMemberView={() => {
              setWorkspaceMode('socio');
              setActiveTab('club');
            }}
            onPreviewRoutinesInMemberView={() => {
              setWorkspaceMode('socio');
              setActiveTab('entreno');
            }}
            memberProfile={state.profile}
            directMessages={mergedDirectMessages}
            onSendDirectMessage={handleSendDirectMessage}
            onOpenPresentationKit={(tab) => setPresentationKitTab(tab)}
            authUser={authUser}
            isLiveAdmin={isLiveAdmin}
            onSignInGoogle={handleSignInGoogle}
            onSignOutGoogle={handleSignOutGoogle}
            liveMembers={liveMembers}
            localDemoMembers={localDemoMembers}
            liveAccessLogs={liveAccessLogs}
            onToggleLiveMemberFee={handleToggleLiveMemberFee}
            onCreateWalkInMember={handleCreateWalkInMember}
            onOpenTurnstileScanner={() => setWorkspaceMode('lector')}
          />
        ) : (
          <>
            {activeTab === 'inicio' && (
              <HomeView
                profile={state.profile}
                habits={state.habits}
                onToggleHabit={handleToggleHabit}
                latestCoachRoutine={memberVisibleCoachRoutines[0] ?? mergedCoachRoutines[0]}
                onStartCoachRoutine={handleLoadCoachRoutine}
                nextBookedClass={nextBookedClass}
                recentWorkouts={state.completedWorkouts}
                leaderboard={state.leaderboard}
                guestPasses={state.guestPasses}
                onNavigate={setActiveTab}
                onOpenAccessPass={() => setIsAccessModalOpen(true)}
                onEditProfile={() => setEditingProfile(true)}
              />
            )}

            {activeTab === 'entreno' && (
              <WorkoutView
                activeWorkoutTitle={state.activeWorkoutTitle}
                activeExercises={state.activeExercises}
                onUpdateExercises={(exercises) =>
                  setState((prev) => ({ ...prev, activeExercises: exercises }))
                }
                onFinishWorkout={handleFinishWorkout}
                activeCoach={activeCoach}
                onSelectCoach={handleSelectCoach}
                coachRoutines={memberVisibleCoachRoutines}
                onLoadCoachRoutine={handleLoadCoachRoutine}
                onOpenCoachPortal={() => setWorkspaceMode('coach')}
                onAddMachine={handleAddMachineToWorkout}
                profile={state.profile}
                directMessages={mergedDirectMessages}
                onSendDirectMessage={handleSendDirectMessage}
              />
            )}

            {activeTab === 'clases' && (
              <ClassesView
                classes={state.classes}
                onToggleBooking={handleToggleClassBooking}
              />
            )}

            {activeTab === 'mapa' && (
              <GymMapView
                onAddMachineToWorkout={handleAddMachineToWorkout}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'club' && (
              <ClubView
                profile={state.profile}
                leaderboard={state.leaderboard}
                onLogChallengeAttempt={handleLogChallengeAttempt}
                strengthLeaderboard={state.strengthLeaderboard}
                onLogStrengthLift={handleLogStrengthLift}
                monthlyChallenges={state.monthlyChallenges}
                onToggleJoinMonthlyChallenge={handleToggleJoinMonthlyChallenge}
                guestPasses={state.guestPasses}
                onCreateGuestPass={handleCreateGuestPass}
                friends={state.clubFriends}
                peerChallenges={state.peerChallenges}
                sharedWorkouts={state.sharedWorkouts}
                activeWorkoutTitle={state.activeWorkoutTitle}
                activeExercises={state.activeExercises}
                coachRoutines={state.coachRoutines}
                onFriendAction={handleFriendAction}
                onCreatePeerChallenge={handleCreatePeerChallenge}
                onPeerChallengeAction={handlePeerChallengeAction}
                onShareWorkout={handleShareWorkout}
                onToggleCheerSharedWorkout={handleToggleCheerSharedWorkout}
                onLoadSharedWorkout={handleLoadSharedWorkout}
              />
            )}
          </>
        )}
      </main>

      {/* Quiet Desktop Footer */}
      <footer className="hidden md:block border-t border-white/8 py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-slate-500">
          <span>FitnessDreams Benidorm · Work Your Dreams · Fuerza de voluntad y constancia</span>
          <span>Equipamiento oficial Telju Fitness · Sala Multifunción · Fit Café Disco 20 kg</span>
        </div>
      </footer>

      {/* Mobile Ergonomic Bottom Navigation Bar (<= 15% aggregate sticky height with top header) */}
      <nav
        aria-label="Navegación móvil"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#06080D]/95 backdrop-blur-md border-t border-white/10"
      >
        <div className="grid grid-cols-5 h-full">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = workspaceMode === 'socio' && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setWorkspaceMode('socio');
                  setActiveTab(item.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors cursor-pointer ${
                  isActive ? 'text-[#00A8FF]' : 'text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Gym Access QR / NFC Modal with Real Scannable QR & Red Overdue Fee Alarm */}
      <AccessPassModal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        profile={state.profile}
        onCheckIn={handleCheckIn}
        onSetFeeStatus={handleSetFeeStatus}
        isCloudSynced={Boolean(authUser)}
        canSimulateFee={!authUser || isLiveAdmin}
      />

      {/* Global Opening Kit Modal (A3 Poster QR + PC Setup PDF/Video + Official App Guide/Spot) */}
      {presentationKitTab && (
        <PresentationKitModal
          initialTab={presentationKitTab}
          onClose={() => setPresentationKitTab(null)}
        />
      )}

      {/* Automatic Android & iPhone PWA Install Prompt + Offline Indicator */}
      <PWAEntryManager />
    </div>
  );
}
