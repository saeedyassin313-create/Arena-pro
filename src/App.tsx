import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowUp,
  Check,
  Gamepad2,
  Home,
  MessageCircle,
  Moon,
  QrCode,
  Shield,
  Sun,
  Swords,
  Trophy,
  Unlock,
  User as UserIcon,
  UserPlus,
  X,
} from 'lucide-react';
import {
  auth,
  clearGmailAccessToken,
  connectGmailSender,
  db,
  getGmailAccessToken,
  getGmailSenderEmail,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase.ts';
import { sendEmailViaGmailApi, type EmailDispatchTarget } from './utils/gmailSender.ts';
import { AdminDashboardView, type AdminSectionTab } from './components/AdminDashboardView.tsx';
import { AuthButton } from './components/AuthButton.tsx';
import type { ChatContact } from './components/FriendsChatPanel.tsx';
import { GamesHubView } from './components/GamesHubView.tsx';
import { HomeView } from './components/HomeView.tsx';
import { RegisterModal, ScreenshotModal, UsernamePromptModal } from './components/Modals.tsx';
import { ProfileTeamView } from './components/ProfileTeamView.tsx';
import { QrCodeModal } from './components/QrCodeModal.tsx';
import { TournamentBracketView } from './components/TournamentBracketView.tsx';
import { useLanguage } from './i18n/LanguageContext.tsx';
import { translateGroupName } from './i18n/helpers.ts';
import { useTheme } from './theme/ThemeContext.tsx';
import {
  deleteFriendEdgeFromFirestore,
  deleteTournamentFromFirestore,
  loadAdminCloudExtras,
  loadAllPlayerProfilesFromFirestore,
  loadCloudUserBundle,
  loadPublicPlatformFromFirestore,
  lookupDirectoryInFirestore,
  markChatMessagesReadInFirestore,
  mirrorFriendEdgeToFirestore,
  mirrorFriendRequestCreateToFirestore,
  mirrorFriendRequestRespondToFirestore,
  removeAdminEmailFromFirestore,
  subscribeToPublicPlatform,
  subscribeToUserRealtime,
  syncAdminEmailToFirestore,
  syncAdminHandlesToFirestore,
  syncAdminSnapshotToFirestore,
  syncChatMessageCreateToFirestore,
  syncGameToFirestore,
  syncLiveFeedItemToFirestore,
  syncProfileAndDirectoryToFirestore,
  syncRegistrationCheckInToFirestore,
  syncRegistrationToFirestore,
  syncSubmissionCreateToFirestore,
  syncSubmissionStatusToFirestore,
  syncTournamentToFirestore,
} from './utils/firestoreSync.ts';
import { extractScannedIdentifier } from './utils/checkin.ts';
import {
  hasTripleName,
  isValidEmailAddress,
  isValidWhatsappNumber,
  normalizeEmail,
  sanitizeWhatsappInput,
} from './utils/validation.ts';
import type {
  ActiveView,
  AdminPlayerSummary,
  BracketMatch,
  BracketParticipant,
  FriendChatMessage,
  FriendRequest,
  GameSlug,
  MatchFormatTag,
  PlatformState,
  PlayerProfile,
  TeamRosterMember,
  Tournament,
} from './types.ts';

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'player-main';
  try {
    const existing = window.localStorage.getItem('arena_client_id');
    if (existing) return existing;
    const generated = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem('arena_client_id', generated);
    return generated;
  } catch {
    return 'player-main';
  }
}

