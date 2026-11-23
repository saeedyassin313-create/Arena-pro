import { type DragEvent, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Award,
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  GripVertical,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  Phone,
  PlusCircle,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Send,
  Shield,
  Shuffle,
  Sparkles,
  Swords,
  Ticket,
  Trash2,
  Trophy,
  Unlock,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { computeGroupStandings, getGroupsForTournament } from '../data/seed.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import {
  translateGameInfo,
  translateGroupName,
  translateLeg,
  translateRoundName,
  translateSchedule,
  translateSubmissionStatus,
} from '../i18n/helpers.ts';
import type {
  AdminPlayerSummary,
  BracketMatch,
  BracketParticipant,
  GameInfo,
  GameSlug,
  MatchFormatTag,
  ResultSubmission,
  Tournament,
} from '../types.ts';
import { buildPlayerEmailTemplate } from '../utils/emailTemplate.ts';
import type { EmailDispatchTarget } from '../utils/gmailSender.ts';
import { getTeamCheckInSummary } from '../utils/checkin.ts';
import {
  buildWhatsappChatUrl,
  isValidEmailAddress,
  normalizeEmail,
} from '../utils/validation.ts';
import { AdminCheckinScanner, type CheckInActionResult } from './AdminCheckinScanner.tsx';
import { SafeImage } from './SafeImage.tsx';

type DragPayload =
  | { kind: 'player'; participantId: string }
  | { kind: 'slot'; matchId: string; side: 'A' | 'B' }
  | { kind: 'match'; matchId: string }
  | null;

export type AdminSectionTab = 'booking' | 'matches' | 'checkin' | 'players';

interface AdminDashboardViewProps {
  isAdmin: boolean;
  emailServiceConfigured?: boolean;
  adminEmails?: string[];
  playersDirectory?: AdminPlayerSummary[];
  loadingPlayers?: boolean;
  games: GameInfo[];
  tournaments: Tournament[];
  submissions: ResultSubmission[];
  onVerifyAdmin?: (username: string) => Promise<boolean>;
  onGoogleSignIn?: () => Promise<void>;
  onLockAdmin: () => void;
  onAddAdminHandle: (handle: string) => Promise<void>;
  onRemoveAdminHandle?: (email: string) => Promise<void>;
  onRefreshPlayers?: () => Promise<void>;
  onCreateTournament: (payload: {
    title: string;
    gameSlug: GameSlug;
    customGameName?: string;
    modeTag: MatchFormatTag;
    venueName: string;
    prizePool: string;
    maxSlots: 4 | 8 | 16 | 32 | 64;
    rulesText: string;
    openImmediately?: boolean;
  }) => Promise<void>;
  onDeleteTournament: (tournamentId: string) => Promise<void>;
  onUpdateTournamentMeta: (
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
  ) => Promise<void>;
  onUpdateGameRules: (
    slug: GameSlug,
    payload: {
      rulesText: string;
      summary?: string;
      scoringSystem?: string;
      modeLabel?: string;
    }
  ) => Promise<void>;
  onUpdateMatchup: (
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
  ) => Promise<void>;
  onAiSchedule: (
    tournamentId: string,
    customPrompt?: string
  ) => Promise<{ ok: boolean; summaryAr?: string }>;
  onUpdateMatchSchedule: (
    tournamentId: string,
    matchId: string,
    scheduledAt: string,
    leg?: BracketMatch['leg']
  ) => Promise<{
    mailtoLinks?: { name: string; email: string; url: string }[];
    emailTargets?: EmailDispatchTarget[];
  } | void>;
  onNotifyMatch: (
    tournamentId: string,
    matchId: string
  ) => Promise<{
    ok: boolean;
    mailtoLinks?: { name: string; email: string; url: string }[];
    emailTargets?: EmailDispatchTarget[];
  }>;
  onSaveMatchResult: (
    tournamentId: string,
    matchId: string,
    payload: {
      scoreA: number;
      scoreB: number;
      winnerId?: string | null;
      autoAiRank?: boolean;
    }
  ) => Promise<{ ok: boolean; aiSummaryAr?: string }>;
  onAiDirectMatchups: (
    tournamentId: string,
    customPrompt?: string
  ) => Promise<{ ok: boolean; summaryAr?: string }>;
  onReviewSubmission: (submissionId: string, decision: 'approved' | 'rejected') => Promise<void>;
  onDeclareWinner: (tournamentId: string, winnerName: string) => Promise<void>;
  onCheckInPlayer: (
    tournamentId: string,
    payload: {
      code: string;
      participantId?: string;
      action?: 'checkin' | 'undo' | 'toggle';
      resolvedHandle?: string;
      resolvedPlayerCode?: string;
    }
  ) => Promise<CheckInActionResult>;
  controlledSection?: AdminSectionTab;
  onSectionChange?: (section: AdminSectionTab) => void;
  gmailConnectedEmail?: string | null;
  onConnectGmailSender?: () => Promise<string | null>;
  onDisconnectGmailSender?: () => void;
  onSendViaGmailOAuth?: (targets: EmailDispatchTarget[]) => Promise<{ sent: number; failed: number }>;
}

