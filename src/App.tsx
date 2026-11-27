import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Bell,
  BellOff,
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
import type { SendDirectMessageResult } from './components/CoachMessageThread';
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
import {
  BOOTSTRAPPED_OWNER_EMAIL,
  OFFICIAL_GYM_EMAIL,
  auth,
  completeGoogleRedirectSignIn,
  isOwnerEmail,
  signInWithGoogleAccount,
  signOutGoogleAccount,
} from './firebase';
import {
  addAuthorizedStaffEmail,
  checkIsLiveAdmin,
  createWalkInPilotMember,
  fetchAllLiveMembersFromServer,
  publishLiveRoutine,
  removeAuthorizedStaffEmail,
  sendLiveMessage,
  setLiveMemberFeeStatus,
  subscribeAllLiveMembers,
  subscribeAuthorizedStaff,
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
  emailToStaffDocId,
  isValidStaffEmail,
  normalizeStaffEmail,
  resolvePrimaryGymEmail,
  type AuthorizedStaffRecord,
  type AuthorizedStaffRole,
} from './utils/staffAuth';
import {
  formatIncomingMessageNotification,
  formatIncomingRoutineNotification,
  formatNewMemberNotification,
  getNotificationPermissionState,
  playNotificationChime,
  requestGymNotificationPermission,
  shouldNotifyIncomingMessage,
  shouldNotifyNewMember,
  showGymNotification,
  vibrateIncomingAlert,
  type NotificationPermissionState,
} from './utils/notifications';
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
import { isPendingLocalWalkIn, resolveGoogleSyncMemberName } from './utils/memberSync';

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
  walkInMembers: LiveGymMember[];
  localAuthorizedStaff: AuthorizedStaffRecord[];
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
    walkInMembers: [],
    localAuthorizedStaff: [],
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
      walkInMembers: Array.isArray(parsed.walkInMembers) ? parsed.walkInMembers : [],
      localAuthorizedStaff: Array.isArray(parsed.localAuthorizedStaff)
        ? parsed.localAuthorizedStaff
        : [],
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
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLiveAdmin, setIsLiveAdmin] = useState(false);
  const [isRefreshingMembers, setIsRefreshingMembers] = useState(false);
  const [liveMembers, setLiveMembers] = useState<LiveGymMember[]>([]);
  const [liveAccessLogs, setLiveAccessLogs] = useState<LiveAccessLog[]>([]);
  const [liveRoutines, setLiveRoutines] = useState<LiveCoachRoutineDoc[]>([]);
  const [liveMessages, setLiveMessages] = useState<LiveDirectMessageDoc[]>([]);
  const [liveAuthorizedStaff, setLiveAuthorizedStaff] = useState<AuthorizedStaffRecord[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<{
    tone: 'success' | 'warning' | 'info';
    message: string;
  } | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(getNotificationPermissionState);
  const [incomingAlert, setIncomingAlert] = useState<{
    id: string;
    title: string;
    body: string;
    actionLabel: string;
    target: 'socio-chat' | 'socio-rutinas' | 'coach-chat' | 'admin-nuevo-socio';
    coachId?: string;
  } | null>(null);
  const [requestedWorkoutSubtab, setRequestedWorkoutSubtab] = useState<
    'activo' | 'coach' | 'mensajes' | 'catalogo' | null
  >(null);
  const workspaceModeRef = useRef<AppWorkspaceMode>(workspaceMode);
  const seenLiveMsgIdsRef = useRef<Set<string>>(new Set());
  const messagesHydratedRef = useRef<boolean>(false);
  const seenLiveRoutineIdsRef = useRef<Set<string>>(new Set());
  const routinesHydratedRef = useRef<boolean>(false);
  const seenLiveMemberIdsRef = useRef<Set<string>>(new Set());
  const membersHydratedRef = useRef<boolean>(false);
  const autoCreatedSelfUidRef = useRef<string | null>(null);
  const syncingWalkInIdsRef = useRef<Set<string>>(new Set());
  const profileRef = useRef<MemberProfile>(state.profile);
  const [localDemoFeeOverrides, setLocalDemoFeeOverrides] = useState<Record<string, FeeStatus>>(
    () => (INITIAL_CLUB_MEMBERS[0] ? { [INITIAL_CLUB_MEMBERS[0].id]: 'pendiente' } : {})
  );

  useEffect(() => {
    profileRef.current = state.profile;
  }, [state.profile]);

  useEffect(() => {
    workspaceModeRef.current = workspaceMode;
  }, [workspaceMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors in private mode
    }
  }, [state]);

  // Sync walk-in members, routines & messages instantly across tabs on the same PC (e.g., Dirección tab <-> Coach Javi tab)
  useEffect(() => {
    const handleStorageSync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const incoming = JSON.parse(event.newValue) as Partial<PersistedState>;
        setState((prev) => ({
          ...prev,
          walkInMembers: Array.isArray(incoming.walkInMembers)
            ? incoming.walkInMembers
            : prev.walkInMembers,
          localAuthorizedStaff: Array.isArray(incoming.localAuthorizedStaff)
            ? incoming.localAuthorizedStaff
            : prev.localAuthorizedStaff,
          coachRoutines: Array.isArray(incoming.coachRoutines)
            ? incoming.coachRoutines
            : prev.coachRoutines,
          directMessages: Array.isArray(incoming.directMessages)
            ? incoming.directMessages
            : prev.directMessages,
        }));
      } catch {
        // Ignore malformed external storage payloads
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, []);

  // Listen to Firebase Auth state & finish mobile redirect login if returning from Google
  useEffect(() => {
    void completeGoogleRedirectSignIn().then(async (redirectUser) => {
      if (!redirectUser) return;
      try {
        const currentProfile = profileRef.current;
        const resolvedName = resolveGoogleSyncMemberName({
          profileName: currentProfile.name,
          isRegistered: currentProfile.isRegistered,
          googleDisplayName: redirectUser.displayName,
          googleEmail: redirectUser.email,
        });
        const synced = await upsertSignedInMemberProfile(redirectUser, {
          name: resolvedName,
          email: redirectUser.email || currentProfile.email || '',
          phone: currentProfile.phone || '',
          goal: currentProfile.goal || 'Hipertrofia y Fuerza',
          tier: currentProfile.tier || 'Socio Fundador',
        });
        setState((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            memberId: synced.id,
            name: synced.name,
            email: redirectUser.email || prev.profile.email,
            founderNumber: synced.memberCode,
            feeStatus: synced.feeStatus,
            tier: synced.tier,
            monthlyFee: synced.monthlyFee,
          },
        }));
      } catch (err) {
        setAuthError(
          err instanceof Error
            ? err.message
            : 'No se pudo sincronizar tu perfil de socio tras iniciar sesión con Google.'
        );
      }
    });

    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setIsLiveAdmin(false);
        setLiveMembers([]);
        setLiveAccessLogs([]);
        setLiveRoutines([]);
        setLiveMessages([]);
        setLiveAuthorizedStaff([]);
        return;
      }
      setAuthError(null);
      if (user.emailVerified && isOwnerEmail(user.email)) {
        setIsLiveAdmin(true);
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

    // 1. Sync current member's live fee status & memberCode (and auto-heal if /members/{uid} does not exist yet)
    unsubs.push(
      subscribeLiveMemberSelf(authUser.uid, (selfDoc) => {
        if (!selfDoc) {
          if (autoCreatedSelfUidRef.current === authUser.uid) return;
          autoCreatedSelfUidRef.current = authUser.uid;
          const currentProfile = profileRef.current;
          const resolvedName = resolveGoogleSyncMemberName({
            profileName: currentProfile.name,
            isRegistered: currentProfile.isRegistered,
            googleDisplayName: authUser.displayName,
            googleEmail: authUser.email,
          });
          void upsertSignedInMemberProfile(authUser, {
            name: resolvedName,
            email: authUser.email || currentProfile.email || '',
            phone: currentProfile.phone || '',
            goal: currentProfile.goal || 'Hipertrofia y Fuerza',
            tier: currentProfile.tier || 'Socio Fundador',
          })
            .then((created) => {
              setState((prev) => ({
                ...prev,
                profile: {
                  ...prev.profile,
                  memberId: created.id,
                  name: created.name,
                  email: authUser.email || prev.profile.email,
                  founderNumber: created.memberCode,
                  feeStatus: created.feeStatus,
                  tier: created.tier,
                  monthlyFee: created.monthlyFee,
                },
              }));
            })
            .catch((err) => {
              autoCreatedSelfUidRef.current = null;
              setAuthError(
                err instanceof Error
                  ? err.message
                  : 'No se pudo registrar tu ficha de socio en la nube.'
              );
            });
          return;
        }
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

    // Reset hydration markers on account/role switch so historical messages never spam alerts
    messagesHydratedRef.current = false;
    seenLiveMsgIdsRef.current = new Set();
    routinesHydratedRef.current = false;
    seenLiveRoutineIdsRef.current = new Set();
    membersHydratedRef.current = false;
    seenLiveMemberIdsRef.current = new Set();

    // 2. Live routines & direct messages (with real-time incoming notification triggers)
    unsubs.push(
      subscribeLiveRoutines(isLiveAdmin, authUser.uid, (routines) => {
        setLiveRoutines(routines);
        if (!routinesHydratedRef.current) {
          routines.forEach((r) => seenLiveRoutineIdsRef.current.add(r.id));
          routinesHydratedRef.current = true;
          return;
        }
        const newlyArrived = routines.filter((r) => !seenLiveRoutineIdsRef.current.has(r.id));
        newlyArrived.forEach((r) => seenLiveRoutineIdsRef.current.add(r.id));
        if (workspaceModeRef.current === 'socio' && newlyArrived.length > 0) {
          const latest = newlyArrived[0];
          if (latest.createdByUid !== authUser.uid) {
            const payload = formatIncomingRoutineNotification(latest);
            setIncomingAlert({
              id: latest.id,
              title: payload.title,
              body: payload.body,
              actionLabel: 'Ver rutina',
              target: 'socio-rutinas',
              coachId: latest.coachId,
            });
            playNotificationChime();
            vibrateIncomingAlert();
            void showGymNotification(payload);
          }
        }
      })
    );
    unsubs.push(
      subscribeLiveMessages(
        isLiveAdmin,
        authUser.uid,
        (messages) => {
          setLiveMessages(messages);
          if (!messagesHydratedRef.current) {
            messages.forEach((m) => seenLiveMsgIdsRef.current.add(m.id));
            messagesHydratedRef.current = true;
            return;
          }
          const notifyCandidates = messages.filter((m) =>
            shouldNotifyIncomingMessage({
              viewerMode: workspaceModeRef.current,
              message: m,
              currentUid: authUser.uid,
              seenIds: seenLiveMsgIdsRef.current,
            })
          );
          messages.forEach((m) => seenLiveMsgIdsRef.current.add(m.id));
          if (notifyCandidates.length > 0) {
            const latest = notifyCandidates[notifyCandidates.length - 1];
            const payload = formatIncomingMessageNotification(latest);
            setIncomingAlert({
              id: latest.id,
              title: payload.title,
              body: payload.body,
              actionLabel: 'Abrir chat',
              target: workspaceModeRef.current === 'socio' ? 'socio-chat' : 'coach-chat',
              coachId: latest.coachId,
            });
            playNotificationChime();
            vibrateIncomingAlert();
            void showGymNotification(payload);
          }
        },
        (msgErr) => {
          setAuthNotice({
            tone: 'warning',
            message: `Aviso de sincronización de mensajes: ${msgErr}`,
          });
        }
      )
    );
    unsubs.push(subscribeLiveAccessLogs(isLiveAdmin, authUser.uid, setLiveAccessLogs));

    // 3. Admin-only real members directory & authorized gym/coach accounts
    if (isLiveAdmin) {
      let activeEffect = true;
      void fetchAllLiveMembersFromServer()
        .then((serverMembers) => {
          if (activeEffect) {
            if (!membersHydratedRef.current) {
              serverMembers.forEach((m) => seenLiveMemberIdsRef.current.add(m.id));
              membersHydratedRef.current = true;
            }
            setLiveMembers(serverMembers);
          }
        })
        .catch((err) => {
          if (activeEffect) {
            setAuthNotice({
              tone: 'warning',
              message: `Aviso al consultar socios en el servidor: ${
                err instanceof Error ? err.message : 'revisa tu conexión'
              }`,
            });
          }
        });
      unsubs.push(() => {
        activeEffect = false;
      });
      unsubs.push(
        subscribeAllLiveMembers(
          (members) => {
            setLiveMembers(members);
            if (!membersHydratedRef.current) {
              members.forEach((m) => seenLiveMemberIdsRef.current.add(m.id));
              membersHydratedRef.current = true;
              return;
            }
            const newlyRegistered = members.filter((m) =>
              shouldNotifyNewMember({
                viewerMode: workspaceModeRef.current,
                member: m,
                currentUid: authUser.uid,
                seenIds: seenLiveMemberIdsRef.current,
              })
            );
            members.forEach((m) => seenLiveMemberIdsRef.current.add(m.id));
            if (newlyRegistered.length > 0) {
              const newest = newlyRegistered[0];
              const payload = formatNewMemberNotification(newest);
              setIncomingAlert({
                id: newest.id,
                title: payload.title,
                body: payload.body,
                actionLabel: 'Ver socio',
                target: 'admin-nuevo-socio',
              });
              playNotificationChime();
              vibrateIncomingAlert();
              void showGymNotification(payload);
            }
          },
          (membersErr) => {
            setAuthNotice({
              tone: 'warning',
              message: `Aviso al cargar socios de la nube: ${membersErr}`,
            });
          }
        )
      );
      unsubs.push(subscribeAuthorizedStaff(setLiveAuthorizedStaff));
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authUser, isLiveAdmin]);

  // Auto-upload any locally created walk-in members (local_pilot_*) to Firestore once an authorized gym/coach account connects
  useEffect(() => {
    if (!authUser || !isLiveAdmin) return;
    const pendingWalkIns = state.walkInMembers.filter(
      (m) => isPendingLocalWalkIn(m) && !syncingWalkInIdsRef.current.has(m.id)
    );
    if (pendingWalkIns.length === 0) return;

    pendingWalkIns.forEach((m) => syncingWalkInIdsRef.current.add(m.id));
    let cancelled = false;

    void (async () => {
      const syncedIds: string[] = [];
      for (const localMember of pendingWalkIns) {
        try {
          const uploaded = await createWalkInPilotMember({
            name: localMember.name,
            phone: localMember.phone || '600 000 000',
            email: localMember.email || '',
            tier: localMember.tier,
            feeStatus: localMember.feeStatus,
            assignedCoach: localMember.assignedCoach || 'Javi Busta',
          });
          if (!cancelled) {
            setLiveMembers((prev) => [uploaded, ...prev.filter((m) => m.id !== uploaded.id)]);
          }
          syncedIds.push(localMember.id);
        } catch (err) {
          syncingWalkInIdsRef.current.delete(localMember.id);
          if (!cancelled) {
            setAuthNotice({
              tone: 'warning',
              message: `No se pudo subir automáticamente a «${localMember.name}»: ${
                err instanceof Error ? err.message : 'revisa tu conexión'
              }`,
            });
          }
        }
      }
      if (!cancelled && syncedIds.length > 0) {
        const syncedSet = new Set(syncedIds);
        setState((prev) => ({
          ...prev,
          walkInMembers: prev.walkInMembers.filter((m) => !syncedSet.has(m.id)),
        }));
        setAuthNotice({
          tone: 'success',
          message:
            syncedIds.length === 1
              ? 'Se ha sincronizado 1 socio local en la nube. Ya aparece en Coach Javi y Recepción en todos los dispositivos.'
              : `Se han sincronizado ${syncedIds.length} socios locales en la nube. Ya aparecen en Coach Javi y Recepción en todos los dispositivos.`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser, isLiveAdmin, state.walkInMembers]);

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

    return [...state.walkInMembers, selfMember, ...seeded];
  }, [localDemoFeeOverrides, state.clubMembers, state.profile, state.walkInMembers]);

  // Unified list of authorized gym & coach Google accounts (Official Gym + Bootstrapped Owner + Firestore cloud + local fallback)
  const mergedAuthorizedStaff = useMemo<AuthorizedStaffRecord[]>(() => {
    const map = new Map<string, AuthorizedStaffRecord>();
    const gymMainId = emailToStaffDocId(OFFICIAL_GYM_EMAIL);
    const ownerId = emailToStaffDocId(BOOTSTRAPPED_OWNER_EMAIL);
    map.set(gymMainId, {
      staffId: gymMainId,
      email: OFFICIAL_GYM_EMAIL,
      label: 'Correo oficial Gimnasio FitnessDreams (acceso permanente)',
      role: 'gym-main',
      addedByUid: 'bootstrap',
      isBootstrappedOwner: true,
      isCloudSynced: true,
    });
    map.set(ownerId, {
      staffId: ownerId,
      email: BOOTSTRAPPED_OWNER_EMAIL,
      label: 'Propietario fundador (acceso permanente)',
      role: 'owner',
      addedByUid: 'bootstrap',
      isBootstrappedOwner: true,
      isCloudSynced: true,
    });
    for (const item of state.localAuthorizedStaff) {
      if (!map.has(item.staffId)) {
        map.set(item.staffId, item);
      }
    }
    for (const item of liveAuthorizedStaff) {
      map.set(item.staffId, {
        ...item,
        isBootstrappedOwner: item.staffId === ownerId || item.staffId === gymMainId,
        isCloudSynced: true,
      });
    }
    return Array.from(map.values());
  }, [liveAuthorizedStaff, state.localAuthorizedStaff]);

  const primaryGymEmail = useMemo(
    () => resolvePrimaryGymEmail(mergedAuthorizedStaff, OFFICIAL_GYM_EMAIL),
    [mergedAuthorizedStaff]
  );

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
      audioLabel: lm.kind === 'audio' ? lm.text : undefined,
      timestampLabel: lm.timestampLabel,
    }));
    const liveIds = new Set(mappedLive.map((m) => m.id));
    return [...state.directMessages.filter((m) => !liveIds.has(m.id)), ...mappedLive];
  }, [authUser, liveMessages, state.directMessages]);

  const handleRequestNotificationPermission = async () => {
    const nextPerm = await requestGymNotificationPermission();
    setNotificationPermission(nextPerm);
    if (nextPerm === 'granted') {
      playNotificationChime();
      vibrateIncomingAlert();
      await showGymNotification({
        title: 'Notificaciones activadas · FitnessDreams',
        body:
          workspaceMode === 'socio'
            ? 'Te avisaremos al instante cuando tu Coach te envíe mensajes, audios o rutinas.'
            : 'Te avisaremos al instante cuando un socio te envíe un mensaje o nota de voz.',
        tag: 'fd-permission-granted',
      });
      setAuthNotice({
        tone: 'success',
        message:
          'Notificaciones activadas. A partir de ahora recibirás avisos al instante cuando entren nuevos mensajes o audios.',
      });
    } else if (nextPerm === 'denied') {
      setAuthNotice({
        tone: 'warning',
        message:
          'Has bloqueado las notificaciones en el navegador. Puedes activarlas desde el icono de candado junto a la dirección web o en los ajustes del móvil.',
      });
    }
  };

  const handleTestNotification = async () => {
    playNotificationChime();
    vibrateIncomingAlert();
    const sent = await showGymNotification({
      title: 'Prueba de aviso · FitnessDreams Benidorm',
      body:
        workspaceMode === 'socio'
          ? 'Así te avisaremos cuando Coach Javi o Joel te envíen un mensaje, audio o rutina.'
          : 'Así te avisaremos cuando un socio te envíe un mensaje o nota de voz.',
      tag: `fd-test-${Date.now()}`,
    });
    setAuthNotice({
      tone: sent ? 'success' : 'warning',
      message: sent
        ? 'Notificación de prueba enviada. Si no la ves en pantalla, revisa que el modo No Molestar no esté activado.'
        : 'Permite primero las notificaciones en tu navegador para ver avisos del sistema.',
    });
  };

  const handleSignInGoogle = async (loginHintEmail?: string) => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const user = await signInWithGoogleAccount(loginHintEmail);
      if (!user) {
        setAuthNotice({
          tone: 'info',
          message: 'Redirigiendo a Google para iniciar sesión...',
        });
        return;
      }
      setAuthUser(user);
      const adminFlag = await checkIsLiveAdmin(user);
      setIsLiveAdmin(adminFlag);
      const resolvedName = resolveGoogleSyncMemberName({
        profileName: state.profile.name,
        isRegistered: state.profile.isRegistered,
        googleDisplayName: user.displayName,
        googleEmail: user.email,
      });
      const synced = await upsertSignedInMemberProfile(user, {
        name: resolvedName,
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
      if (adminFlag) {
        setAuthNotice({
          tone: 'success',
          message: `Conectado con Google como ${user.email}. Acceso total de Dirección y Coaches ACTIVO en la nube (compartido entre ${OFFICIAL_GYM_EMAIL} y ${BOOTSTRAPPED_OWNER_EMAIL}).`,
        });
      } else {
        setAuthNotice({
          tone: 'warning',
          message: `Conectado con Google como ${user.email} (cuenta de socio). Para ver la base de datos completa de coaches/dirección, inicia sesión con ${OFFICIAL_GYM_EMAIL} o ${BOOTSTRAPPED_OWNER_EMAIL}.`,
        });
      }
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthNotice({
          tone: 'info',
          message: 'Has cerrado la ventana de Google antes de terminar el inicio de sesión.',
        });
        return;
      }
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'tu dominio';
        setAuthError(
          `El dominio «${host}» aún no está autorizado en Firebase Authentication. Añádelo en Firebase Console → Authentication → Settings → Dominios autorizados.`
        );
        return;
      }
      setAuthError(
        `No se pudo iniciar sesión con Google (${code || 'error de red'}). Ábrelo desde Chrome o Safari directamente (no dentro de WhatsApp).`
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOutGoogle = async () => {
    setAuthError(null);
    await signOutGoogleAccount();
    setAuthNotice({
      tone: 'info',
      message: 'Sesión de Google cerrada. Ahora puedes entrar con otra cuenta.',
    });
  };

  const handleAddAuthorizedStaff = async (input: {
    email: string;
    label: string;
    role: AuthorizedStaffRole;
  }): Promise<{ savedToCloud: boolean; record: AuthorizedStaffRecord }> => {
    const cleanEmail = normalizeStaffEmail(input.email);
    if (!isValidStaffEmail(cleanEmail)) {
      throw new Error('Escribe un correo de Google válido (ej. fitnessdream@gmail.com).');
    }
    if (isLiveAdmin && authUser) {
      const record = await addAuthorizedStaffEmail({
        email: cleanEmail,
        label: input.label.trim() || 'Cuenta del Gimnasio',
        role: input.role,
        addedByUid: authUser.uid,
      });
      return { savedToCloud: true, record };
    }
    const staffId = emailToStaffDocId(cleanEmail);
    const localRecord: AuthorizedStaffRecord = {
      staffId,
      email: cleanEmail,
      label: input.label.trim() || 'Cuenta del Gimnasio',
      role: input.role,
      addedByUid: 'local',
      isCloudSynced: false,
    };
    setState((prev) => ({
      ...prev,
      localAuthorizedStaff: [
        localRecord,
        ...prev.localAuthorizedStaff.filter((item) => item.staffId !== staffId),
      ],
    }));
    return { savedToCloud: false, record: localRecord };
  };

  const handleRemoveAuthorizedStaff = async (staffId: string): Promise<void> => {
    const ownerId = emailToStaffDocId(BOOTSTRAPPED_OWNER_EMAIL);
    const gymMainId = emailToStaffDocId(OFFICIAL_GYM_EMAIL);
    if (staffId === ownerId || staffId === gymMainId) return;
    if (isLiveAdmin && authUser) {
      await removeAuthorizedStaffEmail(staffId);
    }
    setState((prev) => ({
      ...prev,
      localAuthorizedStaff: prev.localAuthorizedStaff.filter((item) => item.staffId !== staffId),
    }));
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
    setState((prev) => ({
      ...prev,
      walkInMembers: prev.walkInMembers.map((m) =>
        m.id === memberId ? { ...m, feeStatus: nextStatus } : m
      ),
    }));
    setLocalDemoFeeOverrides((prev) => ({ ...prev, [memberId]: nextStatus }));
  };

  const handleRefreshLiveMembers = async (): Promise<{ count: number; error?: string }> => {
    if (!authUser) {
      return {
        count: 0,
        error: `Primero conecta con Google (${OFFICIAL_GYM_EMAIL} o ${BOOTSTRAPPED_OWNER_EMAIL}).`,
      };
    }
    const effectiveAdmin = Boolean(
      isLiveAdmin || (authUser.emailVerified && isOwnerEmail(authUser.email))
    );
    if (!effectiveAdmin) {
      return {
        count: 0,
        error: `La cuenta ${authUser.email} no tiene permisos de Dirección/Coach para ver todos los socios.`,
      };
    }
    setIsRefreshingMembers(true);
    setAuthError(null);
    try {
      const fresh = await fetchAllLiveMembersFromServer();
      setLiveMembers(fresh);
      setAuthNotice({
        tone: 'success',
        message: `Lista actualizada desde Firebase: ${fresh.length} ${
          fresh.length === 1 ? 'socio real en la nube' : 'socios reales en la nube'
        }.`,
      });
      return { count: fresh.length };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo consultar la nube de Firebase.';
      setAuthError(msg);
      return { count: liveMembers.length, error: msg };
    } finally {
      setIsRefreshingMembers(false);
    }
  };

  const handleCreateWalkInMember = async (input: {
    name: string;
    phone: string;
    email?: string;
    tier: 'Socio Fundador' | 'Socio Club';
    feeStatus: FeeStatus;
    assignedCoach: string;
  }): Promise<{ savedToCloud: boolean; member: LiveGymMember }> => {
    const effectiveAdmin = Boolean(
      authUser && (isLiveAdmin || (authUser.emailVerified && isOwnerEmail(authUser.email)))
    );
    if (effectiveAdmin && authUser) {
      if (!isLiveAdmin) {
        setIsLiveAdmin(true);
      }
      setAuthError(null);
      try {
        const created = await createWalkInPilotMember(input);
        // Optimistically prepend so Reception PC and Coach Javi show the new member immediately
        setLiveMembers((prev) => [created, ...prev.filter((m) => m.id !== created.id)]);
        // Verify full list from Firebase server in background
        void fetchAllLiveMembersFromServer()
          .then((serverMembers) => {
            const hasCreated = serverMembers.some((m) => m.id === created.id);
            setLiveMembers(hasCreated ? serverMembers : [created, ...serverMembers]);
          })
          .catch(() => {
            // Keep optimistic created member visible
          });
        return { savedToCloud: true, member: created };
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo guardar el socio en la nube de Firebase.';
        setAuthError(msg);
        throw err;
      }
    }
    const localId = `local_pilot_${Date.now()}`;
    const created: LiveGymMember = {
      id: localId,
      uid: localId,
      memberCode: generateMemberCodeFromUid(localId),
      name: input.name,
      tier: input.tier,
      goal: 'Alta en recepción',
      feeStatus: input.feeStatus,
      monthlyFee: input.tier === 'Socio Fundador' ? 34.9 : 46.9,
      streakDays: 0,
      totalCheckIns: 0,
      lastCheckInLabel: 'Alta en mostrador (local)',
      daysSinceLastVisit: 0,
      outreachStatus: 'pendiente',
      assignedCoach: input.assignedCoach,
      isRealMember: true,
      phone: input.phone,
      email: input.email,
    };
    setState((prev) => ({
      ...prev,
      walkInMembers: [created, ...prev.walkInMembers],
    }));
    return { savedToCloud: false, member: created };
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

  const handleCompleteRegistration = async (data: {
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
      try {
        const synced = await upsertSignedInMemberProfile(authUser, {
          name: data.name,
          email: data.email,
          phone: data.phone,
          goal: data.goal,
          tier: data.tier,
        });
        setState((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            memberId: synced.id,
            founderNumber: synced.memberCode,
            feeStatus: synced.feeStatus,
          },
        }));
        if (isLiveAdmin || (authUser.emailVerified && isOwnerEmail(authUser.email))) {
          setLiveMembers((prev) => [synced, ...prev.filter((m) => m.id !== synced.id)]);
        }
        setAuthNotice({
          tone: 'success',
          message: `Socio «${data.name}» guardado EN LA NUBE (${synced.memberCode}). Ya aparece automáticamente en la página de Coach Javi y en Recepción.`,
        });
      } catch (err) {
        setAuthError(
          err instanceof Error
            ? err.message
            : 'Tu perfil se guardó en este dispositivo, pero falló la sincronización con la nube.'
        );
      }
    } else {
      setAuthNotice({
        tone: 'warning',
        message: `Perfil «${data.name}» guardado solo en este dispositivo. Pulsa «Sin conectar a Google · Conectar» arriba para subirlo a la nube y que aparezca en Coach Javi.`,
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

  // Bidirectional Member <-> Coach Messaging & Voice Audio Handler (never silently drops cloud errors)
  const handleSendDirectMessage = async (
    msg: Omit<DirectMessage, 'id' | 'timestampLabel'>
  ): Promise<SendDirectMessageResult> => {
    const now = new Date();
    const timeLabel = `Hoy, ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const created: DirectMessage = {
      ...msg,
      id: msgId,
      timestampLabel: timeLabel,
    };

    // Guard: if not signed in with Google yet, save locally and clearly tell the user
    if (!authUser) {
      setState((prev) => ({
        ...prev,
        directMessages: [...prev.directMessages, created],
      }));
      return {
        savedToCloud: false,
      };
    }

    // Guard: coach replies to other members require an authorized gym/coach Google account
    if (msg.senderRole === 'coach' && !isLiveAdmin) {
      setState((prev) => ({
        ...prev,
        directMessages: [...prev.directMessages, created],
      }));
      return {
        savedToCloud: false,
        error: `Tu cuenta (${authUser.email}) tiene perfil de socio. Para responder como Coach a otros socios, conecta ${primaryGymEmail} o autoriza este correo en Dirección.`,
      };
    }

    setState((prev) => ({
      ...prev,
      directMessages: [...prev.directMessages, created],
    }));

    const targetMemberUid =
      msg.memberId === 'current-user' ? authUser.uid : msg.memberId;

    try {
      await sendLiveMessage({
        id: msgId,
        authorUid: authUser.uid,
        coachId: msg.coachId,
        memberId: targetMemberUid,
        senderRole: msg.senderRole === 'coach' ? 'coach' : 'socio',
        senderName: msg.senderName,
        kind: msg.kind,
        text: msg.kind === 'audio' ? msg.audioLabel || msg.text : msg.text,
        audioDataUrl:
          msg.audioUrl && msg.audioUrl.startsWith('data:') ? msg.audioUrl : undefined,
        audioDurationSec: msg.audioDurationSec,
      });
      return { savedToCloud: true };
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'No se pudo enviar el mensaje a la nube. Revisa tu conexión.';
      return {
        savedToCloud: false,
        error: errorMsg,
      };
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
        {authError && (
          <div
            role="alert"
            className="bg-red-950/95 border-b border-red-500/50 px-4 py-3 text-xs text-red-100 flex items-center justify-between gap-3"
          >
            <span className="max-w-4xl mx-auto">{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold shrink-0 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}
        <RegistrationView
          initialProfile={state.profile}
          authUser={authUser}
          onSignInGoogle={handleSignInGoogle}
          onSignOutGoogle={handleSignOutGoogle}
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

      {authError && (
        <div
          role="alert"
          className="bg-red-950/95 border-b border-red-500/50 px-4 py-3 text-xs text-red-100 flex items-center justify-between gap-3"
        >
          <span className="max-w-5xl mx-auto">{authError}</span>
          <button
            type="button"
            onClick={() => setAuthError(null)}
            className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold shrink-0 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {authNotice && (
        <div
          role="status"
          className={`border-b px-4 py-2.5 text-xs flex items-center justify-between gap-3 ${
            authNotice.tone === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/45 text-emerald-100'
              : authNotice.tone === 'warning'
                ? 'bg-amber-950/95 border-amber-500/45 text-amber-100'
                : 'bg-[#0D1A2B] border-[#00A8FF]/40 text-sky-100'
          }`}
        >
          <span className="max-w-5xl mx-auto font-medium">{authNotice.message}</span>
          <button
            type="button"
            onClick={() => setAuthNotice(null)}
            className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold shrink-0 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Live Incoming Message / Audio / Routine Alert Banner (Both Socio & Coach) */}
      {incomingAlert && (
        <div
          role="status"
          className="bg-[#00A8FF]/18 border-b border-[#00A8FF]/55 px-4 py-2.5 text-xs text-white flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0 max-w-4xl">
            <Bell className="w-4 h-4 text-[#33C1FF] shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-white truncate">{incomingAlert.title}</p>
              <p className="text-slate-200 truncate">{incomingAlert.body}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (incomingAlert.coachId) {
                  handleSelectCoach(incomingAlert.coachId);
                }
                if (incomingAlert.target === 'socio-chat') {
                  setWorkspaceMode('socio');
                  setActiveTab('entreno');
                  setRequestedWorkoutSubtab('mensajes');
                } else if (incomingAlert.target === 'socio-rutinas') {
                  setWorkspaceMode('socio');
                  setActiveTab('entreno');
                  setRequestedWorkoutSubtab('coach');
                } else if (incomingAlert.target === 'admin-nuevo-socio') {
                  setWorkspaceMode(workspaceModeRef.current === 'coach' ? 'coach' : 'direccion');
                } else {
                  setWorkspaceMode('coach');
                }
                setIncomingAlert(null);
              }}
              className="min-h-[32px] px-3 rounded-lg bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold cursor-pointer"
            >
              {incomingAlert.actionLabel}
            </button>
            <button
              type="button"
              onClick={() => setIncomingAlert(null)}
              className="min-h-[32px] px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

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

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {notificationPermission !== 'unsupported' && (
                notificationPermission === 'granted' ? (
                  <button
                    type="button"
                    onClick={() => void handleTestNotification()}
                    title="Notificaciones activas · Pulsa para probar"
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/45 text-emerald-200 font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Avisos ON</span>
                  </button>
                ) : notificationPermission === 'denied' ? (
                  <span
                    title="Activa los permisos de notificación en los ajustes del navegador"
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-200 font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <BellOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Avisos OFF</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleRequestNotificationPermission()}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#00A8FF]/18 hover:bg-[#00A8FF] hover:text-[#04070D] border border-[#00A8FF]/55 text-[#33C1FF] font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <Bell className="w-3.5 h-3.5 shrink-0" />
                    <span>Activar avisos</span>
                  </button>
                )
              )}

              {authUser ? (
                <div
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                    isLiveAdmin
                      ? 'bg-emerald-950/60 border-emerald-500/45 text-emerald-200'
                      : 'bg-amber-950/50 border-amber-500/45 text-amber-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isLiveAdmin ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-semibold truncate max-w-[180px] sm:max-w-[240px]">
                    {isLiveAdmin ? 'Conectado (Gimnasio)' : 'Conectado (Socio)'}: {authUser.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleSignOutGoogle()}
                    className="underline hover:text-white cursor-pointer shrink-0"
                  >
                    Salir
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void handleSignInGoogle()}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#0D121B] hover:border-[#00A8FF] border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span>
                    {isSigningIn
                      ? 'Conectando Google...'
                      : authReady
                        ? 'Sin conectar a Google · Conectar'
                        : 'Comprobando sesión...'}
                  </span>
                </button>
              )}
            </div>
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
            isSigningIn={isSigningIn}
            primaryGymEmail={primaryGymEmail}
            onSignInGoogle={handleSignInGoogle}
            onSignOutGoogle={handleSignOutGoogle}
            liveMembers={liveMembers}
            localDemoMembers={localDemoMembers}
            coachRoutines={mergedCoachRoutines}
            directMessages={mergedDirectMessages}
            onSendDirectMessage={handleSendDirectMessage}
            notificationPermission={notificationPermission}
            onRequestNotificationPermission={handleRequestNotificationPermission}
            onTestNotification={handleTestNotification}
            onSendCoachRoutine={handleSendCoachRoutine}
            onCreateWalkInMember={handleCreateWalkInMember}
            onRefreshLiveMembers={handleRefreshLiveMembers}
            isRefreshingMembers={isRefreshingMembers}
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
            notificationPermission={notificationPermission}
            onRequestNotificationPermission={handleRequestNotificationPermission}
            onTestNotification={handleTestNotification}
            onOpenPresentationKit={(tab) => setPresentationKitTab(tab)}
            authUser={authUser}
            isLiveAdmin={isLiveAdmin}
            isSigningIn={isSigningIn}
            primaryGymEmail={primaryGymEmail}
            authorizedStaff={mergedAuthorizedStaff}
            onAddAuthorizedStaff={handleAddAuthorizedStaff}
            onRemoveAuthorizedStaff={handleRemoveAuthorizedStaff}
            onSignInGoogle={handleSignInGoogle}
            onSignOutGoogle={handleSignOutGoogle}
            liveMembers={liveMembers}
            localDemoMembers={localDemoMembers}
            liveAccessLogs={liveAccessLogs}
            onToggleLiveMemberFee={handleToggleLiveMemberFee}
            onCreateWalkInMember={handleCreateWalkInMember}
            onRefreshLiveMembers={handleRefreshLiveMembers}
            isRefreshingMembers={isRefreshingMembers}
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
                authUser={authUser}
                onSignInGoogle={handleSignInGoogle}
                notificationPermission={notificationPermission}
                onRequestNotificationPermission={handleRequestNotificationPermission}
                onTestNotification={handleTestNotification}
                requestedSubtab={requestedWorkoutSubtab}
                onConsumeRequestedSubtab={() => setRequestedWorkoutSubtab(null)}
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