export default function App() {
  const { lang, isAr } = useLanguage();
  const { isLight, toggleTheme } = useTheme();
  const [state, setState] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [adminLockedManually, setAdminLockedManually] = useState(false);
  const [gmailConnectedEmail, setGmailConnectedEmail] = useState<string | null>(() =>
    getGmailSenderEmail()
  );
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [checkingAuthProfile, setCheckingAuthProfile] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [pendingQrFriendQuery, setPendingQrFriendQuery] = useState('');
  const [adminPlayers, setAdminPlayers] = useState<AdminPlayerSummary[]>([]);
  const [loadingAdminPlayers, setLoadingAdminPlayers] = useState(false);

  const savedUserProfileRef = useRef<PlayerProfile | null>(null);
  const activeHandleRef = useRef<string>('');
  const hasHydratedCloudRef = useRef(false);
  useEffect(() => {
    activeHandleRef.current =
      savedUserProfileRef.current?.handle || state?.profile.handle || '';
  }, [state?.profile.handle]);

  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [adminSection, setAdminSection] = useState<AdminSectionTab>('booking');
  const [selectedGame, setSelectedGame] = useState<GameSlug>('fc27');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('t-arena-pro');

  const [registerModalTournament, setRegisterModalTournament] = useState<Tournament | null>(null);
  const [screenshotTarget, setScreenshotTarget] = useState<{
    tournament: Tournament;
    match: BracketMatch;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );
  const [chatContacts, setChatContacts] = useState<ChatContact[]>([]);
  const [selectedChatTarget, setSelectedChatTarget] = useState<string>('team-group');
  const [chatVisibleInView, setChatVisibleInView] = useState<boolean>(false);
  const [topChatBanner, setTopChatBanner] = useState<FriendChatMessage | null>(null);
  const [topFriendRequestBanner, setTopFriendRequestBanner] = useState<FriendRequest | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const chatSectionRef = useRef<HTMLElement | null>(null);
  const activeViewRef = useRef<ActiveView>(activeView);
  const selectedChatTargetRef = useRef<string>(selectedChatTarget);
  const chatVisibleRef = useRef<boolean>(chatVisibleInView);
  const seenIncomingMsgIdsRef = useRef<Set<string>>(new Set());
  const seenIncomingReqIdsRef = useRef<Set<string>>(new Set());
  const initialChatLoadedRef = useRef<boolean>(false);
  const topBannerTimerRef = useRef<number | null>(null);
  const topFriendBannerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);
  useEffect(() => {
    selectedChatTargetRef.current = selectedChatTarget;
  }, [selectedChatTarget]);
  useEffect(() => {
    chatVisibleRef.current = chatVisibleInView;
  }, [chatVisibleInView]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const isPlaceholderHandleStr = (val?: string) => {
    const k = String(val || '').trim().replace(/^@+/, '').toLowerCase();
    return !k || k === 'player_guest' || k === 'player';
  };

  const isProfileComplete = (p: {
    displayName?: string;
    handle?: string;
    whatsappNumber?: string;
    phoneOrDiscord?: string;
    email?: string;
  }) => {
    const phone = sanitizeWhatsappInput(p.whatsappNumber || p.phoneOrDiscord || '');
    return (
      hasTripleName(p.displayName) &&
      Boolean(p.handle && !isPlaceholderHandleStr(p.handle)) &&
      isValidWhatsappNumber(phone) &&
      isValidEmailAddress(p.email)
    );
  };

  const getAdminAuthHeaders = (): Record<string, string> => {
    const u = auth.currentUser;
    if (!u || !u.emailVerified || !u.email) return {};
    return {
      'x-viewer-uid': u.uid,
      'x-viewer-email': normalizeEmail(u.email),
      'x-viewer-verified': 'true',
    };
  };

  const getViewerHeaders = (): Record<string, string> => {
    const u = auth.currentUser;
    if (!u) {
      return { 'x-viewer-uid': getOrCreateClientId() };
    }
    return {
      'x-viewer-uid': u.uid,
      ...(u.emailVerified && u.email
        ? {
            'x-viewer-email': normalizeEmail(u.email),
            'x-viewer-verified': 'true',
          }
        : {}),
    };
  };

  const mergeWithSavedProfile = (
    data: PlatformState,
    prev?: PlatformState | null
  ): PlatformState => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const cached = savedUserProfileRef.current;
      if (
        cached &&
        cached.onboardingCompleted &&
        !data.profile.onboardingCompleted
      ) {
        return {
          ...data,
          isViewerAdmin: false,
          profile: {
            ...data.profile,
            id: getEffectiveUid(),
            displayName: cached.displayName || data.profile.displayName,
            handle: cached.handle || data.profile.handle,
            email: cached.email || data.profile.email,
            whatsappNumber: cached.whatsappNumber || data.profile.whatsappNumber,
            phoneOrDiscord: cached.whatsappNumber || cached.phoneOrDiscord || data.profile.phoneOrDiscord,
            onboardingCompleted: isProfileComplete(cached),
          },
        };
      }
      return { ...data, isViewerAdmin: false };
    }

    const existing =
      savedUserProfileRef.current?.id === currentUser.uid
        ? savedUserProfileRef.current
        : prev?.profile.id === currentUser.uid
        ? prev.profile
        : data.profile.id === currentUser.uid
        ? data.profile
        : null;

    const googleDisplayName =
      currentUser.displayName || currentUser.email?.split('@')[0] || 'Google Player';
    const googleHandle =
      currentUser.email?.split('@')[0] || `user_${currentUser.uid.slice(0, 6)}`;

    const preservedWhatsapp =
      existing?.whatsappNumber ||
      existing?.phoneOrDiscord ||
      data.profile.whatsappNumber ||
      data.profile.phoneOrDiscord ||
      '';

    const keepAdminFlag = Boolean(
      currentUser.emailVerified && (data.isViewerAdmin ?? prev?.isViewerAdmin)
    );

    return {
      ...data,
      isViewerAdmin: keepAdminFlag,
      adminHandles:
        data.adminHandles && data.adminHandles.length > 0
          ? data.adminHandles
          : prev?.adminHandles || [],
      profile: {
        ...data.profile,
        id: currentUser.uid,
        displayName: existing?.displayName || googleDisplayName,
        handle: existing?.handle || googleHandle,
        email: existing?.email || currentUser.email || undefined,
        whatsappNumber: preservedWhatsapp,
        phoneOrDiscord: preservedWhatsapp,
        city: existing?.city || data.profile.city,
        onboardingCompleted: existing?.onboardingCompleted ?? data.profile.onboardingCompleted,
        photoURL: currentUser.photoURL || existing?.photoURL || undefined,
        isGoogleSignedIn: true,
      },
    };
  };

  const getEffectiveUid = () => auth.currentUser?.uid || getOrCreateClientId();
  const getEffectiveHandle = () =>
    activeHandleRef.current || savedUserProfileRef.current?.handle || '';
  const getEffectiveEmail = () =>
    (auth.currentUser?.email || savedUserProfileRef.current?.email || '').trim();

  const buildViewerQuery = () => {
    const params = new URLSearchParams();
    params.set('uid', getEffectiveUid());
    const h = getEffectiveHandle();
    const verifiedUser = auth.currentUser?.emailVerified ? auth.currentUser : null;
    const e = verifiedUser?.email?.trim() || getEffectiveEmail();
    if (h) params.set('handle', h);
    if (e) params.set('email', e);
    if (verifiedUser) params.set('verified', '1');
    return params.toString();
  };

  const triggerFriendRequestBannerIfNew = (req: FriendRequest) => {
    const myUid = getEffectiveUid();
    if (!req || !req.id || req.status !== 'pending' || req.toUid !== myUid) return;
    if (seenIncomingReqIdsRef.current.has(req.id)) return;
    seenIncomingReqIdsRef.current.add(req.id);
    setTopFriendRequestBanner(req);
    if (topFriendBannerTimerRef.current) {
      window.clearTimeout(topFriendBannerTimerRef.current);
    }
    topFriendBannerTimerRef.current = window.setTimeout(() => {
      setTopFriendRequestBanner((prev) => (prev?.id === req.id ? null : prev));
    }, 15000);
  };

  const handleSendFriendRequest = async (
    targetQuery: string,
    role?: string
  ): Promise<boolean> => {
    try {
      const uid = getEffectiveUid();
      const fromHandle = getEffectiveHandle();
      const fromName = state?.profile.displayName || fromHandle;

      if (auth.currentUser) {
        try {
          const cloudMatch = await lookupDirectoryInFirestore(
            extractScannedIdentifier(targetQuery)
          );
          if (cloudMatch) {
            await fetch('/api/sync/hydrate-player', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(cloudMatch),
            }).catch(() => {});
          }
        } catch {
          // Non-fatal
        }
      }

      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getViewerHeaders() },
        body: JSON.stringify({
          fromUid: uid,
          fromHandle,
          fromName,
          targetQuery,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(
          data.error || (isAr ? 'تعذر إرسال طلب الصداقة.' : 'Unable to send friend request.'),
          'error'
        );
        return false;
      }

      if (data.state) {
        setState((prev) => mergeWithSavedProfile(data.state, prev));
      }

      const reqObj = data.request as FriendRequest | undefined;
      if (data.autoAccepted && reqObj) {
        mirrorFriendRequestRespondToFirestore(reqObj.id, 'accepted').catch(() => {});
        mirrorFriendEdgeToFirestore(uid, {
          uid: reqObj.fromUid === uid ? reqObj.toUid : reqObj.fromUid,
          handle: reqObj.fromUid === uid ? reqObj.toHandle : reqObj.fromHandle,
          name: reqObj.fromUid === uid ? reqObj.toName : reqObj.fromName,
          playerCode: reqObj.fromUid === uid ? reqObj.toPlayerCode : reqObj.fromPlayerCode,
          role: reqObj.role,
          requestId: reqObj.id,
        }).catch(() => {});
        showToast(
          isAr
            ? 'قبلتما الصداقة تلقائياً وأصبحتم أصدقاء الآن!'
            : 'You are now mutual friends!'
        );
      } else if (reqObj) {
        mirrorFriendRequestCreateToFirestore(reqObj).catch(() => {});
        showToast(
          isAr
            ? `تم إرسال طلب صداقة إلى @${reqObj.toHandle} وبانتظار موافقته.`
            : `Friend request sent to @${reqObj.toHandle}.`
        );
      }
      fetchChatMessages(true);
      return true;
    } catch {
      showToast(isAr ? 'تعذر إرسال طلب الصداقة.' : 'Unable to send friend request.', 'error');
      return false;
    }
  };

  const handleRespondFriendRequest = async (
    requestId: string,
    action: 'accept' | 'decline'
  ): Promise<boolean> => {
    try {
      const uid = getEffectiveUid();
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getViewerHeaders() },
        body: JSON.stringify({ viewerUid: uid, requestId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(
          data.error || (isAr ? 'تعذر الرد على طلب الصداقة.' : 'Unable to respond to request.'),
          'error'
        );
        return false;
      }
      setTopFriendRequestBanner((prev) => (prev?.id === requestId ? null : prev));
      if (data.state) {
        setState((prev) => mergeWithSavedProfile(data.state, prev));
      }

      const reqObj = data.request as FriendRequest | undefined;
      if (reqObj) {
        mirrorFriendRequestRespondToFirestore(
          reqObj.id,
          action === 'accept' ? 'accepted' : 'declined'
        ).catch(() => {});
        if (action === 'accept') {
          const isSender = reqObj.fromUid === uid;
          mirrorFriendEdgeToFirestore(uid, {
            uid: isSender ? reqObj.toUid : reqObj.fromUid,
            handle: isSender ? reqObj.toHandle : reqObj.fromHandle,
            name: isSender ? reqObj.toName : reqObj.fromName,
            playerCode: isSender ? reqObj.toPlayerCode : reqObj.fromPlayerCode,
            role: reqObj.role,
            requestId: reqObj.id,
          }).catch(() => {});
        }
      }

      fetchChatMessages(true);
      showToast(
        action === 'accept'
          ? isAr
            ? 'تمت الموافقة على طلب الصداقة وأصبحتم أصدقاء الآن!'
            : 'Friend request accepted!'
          : isAr
          ? 'تم رفض/إلغاء طلب الصداقة.'
          : 'Friend request declined.'
      );
      return true;
    } catch {
      showToast(isAr ? 'تعذر الرد على طلب الصداقة.' : 'Unable to respond to request.', 'error');
      return false;
    }
  };

  const fetchState = async (silent = false) => {
    try {
      if (!silent) setLoadError(null);
      const res = await fetch(`/api/state?${buildViewerQuery()}`);
      if (!res.ok) throw new Error('تعذر تحميل بيانات المنصة.');
      const data: PlatformState = await res.json();

      const myUid = getEffectiveUid();
      if (Array.isArray(data.friendRequests)) {
        for (const r of data.friendRequests) {
          if (r.toUid === myUid && r.status === 'pending') {
            triggerFriendRequestBannerIfNew(r);
          }
        }
      }

      setState((prev) => mergeWithSavedProfile(data, prev));
      if (data.tournaments[0] && !data.tournaments.some((t) => t.id === selectedTournamentId)) {
        setSelectedTournamentId(data.tournaments[0].id);
      }
      if (data.games[0] && !data.games.some((g) => g.slug === selectedGame)) {
        setSelectedGame(data.games[0].slug);
      }
      if (!silent) setLoading(false);

      if (!hasHydratedCloudRef.current) {
        hasHydratedCloudRef.current = true;
        loadPublicPlatformFromFirestore()
          .then(async (cloudPublic) => {
            const hasCloudContent =
              cloudPublic.games.length > 0 ||
              cloudPublic.tournaments.length > 0 ||
              cloudPublic.liveFeed.length > 0 ||
              Object.keys(cloudPublic.registrationsByTournament).length > 0;
            if (!hasCloudContent) return;
            const hydrateRes = await fetch('/api/sync/hydrate-platform', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getViewerHeaders() },
              body: JSON.stringify({
                uid: getEffectiveUid(),
                email: getEffectiveEmail(),
                handle: getEffectiveHandle(),
                games: cloudPublic.games,
                tournaments: cloudPublic.tournaments,
                registrationsByTournament: cloudPublic.registrationsByTournament,
                liveFeed: cloudPublic.liveFeed,
              }),
            });
            if (hydrateRes.ok) {
              const hData = await hydrateRes.json();
              if (hData.state) {
                setState((prev) => mergeWithSavedProfile(hData.state, prev));
              }
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      if (!silent) {
        setLoadError(
          err instanceof Error
            ? err.message
            : isAr
            ? 'تعذر تحميل بيانات المنصة.'
            : 'Unable to load platform data.'
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getChannelIdForTarget = (target: string, myUid: string) =>
    target === 'team-group' ? 'team-group' : [myUid, target].sort().join('::');

  const triggerTopChatAlertIfOutside = (msg: FriendChatMessage) => {
    const myUid = getEffectiveUid();
    if (!msg || !msg.id || msg.senderUid === myUid) return;
    if (seenIncomingMsgIdsRef.current.has(msg.id)) return;
    seenIncomingMsgIdsRef.current.add(msg.id);

    const activeChannelId = getChannelIdForTarget(selectedChatTargetRef.current, myUid);
    const isInsideThisChat =
      activeViewRef.current === 'profile' &&
      chatVisibleRef.current &&
      activeChannelId === msg.channelId &&
      !document.hidden;

    if (!isInsideThisChat) {
      setTopChatBanner(msg);
      if (topBannerTimerRef.current) {
        window.clearTimeout(topBannerTimerRef.current);
      }
      topBannerTimerRef.current = window.setTimeout(() => {
        setTopChatBanner((prev) => (prev?.id === msg.id ? null : prev));
      }, 7500);
    }
  };

  const fetchChatMessages = async (silent = true) => {
    try {
      const uid = getEffectiveUid();
      const res = await fetch(`/api/chat/messages?uid=${encodeURIComponent(uid)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages?: FriendChatMessage[];
        contacts?: ChatContact[];
      };
      if (Array.isArray(data.contacts)) {
        setChatContacts(data.contacts);
      }
      if (!Array.isArray(data.messages)) return;
      const msgs = data.messages;
      if (!initialChatLoadedRef.current) {
        for (const m of msgs) seenIncomingMsgIdsRef.current.add(m.id);
        initialChatLoadedRef.current = true;
      } else {
        for (const m of msgs) {
          if (m.senderUid !== uid && !(m.readBy || []).includes(uid)) {
            triggerTopChatAlertIfOutside(m);
          } else {
            seenIncomingMsgIdsRef.current.add(m.id);
          }
        }
      }
      setState((prev) => (prev ? { ...prev, friendMessages: msgs } : prev));
    } catch {
      if (!silent) {
        showToast(isAr ? 'تعذر تحديث المحادثة.' : 'Unable to refresh chat.', 'error');
      }
    }
  };

  const handleMarkChatRead = async (channelId: string) => {
    const viewerUid = getEffectiveUid();
    if (!viewerUid || viewerUid === 'player-main' || !channelId) return;
    const unreadInChannel = (state?.friendMessages || []).filter(
      (m) =>
        m.channelId === channelId &&
        m.senderUid !== viewerUid &&
        !(m.readBy || []).includes(viewerUid)
    );
    setState((prev) => {
      if (!prev || !prev.friendMessages) return prev;
      return {
        ...prev,
        friendMessages: prev.friendMessages.map((m) =>
          m.channelId === channelId && m.senderUid !== viewerUid && !(m.readBy || []).includes(viewerUid)
            ? { ...m, readBy: [...(m.readBy || []), viewerUid] }
            : m
        ),
      };
    });
    try {
      await fetch('/api/chat/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerUid, channelId }),
      });
    } catch {
      // ignore
    }
    if (firebaseUser?.emailVerified && unreadInChannel.length > 0) {
      markChatMessagesReadInFirestore(unreadInChannel, viewerUid).catch(() => {});
    }
  };

  const handleSendChatMessage = async (
    target: string,
    text: string,
    targetHandle?: string
  ): Promise<boolean> => {
    const cleanText = text.trim();
    if (!cleanText) return false;
    try {
      const senderUid = getEffectiveUid();
      const senderHandle = getEffectiveHandle();
      const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderUid,
          senderHandle,
          recipientUid: target,
          recipientHandle: targetHandle || target,
          text: cleanText,
          clientMsgId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر إرسال الرسالة.' : 'Unable to send message.'), 'error');
        return false;
      }
      if (data.message) {
        const msg = data.message as FriendChatMessage;
        seenIncomingMsgIdsRef.current.add(msg.id);
        setState((prev) => {
          if (!prev) return prev;
          const prevMsgs = prev.friendMessages || [];
          if (prevMsgs.some((m) => m.id === msg.id)) return prev;
          return { ...prev, friendMessages: [...prevMsgs, msg].slice(-150) };
        });
        if (firebaseUser?.emailVerified) {
          syncChatMessageCreateToFirestore(msg).catch(() => {});
        }
      }
      return true;
    } catch {
      showToast(isAr ? 'تعذر إرسال الرسالة.' : 'Unable to send message.', 'error');
      return false;
    }
  };

  const handleOpenChatFromBanner = (msg: FriendChatMessage) => {
    const nextTarget = msg.channelId === 'team-group' ? 'team-group' : msg.senderUid;
    setSelectedChatTarget(nextTarget);
    setTopChatBanner(null);
    setActiveView('profile');
    handleMarkChatRead(msg.channelId);
    window.setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  useEffect(() => {
    fetchState(false);
    fetchChatMessages(true);
    try {
      const sp = new URLSearchParams(window.location.search);
      const qrFriend = sp.get('addFriend')?.trim();
      if (qrFriend) {
        setPendingQrFriendQuery(qrFriend);
        setActiveView('profile');
        window.history.replaceState({}, '', window.location.pathname);
        showToast(
          isAr
            ? `تم مسح QR للاعب (${qrFriend}) — أرسل له طلب صداقة من هنا!`
            : `Scanned QR for (${qrFriend}) — send a friend request below!`
        );
      }
    } catch {
      // ignore
    }

    const timer = window.setInterval(() => {
      fetchState(true);
    }, 15000);

    const handlePageHide = () => {
      const h = getEffectiveHandle();
      if (!h || !navigator.sendBeacon) return;
      const blob = new Blob([JSON.stringify({ handle: h })], { type: 'application/json' });
      navigator.sendBeacon('/api/activity/offline', blob);
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  // Live WebSocket for Instant Chat & Friend Requests
  const effectiveUidForWs = firebaseUser?.uid || state?.profile.id || '';
  const effectiveHandleForWs = state?.profile.handle || '';
  useEffect(() => {
    if (!effectiveUidForWs) return;
    let closedByCleanup = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    const connectWs = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/chat?uid=${encodeURIComponent(
        effectiveUidForWs
      )}&handle=${encodeURIComponent(effectiveHandleForWs)}`;
      const sock = new WebSocket(wsUrl);
      wsRef.current = sock;

      sock.onopen = () => {
        fetchChatMessages(true);
        pingTimer = window.setInterval(() => {
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      sock.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data as string) as {
            type?: string;
            message?: FriendChatMessage;
            request?: FriendRequest;
            viewerUid?: string;
            channelId?: string;
          };
          if (payload.type === 'chat:message' && payload.message) {
            const msg = payload.message;
            setState((prev) => {
              if (!prev) return prev;
              const prevMsgs = prev.friendMessages || [];
              if (prevMsgs.some((m) => m.id === msg.id)) return prev;
              return { ...prev, friendMessages: [...prevMsgs, msg].slice(-150) };
            });
            triggerTopChatAlertIfOutside(msg);
          } else if (payload.type === 'chat:read' && payload.viewerUid && payload.channelId) {
            const rUid = payload.viewerUid;
            const rChannel = payload.channelId;
            setState((prev) => {
              if (!prev || !prev.friendMessages) return prev;
              return {
                ...prev,
                friendMessages: prev.friendMessages.map((m) =>
                  m.channelId === rChannel && !(m.readBy || []).includes(rUid)
                    ? { ...m, readBy: [...(m.readBy || []), rUid] }
                    : m
                ),
              };
            });
          } else if (payload.type === 'friend:request' && payload.request) {
            const reqObj = payload.request;
            setState((prev) => {
              if (!prev) return prev;
              const existing = prev.friendRequests || [];
              const idx = existing.findIndex((r) => r.id === reqObj.id);
              const nextReqs =
                idx === -1
                  ? [reqObj, ...existing]
                  : existing.map((r) => (r.id === reqObj.id ? reqObj : r));
              return { ...prev, friendRequests: nextReqs };
            });
            triggerFriendRequestBannerIfNew(reqObj);
          } else if (payload.type === 'friend:updated') {
            if (payload.request) {
              const reqObj = payload.request;
              setTopFriendRequestBanner((prev) => (prev?.id === reqObj.id ? null : prev));
            }
            fetchState(true);
            fetchChatMessages(true);
          } else if (payload.type === 'friend:removed') {
            fetchState(true);
            fetchChatMessages(true);
          }
        } catch {
          // ignore
        }
      };

      sock.onclose = () => {
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connectWs, 2500);
        }
      };
    };

    connectWs();
    return () => {
      closedByCleanup = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [effectiveUidForWs, effectiveHandleForWs]);

  // Real-time Firestore public platform listener (Games, Tournaments, LiveFeed)
  useEffect(() => {
    const unsubscribe = subscribeToPublicPlatform({
      onGames: (games) => {
        setState((prev) => (prev ? { ...prev, games } : prev));
      },
      onTournaments: (tournaments) => {
        setState((prev) => (prev ? { ...prev, tournaments } : prev));
      },
      onLiveFeed: (liveFeed) => {
        setState((prev) => (prev ? { ...prev, liveFeed } : prev));
      },
    });
    return () => unsubscribe();
  }, []);

  // Real-time Firestore private user listener (Friends, Friend Requests & Instant Chat)
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;
    const uid = firebaseUser.uid;
    const unsubscribe = subscribeToUserRealtime(uid, {
      onFriends: (friends) => {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            friendsByUid: { ...(prev.friendsByUid || {}), [uid]: friends },
            team: { ...prev.team, members: friends },
          };
        });
      },
      onFriendRequests: (friendRequests) => {
        for (const r of friendRequests) {
          if (r.toUid === uid && r.status === 'pending') {
            triggerFriendRequestBannerIfNew(r);
          } else if (r.status !== 'pending') {
            setTopFriendRequestBanner((prev) => (prev?.id === r.id ? null : prev));
          }
        }
        setState((prev) => {
          if (!prev) return prev;
          const reqMap = new Map<string, FriendRequest>();
          for (const r of prev.friendRequests || []) reqMap.set(r.id, r);
          for (const r of friendRequests) reqMap.set(r.id, r);
          return { ...prev, friendRequests: Array.from(reqMap.values()) };
        });
      },
      onChatMessages: (messages) => {
        if (!initialChatLoadedRef.current) {
          for (const m of messages) seenIncomingMsgIdsRef.current.add(m.id);
          initialChatLoadedRef.current = true;
        } else {
          for (const m of messages) {
            if (m.senderUid !== uid && !(m.readBy || []).includes(uid)) {
              triggerTopChatAlertIfOutside(m);
            } else {
              seenIncomingMsgIdsRef.current.add(m.id);
            }
          }
        }
        setState((prev) => {
          if (!prev) return prev;
          const msgMap = new Map<string, FriendChatMessage>();
          for (const m of prev.friendMessages || []) msgMap.set(m.id, m);
          for (const m of messages) msgMap.set(m.id, m);
          return {
            ...prev,
            friendMessages: Array.from(msgMap.values())
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .slice(-150),
          };
        });
      },
    });
    return () => unsubscribe();
  }, [firebaseUser?.uid, firebaseUser?.emailVerified]);

  // Listen for Firebase Sign-In and enforce first-time-only onboarding
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);

      if (!user) {
        setGmailConnectedEmail(null);
        setCheckingAuthProfile(false);
        setShowUsernamePrompt(true);
        return;
      }

      const googleDisplayName = user.displayName || user.email?.split('@')[0] || '';
      const defaultHandle = user.email?.split('@')[0] || `user_${user.uid.slice(0, 6)}`;
      const localDoneKey = `arena_onboarding_done_${user.uid}`;
      const localProfileKey = `arena_user_profile_${user.uid}`;

      let localDone = false;
      let localCachedProfile: {
        displayName?: string;
        handle?: string;
        whatsappNumber?: string;
        email?: string;
        city?: string;
        onboardingCompleted?: boolean;
      } | null = null;

      try {
        localDone = window.localStorage.getItem(localDoneKey) === '1';
        const rawCached = window.localStorage.getItem(localProfileKey);
        if (rawCached) {
          localCachedProfile = JSON.parse(rawCached);
        }
      } catch {
        // ignore
      }

      const cachedAlreadyComplete = Boolean(
        localDone &&
          localCachedProfile &&
          isProfileComplete({
            displayName: localCachedProfile.displayName,
            handle: localCachedProfile.handle,
            whatsappNumber: localCachedProfile.whatsappNumber,
            email: localCachedProfile.email || user.email || '',
          })
      );

      if (cachedAlreadyComplete) {
        setShowUsernamePrompt(false);
        setCheckingAuthProfile(false);
      } else {
        setCheckingAuthProfile(true);
      }

      const [srvProfileResult, cloudSnapResult] = await Promise.all([
        fetch(`/api/profile/${encodeURIComponent(user.uid)}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ profile?: PlayerProfile | null }>) : null))
          .catch(() => null),
        user.emailVerified
          ? getDoc(doc(db, 'users', user.uid)).catch((err) => {
              handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
              return null;
            })
          : Promise.resolve(null),
      ]);

      const sp = srvProfileResult?.profile || null;
      const d =
        cloudSnapResult && cloudSnapResult.exists()
          ? (cloudSnapResult.data() as {
              displayName?: string;
              handle?: string;
              whatsappNumber?: string;
              email?: string;
              city?: string;
              onboardingCompleted?: boolean;
            })
          : null;

      const resolvedDisplayName =
        [d?.displayName, sp?.displayName, localCachedProfile?.displayName].find((name) =>
          hasTripleName(name)
        ) ||
        d?.displayName ||
        sp?.displayName ||
        localCachedProfile?.displayName ||
        googleDisplayName;

      const resolvedHandle =
        [d?.handle, sp?.handle, localCachedProfile?.handle].find(
          (h) => h && !isPlaceholderHandleStr(h)
        ) || defaultHandle;

      const resolvedWhatsapp =
        [d?.whatsappNumber, sp?.whatsappNumber, sp?.phoneOrDiscord, localCachedProfile?.whatsappNumber]
          .map((w) => sanitizeWhatsappInput(w))
          .find((w) => isValidWhatsappNumber(w)) ||
        sanitizeWhatsappInput(
          d?.whatsappNumber ||
            sp?.whatsappNumber ||
            sp?.phoneOrDiscord ||
            localCachedProfile?.whatsappNumber ||
            ''
        );

      const resolvedEmail =
        d?.email || sp?.email || user.email || localCachedProfile?.email || '';
      const resolvedCity = d?.city || sp?.city || localCachedProfile?.city || 'القاهرة';

      const hasRequiredFields = isProfileComplete({
        displayName: resolvedDisplayName,
        handle: resolvedHandle,
        whatsappNumber: resolvedWhatsapp,
        email: resolvedEmail,
      });

      const hasStoredCompletion = Boolean(
        sp?.onboardingCompleted === true ||
          d?.onboardingCompleted === true ||
          localDone ||
          (d && hasTripleName(d.displayName) && isValidWhatsappNumber(d.whatsappNumber)) ||
          (sp &&
            hasTripleName(sp.displayName) &&
            isValidWhatsappNumber(sp.whatsappNumber || sp.phoneOrDiscord))
      );

      const isCompleted = hasRequiredFields && hasStoredCompletion;

      setCheckingAuthProfile(false);

      if (isCompleted) {
        try {
          window.localStorage.setItem(localDoneKey, '1');
          window.localStorage.setItem('arena_onboarding_done', '1');
          window.localStorage.setItem(
            localProfileKey,
            JSON.stringify({
              displayName: resolvedDisplayName,
              handle: resolvedHandle,
              whatsappNumber: resolvedWhatsapp,
              email: resolvedEmail,
              city: resolvedCity,
              onboardingCompleted: true,
            })
          );
        } catch {
          // ignore
        }
        setShowUsernamePrompt(false);
      } else {
        setShowUsernamePrompt(true);
      }

      try {
        const res = await fetch('/api/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(user.emailVerified && user.email
              ? {
                  'x-viewer-email': normalizeEmail(user.email),
                  'x-viewer-verified': 'true',
                }
              : {}),
          },
          body: JSON.stringify({
            id: user.uid,
            displayName: resolvedDisplayName || resolvedHandle,
            handle: resolvedHandle,
            whatsappNumber: resolvedWhatsapp,
            phoneOrDiscord: resolvedWhatsapp,
            email: resolvedEmail,
            emailVerified: Boolean(user.emailVerified),
            photoURL: user.photoURL || undefined,
            isGoogleSignedIn: true,
            onboardingCompleted: isCompleted,
            city: resolvedCity,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            setAdminLockedManually(false);
            savedUserProfileRef.current = data.state.profile;
            setState(data.state);
            fetchChatMessages(true);

            if (user.emailVerified) {
              syncProfileAndDirectoryToFirestore(data.state.profile).catch(() => {});

              loadCloudUserBundle(user.uid)
                .then(async (cloudBundle) => {
                  const serverReqs: FriendRequest[] = data.state.friendRequests || [];
                  for (const sr of serverReqs) {
                    if (sr.fromUid === user.uid) {
                      mirrorFriendRequestCreateToFirestore(sr).catch(() => {});
                    }
                  }
                  if (cloudBundle.friends.length > 0 || cloudBundle.friendRequests.length > 0) {
                    const hydrateRes = await fetch('/api/sync/hydrate', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(user.emailVerified && user.email
                          ? {
                              'x-viewer-uid': user.uid,
                              'x-viewer-email': normalizeEmail(user.email),
                              'x-viewer-verified': 'true',
                            }
                          : { 'x-viewer-uid': user.uid }),
                      },
                      body: JSON.stringify({
                        uid: user.uid,
                        email: resolvedEmail,
                        handle: resolvedHandle,
                        friends: cloudBundle.friends,
                        friendRequests: cloudBundle.friendRequests,
                      }),
                    });
                    if (hydrateRes.ok) {
                      const hData = await hydrateRes.json();
                      if (hData.state) {
                        setState((prev) => mergeWithSavedProfile(hData.state, prev));
                        fetchChatMessages(true);
                      }
                    }
                  }
                })
                .catch(() => {});

              Promise.all([loadPublicPlatformFromFirestore(), loadAdminCloudExtras()])
                .then(async ([cloudPublic, cloudExtras]) => {
                  let latestForAdmin: PlatformState = data.state;
                  const hasPlatformData =
                    cloudPublic.games.length > 0 ||
                    cloudPublic.tournaments.length > 0 ||
                    cloudPublic.liveFeed.length > 0 ||
                    Object.keys(cloudPublic.registrationsByTournament).length > 0 ||
                    cloudExtras.adminHandles.length > 0 ||
                    cloudExtras.submissions.length > 0;

                  if (hasPlatformData) {
                    const hydratePlatRes = await fetch('/api/sync/hydrate-platform', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(user.emailVerified && user.email
                          ? {
                              'x-viewer-email': normalizeEmail(user.email),
                              'x-viewer-verified': 'true',
                            }
                          : {}),
                      },
                      body: JSON.stringify({
                        uid: user.uid,
                        email: resolvedEmail,
                        handle: resolvedHandle,
                        adminHandles: cloudExtras.adminHandles,
                        games: cloudPublic.games,
                        tournaments: cloudPublic.tournaments,
                        registrationsByTournament: cloudPublic.registrationsByTournament,
                        liveFeed: cloudPublic.liveFeed,
                        submissions: cloudExtras.submissions,
                      }),
                    });
                    if (hydratePlatRes.ok) {
                      const hpData = await hydratePlatRes.json();
                      if (hpData.state) {
                        latestForAdmin = hpData.state;
                        setState((prev) => mergeWithSavedProfile(hpData.state, prev));
                      }
                    }
                  }

                  if (latestForAdmin.isViewerAdmin) {
                    syncAdminSnapshotToFirestore(latestForAdmin).catch(() => {});
                  }
                })
                .catch(() => {});
            }
          }
        }
      } catch {
        // Non-fatal fallback
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignedOut = async () => {
    clearGmailAccessToken();
    setGmailConnectedEmail(null);
    setCheckingAuthProfile(false);
    setShowUsernamePrompt(true);
    setAdminLockedManually(false);
    setAdminPlayers([]);
    savedUserProfileRef.current = null;
    if (activeView === 'admin') {
      setActiveView('home');
    }
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'player-main',
          displayName: 'لاعب ضيف',
          handle: 'Player_Guest',
          whatsappNumber: '',
          phoneOrDiscord: '',
          email: undefined,
          emailVerified: false,
          photoURL: undefined,
          isGoogleSignedIn: false,
          onboardingCompleted: false,
        }),
      });
      const data = await res.json();
      if (res.ok && data.state) {
        setState({ ...data.state, isViewerAdmin: false });
      }
    } catch {
      // ignore
    }
    showToast(isAr ? 'تم تسجيل الخروج من حساب Google.' : 'Signed out of Google account.');
  };

  const canUnlockAdmin =
    Boolean(firebaseUser?.emailVerified) && Boolean(state?.isViewerAdmin);
  const isAdmin = !adminLockedManually && canUnlockAdmin;
  const isAdminLocked = adminLockedManually && canUnlockAdmin;

  const handleUnlockAdmin = () => {
    setAdminLockedManually(false);
    setActiveView('admin');
    showToast(isAr ? 'تم فتح لوحة الإدارة.' : 'Admin panel unlocked.');
  };

  const fetchAdminPlayers = async () => {
    if (!auth.currentUser?.emailVerified) return;
    setLoadingAdminPlayers(true);
    try {
      const [srvRes, cloudList] = await Promise.all([
        fetch('/api/admin/players', { headers: getAdminAuthHeaders() }).catch(() => null),
        loadAllPlayerProfilesFromFirestore().catch(() => [] as AdminPlayerSummary[]),
      ]);
      const srvPlayers: AdminPlayerSummary[] = [];
      if (srvRes && srvRes.ok) {
        const srvJson = (await srvRes.json()) as { players?: AdminPlayerSummary[] };
        if (Array.isArray(srvJson.players)) srvPlayers.push(...srvJson.players);
      }

      const byKey = new Map<string, AdminPlayerSummary>();
      for (const p of [...cloudList, ...srvPlayers]) {
        if (!p.id) continue;
        const existing = byKey.get(p.id);
        if (!existing) {
          byKey.set(p.id, p);
        } else {
          byKey.set(p.id, {
            ...existing,
            ...p,
            displayName: p.displayName || existing.displayName,
            whatsappNumber: p.whatsappNumber || existing.whatsappNumber,
            email: p.email || existing.email,
            tournamentsCount: Math.max(p.tournamentsCount || 0, existing.tournamentsCount || 0),
          });
        }
      }
      setAdminPlayers(
        Array.from(byKey.values()).sort((a, b) =>
          (b.updatedAt || '').localeCompare(a.updatedAt || '') ||
          a.displayName.localeCompare(b.displayName, 'ar')
        )
      );
    } finally {
      setLoadingAdminPlayers(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAdminPlayers();
    } else {
      setAdminPlayers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, firebaseUser?.uid]);

  useEffect(() => {
    if (isAdmin && activeView === 'admin' && adminSection === 'players') {
      fetchAdminPlayers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeView, adminSection]);

  useEffect(() => {
    if (!isAdmin && activeView === 'admin') {
      setActiveView('home');
    }
  }, [isAdmin, activeView]);

  const navigateTo = (view: ActiveView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenGame = (slug: GameSlug) => {
    setSelectedGame(slug);
    navigateTo('games');
  };

  const handleOpenBracket = (tournamentId: string) => {
    setSelectedTournamentId(tournamentId);
    navigateTo('tournaments');
  };

  const handleQuickRegister = (t: Tournament) => {
    const isRegistered = state?.profile.registeredTournamentIds.includes(t.id) ?? false;
    if (isRegistered) {
      showToast(
        isAr
          ? 'أنت مسجل بالفعل في هذه البطولة — مقعدك محجوز في المجموعات.'
          : 'You are already registered in this tournament.'
      );
      return;
    }
    if (!t.registrationOpen) {
      showToast(
        isAr
          ? 'التسجيل مغلق حالياً من الإدارة — يرجى فتح زر التسجيل من لوحة الإدارة أولاً.'
          : 'Registration is currently closed by Admin.',
        'error'
      );
      return;
    }
    if (t.registeredCount >= t.maxSlots) {
      showToast(
        isAr
          ? 'اكتمل العدد الأقصى للمشاركين في هذه البطولة.'
          : 'Tournament slots are completely full.',
        'error'
      );
      return;
    }
    setRegisterModalTournament(t);
  };

  const handleGooglePopupSignIn = async () => {
    try {
      setCheckingAuthProfile(true);
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged resolves server + Firestore profile and toggles prompt cleanly
    } catch (err: unknown) {
      setCheckingAuthProfile(false);
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        showToast(
          isAr ? 'تعذر إتمام تسجيل الدخول عبر Google.' : 'Unable to complete Google Sign-In.',
          'error'
        );
      }
    }
  };

  const handleConfirmRegistration = async (
    tournamentId: string,
    payload: {
      mode: 'solo' | 'team';
      teamName: string;
      members: TeamRosterMember[];
      username: string;
      teammateUsername?: string;
      email?: string;
      isSelfCaptain?: boolean;
      captainDisplayName?: string;
    }
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const uid = getEffectiveUid();
      const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getViewerHeaders() },
        body: JSON.stringify({ ...payload, uid }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || (isAr ? 'تعذر إتمام التسجيل.' : 'Unable to complete registration.');
        showToast(errMsg, 'error');
        return { ok: false, error: errMsg };
      }

      const nextState: PlatformState = data.state;
      setState((prev) => mergeWithSavedProfile(nextState, prev));

      if (firebaseUser?.emailVerified && data.participant) {
        const updatedTournament = nextState.tournaments?.find((t) => t.id === tournamentId);
        (async () => {
          if (updatedTournament) {
            await syncTournamentToFirestore(updatedTournament).catch(() => {});
          }
          await syncRegistrationToFirestore(
            tournamentId,
            data.participant as BracketParticipant,
            typeof data.assignedSeatIndex === 'number' ? data.assignedSeatIndex : 0
          ).catch(() => {});
          if (nextState.profile) {
            await syncProfileAndDirectoryToFirestore(nextState.profile).catch(() => {});
          }
        })().catch(() => {});
      }

      setRegisterModalTournament(null);
      const emailPart =
        data.emailDeliveryStatus === 'sent'
          ? isAr
            ? ' وتم إرسال رسالة التأكيد لبريدك.'
            : ' Confirmation email sent.'
          : payload.email
          ? isAr
            ? ' وتم حفظ التنبيه لمجموعتك ومواعيدك.'
            : ' Group & schedule alert saved.'
          : '';
      if (data.capacityCompleted) {
        showToast(
          isAr
            ? `تم تسجيلك واكتمل عدد البطولة! فُتحت المواجهات المباشرة وإدخال النتائج في إدارة الماتشات.${emailPart}`
            : `Registered and tournament is now full! Direct matchups & score entry are open in Matches Admin.${emailPart}`
        );
      } else {
        const groupDisplay = data.assignedGroup
          ? translateGroupName(data.assignedGroup, lang)
          : isAr
          ? 'مجموعة عشوائية'
          : 'a random group';
        showToast(
          isAr
            ? `تم تسجيلك بنجاح وإدراجك في ${groupDisplay}.${emailPart}`
            : `Registered successfully and placed in ${groupDisplay}.${emailPart}`
        );
      }
      return { ok: true };
    } catch {
      const errMsg = isAr ? 'حدث خطأ أثناء التسجيل.' : 'Error during registration.';
      showToast(errMsg, 'error');
      return { ok: false, error: errMsg };
    }
  };

  const handleSubmitScreenshot = async (payload: {
    tournamentId: string;
    matchId: string;
    claimedWinnerId: string;
    scoreA: number;
    scoreB: number;
    screenshotUrl: string;
    note: string;
  }) => {
    try {
      const res = await fetch(
        `/api/tournaments/${payload.tournamentId}/matches/${payload.matchId}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getViewerHeaders() },
          body: JSON.stringify({
            ...payload,
            submittedBy: state?.profile.handle || state?.profile.displayName || 'Player',
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر إرسال النتيجة.' : 'Unable to submit result.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      if (firebaseUser?.emailVerified && data.submission) {
        syncSubmissionCreateToFirestore(data.submission).catch(() => {});
      }
      setScreenshotTarget(null);
      showToast(
        isAr
          ? 'تم رفع صورة النتيجة وإرسالها لمراجعة الإدارة.'
          : 'Result screenshot uploaded for Admin review.'
      );
    } catch {
      showToast(isAr ? 'تعذر إرسال النتيجة.' : 'Unable to submit result.', 'error');
    }
  };

  const handleSaveProfile = async (updated: Partial<PlayerProfile>): Promise<boolean> => {
    try {
      const activeUser = auth.currentUser || firebaseUser;
      const effectiveUid = activeUser?.uid || getOrCreateClientId();
      const cleanWhatsapp =
        updated.whatsappNumber !== undefined
          ? sanitizeWhatsappInput(updated.whatsappNumber)
          : updated.phoneOrDiscord !== undefined
          ? sanitizeWhatsappInput(updated.phoneOrDiscord)
          : undefined;
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          ...updated,
          ...(cleanWhatsapp !== undefined
            ? { whatsappNumber: cleanWhatsapp, phoneOrDiscord: cleanWhatsapp }
            : {}),
          emailVerified: Boolean(activeUser?.emailVerified),
          isGoogleSignedIn: Boolean(activeUser),
          id: effectiveUid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر حفظ الملف.' : 'Unable to save profile.'), 'error');
        return false;
      }

      const nextState: PlatformState = data.state;
      if (activeUser && activeUser.emailVerified) {
        const userDocPath = `users/${activeUser.uid}`;
        try {
          try {
            await setDoc(
              doc(db, 'users', activeUser.uid),
              {
                uid: activeUser.uid,
                displayName: nextState.profile.displayName.slice(0, 80),
                handle: nextState.profile.handle.slice(0, 50),
                email: (nextState.profile.email || activeUser.email || '').slice(0, 120),
                whatsappNumber: sanitizeWhatsappInput(
                  nextState.profile.whatsappNumber || nextState.profile.phoneOrDiscord || ''
                ),
                city: (nextState.profile.city || 'القاهرة').slice(0, 60),
                onboardingCompleted: Boolean(nextState.profile.onboardingCompleted),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, userDocPath);
          }
        } catch {
          // Non-fatal fallback
        }
        syncProfileAndDirectoryToFirestore(nextState.profile).catch(() => {});
      }

      savedUserProfileRef.current = nextState.profile;
      setState(nextState);
      if (activeUser) {
        try {
          if (nextState.profile.onboardingCompleted) {
            window.localStorage.setItem(`arena_onboarding_done_${activeUser.uid}`, '1');
            window.localStorage.setItem('arena_onboarding_done', '1');
          }
          window.localStorage.setItem(
            `arena_user_profile_${activeUser.uid}`,
            JSON.stringify({
              displayName: nextState.profile.displayName,
              handle: nextState.profile.handle,
              whatsappNumber: nextState.profile.whatsappNumber || '',
              email: nextState.profile.email || activeUser.email || '',
              city: nextState.profile.city || 'القاهرة',
              onboardingCompleted: Boolean(nextState.profile.onboardingCompleted),
            })
          );
        } catch {
          // ignore
        }
      }
      showToast(
        isAr
          ? 'تم حفظ الاسم ثلاثي واليوزر نيم ورقم الواتساب بنجاح.'
          : 'Triple name, username & WhatsApp saved successfully.'
      );
      return true;
    } catch {
      showToast(isAr ? 'تعذر حفظ الملف.' : 'Unable to save profile.', 'error');
      return false;
    }
  };

  const handleUsernamePromptSubmit = async (payload: {
    displayName: string;
    username: string;
    whatsappNumber: string;
    email: string;
  }) => {
    const activeUser = auth.currentUser || firebaseUser;
    if (!activeUser) {
      showToast(
        isAr ? 'يجب تسجيل الدخول عبر Google أولاً.' : 'Please sign in with Google first.',
        'error'
      );
      return;
    }

    const enteredDisplayName = payload.displayName.trim().replace(/\s+/g, ' ');
    const enteredUsername = payload.username.trim().replace(/^@+/, '');
    const enteredWhatsapp = sanitizeWhatsappInput(payload.whatsappNumber);
    const enteredEmail = (payload.email || activeUser.email || '').trim();

    const saved = await handleSaveProfile({
      displayName: enteredDisplayName,
      handle: enteredUsername,
      whatsappNumber: enteredWhatsapp,
      phoneOrDiscord: enteredWhatsapp,
      email: enteredEmail,
      isGoogleSignedIn: true,
      onboardingCompleted: true,
    });
    if (!saved) return;

    try {
      window.localStorage.setItem('arena_onboarding_done', '1');
      window.localStorage.setItem(`arena_onboarding_done_${activeUser.uid}`, '1');
      window.localStorage.setItem(
        `arena_user_profile_${activeUser.uid}`,
        JSON.stringify({
          displayName: enteredDisplayName,
          handle: enteredUsername,
          whatsappNumber: enteredWhatsapp,
          email: enteredEmail,
          onboardingCompleted: true,
        })
      );
    } catch {
      // ignore
    }
    setShowUsernamePrompt(false);
  };

  const handleUpdateTeam = async (payload: {
    name?: string;
    tag?: string;
    removeMemberId?: string;
    regenerateCode?: boolean;
  }): Promise<boolean> => {
    try {
      const uid = getEffectiveUid();
      const removedTarget =
        payload.removeMemberId && state?.team.members
          ? state.team.members.find(
              (m) => m.id === payload.removeMemberId || m.uid === payload.removeMemberId
            )
          : undefined;
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getViewerHeaders() },
        body: JSON.stringify({
          ...payload,
          viewerUid: uid,
          viewerHandle: getEffectiveHandle(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر تحديث الفريق.' : 'Unable to update team.'), 'error');
        return false;
      }
      if (removedTarget?.uid && firebaseUser?.emailVerified) {
        deleteFriendEdgeFromFirestore(firebaseUser.uid, removedTarget.uid).catch(() => {});
      }
      setState(data.state);
      fetchChatMessages(true);
      showToast(
        isAr ? 'تم تحديث بيانات الفريق والأصدقاء بنجاح.' : 'Team & friends updated successfully.'
      );
      return true;
    } catch {
      showToast(isAr ? 'تعذر تحديث الفريق.' : 'Unable to update team.', 'error');
      return false;
    }
  };

  const handleAddAdminHandle = async (adminHandle: string) => {
    const cleanEmail = normalizeEmail(adminHandle);
    if (!isValidEmailAddress(cleanEmail)) {
      showToast(isAr ? 'يرجى إدخال بريد Gmail صحيح.' : 'Please enter a valid Gmail address.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/admin/handle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ adminHandle: cleanEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'خطأ', 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      syncAdminEmailToFirestore(cleanEmail).catch(() => {});
      if (Array.isArray(data.state?.adminHandles)) {
        syncAdminHandlesToFirestore(data.state.adminHandles).catch(() => {});
      }
      showToast(
        isAr
          ? `تمت إضافة "${cleanEmail}" إلى صلاحيات الإدارة.`
          : `Added "${cleanEmail}" to Admin permissions.`
      );
    } catch {
      showToast(isAr ? 'تعذر إضافة البريد للإدارة.' : 'Unable to add Admin email.', 'error');
    }
  };

  const handleRemoveAdminHandle = async (email: string) => {
    const cleanEmail = normalizeEmail(email);
    try {
      const res = await fetch('/api/admin/handle', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({ adminHandle: cleanEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'خطأ', 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      removeAdminEmailFromFirestore(cleanEmail).catch(() => {});
      if (Array.isArray(data.state?.adminHandles)) {
        syncAdminHandlesToFirestore(data.state.adminHandles).catch(() => {});
      }
      showToast(
        isAr
          ? `تمت إزالة "${cleanEmail}" من صلاحيات الإدارة.`
          : `Removed "${cleanEmail}" from Admin permissions.`
      );
    } catch {
      showToast(isAr ? 'تعذر إزالة البريد من الإدارة.' : 'Unable to remove Admin email.', 'error');
    }
  };

  const handleCreateTournament = async (payload: {
    title: string;
    gameSlug: GameSlug;
    customGameName?: string;
    modeTag: MatchFormatTag;
    venueName: string;
    prizePool: string;
    maxSlots: 4 | 8 | 16 | 32 | 64;
    rulesText: string;
    openImmediately?: boolean;
  }) => {
    try {
      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر إنشاء البطولة.' : 'Unable to create tournament.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      setSelectedTournamentId(data.tournament.id);
      syncTournamentToFirestore(data.tournament).catch(() => {});
      showToast(
        payload.openImmediately
          ? isAr
            ? 'تم إنشاء البطولة وفتح باب التسجيل الآن.'
            : 'Tournament created and registration opened immediately.'
          : isAr
          ? 'تم إنشاء البطولة (التسجيل مغلق افتراضياً حتى تقوم بفتحه).'
          : 'Tournament created (registration is closed by default until you open it).'
      );
    } catch {
      showToast(isAr ? 'تعذر إنشاء البطولة.' : 'Unable to create tournament.', 'error');
    }
  };

  const handleDeleteTournament = async (tournamentId: string) => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}`, {
        method: 'DELETE',
        headers: { ...getAdminAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر حذف البطولة.' : 'Unable to delete tournament.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      deleteTournamentFromFirestore(tournamentId).catch(() => {});
      if (selectedTournamentId === tournamentId) {
        setSelectedTournamentId(data.state.tournaments[0]?.id || '');
      }
      if (registerModalTournament?.id === tournamentId) {
        setRegisterModalTournament(null);
      }
      if (screenshotTarget?.tournament.id === tournamentId) {
        setScreenshotTarget(null);
      }
      showToast(isAr ? 'تم حذف البطولة نهائياً من المنصة.' : 'Tournament removed from the platform.');
    } catch {
      showToast(isAr ? 'تعذر حذف البطولة.' : 'Unable to delete tournament.', 'error');
    }
  };

  const handleUpdateTournamentMeta = async (
    tournamentId: string,
    payload: {
      registrationOpen?: boolean;
      resultsEntryOpen?: boolean;
      title?: string;
      venueName?: string;
      prizePool?: string;
      status?: Tournament['status'];
      modeTag?: MatchFormatTag;
      rulesText?: string;
    }
  ) => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر تحديث البطولة.' : 'Unable to update tournament.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      const updatedT = data.tournament || data.state?.tournaments?.find((t: Tournament) => t.id === tournamentId);
      if (updatedT) syncTournamentToFirestore(updatedT).catch(() => {});

      if (typeof payload.registrationOpen === 'boolean') {
        showToast(
          payload.registrationOpen
            ? isAr
              ? 'تم فتح التسجيل (سجل الآن) في البطولة.'
              : 'Tournament registration is now open.'
            : isAr
            ? 'تم قفل زر (سجل الآن) من قبل الليدر.'
            : 'Tournament registration closed by Leader.'
        );
      } else if (typeof payload.resultsEntryOpen === 'boolean') {
        showToast(
          payload.resultsEntryOpen
            ? isAr
              ? 'تم فتح إدارة الماتشات وتسجيل النتائج لهذه البطولة.'
              : 'Matches & score entry opened for this tournament.'
            : isAr
            ? 'تم إغلاق تسجيل النتائج لهذه البطولة.'
            : 'Score entry closed for this tournament.'
        );
      } else {
        showToast(
          isAr
            ? 'تم حفظ تعديلات البطولة والقوانين بنجاح.'
            : 'Tournament settings & rules saved successfully.'
        );
      }
    } catch {
      showToast(isAr ? 'تعذر تحديث البطولة.' : 'Unable to update tournament.', 'error');
    }
  };

  const handleUpdateGameRules = async (
    slug: GameSlug,
    payload: {
      rulesText: string;
      summary?: string;
      scoringSystem?: string;
      modeLabel?: string;
    }
  ) => {
    try {
      const res = await fetch(`/api/admin/games/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر حفظ القوانين.' : 'Unable to save rules.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      if (data.game) syncGameToFirestore(data.game).catch(() => {});
      showToast(
        isAr
          ? 'تم حفظ قوانين اللعبة بواسطة الإدارة بنجاح.'
          : 'Game rules updated by Admin successfully.'
      );
    } catch {
      showToast(isAr ? 'تعذر حفظ القوانين.' : 'Unable to save rules.', 'error');
    }
  };

  const handleUpdateMatchup = async (
    tournamentId: string,
    payload: {
      shuffle?: boolean;
      reorderMatches?: { fromMatchId: string; toMatchId: string };
      swapSlots?: {
        fromMatchId: string;
        fromSide: 'A' | 'B';
        toMatchId: string;
        toSide: 'A' | 'B';
      };
      moveToGroup?: { participantId: string; targetGroup: string };
      matchId?: string;
      participantAId?: string | null;
      participantBId?: string | null;
      groupName?: string;
      pairTargetId?: string;
      teammateUsername?: string;
    }
  ) => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/matchup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر تحديث المواجهة.' : 'Unable to update matchup.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      if (data.tournament) syncTournamentToFirestore(data.tournament).catch(() => {});

      if (payload.shuffle) {
        showToast(isAr ? 'تم إعادة توزيع اللاعبين على مجموعات عشوائية.' : 'Players shuffled across random groups.');
      } else if (payload.reorderMatches) {
        showToast(isAr ? 'تم إعادة ترتيب المواجهات بنجاح.' : 'Matchups reordered.');
      } else if (payload.moveToGroup) {
        showToast(
          isAr
            ? `تم نقل اللاعب إلى ${payload.moveToGroup.targetGroup}.`
            : `Player moved to ${translateGroupName(payload.moveToGroup.targetGroup, lang)}.`
        );
      } else if (payload.swapSlots) {
        showToast(isAr ? 'تم تبديل مواقع اللاعبين في المواجهات.' : 'Player slots swapped.');
      } else {
        showToast(isAr ? 'تم تحديث أطراف المواجهة بنجاح.' : 'Matchup updated successfully.');
      }
    } catch {
      showToast(isAr ? 'تعذر تحديث المواجهة.' : 'Unable to update matchup.', 'error');
    }
  };

  const handleAdminCheckIn = async (
    tournamentId: string,
    payload: {
      code: string;
      participantId?: string;
      action?: 'checkin' | 'undo' | 'toggle';
      resolvedHandle?: string;
      resolvedPlayerCode?: string;
    }
  ) => {
    try {
      let resolvedHandle = payload.resolvedHandle;
      let resolvedPlayerCode = payload.resolvedPlayerCode;

      if (!resolvedHandle && payload.code && auth.currentUser) {
        const scanned = extractScannedIdentifier(payload.code);
        if (scanned) {
          try {
            const cloudMatch = await lookupDirectoryInFirestore(scanned);
            if (cloudMatch) {
              resolvedHandle = cloudMatch.handle;
              resolvedPlayerCode = cloudMatch.playerCode;
            }
          } catch {
            // fallback to server lookup
          }
        }
      }

      const res = await fetch(`/api/admin/tournaments/${tournamentId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify({
          ...payload,
          resolvedHandle,
          resolvedPlayerCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || (isAr ? 'تعذر تسجيل حضور اللاعب.' : 'Unable to check in player.');
        showToast(errMsg, 'error');
        return { ok: false as const, error: errMsg };
      }

      setState((prev) => mergeWithSavedProfile(data.state, prev));
      const updatedTournament = data.state?.tournaments?.find((t: Tournament) => t.id === tournamentId);
      if (updatedTournament) {
        syncTournamentToFirestore(updatedTournament).catch(() => {});
      }
      if (data.participant) {
        syncRegistrationCheckInToFirestore(tournamentId, data.participant as BracketParticipant).catch(
          () => {}
        );
      }

      const teamLabel = data.participant?.teamName || data.participant?.name || '';
      const playerLabel = data.matchedMember?.name || data.matchedMember?.handle || '';
      if (data.actionApplied === 'undo') {
        showToast(
          isAr
            ? `تم إلغاء تحضير ${playerLabel} (${teamLabel}) — ${data.badge}`
            : `Reverted check-in for ${playerLabel} (${teamLabel}) — ${data.badge}`
        );
      } else if (data.status === 'team_ready') {
        showToast(
          isAr
            ? `TEAM READY — اكتمل حضور فريق «${teamLabel}» (${data.arrivedCount}/${data.requiredCount})!`
            : `TEAM READY — «${teamLabel}» is fully checked in (${data.arrivedCount}/${data.requiredCount})!`
        );
      } else if (data.status === 'one_ready') {
        showToast(
          isAr
            ? `ONE READY — حضر ${playerLabel} من فريق «${teamLabel}» (${data.arrivedCount}/${data.requiredCount})`
            : `ONE READY — ${playerLabel} arrived for «${teamLabel}» (${data.arrivedCount}/${data.requiredCount})`
        );
      } else {
        showToast(
          isAr
            ? `${data.badge} — حضر ${playerLabel} من فريق «${teamLabel}»`
            : `${data.badge} — ${playerLabel} checked in for «${teamLabel}»`
        );
      }

      return {
        ok: true as const,
        badge: data.badge,
        status: data.status,
        arrivedCount: data.arrivedCount,
        requiredCount: data.requiredCount,
        participant: data.participant,
        matchedMember: data.matchedMember,
        alreadyCheckedIn: data.alreadyCheckedIn,
        actionApplied: data.actionApplied,
      };
    } catch {
      const errMsg = isAr ? 'تعذر تسجيل حضور اللاعب.' : 'Unable to check in player.';
      showToast(errMsg, 'error');
      return { ok: false as const, error: errMsg };
    }
  };

  const handleAiSchedule = async (
    tournamentId: string,
    customPrompt?: string
  ): Promise<{ ok: boolean; summaryAr?: string }> => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/ai-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify({ customPrompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر توليد الجدول.' : 'Unable to generate schedule.'), 'error');
        return { ok: false };
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      const updatedT = data.state?.tournaments?.find((t: Tournament) => t.id === tournamentId);
      if (updatedT) syncTournamentToFirestore(updatedT).catch(() => {});
      showToast(
        isAr
          ? `تم تحديد ${data.matchesCount} مباراة ذهاب وعودة بالـ AI (الموعد: لم يتحدد).`
          : `AI scheduled ${data.matchesCount} Home & Away matches (Schedule: TBD).`
      );
      return { ok: true, summaryAr: data.summaryAr };
    } catch {
      showToast(isAr ? 'تعذر الاتصال بخدمة الذكاء الاصطناعي.' : 'Unable to reach AI scheduling service.', 'error');
      return { ok: false };
    }
  };

  const handleConnectGmailSender = async (): Promise<string | null> => {
    try {
      const { email } = await connectGmailSender();
      const resolved = email || firebaseUser?.email || 'Gmail';
      setGmailConnectedEmail(resolved);
      showToast(
        isAr
          ? `تم ربط بريد ${resolved} للإرسال المباشر بنجاح.`
          : `Connected ${resolved} for direct email sending.`
      );
      return resolved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        showToast(
          isAr
            ? 'تعذر ربط حساب Gmail. تأكد من السماح بالنافذة المنبثقة وصلاحية الإرسال.'
            : 'Unable to connect Gmail. Please allow the popup and grant send permission.',
          'error'
        );
      }
      return null;
    }
  };

  const handleDisconnectGmailSender = () => {
    clearGmailAccessToken();
    setGmailConnectedEmail(null);
    showToast(isAr ? 'تم فصل الإرسال المباشر عبر Gmail.' : 'Disconnected direct Gmail sender.');
  };

  const handleSendViaGmailOAuth = async (
    targets: EmailDispatchTarget[]
  ): Promise<{ sent: number; failed: number }> => {
    if (!targets.length) return { sent: 0, failed: 0 };

    let token = getGmailAccessToken();
    let senderEmail = getGmailSenderEmail() || gmailConnectedEmail || firebaseUser?.email || null;

    if (!token) {
      try {
        const connected = await connectGmailSender();
        token = connected.accessToken;
        senderEmail = connected.email || senderEmail;
        setGmailConnectedEmail(senderEmail);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('popup-closed-by-user')) {
          showToast(
            isAr
              ? 'يرجى الموافقة على ربط حساب Gmail لإتمام الإرسال المباشر.'
              : 'Please grant Gmail permission to send directly.',
            'error'
          );
        }
        return { sent: 0, failed: targets.length };
      }
    }

    let sent = 0;
    let failed = 0;
    let tokenExpired = false;

    for (const target of targets) {
      const res = await sendEmailViaGmailApi({
        accessToken: token,
        to: target.email,
        subject: target.subject,
        text: target.text,
        html: target.html,
        fromEmail: senderEmail,
      });
      if (res.ok) {
        sent += 1;
      } else {
        failed += 1;
        if (res.status === 401 || res.status === 403) {
          tokenExpired = true;
          clearGmailAccessToken();
          setGmailConnectedEmail(null);
          break;
        }
      }
    }

    if (tokenExpired) {
      showToast(
        isAr
          ? 'انتهت جلسة صلاحية Gmail. اضغط «ربط Gmail للإرسال المباشر» وأعد المحاولة.'
          : 'Gmail authorization expired. Please reconnect Gmail and try again.',
        'error'
      );
    } else if (sent > 0 && failed === 0) {
      showToast(
        isAr
          ? `تم إرسال الرسالة مباشرة عبر Gmail (${senderEmail || 'حسابك'}) إلى ${sent} لاعب!`
          : `Sent directly via Gmail (${senderEmail || 'your account'}) to ${sent} player(s)!`
      );
    } else if (sent > 0 && failed > 0) {
      showToast(
        isAr
          ? `تم الإرسال إلى ${sent} لاعب، وتعذر الإرسال إلى ${failed}.`
          : `Sent to ${sent} player(s), failed for ${failed}.`,
        'error'
      );
    } else {
      showToast(
        isAr
          ? 'تعذر إرسال البريد عبر Gmail. تأكد من صلاحيات الحساب وأعد المحاولة.'
          : 'Failed to send email via Gmail API.',
        'error'
      );
    }

    return { sent, failed };
  };

  const handleUpdateMatchSchedule = async (
    tournamentId: string,
    matchId: string,
    scheduledAt: string,
    leg?: BracketMatch['leg']
  ): Promise<{
    mailtoLinks?: { name: string; email: string; url: string }[];
    emailTargets?: EmailDispatchTarget[];
  } | void> => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/matches/${matchId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify({ scheduledAt, leg }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر تحديث الموعد.' : 'Unable to update schedule.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      const updatedT = data.state?.tournaments?.find((t: Tournament) => t.id === tournamentId);
      if (updatedT) syncTournamentToFirestore(updatedT).catch(() => {});
      showToast(
        scheduledAt.trim()
          ? isAr
            ? `تم تحديد موعد المواجهة: ${scheduledAt.trim()} وإشعار اللاعبين`
            : `Match schedule set to ${scheduledAt.trim()} & players notified.`
          : isAr
          ? 'تم إعادة الموعد إلى: لم يتحدد.'
          : 'Match schedule reset to TBD.'
      );
      return { mailtoLinks: data.mailtoLinks, emailTargets: data.emailTargets };
    } catch {
      showToast(isAr ? 'تعذر تحديث الموعد.' : 'Unable to update schedule.', 'error');
    }
  };

  const handleNotifyMatch = async (
    tournamentId: string,
    matchId: string
  ): Promise<{
    ok: boolean;
    mailtoLinks?: { name: string; email: string; url: string }[];
    emailTargets?: EmailDispatchTarget[];
  }> => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/matches/${matchId}/notify`, {
        method: 'POST',
        headers: { ...getAdminAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر إرسال التنبيهات.' : 'Unable to send notifications.'), 'error');
        return { ok: false };
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      if (data.sentCount > 0) {
        showToast(
          isAr
            ? `تم إرسال البريد الإلكتروني والموعد إلى ${data.sentCount} لاعب.`
            : `Sent schedule & group email to ${data.sentCount} players.`
        );
      } else {
        showToast(
          isAr
            ? 'تم حفظ تنبيه المجموعة والموعد للاعبين.'
            : 'Group & schedule alert saved.'
        );
      }
      return { ok: true, mailtoLinks: data.mailtoLinks, emailTargets: data.emailTargets };
    } catch {
      showToast(isAr ? 'تعذر إرسال التنبيهات.' : 'Unable to send notifications.', 'error');
      return { ok: false };
    }
  };

  const handleSaveMatchResult = async (
    tournamentId: string,
    matchId: string,
    payload: {
      scoreA: number;
      scoreB: number;
      winnerId?: string | null;
      autoAiRank?: boolean;
    }
  ): Promise<{ ok: boolean; aiSummaryAr?: string }> => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/matches/${matchId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر تسجيل النتيجة.' : 'Unable to save score.'), 'error');
        return { ok: false };
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      const updatedT = data.state?.tournaments?.find((t: Tournament) => t.id === tournamentId);
      if (updatedT) syncTournamentToFirestore(updatedT).catch(() => {});
      if (data.state?.liveFeed?.[0]) syncLiveFeedItemToFirestore(data.state.liveFeed[0]).catch(() => {});
      if (data.aiSummaryAr) {
        showToast(
          isAr
            ? 'تم حفظ النتيجة وتحديث الترتيب وفارق الأهداف تلقائياً بالـ AI.'
            : 'Match result saved & group standings updated by AI.'
        );
      } else {
        showToast(
          isAr
            ? 'تم تسجيل نتيجة المواجهة وتحديث الترتيب وفارق الأهداف.'
            : 'Match result saved and standings & goal difference updated.'
        );
      }
      return { ok: true, aiSummaryAr: data.aiSummaryAr };
    } catch {
      showToast(isAr ? 'تعذر تسجيل النتيجة.' : 'Unable to save score.', 'error');
      return { ok: false };
    }
  };

  const handleAiDirectMatchups = async (
    tournamentId: string,
    customPrompt?: string
  ): Promise<{ ok: boolean; summaryAr?: string }> => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/ai-direct-matchups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify({ customPrompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر وضع المواجهات بالـ AI.' : 'Unable to run AI placement.'), 'error');
        return { ok: false };
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      const updatedT = data.state?.tournaments?.find((t: Tournament) => t.id === tournamentId);
      if (updatedT) syncTournamentToFirestore(updatedT).catch(() => {});
      showToast(
        isAr
          ? `تم وضع ${data.matchupsCount} مواجهة مباشرة بالـ AI بناءً على ترتيب المجموعات.`
          : `AI placed ${data.matchupsCount} direct knockout matchups based on group standings.`
      );
      return { ok: true, summaryAr: data.summaryAr };
    } catch {
      showToast(isAr ? 'تعذر الاتصال بخدمة الذكاء الاصطناعي.' : 'Unable to reach AI service.', 'error');
      return { ok: false };
    }
  };

  const handleReviewSubmission = async (
    submissionId: string,
    decision: 'approved' | 'rejected'
  ) => {
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر مراجعة النتيجة.' : 'Unable to review submission.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      syncSubmissionStatusToFirestore(submissionId, decision).catch(() => {});
      const reviewedSub = (state?.submissions || []).find((s) => s.id === submissionId);
      if (reviewedSub) {
        const updatedT = data.state?.tournaments?.find((t: Tournament) => t.id === reviewedSub.tournamentId);
        if (updatedT) syncTournamentToFirestore(updatedT).catch(() => {});
      }
      if (decision === 'approved' && data.state?.liveFeed?.[0]) {
        syncLiveFeedItemToFirestore(data.state.liveFeed[0]).catch(() => {});
      }
      showToast(
        decision === 'approved'
          ? isAr
            ? 'تم اعتماد النتيجة وتأهيل الفائز للدور التالي.'
            : 'Result approved and winner advanced.'
          : isAr
          ? 'تم رفض لقطة الشاشة وإعادة فتح المواجهة.'
          : 'Screenshot rejected and match reopened.'
      );
    } catch {
      showToast(isAr ? 'تعذر مراجعة النتيجة.' : 'Unable to review submission.', 'error');
    }
  };

  const handleDeclareWinner = async (tournamentId: string, winnerName: string) => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/winner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify({ winnerName }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || (isAr ? 'تعذر تتويج البطل.' : 'Unable to crown champion.'), 'error');
        return;
      }
      setState((prev) => mergeWithSavedProfile(data.state, prev));
      const updatedT = data.state?.tournaments?.find((t: Tournament) => t.id === tournamentId);
      if (updatedT) syncTournamentToFirestore(updatedT).catch(() => {});
      showToast(
        isAr
          ? `تم تتويج ${winnerName} بطلاً رسمياً للبطولة.`
          : `${winnerName} crowned official tournament champion.`
      );
    } catch {
      showToast(isAr ? 'تعذر تتويج البطل.' : 'Unable to crown champion.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070811] flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="h-6 w-40 bg-white/10 rounded animate-pulse mx-auto" />
          <div className="h-44 bg-[#0E1222] rounded-2xl border border-white/[0.08] animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="min-h-screen bg-[#070811] flex items-center justify-center p-6 text-center">
        <div className="bg-[#0E1222] border border-white/10 rounded-2xl p-6 max-w-md space-y-4">
          <p className="text-sm text-rose-300">
            {loadError || (isAr ? 'تعذر تشغيل المنصة.' : 'Unable to launch platform.')}
          </p>
          <button
            type="button"
            onClick={() => fetchState(false)}
            className="min-h-[44px] px-5 rounded-xl bg-[#D4FF00] text-[#070811] text-sm font-extrabold"
          >
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  const navLinks: {
    key: string;
    id: ActiveView;
    label: string;
    section?: AdminSectionTab;
  }[] = [
    { key: 'home', id: 'home', label: isAr ? 'الرئيسية' : 'Home' },
    { key: 'games', id: 'games', label: isAr ? 'الألعاب' : 'Games' },
    { key: 'tournaments', id: 'tournaments', label: isAr ? 'المواجهات' : 'Matches' },
    ...(isAdmin
      ? [
          {
            key: 'admin-booking',
            id: 'admin' as ActiveView,
            label: isAr ? 'إدارة البطولات' : 'Admin',
            section: 'booking' as const,
          },
          {
            key: 'admin-matches',
            id: 'admin' as ActiveView,
            label: isAr ? 'إدارة الماتشات (AI)' : 'Matches Admin',
            section: 'matches' as const,
          },
          {
            key: 'admin-checkin',
            id: 'admin' as ActiveView,
            label: isAr ? 'سكان الحضور (QR)' : 'QR Check-In',
            section: 'checkin' as const,
          },
          {
            key: 'admin-players',
            id: 'admin' as ActiveView,
            label: isAr ? 'أرقام اللاعبين' : 'Players',
            section: 'players' as const,
          },
        ]
      : []),
  ];

  const mobileTabs: {
    key: string;
    id: ActiveView;
    label: string;
    icon: typeof Home;
    section?: AdminSectionTab;
  }[] = [
    { key: 'home', id: 'home', label: isAr ? 'الرئيسية' : 'Home', icon: Home },
    { key: 'games', id: 'games', label: isAr ? 'الألعاب' : 'Games', icon: Gamepad2 },
    { key: 'tournaments', id: 'tournaments', label: isAr ? 'المواجهات' : 'Matches', icon: Trophy },
    { key: 'profile', id: 'profile', label: isAr ? 'حسابي' : 'Profile', icon: UserIcon },
    ...(isAdmin
      ? [
          {
            key: 'admin-booking',
            id: 'admin' as ActiveView,
            label: isAr ? 'الإدارة' : 'Admin',
            icon: Shield,
            section: 'booking' as const,
          },
          {
            key: 'admin-matches',
            id: 'admin' as ActiveView,
            label: isAr ? 'الماتشات AI' : 'Matches AI',
            icon: Swords,
            section: 'matches' as const,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#070811] text-[#F8FAFC] flex flex-col overflow-x-hidden">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#070811]/90 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-2 md:gap-8">
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="flex items-center gap-2 sm:gap-2.5 whitespace-nowrap shrink-0 group min-w-0"
          >
            <img
              src="/assets/aistudio/Gemini_Generated_Image_c646y6c646y6c646_31bc66c8.jpeg"
              alt="Arena Pro"
              referrerPolicy="no-referrer"
              className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-xl object-cover border border-white/15 shadow-lg shadow-[#F02E97]/10 group-hover:border-[#D4FF00]/60 transition-colors shrink-0"
            />
            <span className="font-display text-base sm:text-lg md:text-xl font-extrabold tracking-tight text-white flex items-center gap-1 sm:gap-1.5">
              <span>{isAr ? 'أرينا' : 'ARENA'}</span>
              <span className="px-1.5 py-0.5 rounded-md bg-[#D4FF00] text-[#070811] text-xs sm:text-sm md:text-base font-black leading-none arena-volt-badge">
                {isAr ? 'برو' : 'PRO'}
              </span>
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navLinks.map((link) => {
              const isActive =
                activeView === link.id && (!link.section || adminSection === link.section);
              return (
                <button
                  key={link.key}
                  type="button"
                  onClick={() => {
                    if (link.section) setAdminSection(link.section);
                    navigateTo(link.id);
                  }}
                  className={`py-1.5 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    isActive
                      ? 'text-white border-[#D4FF00] font-bold'
                      : 'text-slate-400 border-transparent hover:text-[#22D3EE]'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                isLight
                  ? isAr
                    ? 'التبديل إلى الوضع الداكن'
                    : 'Switch to Dark Mode'
                  : isAr
                  ? 'التبديل إلى الوضع الفاتح'
                  : 'Switch to Light Mode'
              }
              title={
                isLight
                  ? isAr
                    ? 'الوضع الداكن'
                    : 'Dark Mode'
                  : isAr
                  ? 'الوضع الفاتح'
                  : 'Light Mode'
              }
              className="min-h-[38px] sm:min-h-[40px] px-2 sm:px-3 py-1.5 rounded-xl border border-white/15 hover:border-[#F02E97]/50 bg-[#0E1222] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              {isLight ? (
                <Moon className="w-3.5 h-3.5 text-[#7C3AED] shrink-0" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-[#D4FF00] shrink-0" />
              )}
              <span className="hidden sm:inline">
                {isLight
                  ? isAr
                    ? 'داكن'
                    : 'Dark'
                  : isAr
                  ? 'فاتح'
                  : 'Light'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              aria-label={isAr ? 'عرض QR Code حسابك' : 'Show your Account QR Code'}
              title={isAr ? 'QR Code حسابك' : 'My QR Code'}
              className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-white/15 hover:border-[#22D3EE]/50 bg-[#0E1222] text-xs font-bold text-white flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5 text-[#22D3EE] shrink-0" />
              <span>QR</span>
            </button>

            {isAdminLocked && (
              <button
                type="button"
                onClick={handleUnlockAdmin}
                aria-label={isAr ? 'فتح لوحة الإدارة' : 'Unlock Admin Panel'}
                title={isAr ? 'فتح لوحة الإدارة' : 'Unlock Admin Panel'}
                className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] text-[#070811] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors shadow-lg shadow-[#D4FF00]/20"
              >
                <Unlock className="w-3.5 h-3.5 shrink-0" />
                <span>{isAr ? 'فتح الإدارة' : 'Unlock Admin'}</span>
              </button>
            )}

            <AuthButton
              user={firebaseUser}
              authReady={authReady}
              onAuthError={(msg) => showToast(msg, 'error')}
              onSignedIn={() => setCheckingAuthProfile(true)}
              onSignedOut={handleSignedOut}
            />

            <button
              type="button"
              onClick={() => navigateTo('profile')}
              className="hidden md:inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] text-[#070811] text-xs font-extrabold whitespace-nowrap shrink-0 transition-colors shadow-lg shadow-[#D4FF00]/15"
            >
              <span>{isAr ? 'ملفي وفريقي' : 'Profile & Team'}</span>
              {(() => {
                const myUid = getEffectiveUid();
                const unreadMsgs = (state.friendMessages || []).filter(
                  (m) => m.senderUid !== myUid && !(m.readBy || []).includes(myUid)
                ).length;
                const pendingReqs = (state.friendRequests || []).filter(
                  (r) => r.toUid === myUid && r.status === 'pending'
                ).length;
                const badgeTotal = unreadMsgs + pendingReqs;
                return badgeTotal > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#F02E97] text-white text-[10px] font-bold font-mono-num leading-none">
                    {badgeTotal}
                  </span>
                ) : null;
              })()}
            </button>
          </div>
        </div>
        <div className="h-[2px] w-full arena-gradient-bar opacity-80" />
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-5 sm:pt-6 pb-8 md:pb-12">
        {activeView === 'home' && (
          <HomeView
            tournaments={state.tournaments}
            games={state.games}
            liveFeed={state.liveFeed || []}
            profile={state.profile}
            onQuickRegister={handleQuickRegister}
            onOpenBracket={handleOpenBracket}
            onOpenGame={handleOpenGame}
          />
        )}

        {activeView === 'games' && (
          <GamesHubView
            games={state.games}
            tournaments={state.tournaments}
            selectedGame={selectedGame}
            profile={state.profile}
            onSelectGame={setSelectedGame}
            onQuickRegister={handleQuickRegister}
            onOpenBracket={handleOpenBracket}
          />
        )}

        {activeView === 'tournaments' && (
          <TournamentBracketView
            tournaments={state.tournaments}
            games={state.games}
            liveFeed={state.liveFeed || []}
            notifications={state.notifications || []}
            selectedTournamentId={selectedTournamentId}
            profile={state.profile}
            isAdmin={isAdmin}
            onOpenMatchesAdmin={() => {
              setAdminSection('matches');
              navigateTo('admin');
            }}
            onSelectTournament={setSelectedTournamentId}
            onQuickRegister={handleQuickRegister}
            onOpenScreenshotModal={(t, m) => setScreenshotTarget({ tournament: t, match: m })}
          />
        )}

        {activeView === 'profile' && (
          <ProfileTeamView
            profile={state.profile}
            team={state.team}
            games={state.games}
            notifications={state.notifications || []}
            friendMessages={state.friendMessages || []}
            friendRequests={state.friendRequests || []}
            chatContacts={chatContacts}
            selectedChatTarget={selectedChatTarget}
            initialFriendQuery={pendingQrFriendQuery}
            onClearInitialFriendQuery={() => setPendingQrFriendQuery('')}
            onOpenQrModal={() => setQrModalOpen(true)}
            onSelectChatTarget={setSelectedChatTarget}
            onSendChatMessage={handleSendChatMessage}
            onMarkChatRead={handleMarkChatRead}
            chatSectionRef={chatSectionRef}
            onChatVisibilityChange={setChatVisibleInView}
            onSaveProfile={handleSaveProfile}
            onSendFriendRequest={handleSendFriendRequest}
            onRespondFriendRequest={handleRespondFriendRequest}
            onUpdateTeam={handleUpdateTeam}
            canUnlockAdmin={canUnlockAdmin}
            isAdminLocked={isAdminLocked}
            onUnlockAdmin={handleUnlockAdmin}
          />
        )}

        {activeView === 'admin' && isAdmin && (
          <AdminDashboardView
            isAdmin={isAdmin}
            controlledSection={adminSection}
            onSectionChange={setAdminSection}
            emailServiceConfigured={state.emailServiceConfigured}
            adminEmails={state.adminHandles}
            playersDirectory={adminPlayers}
            loadingPlayers={loadingAdminPlayers}
            onRefreshPlayers={fetchAdminPlayers}
            games={state.games}
            tournaments={state.tournaments}
            submissions={state.submissions}
            onGoogleSignIn={handleGooglePopupSignIn}
            onLockAdmin={() => {
              setAdminLockedManually(true);
              setActiveView('home');
              showToast(
                isAr
                  ? 'تم قفل لوحة الإدارة. اضغط «فتح الإدارة» بالأعلى لإعادة فتحها في أي وقت.'
                  : 'Admin panel locked. Click "Unlock Admin" in the top bar anytime to reopen it.'
              );
            }}
            onAddAdminHandle={handleAddAdminHandle}
            onRemoveAdminHandle={handleRemoveAdminHandle}
            onCreateTournament={handleCreateTournament}
            onDeleteTournament={handleDeleteTournament}
            onUpdateTournamentMeta={handleUpdateTournamentMeta}
            onUpdateGameRules={handleUpdateGameRules}
            onUpdateMatchup={handleUpdateMatchup}
            onAiSchedule={handleAiSchedule}
            onUpdateMatchSchedule={handleUpdateMatchSchedule}
            onNotifyMatch={handleNotifyMatch}
            onSaveMatchResult={handleSaveMatchResult}
            onAiDirectMatchups={handleAiDirectMatchups}
            onReviewSubmission={handleReviewSubmission}
            onDeclareWinner={handleDeclareWinner}
            onCheckInPlayer={handleAdminCheckIn}
            gmailConnectedEmail={gmailConnectedEmail}
            onConnectGmailSender={handleConnectGmailSender}
            onDisconnectGmailSender={handleDisconnectGmailSender}
            onSendViaGmailOAuth={handleSendViaGmailOAuth}
          />
        )}
      </main>

      {/* Animated Arena Pro Brand Footer (Desktop & Mobile) */}
      <footer className="relative overflow-hidden border-t border-white/[0.08] bg-[#070811]/90 pb-24 md:pb-8">
        <div className="h-[3px] w-full arena-gradient-bar-animated" />

        {/* Ambient Neon Backdrop Orbs */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 start-8 w-56 h-56 rounded-full bg-[#F02E97]/15 blur-3xl arena-orbit-glow"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 end-8 w-64 h-64 rounded-full bg-[#06B6D4]/15 blur-3xl arena-orbit-glow"
          style={{ animationDelay: '-3.5s' }}
        />

        {/* Animated Site Name Hero Strip */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="group flex flex-col sm:flex-row items-center gap-4 text-center sm:text-start focus:outline-none"
              aria-label={isAr ? 'العودة إلى أعلى الصفحة — أرينا برو' : 'Back to top — Arena Pro'}
            >
              <div className="relative w-16 h-16 rounded-2xl p-[2px] arena-gradient-bar-animated arena-float shadow-xl shadow-[#F02E97]/20 shrink-0">
                <img
                  src="/assets/aistudio/Gemini_Generated_Image_c646y6c646y6c646_31bc66c8.jpeg"
                  alt={isAr ? 'شعار أرينا برو' : 'Arena Pro Crest'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-[14px]"
                />
              </div>

              <div className="flex flex-col items-center sm:items-start gap-1">
                <div className="flex items-center flex-wrap justify-center sm:justify-start gap-2.5">
                  <span className="font-display text-3xl sm:text-4xl font-black tracking-tight arena-footer-wordmark leading-none">
                    {isAr ? 'أرينا' : 'ARENA'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#D4FF00] text-[#070811] text-sm sm:text-base font-black tracking-wider arena-volt-badge arena-pro-pulse">
                    {isAr ? 'برو' : 'PRO'}
                  </span>
                  <span className="text-[11px] font-bold tracking-widest uppercase text-[#22D3EE] px-2 py-0.5 rounded-md border border-[#22D3EE]/30 bg-[#06B6D4]/10">
                    {isAr ? 'ARENA PRO' : 'أرينا برو'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-400 tracking-wide">
                  {isAr
                    ? 'GAME ON · NEXT LEVEL — ساحة المنافسات الرسمية'
                    : 'GAME ON · NEXT LEVEL — Official Esports Arena'}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigateTo('tournaments')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-white/10 hover:border-[#22D3EE]/40 bg-[#0E1222] text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <Trophy className="w-3.5 h-3.5 text-[#22D3EE]" />
                <span>{isAr ? 'البطولات' : 'Tournaments'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-white/10 hover:border-[#F02E97]/40 bg-[#0E1222] text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <ArrowUp className="w-3.5 h-3.5 text-[#F472B6]" />
                <span>{isAr ? 'للأعلى' : 'Top'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Continuous Kinetic Site-Name Marquee Ticker */}
        <div
          dir="ltr"
          aria-hidden="true"
          className="arena-marquee-shell border-y border-white/[0.07] bg-[#0E1222]/60 py-2.5"
        >
          <div className="arena-marquee-track">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex items-center gap-6 px-3 shrink-0">
                <span className="font-display text-xs sm:text-sm font-black tracking-[0.2em] arena-footer-wordmark">
                  ARENA PRO
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4FF00]" />
                <span className="font-display text-xs sm:text-sm font-black text-white">
                  أرينا برو
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#F02E97]" />
                <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#22D3EE]">
                  GAME ON · NEXT LEVEL
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]" />
                <span className="text-[11px] font-bold tracking-wider text-slate-400">
                  8 BALL POOL
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4]" />
                <span className="text-[11px] font-bold tracking-wider text-slate-400">
                  EA SPORTS FC 27
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4FF00]" />
                <span className="text-[11px] font-mono-num font-bold text-[#F472B6]">
                  1v1 · 2v2 · 4v4
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]" />
              </div>
            ))}
          </div>
        </div>

        {/* Clean Bottom Meta Row */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            {isAr
              ? '© أرينا برو — منصة بطولات الألعاب التنافسية'
              : '© Arena Pro — Competitive Gaming Tournaments'}
          </span>
          <span className="text-[#22D3EE] font-semibold">8 Ball Pool · EA Sports FC 27</span>
        </div>
      </footer>

      {/* Mobile Bottom Thumb Navigation Bar */}
      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 h-14 px-1 bg-[#070811]/95 backdrop-blur-md border-t border-white/10 grid ${
          isAdmin ? 'grid-cols-6' : 'grid-cols-4'
        } items-center`}
        aria-label={isAr ? 'التنقل السريع' : 'Quick navigation'}
      >
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeView === tab.id && (!tab.section || adminSection === tab.section);
          const myUid = getEffectiveUid();
          const unreadForProfile =
            tab.id === 'profile'
              ? (state.friendMessages || []).filter(
                  (m) => m.senderUid !== myUid && !(m.readBy || []).includes(myUid)
                ).length +
                (state.friendRequests || []).filter(
                  (r) => r.toUid === myUid && r.status === 'pending'
                ).length
              : 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.section) setAdminSection(tab.section);
                navigateTo(tab.id);
              }}
              className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-0.5 min-w-0 transition-colors ${
                active ? 'text-[#D4FF00]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <div className="relative">
                <Icon className="w-4 h-4 shrink-0" />
                {unreadForProfile > 0 && (
                  <span className="absolute -top-1.5 -end-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#F02E97] text-white text-[9px] font-bold font-mono-num flex items-center justify-center leading-none">
                    {unreadForProfile}
                  </span>
                )}
              </div>
              <span className="text-[9px] leading-tight font-medium truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Interactive Modals */}
      <UsernamePromptModal
        open={showUsernamePrompt}
        isSignedIn={Boolean(firebaseUser)}
        checkingProfile={checkingAuthProfile}
        displayName={
          firebaseUser?.displayName || state.profile.displayName || (isAr ? 'لاعب أرينا' : 'Arena Player')
        }
        initialDisplayName={
          state.profile.displayName &&
          state.profile.displayName !== 'لاعب ضيف' &&
          state.profile.displayName !== 'Player Guest' &&
          hasTripleName(state.profile.displayName)
            ? state.profile.displayName
            : ''
        }
        initialUsername={
          !isPlaceholderHandleStr(state.profile.handle)
            ? state.profile.handle
            : firebaseUser?.email?.split('@')[0] || ''
        }
        initialWhatsapp={state.profile.whatsappNumber || state.profile.phoneOrDiscord || ''}
        initialEmail={firebaseUser?.email || state.profile.email || ''}
        onGoogleSignIn={handleGooglePopupSignIn}
        onSubmitUsername={handleUsernamePromptSubmit}
      />

      {registerModalTournament && (
        <RegisterModal
          tournament={
            state.tournaments.find((t) => t.id === registerModalTournament.id) ||
            registerModalTournament
          }
          profile={state.profile}
          team={state.team}
          onClose={() => setRegisterModalTournament(null)}
          onGoogleSignIn={handleGooglePopupSignIn}
          onConfirm={handleConfirmRegistration}
        />
      )}

      {screenshotTarget && (
        <ScreenshotModal
          tournament={screenshotTarget.tournament}
          match={screenshotTarget.match}
          onClose={() => setScreenshotTarget(null)}
          onSubmit={handleSubmitScreenshot}
        />
      )}

      <QrCodeModal
        open={qrModalOpen}
        profile={state.profile}
        onClose={() => setQrModalOpen(false)}
        onOpenProfile={() => navigateTo('profile')}
      />

      {/* Top Floating Friend Request & Chat Notification Stack */}
      {(topFriendRequestBanner || topChatBanner) && (
        <div className="fixed top-3 inset-x-3 sm:top-4 sm:inset-x-auto sm:start-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-50 flex flex-col gap-2">
          {topFriendRequestBanner && (
            <div
              role="alert"
              className="bg-[#0E1222]/95 backdrop-blur-xl border border-[#D4FF00]/60 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-[#D4FF00]/15 border border-[#D4FF00]/40 flex items-center justify-center text-[#D4FF00] shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold text-white truncate">
                    {isAr ? 'طلب صداقة جديد من ' : 'Friend request from '}
                    <span className="text-[#D4FF00]">{topFriendRequestBanner.fromName}</span>
                  </div>
                  <div className="text-[11px] font-mono-num text-[#22D3EE] truncate">
                    @{topFriendRequestBanner.fromHandle} · {topFriendRequestBanner.fromPlayerCode}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRespondFriendRequest(topFriendRequestBanner.id, 'accept')}
                  aria-label={isAr ? 'موافقة على طلب الصداقة' : 'Accept friend request'}
                  className="min-h-[34px] px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#070811] text-[11px] font-extrabold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isAr ? 'موافق' : 'Accept'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRespondFriendRequest(topFriendRequestBanner.id, 'decline')}
                  aria-label={isAr ? 'رفض طلب الصداقة' : 'Decline friend request'}
                  className="min-h-[34px] px-2.5 rounded-lg border border-rose-500/45 text-rose-300 hover:bg-rose-500/15 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{isAr ? 'رفض' : 'Decline'}</span>
                </button>
              </div>
            </div>
          )}

          {topChatBanner && (
            <div
              role="alert"
              className="bg-[#0E1222]/95 backdrop-blur-xl border border-[#22D3EE]/50 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3 transition-transform"
            >
              <button
                type="button"
                onClick={() => handleOpenChatFromBanner(topChatBanner)}
                className="flex items-center gap-3 min-w-0 flex-1 text-start"
              >
                <div className="w-9 h-9 rounded-xl bg-[#D4FF00]/15 border border-[#D4FF00]/40 flex items-center justify-center text-[#D4FF00] shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">
                    {isAr
                      ? `رسالة من ${topChatBanner.senderName}`
                      : `Message from ${topChatBanner.senderName}`}{' '}
                    <span className="font-mono-num text-[#22D3EE]">@{topChatBanner.senderHandle}</span>
                    {topChatBanner.channelId === 'team-group' && (
                      <span className="text-[10px] text-slate-400">
                        {' '}
                        · {isAr ? 'جروب الأصدقاء' : 'Friends Group'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-300 truncate mt-0.5">{topChatBanner.text}</div>
                </div>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenChatFromBanner(topChatBanner)}
                  className="min-h-[34px] px-3 rounded-lg bg-[#D4FF00] hover:bg-[#e5ff4d] text-[#070811] text-[11px] font-extrabold whitespace-nowrap shrink-0 transition-colors"
                >
                  {isAr ? 'رد الآن' : 'Reply'}
                </button>
                <button
                  type="button"
                  onClick={() => setTopChatBanner(null)}
                  aria-label={isAr ? 'إغلاق الإشعار' : 'Dismiss notification'}
                  className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Non-blocking Action Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed top-16 md:top-20 inset-x-4 sm:inset-x-auto sm:end-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/40 text-rose-100 arena-toast-error'
              : 'bg-[#0E1222]/95 border-[#D4FF00]/50 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