export function AdminDashboardView({
  isAdmin,
  emailServiceConfigured = false,
  adminEmails = ['saeedyassin313@gmail.com', 'arenapro185@gmail.com'],
  playersDirectory = [],
  loadingPlayers = false,
  games,
  tournaments,
  submissions,
  onGoogleSignIn,
  onLockAdmin,
  onAddAdminHandle,
  onRemoveAdminHandle,
  onRefreshPlayers,
  onCreateTournament,
  onDeleteTournament,
  onUpdateTournamentMeta,
  onUpdateGameRules,
  onUpdateMatchup,
  onAiSchedule,
  onUpdateMatchSchedule,
  onNotifyMatch,
  onSaveMatchResult,
  onAiDirectMatchups,
  onReviewSubmission,
  onDeclareWinner,
  onCheckInPlayer,
  controlledSection,
  onSectionChange,
  gmailConnectedEmail = null,
  onConnectGmailSender,
  onDisconnectGmailSender,
  onSendViaGmailOAuth,
}: AdminDashboardViewProps) {
  const { lang, isAr } = useLanguage();
  const [signingInAdmin, setSigningInAdmin] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [sendingGmailOAuth, setSendingGmailOAuth] = useState(false);
  const [pendingGmailConfirm, setPendingGmailConfirm] = useState<{
    matchLabel: string;
    scheduledAt: string;
    targets: EmailDispatchTarget[];
  } | null>(null);

  // 4 Admin Sections: 1) Booking, 2) Matches & AI Results, 3) QR Check-In, 4) Players & WhatsApp Directory
  const [internalSection, setInternalSection] = useState<AdminSectionTab>(
    controlledSection || 'booking'
  );
  const adminSection = controlledSection ?? internalSection;
  const setAdminSection = (next: AdminSectionTab) => {
    setInternalSection(next);
    onSectionChange?.(next);
  };

  useEffect(() => {
    if (controlledSection) {
      setInternalSection(controlledSection);
    }
  }, [controlledSection]);

  const [newAdminHandle, setNewAdminHandle] = useState('');
  const [adminEmailError, setAdminEmailError] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [copiedAllPhones, setCopiedAllPhones] = useState(false);

  // Create Tournament form (Booking Admin) — starts at Round of 32 (8 groups × 4 teams)
  const [title, setTitle] = useState('');
  const [gameSlug, setGameSlug] = useState<GameSlug>(games[0]?.slug || 'fc27');
  const [customGameName, setCustomGameName] = useState('');
  const [modeTag, setModeTag] = useState<MatchFormatTag>('2v2');
  const [venueName, setVenueName] = useState(
    isAr ? 'صالة أرينا برو — المعادي' : 'Arena Pro Lounge — Maadi'
  );
  const [prizePool, setPrizePool] = useState(isAr ? '10,000 ج.م' : '10,000 EGP');
  const maxSlots: 32 = 32;
  const [rulesText, setRulesText] = useState('');
  const [openImmediately, setOpenImmediately] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Admin-only Game Rules Editor
  const [selectedGameRuleSlug, setSelectedGameRuleSlug] = useState<GameSlug>(
    games[0]?.slug || 'pool8'
  );
  const selectedRuleGame =
    games.find((g) => g.slug === selectedGameRuleSlug) || games[0];
  const [gameScoringDraft, setGameScoringDraft] = useState(
    selectedRuleGame?.scoringSystem || ''
  );
  const [gameModeDraft, setGameModeDraft] = useState(selectedRuleGame?.modeLabel || '');
  const [gameSummaryDraft, setGameSummaryDraft] = useState(selectedRuleGame?.summary || '');
  const [gameRulesTextDraft, setGameRulesTextDraft] = useState(
    (selectedRuleGame?.rulesHighlights || []).join('\n')
  );
  const [savingGameRules, setSavingGameRules] = useState(false);

  // Shared Managed Tournament Selection
  const [managedTournamentId, setManagedTournamentId] = useState(tournaments[0]?.id || '');
  const managedTournament =
    tournaments.find((t) => t.id === managedTournamentId) || tournaments[0];

  const [editTitle, setEditTitle] = useState(managedTournament?.title || '');
  const [editLocation, setEditLocation] = useState(managedTournament?.venueName || '');
  const [editPrize, setEditPrize] = useState(managedTournament?.prizePool || '');
  const [editStatus, setEditStatus] = useState<Tournament['status']>(
    managedTournament?.status || 'open'
  );
  const [editModeTag, setEditModeTag] = useState<MatchFormatTag>(
    managedTournament?.modeTag || '2v2'
  );
  const [editRulesText, setEditRulesText] = useState(
    (managedTournament?.rules || []).join('\n')
  );
  const [savingMeta, setSavingMeta] = useState(false);

  // 2v2 Partner Assignment (Booking Admin)
  const [pairTargetId, setPairTargetId] = useState('');
  const [pairTeammate, setPairTeammate] = useState('');

  // Matches & AI Results Admin state
  const [activeRoundIndex, setActiveRoundIndex] = useState<number>(0);
  const [adminGroupFilter, setAdminGroupFilter] = useState<string>('all');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiScheduling, setAiScheduling] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const [aiDirectPrompt, setAiDirectPrompt] = useState('');
  const [aiDirectLoading, setAiDirectLoading] = useState(false);
  const [aiDirectSummary, setAiDirectSummary] = useState<string | null>(null);
  const [autoAiPlaceOnSave, setAutoAiPlaceOnSave] = useState(true);

  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [savingScheduleId, setSavingScheduleId] = useState<string | null>(null);
  const [notifyingMatchId, setNotifyingMatchId] = useState<string | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [copiedEmailHtml, setCopiedEmailHtml] = useState(false);
  const [matchMailtoLinks, setMatchMailtoLinks] = useState<
    Record<string, { name: string; email: string; url: string }[]>
  >({});

  const [scoreDrafts, setScoreDrafts] = useState<
    Record<string, { scoreA: string; scoreB: string; winnerId: string }>
  >({});
  const [savingResultId, setSavingResultId] = useState<string | null>(null);

  // Drag-and-Drop state for groups, player slots, and matchup reordering
  const [dragPayload, setDragPayload] = useState<DragPayload>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [dragOverMatchId, setDragOverMatchId] = useState<string | null>(null);

  const [winnerTournamentId, setWinnerTournamentId] = useState(tournaments[0]?.id || '');
  const [winnerNameInput, setWinnerNameInput] = useState('');
  const [declaring, setDeclaring] = useState(false);

  const clearDragState = () => {
    setDragPayload(null);
    setDragOverGroup(null);
    setDragOverSlotKey(null);
    setDragOverMatchId(null);
  };

  // Sync game rules editor ONLY when switching selected game (prevents 5s polling from wiping Admin drafts)
  useEffect(() => {
    if (selectedRuleGame) {
      setGameScoringDraft(selectedRuleGame.scoringSystem);
      setGameModeDraft(selectedRuleGame.modeLabel);
      setGameSummaryDraft(selectedRuleGame.summary);
      setGameRulesTextDraft((selectedRuleGame.rulesHighlights || []).join('\n'));
    }
  }, [selectedGameRuleSlug]);

  // Sync tournament edit drafts ONLY when Admin switches to a different tournament ID
  useEffect(() => {
    if (managedTournament) {
      setEditTitle(managedTournament.title);
      setEditLocation(managedTournament.venueName);
      setEditPrize(managedTournament.prizePool);
      setEditStatus(managedTournament.status);
      setEditModeTag(managedTournament.modeTag);
      setEditRulesText((managedTournament.rules || []).join('\n'));
      setAiDirectSummary(managedTournament.lastAiMatchupSummary || null);

      const nextSchedules: Record<string, string> = {};
      const nextScores: Record<string, { scoreA: string; scoreB: string; winnerId: string }> = {};
      for (const r of managedTournament.rounds) {
        for (const m of r.matches) {
          nextSchedules[m.id] =
            m.scheduledAt && m.scheduledAt !== 'لم يتحدد' ? m.scheduledAt : '';
          nextScores[m.id] = {
            scoreA: m.scoreA !== null ? String(m.scoreA) : '',
            scoreB: m.scoreB !== null ? String(m.scoreB) : '',
            winnerId: m.winnerId || '',
          };
        }
      }
      setScheduleDrafts(nextSchedules);
      setScoreDrafts(nextScores);
    }
  }, [managedTournament?.id]);

  // Add newly created match keys without overwriting existing Admin drafts during polling
  useEffect(() => {
    if (!managedTournament) return;
    setScheduleDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of managedTournament.rounds) {
        for (const m of r.matches) {
          if (!(m.id in next)) {
            next[m.id] =
              m.scheduledAt && m.scheduledAt !== 'لم يتحدد' ? m.scheduledAt : '';
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
    setScoreDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of managedTournament.rounds) {
        for (const m of r.matches) {
          if (!(m.id in next)) {
            next[m.id] = {
              scoreA: m.scoreA !== null ? String(m.scoreA) : '',
              scoreB: m.scoreB !== null ? String(m.scoreB) : '',
              winnerId: m.winnerId || '',
            };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [managedTournament?.rounds]);

  useEffect(() => {
    if (tournaments.length > 0 && !tournaments.some((t) => t.id === winnerTournamentId)) {
      setWinnerTournamentId(tournaments[0].id);
    }
    if (tournaments.length > 0 && !tournaments.some((t) => t.id === managedTournamentId)) {
      setManagedTournamentId(tournaments[0].id);
    }
  }, [tournaments, winnerTournamentId, managedTournamentId]);

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#D4FF00]/15 border border-[#D4FF00]/30 flex items-center justify-center text-[#D4FF00]">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {isAr ? 'دخول الإدارة عبر Gmail المعتمد' : 'Verified Gmail Admin Access'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? 'لوحة الإدارة متاحة فقط لحسابات Gmail المصرح لها من المالك.'
                  : 'Admin access is strictly restricted to owner-authorized Gmail accounts.'}
              </p>
            </div>
          </div>

          <div className="bg-[#070811] border border-white/[0.08] rounded-xl p-4 text-xs text-slate-300 space-y-1.5">
            <div>
              {isAr
                ? 'سجّل الدخول بحساب Google / Gmail المعتمد لفتح لوحة الإدارة وإدارة اللاعبين.'
                : 'Sign in with an authorized Google / Gmail account to unlock the Admin Dashboard.'}
            </div>
          </div>

          {onGoogleSignIn && (
            <button
              type="button"
              disabled={signingInAdmin}
              onClick={async () => {
                setSigningInAdmin(true);
                try {
                  await onGoogleSignIn();
                } finally {
                  setSigningInAdmin(false);
                }
              }}
              className="w-full min-h-[48px] rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:bg-slate-700 text-[#070811] font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {signingInAdmin
                  ? isAr
                    ? 'جاري تسجيل الدخول...'
                    : 'Signing in...'
                  : isAr
                  ? 'تسجيل الدخول عبر Google Admin'
                  : 'Sign In with Admin Gmail'}
              </span>
            </button>
          )}
        </section>
      </div>
    );
  }

  const pendingSubmissions = submissions.filter((s) => s.status === 'pending');
  const fullCapacityTournaments = tournaments.filter((t) => t.registeredCount >= t.maxSlots);

  // Collect all unique Round 1 participants for the selected tournament
  const round0 = managedTournament?.rounds[0];
  const seenParticipantIds = new Set<string>();
  const allRound0Participants: BracketParticipant[] = [];
  if (round0) {
    round0.matches.forEach((m) => {
      if (m.participantA && !seenParticipantIds.has(m.participantA.id)) {
        seenParticipantIds.add(m.participantA.id);
        allRound0Participants.push(m.participantA);
      }
      if (m.participantB && !seenParticipantIds.has(m.participantB.id)) {
        seenParticipantIds.add(m.participantB.id);
        allRound0Participants.push(m.participantB);
      }
    });
  }

  const managedActiveGroups = managedTournament
    ? getGroupsForTournament(managedTournament)
    : [];
  const activeRound =
    managedTournament?.rounds[activeRoundIndex] || managedTournament?.rounds[0];
  const standingsByGroup = managedTournament
    ? computeGroupStandings(managedTournament)
    : ({} as ReturnType<typeof computeGroupStandings>);

  const handleCreate = async () => {
    if (!title.trim()) return;
    if (gameSlug === 'custom' && !customGameName.trim()) return;
    setCreating(true);
    try {
      await onCreateTournament({
        title: title.trim(),
        gameSlug,
        customGameName: gameSlug === 'custom' ? customGameName.trim() : undefined,
        modeTag,
        venueName,
        prizePool,
        maxSlots,
        rulesText,
        openImmediately,
      });
      setTitle('');
      setCustomGameName('');
      setRulesText('');
      setOpenImmediately(false);
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmDelete = async (tournamentId: string) => {
    setDeletingId(tournamentId);
    try {
      await onDeleteTournament(tournamentId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveMeta = async () => {
    if (!managedTournament) return;
    setSavingMeta(true);
    try {
      await onUpdateTournamentMeta(managedTournament.id, {
        title: editTitle,
        venueName: editLocation,
        prizePool: editPrize,
        status: editStatus,
        modeTag: editModeTag,
        rulesText: editRulesText,
      });
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSaveGameRules = async () => {
    if (!selectedRuleGame) return;
    setSavingGameRules(true);
    try {
      await onUpdateGameRules(selectedRuleGame.slug, {
        rulesText: gameRulesTextDraft,
        summary: gameSummaryDraft,
        scoringSystem: gameScoringDraft,
        modeLabel: gameModeDraft,
      });
    } finally {
      setSavingGameRules(false);
    }
  };

  const handleDeclare = async () => {
    if (!winnerTournamentId || !winnerNameInput.trim()) return;
    setDeclaring(true);
    try {
      await onDeclareWinner(winnerTournamentId, winnerNameInput);
      setWinnerNameInput('');
    } finally {
      setDeclaring(false);
    }
  };

  const openMatchesAdminFor = (tournamentId: string, roundIdx = 0) => {
    setManagedTournamentId(tournamentId);
    setActiveRoundIndex(roundIdx);
    setAdminSection('matches');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-7 pb-8">
      {/* Header + Lock Admin */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-[#D4FF00]" />
            <span>
              {isAr
                ? 'لوحة تحكم الليدر — أرينا برو'
                : 'Leader Control Panel — Arena Pro'}
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'إدارة الحجز والتسجيل، إدارة الماتشات، سكان الـ QR، ودليل أرقام واتساب اللاعبين.'
              : 'Booking & Registration, Matches & AI Results, QR Check-In, and Players WhatsApp Directory.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onLockAdmin}
          className="min-h-[44px] px-4 rounded-xl border border-white/15 hover:border-rose-500/40 text-xs font-semibold text-slate-200 hover:text-rose-200 flex items-center gap-2 self-start sm:self-auto whitespace-nowrap transition-colors"
        >
          <Lock className="w-4 h-4" />
          <span>{isAr ? 'قفل لوحة الإدارة' : 'Lock Admin Panel'}</span>
        </button>
      </div>

      {/* Dedicated 4-Section Switcher */}
      <div
        role="tablist"
        aria-label={isAr ? 'أقسام لوحة الإدارة' : 'Admin Dashboard Sections'}
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 bg-[#0E1222] border border-white/[0.08] rounded-2xl p-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={adminSection === 'booking'}
          onClick={() => setAdminSection('booking')}
          className={`min-h-[54px] px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-start transition-colors ${
            adminSection === 'booking'
              ? 'bg-[#D4FF00] text-[#070811]'
              : 'bg-[#070811] text-slate-300 hover:text-white border border-white/[0.06]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Ticket className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">
                {isAr ? '1. إدارة الحجز والتسجيل' : '1. Booking & Registration'}
              </div>
              <div
                className={`text-[11px] truncate ${
                  adminSection === 'booking' ? 'text-[#070811]/80 font-medium' : 'text-slate-400'
                }`}
              >
                {isAr
                  ? 'البطولات وصلاحيات الأدمن (Gmail)'
                  : 'Tournaments & Admin Gmail access'}
              </div>
            </div>
          </div>
          <span
            className={`text-xs font-mono-num font-bold px-2.5 py-1 rounded-lg shrink-0 ${
              adminSection === 'booking'
                ? 'bg-[#070811]/15 text-[#070811]'
                : 'bg-white/5 text-[#D4FF00]'
            }`}
          >
            {tournaments.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={adminSection === 'matches'}
          onClick={() => setAdminSection('matches')}
          className={`min-h-[54px] px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-start transition-colors ${
            adminSection === 'matches'
              ? 'bg-[#D4FF00] text-[#070811]'
              : 'bg-[#070811] text-slate-300 hover:text-white border border-white/[0.06]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Swords className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">
                {isAr ? '2. إدارة الماتشات والنتائج (AI)' : '2. Matches & AI Results'}
              </div>
              <div
                className={`text-[11px] truncate ${
                  adminSection === 'matches' ? 'text-[#070811]/80 font-medium' : 'text-slate-400'
                }`}
              >
                {isAr
                  ? 'المجموعات، المواجهات، المواعيد'
                  : 'Groups, knockouts & schedules'}
              </div>
            </div>
          </div>
          <span
            className={`text-xs font-mono-num font-bold px-2.5 py-1 rounded-lg shrink-0 ${
              adminSection === 'matches'
                ? 'bg-[#070811]/15 text-[#070811]'
                : 'bg-emerald-500/15 text-emerald-400'
            }`}
          >
            {fullCapacityTournaments.length > 0
              ? isAr
                ? `${fullCapacityTournaments.length} مكتمل`
                : `${fullCapacityTournaments.length} Full`
              : isAr
              ? `${pendingSubmissions.length} مراجعة`
              : `${pendingSubmissions.length} Review`}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={adminSection === 'checkin'}
          onClick={() => setAdminSection('checkin')}
          className={`min-h-[54px] px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-start transition-colors ${
            adminSection === 'checkin'
              ? 'bg-[#D4FF00] text-[#070811]'
              : 'bg-[#070811] text-slate-300 hover:text-white border border-white/[0.06]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <QrCode className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">
                {isAr ? '3. سكان الحضور (QR)' : '3. QR Check-In'}
              </div>
              <div
                className={`text-[11px] truncate ${
                  adminSection === 'checkin' ? 'text-[#070811]/80 font-medium' : 'text-slate-400'
                }`}
              >
                {isAr
                  ? 'مسح QR: ONE READY / TEAM READY'
                  : 'Scan QR: ONE / TEAM READY'}
              </div>
            </div>
          </div>
          <span
            className={`text-xs font-mono-num font-bold px-2.5 py-1 rounded-lg shrink-0 ${
              adminSection === 'checkin'
                ? 'bg-[#070811]/15 text-[#070811]'
                : 'bg-[#22D3EE]/15 text-[#22D3EE]'
            }`}
          >
            {(() => {
              const readyCount = allRound0Participants.filter(
                (p) =>
                  getTeamCheckInSummary(p, managedTournament?.modeTag).status === 'team_ready'
              ).length;
              return isAr ? `${readyCount} جاهز` : `${readyCount} Ready`;
            })()}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={adminSection === 'players'}
          onClick={() => setAdminSection('players')}
          className={`min-h-[54px] px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-start transition-colors ${
            adminSection === 'players'
              ? 'bg-[#D4FF00] text-[#070811]'
              : 'bg-[#070811] text-slate-300 hover:text-white border border-white/[0.06]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Phone className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">
                {isAr ? '4. أرقام اللاعبين (واتساب)' : '4. Players & WhatsApp'}
              </div>
              <div
                className={`text-[11px] truncate ${
                  adminSection === 'players' ? 'text-[#070811]/80 font-medium' : 'text-slate-400'
                }`}
              >
                {isAr
                  ? 'الأسماء ثلاثي وأرقام الواتساب و Gmail'
                  : 'Triple names, WhatsApp & Gmail'}
              </div>
            </div>
          </div>
          <span
            className={`text-xs font-mono-num font-bold px-2.5 py-1 rounded-lg shrink-0 ${
              adminSection === 'players'
                ? 'bg-[#070811]/15 text-[#070811]'
                : 'bg-emerald-500/15 text-emerald-300'
            }`}
          >
            {playersDirectory.length}
          </span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 1: BOOKING & REGISTRATION ADMIN                               */}
      {/* ===================================================================== */}
      {adminSection === 'booking' && (
        <div className="space-y-6">
          {/* Booking Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">
                {isAr ? 'إجمالي البطولات' : 'Total Tournaments'}
              </div>
              <div className="text-2xl font-bold text-white mt-1.5 tabular-nums">
                {tournaments.length}
              </div>
            </div>
            <div className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">
                {isAr ? 'بطولات مفتوحة للحجز' : 'Open for Booking'}
              </div>
              <div className="text-2xl font-bold text-emerald-400 mt-1.5 tabular-nums">
                {tournaments.filter((t) => t.registrationOpen).length}
              </div>
            </div>
            <div className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">
                {isAr
                  ? 'بطولات اكتمل عددها (في إدارة الماتشات)'
                  : 'Full Capacity (Ready in Matches Admin)'}
              </div>
              <div className="text-2xl font-bold text-[#D4FF00] mt-1.5 tabular-nums">
                {fullCapacityTournaments.length}
              </div>
            </div>
          </div>

          {/* Manual Registration Lock / Unlock Switchboard */}
          <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[#D4FF00]" />
                <span>
                  {isAr
                    ? 'إدارة الحجز والتسجيل ("سجل الآن")'
                    : 'Registration Switchboard ("Register Now")'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr
                  ? 'تبدأ أي بطولة جديدة بحالة (التسجيل مغلق). وعندما يكتمل عدد المقاعد تلقائياً، تُغلق بطاقة الحجز وتُفتح البطولة ومواجهاتها المباشرة في قسم «إدارة الماتشات والنتائج».'
                  : 'New tournaments start closed by default. Once slots fill up, booking closes automatically and direct matchups unlock in the Matches & AI Results panel.'}
              </p>
            </div>

            {tournaments.length === 0 ? (
              <div className="bg-[#070811] border border-white/[0.08] rounded-xl p-5 text-center text-xs text-slate-400">
                {isAr
                  ? 'لا توجد بطولات حالياً — أنشئ بطولة جديدة من النموذج بالأسفل ثم اضغط "فتح التسجيل".'
                  : 'No tournaments yet — create a tournament below and click "Open Booking".'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tournaments.map((t) => {
                  const isFull = t.registeredCount >= t.maxSlots;
                  const gameObj = games.find((g) => g.slug === t.gameSlug);
                  const gameDisplay =
                    t.customGameName ||
                    (gameObj ? translateGameInfo(gameObj, lang).displayName : t.gameSlug);
                  const isConfirmingDelete = confirmDeleteId === t.id;
                  const isDeletingThis = deletingId === t.id;
                  return (
                    <div
                      key={t.id}
                      className="bg-[#070811] border border-white/[0.08] rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-white truncate">
                            {t.title}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-[#D4FF00]">{gameDisplay}</span>
                            <span>·</span>
                            <span>{t.modeTag}</span>
                            <span>·</span>
                            <span className="font-mono-num text-white">
                              {isAr
                                ? `${t.registeredCount}/${t.maxSlots} مقعد`
                                : `${t.registeredCount}/${t.maxSlots} slots`}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0 ${
                            isFull
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : t.registrationOpen
                              ? 'bg-[#D4FF00]/15 text-[#22D3EE] border border-[#D4FF00]/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {isFull
                            ? isAr
                              ? 'اكتمل العدد'
                              : 'Full'
                            : t.registrationOpen
                            ? isAr
                              ? 'الحجز مفتوح'
                              : 'Open'
                            : isAr
                            ? 'الحجز مغلق'
                            : 'Closed'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateTournamentMeta(t.id, {
                              registrationOpen: !t.registrationOpen,
                            })
                          }
                          className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                            t.registrationOpen
                              ? 'bg-rose-500/15 border border-rose-500/40 text-rose-200 hover:bg-rose-500/25'
                              : 'bg-emerald-500 text-[#070811] hover:bg-emerald-400'
                          }`}
                        >
                          {t.registrationOpen ? (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>{isAr ? 'إغلاق الحجز' : 'Close Booking'}</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3.5 h-3.5" />
                              <span>{isAr ? 'فتح الحجز (سجل الآن)' : 'Open Booking'}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => openMatchesAdminFor(t.id, 0)}
                          className="min-h-[40px] px-3.5 rounded-lg border border-[#D4FF00]/40 text-[#22D3EE] hover:bg-[#D4FF00]/10 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Swords className="w-3.5 h-3.5" />
                          <span>{isAr ? 'فتح في إدارة الماتشات' : 'Open Matches Admin'}</span>
                        </button>

                        {isFull && (
                          <button
                            type="button"
                            onClick={() =>
                              onCreateTournament({
                                title: isAr
                                  ? `${t.title} — جولة جديدة`
                                  : `${t.title} — New Edition`,
                                gameSlug: t.gameSlug,
                                customGameName: t.customGameName,
                                modeTag: t.modeTag,
                                venueName: t.venueName,
                                prizePool: t.prizePool,
                                maxSlots: t.maxSlots,
                                rulesText: t.rules.join('\n'),
                              })
                            }
                            className="min-h-[40px] px-3 rounded-lg border border-white/15 hover:border-white/30 text-xs text-white font-medium whitespace-nowrap"
                          >
                            {isAr ? '+ فتح حجز جديد لنفس اللعبة' : '+ New Booking for Same Game'}
                          </button>
                        )}

                        {!isConfirmingDelete ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(t.id)}
                            className="min-h-[40px] px-3 rounded-lg border border-rose-500/35 text-rose-300 hover:bg-rose-500/15 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isAr ? 'حذف البطولة' : 'Delete'}</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/40 rounded-lg px-2 py-1">
                            <span className="text-[11px] font-bold text-rose-200 px-1">
                              {isAr ? 'تأكيد الحذف؟' : 'Confirm?'}
                            </span>
                            <button
                              type="button"
                              disabled={isDeletingThis}
                              onClick={() => handleConfirmDelete(t.id)}
                              className="min-h-[30px] px-2.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold whitespace-nowrap"
                            >
                              {isDeletingThis
                                ? isAr
                                  ? 'جاري الحذف...'
                                  : 'Deleting...'
                                : isAr
                                ? 'نعم، احذف'
                                : 'Yes, Delete'}
                            </button>
                            <button
                              type="button"
                              disabled={isDeletingThis}
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[30px] px-2 rounded-md border border-white/15 text-[11px] text-slate-300 hover:text-white"
                            >
                              {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Create New Tournament + Edit Venue & Prize */}
            <div className="lg:col-span-7 space-y-6">
              <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-[#D4FF00]" />
                  <span>
                    {isAr
                      ? 'إنشاء بطولة جديدة للحجز (بتحديد المكان والجائزة)'
                      : 'Create New Tournament (Venue & Prize)'}
                  </span>
                </h2>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {isAr ? 'اسم البطولة' : 'Tournament Title'}
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={
                        isAr
                          ? 'مثال: بطولة أرينا برو 2v2 — FC 27'
                          : 'e.g., Arena Pro 2v2 Cup — FC 27'
                      }
                      className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#D4FF00]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'اللعبة' : 'Game'}
                      </label>
                      <select
                        value={gameSlug}
                        onChange={(e) => setGameSlug(e.target.value as GameSlug)}
                        className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-2.5 text-xs text-white"
                      >
                        {games.map((g) => (
                          <option key={g.slug} value={g.slug}>
                            {translateGameInfo(g, lang).displayName}
                          </option>
                        ))}
                        <option value="custom">
                          {isAr ? 'أخرى (لعبة مخصصة)' : 'Other (Custom Game)'}
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'النظام' : 'Format'}
                      </label>
                      <select
                        value={modeTag}
                        onChange={(e) => setModeTag(e.target.value as MatchFormatTag)}
                        className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-2.5 text-xs text-white"
                      >
                        <option value="1v1">{isAr ? '1v1 فردي' : '1v1 Solo'}</option>
                        <option value="2v2">{isAr ? '2v2 ثنائيات' : '2v2 Duos'}</option>
                        <option value="4v4">{isAr ? '4v4 فرق' : '4v4 Squads'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'نظام المجموعات' : 'Group Format'}
                      </label>
                      <div className="w-full min-h-[44px] bg-[#070811] border border-[#22D3EE]/35 rounded-xl px-3 flex items-center justify-between text-xs font-bold text-[#22D3EE]">
                        <span>
                          {isAr
                            ? '8 مجموعات × 4 فرق (32)'
                            : '8 Groups × 4 Teams (32)'}
                        </span>
                        <span className="text-[10px] text-[#D4FF00] font-mono-num">
                          {isAr ? '← دور الـ 16' : '→ R16'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {gameSlug === 'custom' && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'اسم اللعبة المخصصة' : 'Custom Game Name'}
                      </label>
                      <input
                        type="text"
                        value={customGameName}
                        onChange={(e) => setCustomGameName(e.target.value)}
                        placeholder={
                          isAr
                            ? 'مثال: Valorant أو Rocket League أو شطرنج'
                            : 'e.g., Valorant, Rocket League, Chess'
                        }
                        className="w-full min-h-[44px] bg-[#070811] border border-[#22D3EE]/40 rounded-xl px-3.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#D4FF00]"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'المكان' : 'Venue'}
                      </label>
                      <input
                        type="text"
                        value={venueName}
                        onChange={(e) => setVenueName(e.target.value)}
                        className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#D4FF00]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'الجائزة' : 'Prize Pool'}
                      </label>
                      <input
                        type="text"
                        value={prizePool}
                        onChange={(e) => setPrizePool(e.target.value)}
                        className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#D4FF00]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {isAr ? 'قوانين البطولة — تحددها الإدارة فقط (سطر لكل قاعدة)' : 'Tournament Rules — Admin Only (One rule per line)'}
                    </label>
                    <textarea
                      rows={3}
                      value={rulesText}
                      onChange={(e) => setRulesText(e.target.value)}
                      placeholder={
                        isAr
                          ? 'اكتب قوانين هذه البطولة هنا (اتركه فارغاً إذا لم تحدد قوانين بعد)...'
                          : 'Write rules for this tournament (leave empty if none yet)...'
                      }
                      className="w-full bg-[#070811] border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#D4FF00]"
                    />
                  </div>

                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={openImmediately}
                      onChange={(e) => setOpenImmediately(e.target.checked)}
                      className="w-4 h-4 accent-[#D4FF00] rounded"
                    />
                    <span>
                      {isAr
                        ? 'فتح التسجيل («سجل الآن») فوراً عند النشر'
                        : 'Open booking ("Register Now") immediately upon publish'}
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={
                      creating ||
                      !title.trim() ||
                      (gameSlug === 'custom' && !customGameName.trim())
                    }
                    onClick={handleCreate}
                    className="w-full min-h-[48px] rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:bg-slate-700 text-[#070811] font-extrabold text-sm transition-colors"
                  >
                    {creating
                      ? isAr
                        ? 'جاري إنشاء البطولة...'
                        : 'Creating tournament...'
                      : openImmediately
                      ? isAr
                        ? 'نشر البطولة وفتح الحجز الآن'
                        : 'Publish & Open Booking Now'
                      : isAr
                      ? 'نشر البطولة (مغلقة حتى تفتح الحجز)'
                      : 'Publish Tournament (Closed Until Opened)'}
                  </button>
                </div>
              </section>

              {managedTournament && (
                <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-white">
                      {isAr
                        ? 'تعديل بيانات البطولة والقوانين'
                        : 'Edit Tournament Details & Rules'}
                    </h2>
                    <select
                      value={managedTournament.id}
                      onChange={(e) => setManagedTournamentId(e.target.value)}
                      aria-label={isAr ? 'اختر بطولة لتعديل بياناتها' : 'Select tournament to edit'}
                      className="min-h-[40px] bg-[#070811] border border-white/15 rounded-xl px-3 text-xs text-white"
                    >
                      {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {isAr ? 'اسم البطولة' : 'Tournament Title'}
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#D4FF00]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'المكان' : 'Venue'}
                      </label>
                      <input
                        type="text"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#D4FF00]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'الجائزة' : 'Prize Pool'}
                      </label>
                      <input
                        type="text"
                        value={editPrize}
                        onChange={(e) => setEditPrize(e.target.value)}
                        className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#D4FF00]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'النظام' : 'Format'}
                      </label>
                      <select
                        value={editModeTag}
                        onChange={(e) => setEditModeTag(e.target.value as MatchFormatTag)}
                        className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white"
                      >
                        <option value="1v1">1v1</option>
                        <option value="2v2">2v2</option>
                        <option value="4v4">4v4</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'حالة البطولة' : 'Status'}
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as Tournament['status'])}
                        className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white"
                      >
                        <option value="open">{isAr ? 'قائمة' : 'Open'}</option>
                        <option value="ongoing">{isAr ? 'جارية' : 'Ongoing'}</option>
                        <option value="completed">{isAr ? 'منتهية' : 'Completed'}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {isAr ? 'قوانين البطولة (سطر لكل قاعدة)' : 'Tournament Rules (One rule per line)'}
                    </label>
                    <textarea
                      rows={3}
                      value={editRulesText}
                      onChange={(e) => setEditRulesText(e.target.value)}
                      placeholder={
                        isAr
                          ? 'أدخل قوانين البطولة هنا (سطر لكل قاعدة)...'
                          : 'Enter tournament rules here (one per line)...'
                      }
                      className="w-full bg-[#070811] border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#D4FF00]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={savingMeta}
                      onClick={handleSaveMeta}
                      className="min-h-[44px] px-5 rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] text-[#070811] text-xs font-extrabold flex items-center gap-2 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {savingMeta
                          ? isAr
                            ? 'جاري الحفظ...'
                            : 'Saving...'
                          : isAr
                          ? 'حفظ بيانات وقوانين البطولة'
                          : 'Save Tournament Settings & Rules'}
                      </span>
                    </button>

                    {confirmDeleteId !== managedTournament.id ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(managedTournament.id)}
                        className="min-h-[44px] px-4 rounded-xl border border-rose-500/35 text-rose-300 hover:bg-rose-500/15 text-xs font-semibold flex items-center gap-2 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{isAr ? 'حذف هذه البطولة' : 'Delete Tournament'}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/40 rounded-xl px-3 py-1.5">
                        <span className="text-xs font-bold text-rose-200">
                          {isAr ? 'حذف نهائي؟' : 'Delete permanently?'}
                        </span>
                        <button
                          type="button"
                          disabled={deletingId === managedTournament.id}
                          onClick={() => handleConfirmDelete(managedTournament.id)}
                          className="min-h-[34px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                        >
                          {deletingId === managedTournament.id
                            ? isAr
                              ? 'جاري الحذف...'
                              : 'Deleting...'
                            : isAr
                            ? 'تأكيد الحذف'
                            : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === managedTournament.id}
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[34px] px-2.5 rounded-lg border border-white/15 text-xs text-slate-300 hover:text-white"
                        >
                          {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Admin-Only Game Rules Editor */}
              {selectedRuleGame && (
                <section className="bg-[#0E1222] border border-[#22D3EE]/30 rounded-2xl p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#22D3EE]" />
                        <span>
                          {isAr
                            ? 'إدارة قوانين الألعاب (تحددها الإدارة فقط)'
                            : 'Manage Game Rules (Admin Only)'}
                        </span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isAr
                          ? 'القوانين التي تحفظها هنا هي فقط التي تظهر للاعبين في صفحة الألعاب ولا تتغير تلقائياً.'
                          : 'Only the rules you save here appear in the Games Hub and remain locked until you change them.'}
                      </p>
                    </div>

                    <select
                      value={selectedGameRuleSlug}
                      onChange={(e) => setSelectedGameRuleSlug(e.target.value as GameSlug)}
                      aria-label={isAr ? 'اختر اللعبة لتعديل قوانينها' : 'Select game to edit rules'}
                      className="min-h-[40px] bg-[#070811] border border-white/15 rounded-xl px-3 text-xs text-[#22D3EE] font-bold"
                    >
                      {games.map((g) => (
                        <option key={g.slug} value={g.slug}>
                          {translateGameInfo(g, lang).displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'نظام الاحتساب' : 'Scoring System'}
                      </label>
                      <input
                        type="text"
                        value={gameScoringDraft}
                        onChange={(e) => setGameScoringDraft(e.target.value)}
                        className="w-full min-h-[42px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isAr ? 'الأنماط المتاحة' : 'Supported Modes'}
                      </label>
                      <input
                        type="text"
                        value={gameModeDraft}
                        onChange={(e) => setGameModeDraft(e.target.value)}
                        className="w-full min-h-[42px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {isAr ? 'وصف اللعبة' : 'Game Summary'}
                    </label>
                    <input
                      type="text"
                      value={gameSummaryDraft}
                      onChange={(e) => setGameSummaryDraft(e.target.value)}
                      className="w-full min-h-[42px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {isAr
                        ? 'قوانين اللعبة الرسمية (سطر لكل قانون — اتركه فارغاً لإخفاء القوانين)'
                        : 'Official Game Rules (One rule per line — leave blank to clear rules)'}
                    </label>
                    <textarea
                      rows={4}
                      value={gameRulesTextDraft}
                      onChange={(e) => setGameRulesTextDraft(e.target.value)}
                      placeholder={
                        isAr
                          ? 'مثال:\nيُمنع استخدام أي إضافات خارجية.\nالالتزام بموعد المباراة المحدد.'
                          : 'e.g.,\nNo external tools allowed.\nShow up on time for scheduled matches.'
                      }
                      className="w-full bg-[#070811] border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#22D3EE]"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={savingGameRules}
                    onClick={handleSaveGameRules}
                    className="min-h-[44px] px-5 rounded-xl bg-[#22D3EE] hover:bg-[#38BDF8] text-[#070811] text-xs font-extrabold flex items-center gap-2 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {savingGameRules
                        ? isAr
                          ? 'جاري الحفظ...'
                          : 'Saving...'
                        : isAr
                        ? 'حفظ قوانين اللعبة'
                        : 'Save Game Rules'}
                    </span>
                  </button>
                </section>
              )}
            </div>

            {/* 2v2 Partner Linking + Secret Admin Handle Management */}
            <div className="lg:col-span-5 space-y-6">
              {managedTournament && (
                <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#D4FF00]" />
                    <span>{isAr ? 'ربط شركاء 2v2 للمسجلين' : 'Link 2v2 Teammates'}</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    {isAr
                      ? `اختر أي مسجل في «${managedTournament.title}» لربطه بصديقه قبل إغلاق الحجز.`
                      : `Pick any entrant in "${managedTournament.title}" to link with their teammate before closing registration.`}
                  </p>
                  <div className="space-y-3">
                    <select
                      value={pairTargetId}
                      onChange={(e) => setPairTargetId(e.target.value)}
                      className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white"
                    >
                      <option value="">
                        {isAr ? '— اختر المشارك —' : '— Select Participant —'}
                      </option>
                      {allRound0Participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (@{p.username})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={pairTeammate}
                      onChange={(e) => setPairTeammate(e.target.value)}
                      placeholder={
                        isAr
                          ? 'يوزر نيم الشريك (مثال: Ahmed_99)'
                          : 'Partner username (e.g., Ahmed_99)'
                      }
                      className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white font-mono-num"
                    />
                    <button
                      type="button"
                      disabled={!pairTargetId}
                      onClick={async () => {
                        await onUpdateMatchup(managedTournament.id, {
                          pairTargetId,
                          teammateUsername: pairTeammate,
                        });
                        setPairTeammate('');
                      }}
                      className="w-full min-h-[44px] px-4 rounded-xl bg-white hover:bg-slate-200 disabled:bg-slate-800 disabled:text-slate-500 text-[#070811] text-xs font-bold"
                    >
                      {isAr ? 'ربط الشريك مع اللاعب' : 'Link Partner'}
                    </button>
                  </div>
                </section>
              )}

              <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#D4FF00]" />
                    <span>
                      {isAr ? 'إدارة صلاحيات الأدمن (Gmail فقط)' : 'Admin Permissions (Gmail Only)'}
                    </span>
                  </h3>
                  <span className="text-[11px] font-mono-num text-[#22D3EE]">
                    {adminEmails.length} Gmail
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {isAr
                    ? 'الإدارة محصورة في الجيميلات المعتمدة فقط، ورسائل المنصة تُرسل من البريد الرسمي saeedyassin313@gmail.com.'
                    : 'Admin access is restricted to approved Gmails only. Platform emails are sent from saeedyassin313@gmail.com.'}
                </p>

                <div className="space-y-2">
                  {Array.from(
                    new Set([
                      'saeedyassin313@gmail.com',
                      'arenapro185@gmail.com',
                      ...adminEmails.map((e) => normalizeEmail(e)).filter((e) => isValidEmailAddress(e)),
                    ])
                  ).map((email) => {
                    const isOwner = email === 'saeedyassin313@gmail.com';
                    const isOfficialBackup = email === 'arenapro185@gmail.com';
                    const isProtected = isOwner || isOfficialBackup;
                    return (
                      <div
                        key={email}
                        className="bg-[#070811] border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="w-3.5 h-3.5 text-[#22D3EE] shrink-0" />
                          <span dir="ltr" className="text-xs font-mono-num text-white truncate">
                            {email}
                          </span>
                        </div>
                        {isProtected ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#D4FF00]/15 text-[#D4FF00] shrink-0">
                            {isOwner
                              ? isAr
                                ? 'المالك والرسائل'
                                : 'Owner & Sender'
                              : isAr
                              ? 'إدارة أساسية'
                              : 'Core Admin'}
                          </span>
                        ) : (
                          onRemoveAdminHandle && (
                            <button
                              type="button"
                              onClick={() => onRemoveAdminHandle(email)}
                              aria-label={isAr ? `إزالة ${email}` : `Remove ${email}`}
                              className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 transition-colors shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    dir="ltr"
                    autoComplete="off"
                    value={newAdminHandle}
                    onChange={(e) => {
                      setNewAdminHandle(e.target.value);
                      if (adminEmailError) setAdminEmailError(null);
                    }}
                    placeholder="example@gmail.com"
                    className="flex-1 min-h-[42px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white font-mono-num text-left"
                  />
                  <button
                    type="button"
                    disabled={!newAdminHandle.trim()}
                    onClick={async () => {
                      const clean = normalizeEmail(newAdminHandle);
                      if (!isValidEmailAddress(clean)) {
                        setAdminEmailError(
                          isAr
                            ? 'يرجى إدخال بريد Gmail / بريد إلكتروني صحيح.'
                            : 'Please enter a valid Gmail / email address.'
                        );
                        return;
                      }
                      setAdminEmailError(null);
                      await onAddAdminHandle(clean);
                      setNewAdminHandle('');
                    }}
                    className="min-h-[42px] px-4 rounded-xl bg-white text-[#070811] text-xs font-bold shrink-0"
                  >
                    {isAr ? 'إضافة Gmail' : 'Add Gmail'}
                  </button>
                </div>
                {adminEmailError && <p className="text-xs text-rose-400">{adminEmailError}</p>}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: MATCHES & AI RESULTS ADMIN                                 */}
      {/* ===================================================================== */}
      {adminSection === 'matches' && (
        <div className="space-y-6">
          {!managedTournament ? (
            <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm text-slate-300">
                {isAr
                  ? 'لا توجد بطولات حالياً لإدارة ماتشاتها. أنشئ بطولة أولاً من «إدارة الحجز والتسجيل».'
                  : 'No tournaments available yet. Create one first in Booking & Registration.'}
              </p>
              <button
                type="button"
                onClick={() => setAdminSection('booking')}
                className="min-h-[44px] px-5 rounded-xl bg-[#D4FF00] text-[#070811] text-xs font-bold"
              >
                {isAr ? 'الانتقال إلى إدارة الحجز' : 'Go to Booking Admin'}
              </button>
            </section>
          ) : (
            <>
              {/* Tournament Selector + Matches Stage Status */}
              <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Swords className="w-5 h-5 text-[#D4FF00]" />
                        <span>
                          {isAr
                            ? `إدارة الماتشات والنتائج — ${managedTournament.title}`
                            : `Matches & Results — ${managedTournament.title}`}
                        </span>
                      </h2>
                      {managedTournament.registeredCount >= managedTournament.maxSlots && (
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                          {isAr
                            ? `العدد مكتمل (${managedTournament.registeredCount}/${managedTournament.maxSlots})`
                            : `Full (${managedTournament.registeredCount}/${managedTournament.maxSlots})`}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {isAr
                        ? `هنا تدير المجموعات (${managedActiveGroups.length} مجموعات × 4 فرق · 6 مواجهات/مجموعة)، ثم تبدأ الأدوار الإقصائية من ${translateRoundName(
                            managedTournament.rounds[1]?.nameAr || 'دور الـ 16',
                            lang
                          )}، مع حساب المتصدر وفارق الأهداف بالـ AI.`
                        : `Manage ${managedActiveGroups.length} groups (4 teams · 6 matches each), then knockout starting at ${translateRoundName(
                            managedTournament.rounds[1]?.nameAr || 'دور الـ 16',
                            lang
                          )} with AI standings & GD.`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <select
                      value={managedTournament.id}
                      onChange={(e) => {
                        setManagedTournamentId(e.target.value);
                        setActiveRoundIndex(0);
                      }}
                      aria-label={
                        isAr ? 'اختر البطولة لإدارة ماتشاتها' : 'Select tournament to manage matches'
                      }
                      className="min-h-[44px] bg-[#070811] border border-white/15 rounded-xl px-3.5 text-xs sm:text-sm text-white"
                    >
                      {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.registeredCount}/{t.maxSlots})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTournamentMeta(managedTournament.id, {
                          resultsEntryOpen: !managedTournament.resultsEntryOpen,
                        })
                      }
                      className={`min-h-[44px] px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        managedTournament.resultsEntryOpen
                          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                          : 'bg-[#D4FF00] text-[#070811] hover:bg-[#E2FF4D]'
                      }`}
                    >
                      {managedTournament.resultsEntryOpen ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>{isAr ? 'تسجيل النتائج مفتوح' : 'Score Entry Open'}</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-4 h-4" />
                          <span>
                            {isAr
                              ? 'فتح تسجيل النتائج والمواجهات'
                              : 'Open Score Entry & Matchups'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div
                  className={`rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 border ${
                    emailServiceConfigured || gmailConnectedEmail
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-[#070811] border-white/[0.08] text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 shrink-0 text-[#D4FF00]" />
                    <div className="space-y-0.5">
                      <p>
                        {emailServiceConfigured
                          ? isAr
                            ? 'الإرسال التلقائي عبر الخادم مفعّل عبر saeedyassin313@gmail.com: تصِل رسائل المجموعة والموعد لبريد اللاعب تلقائياً عند الحفظ.'
                            : 'Automatic server email dispatch from saeedyassin313@gmail.com is active.'
                          : gmailConnectedEmail
                          ? isAr
                            ? `متصل للإرسال المباشر عبر Gmail: `
                            : `Connected for direct Gmail sending: `
                          : isAr
                          ? 'ربط Gmail للإرسال المباشر جاهز — اربط حسابك بضغطة واحدة لإرسال مواعيد الماتشات من بريدك بدون App Password.'
                          : 'Direct Gmail sending is ready — connect your Gmail once to dispatch match schedules with one click.'}
                        {!emailServiceConfigured && gmailConnectedEmail && (
                          <span dir="ltr" className="font-mono-num font-bold text-[#D4FF00]">
                            {gmailConnectedEmail}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!emailServiceConfigured && onConnectGmailSender && (
                      gmailConnectedEmail ? (
                        <button
                          type="button"
                          onClick={() => onDisconnectGmailSender?.()}
                          className="min-h-[32px] px-3 rounded-lg bg-rose-500/15 border border-rose-500/35 hover:bg-rose-500/25 text-[11px] font-semibold text-rose-300 whitespace-nowrap"
                        >
                          {isAr ? 'فصل Gmail' : 'Disconnect Gmail'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={connectingGmail}
                          onClick={async () => {
                            setConnectingGmail(true);
                            try {
                              await onConnectGmailSender();
                            } finally {
                              setConnectingGmail(false);
                            }
                          }}
                          className="min-h-[32px] px-3 rounded-lg bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:bg-slate-700 text-[#070811] text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {connectingGmail
                              ? isAr
                                ? 'جاري الربط...'
                                : 'Connecting...'
                              : isAr
                              ? 'ربط Gmail للإرسال المباشر'
                              : 'Connect Gmail'}
                          </span>
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => setShowEmailPreview((prev) => !prev)}
                      className="min-h-[32px] px-3 rounded-lg bg-[#0E1222] border border-white/15 hover:border-[#D4FF00]/50 text-[11px] font-semibold text-[#22D3EE] whitespace-nowrap"
                    >
                      {showEmailPreview
                        ? isAr
                          ? 'إخفاء المعاينة'
                          : 'Hide Email Preview'
                        : isAr
                        ? 'معاينة شكل الرسالة'
                        : 'Preview Email Template'}
                    </button>
                  </div>
                </div>

                {showEmailPreview &&
                  (() => {
                    const gameObj = games.find((g) => g.slug === managedTournament.gameSlug);
                    const previewGameName = gameObj
                      ? translateGameInfo(gameObj, lang).displayName
                      : managedTournament.gameSlug;
                    const firstRoundMatch =
                      managedTournament.rounds[0]?.matches.find(
                        (m) => m.participantA || m.participantB
                      ) || managedTournament.rounds[0]?.matches[0];
                    const previewEmail = buildPlayerEmailTemplate({
                      playerName:
                        firstRoundMatch?.participantA?.name ||
                        (isAr ? 'كريم محمد' : 'Kareem Mohamed'),
                      tournamentTitle: managedTournament.title,
                      gameName: previewGameName,
                      groupName: translateGroupName(
                        firstRoundMatch?.groupName || 'المجموعة أ',
                        lang
                      ),
                      scheduledAt:
                        firstRoundMatch?.scheduledAt && firstRoundMatch.scheduledAt !== 'لم يتحدد'
                          ? firstRoundMatch.scheduledAt
                          : isAr
                          ? 'الجمعة 9:00 م'
                          : 'Friday 9:00 PM',
                      matchLabel: firstRoundMatch
                        ? isAr
                          ? `مواجهة #${firstRoundMatch.matchNumber} (${firstRoundMatch.leg || 'ذهاب'})`
                          : `Match #${firstRoundMatch.matchNumber} (${translateLeg(
                              firstRoundMatch.leg || 'ذهاب',
                              lang
                            )})`
                        : isAr
                        ? 'مواجهة #1 (ذهاب)'
                        : 'Match #1 (1st Leg)',
                      opponentName:
                        firstRoundMatch?.participantB?.name ||
                        (isAr ? 'أحمد طارق' : 'Ahmed Tarek'),
                      venueName: managedTournament.venueName,
                      prizePool: managedTournament.prizePool,
                      appUrl: typeof window !== 'undefined' ? window.location.origin : '',
                      lang,
                    });

                    return (
                      <div className="rounded-2xl border border-[#D4FF00]/30 bg-[#070811] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-slate-300 font-medium">
                            {isAr
                              ? 'معاينة قالب البريد الإلكتروني الفعلي (HTML)'
                              : 'Live HTML Email Template Preview'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (navigator.clipboard) {
                                navigator.clipboard.writeText(previewEmail.html).catch(() => {});
                              }
                              setCopiedEmailHtml(true);
                              window.setTimeout(() => setCopiedEmailHtml(false), 2000);
                            }}
                            className="min-h-[32px] px-3 rounded-lg bg-[#0E1222] border border-white/15 hover:border-[#D4FF00]/50 text-[11px] font-semibold text-white flex items-center gap-1.5"
                          >
                            {copiedEmailHtml ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-[#D4FF00]" />
                            )}
                            <span>
                              {copiedEmailHtml
                                ? isAr
                                  ? 'تم نسخ كود HTML'
                                  : 'HTML Copied'
                                : isAr
                                ? 'نسخ كود HTML للقالب'
                                : 'Copy Template HTML'}
                            </span>
                          </button>
                        </div>

                        <iframe
                          title={
                            isAr
                              ? 'معاينة قالب البريد الإلكتروني الاحترافي'
                              : 'Email Template Preview'
                          }
                          srcDoc={previewEmail.html}
                          sandbox=""
                          className="w-full h-[540px] rounded-xl border border-white/10 bg-[#070811]"
                        />
                      </div>
                    );
                  })()}
              </section>

              {/* AI Tools Row: 1) 8-Group Home & Away Scheduler  2) AI Direct Matchups from Entered Results */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Tool 1: AI Home & Away across 8 Groups */}
                <div className="bg-[#0E1222] border border-[#D4FF00]/25 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#D4FF00]" />
                        <span>
                          {isAr
                            ? `1. توليد ماتشات الذهاب والعودة بالـ AI (${managedActiveGroups.length} مجموعات)`
                            : `1. AI Home & Away Match Generator (${managedActiveGroups.length} Groups)`}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        {isAr
                          ? 'يوزع الفرق على المجموعات (4 فرق بحد أقصى في كل مجموعة) بنظام الذهاب والعودة ويكتب الموعد «لم يتحدد».'
                          : 'Distributes teams into groups (max 4 teams per group) in Home & Away format and initializes match times as TBD.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder={
                        isAr
                          ? 'تعليمات اختيارية للـ AI (مثال: توزيع متوازن)'
                          : 'Optional AI instructions (e.g., balanced seeding)'
                      }
                      className="flex-1 min-h-[42px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      disabled={aiScheduling || allRound0Participants.length < 2}
                      onClick={async () => {
                        setAiScheduling(true);
                        setAiSummary(null);
                        try {
                          const result = await onAiSchedule(managedTournament.id, aiPrompt);
                          if (result.ok && result.summaryAr) {
                            setAiSummary(result.summaryAr);
                            setActiveRoundIndex(0);
                          }
                        } finally {
                          setAiScheduling(false);
                        }
                      }}
                      className="min-h-[42px] px-4 rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:bg-slate-700 disabled:text-slate-400 text-[#070811] text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {aiScheduling
                          ? isAr
                            ? 'جاري التوليد...'
                            : 'Generating...'
                          : isAr
                          ? 'تحديد ذهاب وعودة بالـ AI'
                          : 'AI Schedule Home & Away'}
                      </span>
                    </button>
                  </div>

                  {aiSummary && (
                    <div className="bg-[#070811] border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-emerald-300">
                      {aiSummary}
                    </div>
                  )}
                </div>

                {/* Tool 2: AI Places Direct Matchups Based on Admin's Entered Results */}
                <div className="bg-[#0E1222] border border-emerald-500/25 rounded-2xl p-5 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-emerald-400" />
                      <span>
                        {isAr
                          ? '2. وضع المواجهات المباشرة بالـ AI حسب النتائج'
                          : '2. AI Direct Knockout Placement from Scores'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {isAr
                        ? 'بناءً على النتائج التي تدخلها في المجموعات، يرتب الـ AI المتأهلين ويضعهم في الدور الإقصائي المباشر.'
                        : 'Ranks group qualifiers from the scores you enter and places them into direct knockout rounds.'}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={aiDirectPrompt}
                      onChange={(e) => setAiDirectPrompt(e.target.value)}
                      placeholder={
                        isAr
                          ? 'تعليمات إضافية (مثال: تجنب مواجهة نفس المجموعة)'
                          : 'Extra instructions (e.g., avoid same-group rematches)'
                      }
                      className="flex-1 min-h-[42px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      disabled={aiDirectLoading || managedTournament.rounds.length < 2}
                      onClick={async () => {
                        setAiDirectLoading(true);
                        try {
                          const res = await onAiDirectMatchups(
                            managedTournament.id,
                            aiDirectPrompt
                          );
                          if (res.ok) {
                            if (res.summaryAr) setAiDirectSummary(res.summaryAr);
                            setActiveRoundIndex(1);
                          }
                        } finally {
                          setAiDirectLoading(false);
                        }
                      }}
                      className="min-h-[42px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-[#070811] text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {aiDirectLoading
                          ? isAr
                            ? 'جاري وضع المواجهات...'
                            : 'Placing Matchups...'
                          : isAr
                          ? 'وضع المواجهات المباشرة بالـ AI'
                          : 'AI Place Direct Matchups'}
                      </span>
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoAiPlaceOnSave}
                      onChange={(e) => setAutoAiPlaceOnSave(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 rounded"
                    />
                    <span>
                      {isAr
                        ? 'تحديث المواجهات المباشرة بالـ AI تلقائياً عند حفظ أي نتيجة في المجموعات'
                        : 'Auto-update AI direct matchups whenever a group score is saved'}
                    </span>
                  </label>

                  {aiDirectSummary && (
                    <div className="bg-[#070811] border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-emerald-300">
                      {aiDirectSummary}
                    </div>
                  )}
                </div>
              </section>

              {/* Round Switcher: Groups vs Direct Knockout Matchups + Group Standings */}
              <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 bracket-scroll">
                    {managedTournament.rounds.map((r, idx) => {
                      const active = idx === activeRoundIndex;
                      const roundLabel = translateRoundName(r.nameAr, lang);
                      return (
                        <button
                          key={r.roundIndex}
                          type="button"
                          onClick={() => setActiveRoundIndex(idx)}
                          className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                            active
                              ? 'bg-[#D4FF00] border-[#D4FF00] text-[#070811]'
                              : 'bg-[#070811] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          {idx === 0
                            ? isAr
                              ? `المجموعات (${managedActiveGroups.length}): ${roundLabel}`
                              : `${managedActiveGroups.length} Groups: ${roundLabel}`
                            : isAr
                            ? `مواجهة مباشرة: ${roundLabel}`
                            : `Knockout: ${roundLabel}`}{' '}
                          ({r.matches.length})
                        </button>
                      );
                    })}
                  </div>

                  {activeRoundIndex === 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateMatchup(managedTournament.id, { shuffle: true })}
                        className="min-h-[40px] px-3.5 rounded-xl border border-[#D4FF00]/40 text-[#22D3EE] hover:bg-[#D4FF00]/10 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>{isAr ? 'توزيع عشوائي' : 'Shuffle Draw'}</span>
                      </button>

                      <select
                        aria-label={
                          isAr ? 'تصفية المواجهات حسب المجموعة' : 'Filter matches by group'
                        }
                        value={adminGroupFilter}
                        onChange={(e) => setAdminGroupFilter(e.target.value)}
                        className="min-h-[40px] bg-[#070811] border border-white/15 rounded-xl px-3 text-xs text-white"
                      >
                        <option value="all">
                          {isAr
                            ? `جميع المجموعات (${managedActiveGroups.length})`
                            : `All Groups (${managedActiveGroups.length})`}
                        </option>
                        {managedActiveGroups.map((gn) => (
                          <option key={gn} value={gn}>
                            {translateGroupName(gn, lang)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Group Interactive Drag & Drop + Standings Board (4 teams per group) */}
                {activeRoundIndex === 0 && round0 && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="text-xs font-semibold text-slate-200">
                        {isAr
                          ? `المجموعات (${managedActiveGroups.length} مجموعات × 4 فرق) وترتيب النقاط — اسحب الفريق لنقله:`
                          : `Groups (${managedActiveGroups.length} × 4 Teams) & Standings — Drag to move teams:`}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {isAr
                          ? `إجمالي الفرق: ${allRound0Participants.length} / ${managedTournament.maxSlots}`
                          : `Total Teams: ${allRound0Participants.length} / ${managedTournament.maxSlots}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {managedActiveGroups.map((gn) => {
                        const rows = standingsByGroup[gn] || [];
                        const isGroupDropTarget =
                          dragOverGroup === gn && dragPayload?.kind === 'player';
                        return (
                          <div
                            key={gn}
                            onDragOver={(e: DragEvent<HTMLDivElement>) => {
                              if (dragPayload?.kind !== 'player') return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverGroup !== gn) setDragOverGroup(gn);
                            }}
                            onDragLeave={() => {
                              if (dragOverGroup === gn) setDragOverGroup(null);
                            }}
                            onDrop={(e: DragEvent<HTMLDivElement>) => {
                              e.preventDefault();
                              if (dragPayload?.kind === 'player') {
                                const targetParticipantId = dragPayload.participantId;
                                clearDragState();
                                onUpdateMatchup(managedTournament.id, {
                                  moveToGroup: { participantId: targetParticipantId, targetGroup: gn },
                                });
                              }
                            }}
                            className={`bg-[#070811] rounded-xl p-3 border transition-colors space-y-2.5 min-h-[140px] ${
                              isGroupDropTarget
                                ? 'border-[#D4FF00] bg-[#D4FF00]/10'
                                : 'border-white/[0.08]'
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setAdminGroupFilter((prev) => (prev === gn ? 'all' : gn))
                                }
                                className={`text-xs font-bold transition-colors ${
                                  adminGroupFilter === gn
                                    ? 'text-[#22D3EE] underline'
                                    : 'text-[#D4FF00] hover:text-[#22D3EE]'
                                }`}
                                title={
                                  isAr
                                    ? 'اضغط لتصفية ماتشات هذه المجموعة بالأسفل'
                                    : 'Click to filter matches for this group below'
                                }
                              >
                                {translateGroupName(gn, lang)}
                              </button>
                              <span className="text-[11px] font-mono-num text-slate-400">
                                {isAr ? `${rows.length}/4 فرق` : `${rows.length}/4 teams`}
                              </span>
                            </div>

                            {rows.length === 0 ? (
                              <div className="text-[11px] text-slate-500 py-5 text-center border border-dashed border-white/10 rounded-lg">
                                {isAr ? 'اسحب أي لاعب وأفلته هنا' : 'Drop any player here'}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {rows.map((row, rankIdx) => {
                                  const p = row.participant;
                                  const gd = row.goalsFor - row.goalsAgainst;
                                  const gdLabel = gd > 0 ? `+${gd}` : `${gd}`;
                                  const isLeader = rankIdx === 0 && row.played > 0;
                                  const isRunnerUp = rankIdx === 1 && row.played > 0;
                                  return (
                                    <div
                                      key={p.id}
                                      draggable
                                      onDragStart={(e: DragEvent<HTMLDivElement>) => {
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', p.id);
                                        setDragPayload({ kind: 'player', participantId: p.id });
                                      }}
                                      onDragEnd={clearDragState}
                                      className={`rounded-lg p-2 space-y-1.5 cursor-grab active:cursor-grabbing border ${
                                        isLeader
                                          ? 'bg-emerald-500/10 border-emerald-500/45'
                                          : isRunnerUp
                                          ? 'bg-[#0E1222] border-[#22D3EE]/35'
                                          : 'bg-[#0E1222] border-white/[0.08] hover:border-[#D4FF00]/40'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <GripVertical className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                          <span className="text-[10px] font-mono-num text-[#D4FF00] shrink-0">
                                            #{rankIdx + 1}
                                          </span>
                                          <span className="text-xs font-semibold text-white truncate">
                                            {p.teamName || p.name}
                                          </span>
                                          {isLeader && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                                              {isAr ? 'أول المجموعة' : '1st'}
                                            </span>
                                          )}
                                          {isRunnerUp && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#22D3EE]/15 text-[#22D3EE] shrink-0">
                                              {isAr ? 'متأهل' : '2nd'}
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[11px] font-mono-num font-bold text-emerald-300 shrink-0">
                                          {row.points} {isAr ? 'ن' : 'pts'}
                                        </span>
                                      </div>

                                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono-num">
                                        <span>
                                          {isAr
                                            ? `لعب ${row.played} · ف ${row.wins} · ت ${row.draws} · خ ${row.losses}`
                                            : `P ${row.played} · W ${row.wins} · D ${row.draws} · L ${row.losses}`}
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                          <span>
                                            {row.goalsFor}:{row.goalsAgainst}
                                          </span>
                                          <span
                                            className={`font-bold ${
                                              gd > 0
                                                ? 'text-emerald-300'
                                                : gd < 0
                                                ? 'text-rose-400'
                                                : 'text-slate-300'
                                            }`}
                                          >
                                            ({isAr ? `فارق ${gdLabel}` : `GD ${gdLabel}`})
                                          </span>
                                        </span>
                                      </div>

                                      <select
                                        aria-label={
                                          isAr
                                            ? `نقل ${p.name} إلى مجموعة`
                                            : `Move ${p.name} to group`
                                        }
                                        value={p.groupName}
                                        onChange={(e) =>
                                          onUpdateMatchup(managedTournament.id, {
                                            moveToGroup: {
                                              participantId: p.id,
                                              targetGroup: e.target.value,
                                            },
                                          })
                                        }
                                        className="w-full min-h-[32px] bg-[#070811] border border-white/10 rounded-md px-2 text-[11px] text-slate-200"
                                      >
                                        {managedActiveGroups.map((optionGroup) => (
                                          <option key={optionGroup} value={optionGroup}>
                                            {isAr ? 'نقل إلى:' : 'Move to:'}{' '}
                                            {translateGroupName(optionGroup, lang)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Matches List: Score Entry, Schedule Editing, Drag & Drop */}
                {activeRound && (
                  <div className="space-y-3 pt-3 border-t border-white/[0.08]">
                    <div className="text-xs font-semibold text-slate-200">
                      {isAr
                        ? `مباريات «${activeRound.nameAr}» — إدخال النتائج والمواعيد:`
                        : `Matches — "${translateRoundName(
                            activeRound.nameAr,
                            lang
                          )}" (Scores & Schedules):`}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:max-h-[680px] md:overflow-y-auto md:pe-1 bracket-scroll">
                      {activeRound.matches
                        .filter(
                          (m) =>
                            activeRoundIndex !== 0 ||
                            adminGroupFilter === 'all' ||
                            m.groupName === adminGroupFilter
                        )
                        .map((m) => {
                          const idx = activeRound.matches.findIndex((item) => item.id === m.id);
                          const isMatchDropTarget =
                            activeRoundIndex === 0 &&
                            dragPayload?.kind === 'match' &&
                            dragPayload.matchId !== m.id &&
                            dragOverMatchId === m.id;
                          const slotAKey = `${m.id}:A`;
                          const slotBKey = `${m.id}:B`;
                          const rawSchedule = m.scheduledAt || 'لم يتحدد';
                          const isUnscheduled = rawSchedule === 'لم يتحدد';
                          const displaySchedule = translateSchedule(rawSchedule, lang);
                          const draftSchedule = scheduleDrafts[m.id] ?? '';
                          const scoreDraft = scoreDrafts[m.id] || {
                            scoreA: '',
                            scoreB: '',
                            winnerId: '',
                          };

                          return (
                            <div
                              key={m.id}
                              draggable={activeRoundIndex === 0}
                              onDragStart={(e: DragEvent<HTMLDivElement>) => {
                                if (activeRoundIndex !== 0 || dragPayload?.kind === 'slot') return;
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', m.id);
                                setDragPayload({ kind: 'match', matchId: m.id });
                              }}
                              onDragOver={(e: DragEvent<HTMLDivElement>) => {
                                if (
                                  activeRoundIndex !== 0 ||
                                  dragPayload?.kind !== 'match' ||
                                  dragPayload.matchId === m.id
                                )
                                  return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                if (dragOverMatchId !== m.id) setDragOverMatchId(m.id);
                              }}
                              onDragLeave={() => {
                                if (dragOverMatchId === m.id) setDragOverMatchId(null);
                              }}
                              onDrop={(e: DragEvent<HTMLDivElement>) => {
                                if (
                                  activeRoundIndex !== 0 ||
                                  dragPayload?.kind !== 'match' ||
                                  dragPayload.matchId === m.id
                                )
                                  return;
                                e.preventDefault();
                                const fromMatchId = dragPayload.matchId;
                                clearDragState();
                                onUpdateMatchup(managedTournament.id, {
                                  reorderMatches: { fromMatchId, toMatchId: m.id },
                                });
                              }}
                              onDragEnd={clearDragState}
                              className={`bg-[#070811] rounded-xl p-3.5 space-y-3 border transition-colors ${
                                isMatchDropTarget
                                  ? 'border-[#D4FF00] bg-[#D4FF00]/10'
                                  : m.status === 'completed'
                                  ? 'border-emerald-500/35'
                                  : 'border-white/[0.08]'
                              }`}
                            >
                              {/* Match Header */}
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-1.5">
                                  {activeRoundIndex === 0 && (
                                    <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
                                  )}
                                  <span className="font-mono-num text-white font-semibold">
                                    {isAr ? `مواجهة #${m.matchNumber}` : `Match #${m.matchNumber}`}
                                  </span>
                                  {m.status === 'completed' && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                                      {isAr ? 'مكتملة' : 'Completed'}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {activeRoundIndex === 0 && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={idx === 0}
                                        aria-label={
                                          isAr
                                            ? `تحريك مواجهة ${m.matchNumber} لأعلى`
                                            : `Move match ${m.matchNumber} up`
                                        }
                                        onClick={() => {
                                          const prevMatch = activeRound.matches[idx - 1];
                                          if (prevMatch) {
                                            onUpdateMatchup(managedTournament.id, {
                                              reorderMatches: {
                                                fromMatchId: m.id,
                                                toMatchId: prevMatch.id,
                                              },
                                            });
                                          }
                                        }}
                                        className="min-h-[32px] min-w-[32px] rounded-lg bg-[#0E1222] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-35"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={idx === activeRound.matches.length - 1}
                                        aria-label={
                                          isAr
                                            ? `تحريك مواجهة ${m.matchNumber} لأسفل`
                                            : `Move match ${m.matchNumber} down`
                                        }
                                        onClick={() => {
                                          const nextMatch = activeRound.matches[idx + 1];
                                          if (nextMatch) {
                                            onUpdateMatchup(managedTournament.id, {
                                              reorderMatches: {
                                                fromMatchId: m.id,
                                                toMatchId: nextMatch.id,
                                              },
                                            });
                                          }
                                        }}
                                        className="min-h-[32px] min-w-[32px] rounded-lg bg-[#0E1222] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-35"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </button>
                                      <select
                                        aria-label={
                                          isAr
                                            ? `مجموعة مواجهة ${m.matchNumber}`
                                            : `Match ${m.matchNumber} group`
                                        }
                                        value={m.groupName}
                                        onChange={(e) =>
                                          onUpdateMatchup(managedTournament.id, {
                                            matchId: m.id,
                                            participantAId: m.participantA?.id || null,
                                            participantBId: m.participantB?.id || null,
                                            groupName: e.target.value,
                                          })
                                        }
                                        className="min-h-[32px] bg-[#0E1222] border border-white/10 rounded-lg px-2 text-[11px] text-[#D4FF00]"
                                      >
                                        {managedActiveGroups.map((gn) => (
                                          <option key={gn} value={gn}>
                                            {translateGroupName(gn, lang)}
                                          </option>
                                        ))}
                                      </select>
                                    </>
                                  )}
                                  {activeRoundIndex > 0 && (
                                    <span className="text-[11px] text-[#D4FF00] font-semibold">
                                      {translateGroupName(m.groupName, lang)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Participants */}
                              {activeRoundIndex === 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div
                                    draggable
                                    onDragStart={(e: DragEvent<HTMLDivElement>) => {
                                      e.stopPropagation();
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', slotAKey);
                                      setDragPayload({ kind: 'slot', matchId: m.id, side: 'A' });
                                    }}
                                    onDragOver={(e: DragEvent<HTMLDivElement>) => {
                                      if (dragPayload?.kind !== 'slot') return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      e.dataTransfer.dropEffect = 'move';
                                      if (dragOverSlotKey !== slotAKey) setDragOverSlotKey(slotAKey);
                                    }}
                                    onDragLeave={() => {
                                      if (dragOverSlotKey === slotAKey) setDragOverSlotKey(null);
                                    }}
                                    onDrop={(e: DragEvent<HTMLDivElement>) => {
                                      if (dragPayload?.kind !== 'slot') return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const fromMatchId = dragPayload.matchId;
                                      const fromSide = dragPayload.side;
                                      clearDragState();
                                      if (fromMatchId !== m.id || fromSide !== 'A') {
                                        onUpdateMatchup(managedTournament.id, {
                                          swapSlots: {
                                            fromMatchId,
                                            fromSide,
                                            toMatchId: m.id,
                                            toSide: 'A',
                                          },
                                        });
                                      }
                                    }}
                                    onDragEnd={clearDragState}
                                    className={`rounded-lg p-2 border space-y-1.5 ${
                                      dragOverSlotKey === slotAKey
                                        ? 'border-[#D4FF00] bg-[#D4FF00]/15'
                                        : 'border-white/[0.08] bg-[#0E1222]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-[11px] text-slate-400 cursor-grab">
                                      <span>{isAr ? 'الطرف 1' : 'Side A'}</span>
                                      <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                                    </div>
                                    <select
                                      aria-label={
                                        isAr
                                          ? `اختيار الطرف الأول في مواجهة ${m.matchNumber}`
                                          : `Select Side A for match ${m.matchNumber}`
                                      }
                                      value={m.participantA?.id || ''}
                                      onChange={(e) =>
                                        onUpdateMatchup(managedTournament.id, {
                                          matchId: m.id,
                                          participantAId: e.target.value || null,
                                          participantBId: m.participantB?.id || null,
                                          groupName: m.groupName,
                                        })
                                      }
                                      className="w-full min-h-[36px] bg-[#070811] border border-white/10 rounded-lg px-2 text-xs text-white"
                                    >
                                      <option value="">
                                        {isAr ? '— خانة فارغة —' : '— Empty Slot —'}
                                      </option>
                                      {allRound0Participants.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} (@{p.username})
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div
                                    draggable
                                    onDragStart={(e: DragEvent<HTMLDivElement>) => {
                                      e.stopPropagation();
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', slotBKey);
                                      setDragPayload({ kind: 'slot', matchId: m.id, side: 'B' });
                                    }}
                                    onDragOver={(e: DragEvent<HTMLDivElement>) => {
                                      if (dragPayload?.kind !== 'slot') return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      e.dataTransfer.dropEffect = 'move';
                                      if (dragOverSlotKey !== slotBKey) setDragOverSlotKey(slotBKey);
                                    }}
                                    onDragLeave={() => {
                                      if (dragOverSlotKey === slotBKey) setDragOverSlotKey(null);
                                    }}
                                    onDrop={(e: DragEvent<HTMLDivElement>) => {
                                      if (dragPayload?.kind !== 'slot') return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const fromMatchId = dragPayload.matchId;
                                      const fromSide = dragPayload.side;
                                      clearDragState();
                                      if (fromMatchId !== m.id || fromSide !== 'B') {
                                        onUpdateMatchup(managedTournament.id, {
                                          swapSlots: {
                                            fromMatchId,
                                            fromSide,
                                            toMatchId: m.id,
                                            toSide: 'B',
                                          },
                                        });
                                      }
                                    }}
                                    onDragEnd={clearDragState}
                                    className={`rounded-lg p-2 border space-y-1.5 ${
                                      dragOverSlotKey === slotBKey
                                        ? 'border-[#D4FF00] bg-[#D4FF00]/15'
                                        : 'border-white/[0.08] bg-[#0E1222]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-[11px] text-slate-400 cursor-grab">
                                      <span>{isAr ? 'الطرف 2' : 'Side B'}</span>
                                      <GripVertical className="w-3.5 h-3.5 text-slate-500" />
                                    </div>
                                    <select
                                      aria-label={
                                        isAr
                                          ? `اختيار الطرف الثاني في مواجهة ${m.matchNumber}`
                                          : `Select Side B for match ${m.matchNumber}`
                                      }
                                      value={m.participantB?.id || ''}
                                      onChange={(e) =>
                                        onUpdateMatchup(managedTournament.id, {
                                          matchId: m.id,
                                          participantAId: m.participantA?.id || null,
                                          participantBId: e.target.value || null,
                                          groupName: m.groupName,
                                        })
                                      }
                                      className="w-full min-h-[36px] bg-[#070811] border border-white/10 rounded-lg px-2 text-xs text-white"
                                    >
                                      <option value="">
                                        {isAr ? '— خانة فارغة —' : '— Empty Slot —'}
                                      </option>
                                      {allRound0Participants.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} (@{p.username})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="bg-[#0E1222] border border-white/[0.08] rounded-lg px-3 py-2 truncate text-white">
                                    {m.participantA?.name ||
                                      (isAr ? 'بانتظار المتأهل' : 'Awaiting Qualifier')}
                                  </div>
                                  <div className="bg-[#0E1222] border border-white/[0.08] rounded-lg px-3 py-2 truncate text-white">
                                    {m.participantB?.name ||
                                      (isAr ? 'بانتظار المتأهل' : 'Awaiting Qualifier')}
                                  </div>
                                </div>
                              )}

                              {/* Direct Match Score & Result Entry */}
                              {m.participantA && m.participantB && (
                                <div className="bg-[#0E1222] border border-white/[0.06] rounded-lg p-2.5 space-y-2">
                                  <div className="text-[11px] font-semibold text-slate-300">
                                    {isAr ? 'تسجيل نتيجة المباراة:' : 'Enter Match Result:'}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[10px] text-slate-400 truncate mb-1">
                                        {isAr
                                          ? `نتيجة ${m.participantA.name}`
                                          : `${m.participantA.name} Score`}
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={scoreDraft.scoreA}
                                        onChange={(e) =>
                                          setScoreDrafts((prev) => ({
                                            ...prev,
                                            [m.id]: { ...scoreDraft, scoreA: e.target.value },
                                          }))
                                        }
                                        placeholder="0"
                                        className="w-full min-h-[36px] bg-[#070811] border border-white/10 rounded-lg px-2.5 text-xs text-white font-mono-num"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-slate-400 truncate mb-1">
                                        {isAr
                                          ? `نتيجة ${m.participantB.name}`
                                          : `${m.participantB.name} Score`}
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={scoreDraft.scoreB}
                                        onChange={(e) =>
                                          setScoreDrafts((prev) => ({
                                            ...prev,
                                            [m.id]: { ...scoreDraft, scoreB: e.target.value },
                                          }))
                                        }
                                        placeholder="0"
                                        className="w-full min-h-[36px] bg-[#070811] border border-white/10 rounded-lg px-2.5 text-xs text-white font-mono-num"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={
                                        savingResultId === m.id ||
                                        scoreDraft.scoreA === '' ||
                                        scoreDraft.scoreB === ''
                                      }
                                      onClick={async () => {
                                        setSavingResultId(m.id);
                                        try {
                                          const res = await onSaveMatchResult(
                                            managedTournament.id,
                                            m.id,
                                            {
                                              scoreA: Number(scoreDraft.scoreA),
                                              scoreB: Number(scoreDraft.scoreB),
                                              winnerId: scoreDraft.winnerId || null,
                                              autoAiRank: autoAiPlaceOnSave,
                                            }
                                          );
                                          if (res.ok && res.aiSummaryAr) {
                                            setAiDirectSummary(res.aiSummaryAr);
                                          }
                                        } finally {
                                          setSavingResultId(null);
                                        }
                                      }}
                                      className="flex-1 min-h-[36px] px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-[#070811] text-[11px] font-bold flex items-center justify-center gap-1.5"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>
                                        {savingResultId === m.id
                                          ? isAr
                                            ? 'جاري الحفظ وحساب الترتيب...'
                                            : 'Saving & Calculating...'
                                          : activeRoundIndex === 0 && autoAiPlaceOnSave
                                          ? isAr
                                            ? 'حفظ النتيجة + حساب الأول وفارق الأهداف بالـ AI'
                                            : 'Save Score + AI Leader & GD'
                                          : isAr
                                          ? 'حفظ النتيجة'
                                          : 'Save Score'}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Admin Schedule & Leg Controls */}
                              <div className="pt-2 border-t border-white/[0.06] space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-[#D4FF00]" />
                                    <span className="text-slate-400">
                                      {isAr ? 'الموعد:' : 'Schedule:'}
                                    </span>
                                    <span
                                      className={`font-semibold ${
                                        isUnscheduled ? 'text-[#22D3EE]' : 'text-emerald-300'
                                      }`}
                                    >
                                      {displaySchedule}
                                    </span>
                                  </div>

                                  <select
                                    aria-label={
                                      isAr
                                        ? `نوع الجولة لمواجهة ${m.matchNumber}`
                                        : `Match ${m.matchNumber} leg type`
                                    }
                                    value={m.leg || 'مباراة واحدة'}
                                    onChange={(e) =>
                                      onUpdateMatchSchedule(
                                        managedTournament.id,
                                        m.id,
                                        rawSchedule,
                                        e.target.value as BracketMatch['leg']
                                      )
                                    }
                                    className="min-h-[30px] bg-[#0E1222] border border-white/10 rounded-lg px-2 text-[11px] text-slate-200"
                                  >
                                    <option value="ذهاب">{translateLeg('ذهاب', lang)}</option>
                                    <option value="عودة">{translateLeg('عودة', lang)}</option>
                                    <option value="مباراة واحدة">
                                      {translateLeg('مباراة واحدة', lang)}
                                    </option>
                                  </select>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  <div className="relative flex-1 min-w-[150px]">
                                    <Clock className="w-3.5 h-3.5 text-slate-500 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                      type="text"
                                      value={draftSchedule}
                                      onChange={(e) =>
                                        setScheduleDrafts((prev) => ({
                                          ...prev,
                                          [m.id]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                          setSavingScheduleId(m.id);
                                          try {
                                            await onUpdateMatchSchedule(
                                              managedTournament.id,
                                              m.id,
                                              draftSchedule
                                            );
                                          } finally {
                                            setSavingScheduleId(null);
                                          }
                                        }
                                      }}
                                      placeholder={
                                        isAr
                                          ? 'حدد الموعد (مثال: الجمعة 9:00 م)'
                                          : 'Set time (e.g., Friday 9:00 PM)'
                                      }
                                      className="w-full min-h-[36px] bg-[#0E1222] border border-white/10 rounded-lg ps-8 pe-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#D4FF00]"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    disabled={savingScheduleId === m.id}
                                    onClick={async () => {
                                      setSavingScheduleId(m.id);
                                      try {
                                        const res = await onUpdateMatchSchedule(
                                          managedTournament.id,
                                          m.id,
                                          draftSchedule
                                        );
                                        if (res?.mailtoLinks?.length) {
                                          setMatchMailtoLinks((prev) => ({
                                            ...prev,
                                            [m.id]: res.mailtoLinks!,
                                          }));
                                        }
                                        if (
                                          !emailServiceConfigured &&
                                          draftSchedule.trim() &&
                                          res?.emailTargets?.length &&
                                          onSendViaGmailOAuth
                                        ) {
                                          setPendingGmailConfirm({
                                            matchLabel: `${managedTournament.title} — #${m.matchNumber}`,
                                            scheduledAt: draftSchedule.trim(),
                                            targets: res.emailTargets,
                                          });
                                        }
                                      } finally {
                                        setSavingScheduleId(null);
                                      }
                                    }}
                                    className="min-h-[36px] px-3 rounded-lg bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:bg-slate-700 text-[#070811] text-[11px] font-bold whitespace-nowrap"
                                  >
                                    {savingScheduleId === m.id
                                      ? isAr
                                        ? 'جاري الحفظ...'
                                        : 'Saving...'
                                      : isAr
                                      ? 'حفظ الموعد'
                                      : 'Save Time'}
                                  </button>

                                  {!isUnscheduled && (
                                    <button
                                      type="button"
                                      disabled={savingScheduleId === m.id}
                                      onClick={async () => {
                                        setSavingScheduleId(m.id);
                                        try {
                                          setScheduleDrafts((prev) => ({ ...prev, [m.id]: '' }));
                                          await onUpdateMatchSchedule(
                                            managedTournament.id,
                                            m.id,
                                            ''
                                          );
                                        } finally {
                                          setSavingScheduleId(null);
                                        }
                                      }}
                                      className="min-h-[36px] px-2.5 rounded-lg border border-white/10 hover:border-[#D4FF00]/40 text-[11px] text-slate-300 hover:text-[#22D3EE] whitespace-nowrap"
                                    >
                                      {isAr ? 'لم يتحدد' : 'Reset TBD'}
                                    </button>
                                  )}

                                  {(m.participantA || m.participantB) && (
                                    <button
                                      type="button"
                                      disabled={notifyingMatchId === m.id}
                                      onClick={async () => {
                                        setNotifyingMatchId(m.id);
                                        try {
                                          const res = await onNotifyMatch(
                                            managedTournament.id,
                                            m.id
                                          );
                                          if (res.mailtoLinks?.length) {
                                            setMatchMailtoLinks((prev) => ({
                                              ...prev,
                                              [m.id]: res.mailtoLinks!,
                                            }));
                                          }
                                          if (
                                            !emailServiceConfigured &&
                                            res.emailTargets?.length &&
                                            onSendViaGmailOAuth
                                          ) {
                                            setPendingGmailConfirm({
                                              matchLabel: `${managedTournament.title} — #${m.matchNumber}`,
                                              scheduledAt:
                                                draftSchedule.trim() ||
                                                m.scheduledAt ||
                                                (isAr ? 'لم يتحدد' : 'TBD'),
                                              targets: res.emailTargets,
                                            });
                                          }
                                        } finally {
                                          setNotifyingMatchId(null);
                                        }
                                      }}
                                      className="min-h-[36px] px-2.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
                                    >
                                      <Mail className="w-3.5 h-3.5" />
                                      <span>
                                        {notifyingMatchId === m.id
                                          ? isAr
                                            ? 'جاري التحضير...'
                                            : 'Preparing...'
                                          : isAr
                                          ? 'إرسال عبر Gmail'
                                          : 'Send via Gmail'}
                                      </span>
                                    </button>
                                  )}
                                </div>

                                {matchMailtoLinks[m.id]?.length ? (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    <span className="text-[10px] text-slate-400">
                                      {isAr ? 'إرسال يدوي عبر بريدك:' : 'Manual mailto links:'}
                                    </span>
                                    {matchMailtoLinks[m.id].map((link) => (
                                      <a
                                        key={link.email}
                                        href={link.url}
                                        className="px-2 py-1 rounded bg-[#0E1222] border border-white/15 hover:border-[#D4FF00] text-[10px] text-[#22D3EE]"
                                      >
                                        {isAr ? `إيميل ${link.name}` : `Email ${link.name}`}
                                      </a>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </section>

              {/* Screenshot Review Queue + Declare Winner */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <section className="lg:col-span-7 bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">
                      {isAr ? 'مراجعة صور نتائج اللاعبين' : 'Player Result Screenshots'}
                    </h2>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {isAr
                        ? `${pendingSubmissions.length} قيد الانتظار`
                        : `${pendingSubmissions.length} pending`}
                    </span>
                  </div>

                  {submissions.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">
                      {isAr
                        ? 'لا توجد صور نتائج مرفوعة حالياً.'
                        : 'No result screenshots uploaded yet.'}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {submissions.map((sub) => (
                        <div
                          key={sub.id}
                          className="bg-[#070811] border border-white/[0.08] rounded-2xl p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="text-xs text-[#D4FF00] font-medium">
                                {sub.tournamentTitle}
                              </div>
                              <div className="text-sm font-bold text-white mt-0.5">
                                {sub.matchLabel}
                              </div>
                              <div className="text-xs text-slate-400 mt-1">
                                {isAr ? 'مقدم من:' : 'Submitted by:'} {sub.submittedBy} ·{' '}
                                {isAr ? 'النتيجة:' : 'Score:'}{' '}
                                <span className="font-mono-num text-white font-semibold">
                                  {sub.scoreA} - {sub.scoreB}
                                </span>
                              </div>
                            </div>

                            <span
                              className={`text-xs font-semibold ${
                                sub.status === 'approved'
                                  ? 'text-emerald-400'
                                  : sub.status === 'rejected'
                                  ? 'text-rose-400'
                                  : 'text-[#D4FF00]'
                              }`}
                            >
                              {translateSubmissionStatus(sub.status, lang)}
                            </span>
                          </div>

                          <div className="rounded-xl overflow-hidden border border-white/10 h-44 bg-[#0E1222]">
                            <SafeImage
                              src={sub.screenshotUrl}
                              alt={sub.matchLabel}
                              className="w-full h-full object-cover"
                              fallbackTitle={
                                isAr ? 'صورة نتيجة المباراة' : 'Match Result Screenshot'
                              }
                            />
                          </div>

                          {sub.note && <p className="text-xs text-slate-300">{sub.note}</p>}

                          {sub.status === 'pending' && (
                            <div className="flex flex-wrap items-center gap-2.5 pt-1">
                              <button
                                type="button"
                                onClick={() => onReviewSubmission(sub.id, 'approved')}
                                className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#070811] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <Check className="w-4 h-4" />
                                <span>
                                  {isAr
                                    ? `اعتماد النتيجة وتأهيل (${sub.claimedWinnerName})`
                                    : `Approve & Advance (${sub.claimedWinnerName})`}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onReviewSubmission(sub.id, 'rejected')}
                                className="min-h-[44px] px-4 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <X className="w-4 h-4" />
                                <span>{isAr ? 'رفض' : 'Reject'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="lg:col-span-5 bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Award className="w-5 h-5 text-emerald-400" />
                    <span>
                      {isAr ? 'إعلان الفائز الرسمي للبطولة' : 'Declare Official Champion'}
                    </span>
                  </h2>
                  <div className="space-y-3">
                    <select
                      value={winnerTournamentId}
                      onChange={(e) => setWinnerTournamentId(e.target.value)}
                      className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-xs text-white"
                    >
                      {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={winnerNameInput}
                      onChange={(e) => setWinnerNameInput(e.target.value)}
                      placeholder={
                        isAr
                          ? 'اسم الفريق أو اللاعب المتوج بالكأس'
                          : 'Champion team or player name'
                      }
                      className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      disabled={declaring || !winnerNameInput.trim()}
                      onClick={handleDeclare}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-[#070811] font-bold text-sm transition-colors"
                    >
                      {declaring
                        ? isAr
                          ? 'جاري التتويج...'
                          : 'Declaring Champion...'
                        : isAr
                        ? 'اعتماد وإعلان البطل'
                        : 'Confirm & Crown Champion'}
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: VENUE QR CHECK-IN SCANNER (ONE READY / TEAM READY)         */}
      {/* ===================================================================== */}
      {adminSection === 'checkin' && (
        <AdminCheckinScanner
          tournaments={tournaments}
          selectedTournamentId={managedTournamentId}
          onSelectTournament={setManagedTournamentId}
          onCheckInPlayer={onCheckInPlayer}
        />
      )}

      {/* ===================================================================== */}
      {/* SECTION 4: REGISTERED PLAYERS & WHATSAPP CONTACT DIRECTORY            */}
      {/* ===================================================================== */}
      {adminSection === 'players' && (() => {
        const q = playerSearch.trim().toLowerCase();
        const filteredPlayers = playersDirectory.filter((p) => {
          if (!q) return true;
          return (
            p.displayName.toLowerCase().includes(q) ||
            p.handle.toLowerCase().includes(q) ||
            p.whatsappNumber.toLowerCase().includes(q) ||
            p.email.toLowerCase().includes(q) ||
            p.playerCode.toLowerCase().includes(q) ||
            p.city.toLowerCase().includes(q)
          );
        });
        const playersWithWhatsapp = playersDirectory.filter((p) => Boolean(p.whatsappNumber.trim()));
        const playersWithEmail = playersDirectory.filter((p) => Boolean(p.email.trim()));

        return (
          <div className="space-y-6">
            {/* Summary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5">
                <div className="text-xs text-slate-400">
                  {isAr ? 'إجمالي اللاعبين المسجلين' : 'Total Registered Players'}
                </div>
                <div className="text-2xl font-extrabold font-mono-num text-white mt-1">
                  {playersDirectory.length}
                </div>
              </div>
              <div className="bg-[#0E1222] border border-emerald-500/25 rounded-2xl p-5">
                <div className="text-xs text-slate-400">
                  {isAr ? 'أرقام واتساب متاحة' : 'WhatsApp Numbers Recorded'}
                </div>
                <div className="text-2xl font-extrabold font-mono-num text-emerald-400 mt-1">
                  {playersWithWhatsapp.length}
                </div>
              </div>
              <div className="bg-[#0E1222] border border-[#22D3EE]/25 rounded-2xl p-5">
                <div className="text-xs text-slate-400">
                  {isAr ? 'بريد Gmail مسجل' : 'Gmail Addresses'}
                </div>
                <div className="text-2xl font-extrabold font-mono-num text-[#22D3EE] mt-1">
                  {playersWithEmail.length}
                </div>
              </div>
            </div>

            {/* Search & Quick Actions */}
            <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Phone className="w-5 h-5 text-emerald-400" />
                    <span>
                      {isAr
                        ? 'دليل أرقام الواتساب وبيانات اللاعبين'
                        : 'Players WhatsApp & Profile Directory'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isAr
                      ? 'الاسم ثلاثي، اليوزر نيم، رقم الواتساب، وبريد Gmail لكل لاعب مسجل في المنصة (للإدارة فقط).'
                      : 'Triple name, username, WhatsApp number, and Gmail for every registered player (Admin only).'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onRefreshPlayers && (
                    <button
                      type="button"
                      disabled={loadingPlayers}
                      onClick={() => onRefreshPlayers()}
                      className="min-h-[40px] px-3.5 rounded-xl bg-[#070811] border border-white/15 hover:border-[#22D3EE]/50 text-xs font-bold text-white flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-[#22D3EE] ${loadingPlayers ? 'animate-spin' : ''}`} />
                      <span>{isAr ? 'تحديث القائمة' : 'Refresh'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={playersWithWhatsapp.length === 0}
                    onClick={() => {
                      const text = filteredPlayers
                        .filter((p) => p.whatsappNumber)
                        .map((p) => `${p.displayName} (@${p.handle}): ${p.whatsappNumber}`)
                        .join('\n');
                      if (navigator.clipboard && text) {
                        navigator.clipboard.writeText(text).catch(() => {});
                        setCopiedAllPhones(true);
                        window.setTimeout(() => setCopiedAllPhones(false), 2200);
                      }
                    }}
                    className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 hover:bg-emerald-500/25 disabled:opacity-40 text-xs font-bold text-emerald-300 flex items-center gap-1.5"
                  >
                    {copiedAllPhones ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>
                      {copiedAllPhones
                        ? isAr
                          ? 'تم نسخ كل الأرقام'
                          : 'Copied All'
                        : isAr
                        ? 'نسخ كل أرقام الواتساب'
                        : 'Copy All Numbers'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  placeholder={
                    isAr
                      ? 'ابحث بالاسم ثلاثي أو اليوزر نيم أو رقم الواتساب أو الجيميل أو الكود...'
                      : 'Search by triple name, username, WhatsApp, Gmail, or code...'
                  }
                  className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl ps-10 pe-4 text-sm text-white focus:outline-none focus:border-[#D4FF00]"
                />
              </div>

              {filteredPlayers.length === 0 ? (
                <div className="bg-[#070811] border border-white/[0.06] rounded-xl p-8 text-center text-sm text-slate-400">
                  {loadingPlayers
                    ? isAr
                      ? 'جاري تحميل بيانات وأرقام اللاعبين...'
                      : 'Loading player directory...'
                    : isAr
                    ? 'لا توجد نتائج مطابقة للبحث حالياً.'
                    : 'No matching registered players found.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredPlayers.map((p) => {
                    const waUrl = buildWhatsappChatUrl(p.whatsappNumber);
                    return (
                      <div
                        key={p.id}
                        className="bg-[#070811] border border-white/10 hover:border-white/20 rounded-xl p-4 space-y-3 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <UserCheck className="w-4 h-4 text-[#D4FF00] shrink-0" />
                              <h3 className="text-sm font-extrabold text-white truncate">
                                {p.displayName || p.handle}
                              </h3>
                            </div>
                            <div className="text-xs font-mono-num text-[#22D3EE] mt-0.5 truncate">
                              @{p.handle} {p.playerCode ? `· ${p.playerCode}` : ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {typeof p.tournamentsCount === 'number' && (
                              <span className="text-[11px] font-mono-num font-bold px-2 py-0.5 rounded bg-white/5 text-slate-300">
                                {isAr ? `${p.tournamentsCount} بطولة` : `${p.tournamentsCount} T`}
                              </span>
                            )}
                            {p.city && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-slate-400">
                                {p.city}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-xs">
                          <div className="flex items-center justify-between gap-2 bg-[#0E1222] border border-white/[0.06] rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span dir="ltr" className="font-mono-num text-white truncate">
                                {p.whatsappNumber || (isAr ? 'غير مسجل' : 'Not provided')}
                              </span>
                            </div>
                            {p.whatsappNumber && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (navigator.clipboard) {
                                      navigator.clipboard.writeText(p.whatsappNumber).catch(() => {});
                                      setCopiedPhoneId(p.id);
                                      window.setTimeout(() => setCopiedPhoneId(null), 1800);
                                    }
                                  }}
                                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[11px] font-bold text-slate-200 flex items-center gap-1"
                                >
                                  {copiedPhoneId === p.id ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  <span>{copiedPhoneId === p.id ? (isAr ? 'تم' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
                                </button>
                                {waUrl && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-[11px] font-bold text-emerald-300 flex items-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                                  </a>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 bg-[#0E1222] border border-white/[0.06] rounded-lg px-3 py-2">
                            <Mail className="w-3.5 h-3.5 text-[#F472B6] shrink-0" />
                            <span dir="ltr" className="font-mono-num text-slate-300 truncate">
                              {p.email || (isAr ? 'لا يوجد بريد' : 'No email')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        );
      })()}

      {pendingGmailConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#0E1222] border border-[#D4FF00]/35 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-[#070811]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#D4FF00]/15 border border-[#D4FF00]/30 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-[#D4FF00]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {isAr ? 'تأكيد الإرسال عبر Gmail' : 'Confirm Gmail Dispatch'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {pendingGmailConfirm.matchLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={sendingGmailOAuth}
                onClick={() => setPendingGmailConfirm(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                aria-label={isAr ? 'إغلاق' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="rounded-xl bg-[#070811] border border-white/[0.08] p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">
                    {isAr ? 'حساب المُرسِل:' : 'Sender Gmail:'}
                  </span>
                  {gmailConnectedEmail ? (
                    <span dir="ltr" className="font-mono-num font-bold text-emerald-300">
                      {gmailConnectedEmail}
                    </span>
                  ) : (
                    <span className="text-amber-300 font-semibold">
                      {isAr
                        ? 'سيتم ربط حساب Gmail عند التأكيد'
                        : 'Will connect your Gmail upon confirmation'}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">
                    {isAr ? 'الموعد المُرسَل:' : 'Match Schedule:'}
                  </span>
                  <span className="font-bold text-[#D4FF00]">
                    {pendingGmailConfirm.scheduledAt}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-slate-200">
                  {isAr
                    ? `المستلمون (${pendingGmailConfirm.targets.length}):`
                    : `Recipients (${pendingGmailConfirm.targets.length}):`}
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {pendingGmailConfirm.targets.map((target) => (
                    <div
                      key={target.email}
                      className="rounded-xl bg-[#070811] border border-white/[0.08] px-3.5 py-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white">{target.name}</span>
                        <span dir="ltr" className="font-mono-num text-[11px] text-[#22D3EE]">
                          {target.email}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {target.subject}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.08] bg-[#070811]">
              <button
                type="button"
                disabled={sendingGmailOAuth}
                onClick={() => setPendingGmailConfirm(null)}
                className="min-h-[38px] px-4 rounded-xl border border-white/15 text-xs font-semibold text-slate-300 hover:bg-white/5"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={sendingGmailOAuth}
                onClick={async () => {
                  if (!onSendViaGmailOAuth) return;
                  setSendingGmailOAuth(true);
                  try {
                    const result = await onSendViaGmailOAuth(pendingGmailConfirm.targets);
                    if (result.sent > 0 || result.failed === 0) {
                      setPendingGmailConfirm(null);
                    }
                  } finally {
                    setSendingGmailOAuth(false);
                  }
                }}
                className="min-h-[38px] px-4 rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:bg-slate-700 text-[#070811] text-xs font-bold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {sendingGmailOAuth
                    ? isAr
                      ? 'جاري الإرسال عبر Gmail...'
                      : 'Sending via Gmail...'
                    : gmailConnectedEmail
                    ? isAr
                      ? 'تأكيد وإرسال عبر Gmail'
                      : 'Confirm & Send via Gmail'
                    : isAr
                    ? 'ربط Gmail وتأكيد الإرسال'
                    : 'Connect Gmail & Send'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
