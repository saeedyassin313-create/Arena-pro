import { useEffect, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  LogIn,
  Mail,
  Phone,
  ShieldCheck,
  Trophy,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { translateFormatLabel, translateGroupName } from '../i18n/helpers.ts';
import type {
  BracketMatch,
  BracketParticipant,
  MatchFormatTag,
  PlayerProfile,
  TeamClan,
  TeamRosterMember,
  Tournament,
} from '../types.ts';
import { getTeamCheckInSummary } from '../utils/checkin.ts';
import { usePlayerLookup, type PlayerLookupState } from '../utils/playerLookup.ts';
import {
  hasTripleName,
  isValidEmailAddress,
  isValidWhatsappNumber,
  sanitizeWhatsappInput,
} from '../utils/validation.ts';

function PlayerLookupBadge({
  lookup,
  isAr,
  notFoundText,
}: {
  lookup: PlayerLookupState;
  isAr: boolean;
  notFoundText?: string;
}) {
  if (lookup.status === 'idle') return null;
  if (lookup.status === 'checking') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-[#22D3EE] mt-1">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        <span>{isAr ? 'جاري التحقق من الـ ID...' : 'Verifying player ID...'}</span>
      </div>
    );
  }
  if (lookup.status === 'valid' && lookup.user) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 mt-1 truncate">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="truncate">
          {isAr ? 'تم التحقق:' : 'Verified:'}{' '}
          <strong className="text-white">{lookup.user.displayName}</strong>{' '}
          <span className="font-mono-num text-[#22D3EE]">
            (@{lookup.user.handle} · {lookup.user.playerCode})
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-rose-400 mt-1">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <span>
        {notFoundText ||
          (isAr
            ? 'هذا الـ ID أو اليوزر نيم غير مسجل في المنصة.'
            : 'This ID or username is not registered on the platform.')}
      </span>
    </div>
  );
}

interface RegisterModalProps {
  tournament: Tournament | null;
  profile: PlayerProfile;
  team: TeamClan;
  onClose: () => void;
  onGoogleSignIn?: () => Promise<void>;
  onConfirm: (
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
  ) => Promise<{ ok: boolean; error?: string } | void>;
}

const normalizeArenaKey = (value?: string) =>
  String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();

const isPlaceholderArenaValue = (value?: string) => {
  const k = normalizeArenaKey(value);
  return (
    !k ||
    k === 'player_guest' ||
    k === 'player' ||
    k === 'arena-1042' ||
    k === 'arena-player' ||
    k === 'guest'
  );
};

export function RegisterModal({
  tournament,
  profile,
  team,
  onClose,
  onGoogleSignIn,
  onConfirm,
}: RegisterModalProps) {
  const { lang, isAr } = useLanguage();
  const [teamName, setTeamName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [teammateUsername, setTeammateUsername] = useState<string>('');
  const [squadMates, setSquadMates] = useState<TeamRosterMember[]>([
    { name: '', username: '', role: 'لاعب #2' },
    { name: '', username: '', role: 'لاعب #3' },
    { name: '', username: '', role: 'لاعب #4' },
  ]);
  const [email, setEmail] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tournamentId = tournament?.id || null;

  useEffect(() => {
    if (!tournamentId || !tournament) return;
    const cleanHandle = !isPlaceholderArenaValue(profile.handle) ? profile.handle : '';
    const cleanCode = !isPlaceholderArenaValue(profile.playerCode) ? profile.playerCode : '';
    const cleanDisplayName =
      profile.displayName &&
      profile.displayName !== 'لاعب ضيف' &&
      profile.displayName !== 'Player Guest'
        ? profile.displayName
        : '';

    const defaultTeamName =
      tournament.modeTag === '1v1'
        ? cleanDisplayName || cleanHandle || team.name || ''
        : team.name || '';

    setTeamName(defaultTeamName);
    setUsername(cleanHandle || cleanCode || '');
    setTeammateUsername('');
    setSquadMates([
      { name: '', username: '', role: isAr ? 'لاعب #2' : 'Player #2' },
      { name: '', username: '', role: isAr ? 'لاعب #3' : 'Player #3' },
      { name: '', username: '', role: isAr ? 'لاعب #4' : 'Player #4' },
    ]);
    setEmail(profile.email || '');
    setFormError(null);
    // Only reset form fields when opening a different tournament modal (never wipe user input during 5s background sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const is2v2 = tournament?.modeTag === '2v2';
  const is4v4 = tournament?.modeTag === '4v4';

  const captainLookup = usePlayerLookup(username, Boolean(tournament));
  const partnerLookup = usePlayerLookup(teammateUsername, Boolean(tournament && is2v2));
  const mate1Lookup = usePlayerLookup(squadMates[0]?.username || '', Boolean(tournament && is4v4));
  const mate2Lookup = usePlayerLookup(squadMates[1]?.username || '', Boolean(tournament && is4v4));
  const mate3Lookup = usePlayerLookup(squadMates[2]?.username || '', Boolean(tournament && is4v4));
  const squadLookups = [mate1Lookup, mate2Lookup, mate3Lookup];

  if (!tournament) return null;

  const alreadyRegistered = profile.registeredTournamentIds.includes(tournament.id);
  const isClosed = !tournament.registrationOpen;
  const isFull = tournament.registeredCount >= tournament.maxSlots;
  const mode: 'solo' | 'team' = tournament.modeTag === '1v1' ? 'solo' : 'team';

  const savedFriends = team.members.filter(
    (m) =>
      m.id !== 'm-1' &&
      normalizeArenaKey(m.handle) !== normalizeArenaKey(profile.handle)
  );

  const enteredCaptainKey = normalizeArenaKey(username);
  const matchesOwnAccount =
    Boolean(enteredCaptainKey) &&
    !isPlaceholderArenaValue(username) &&
    ((!isPlaceholderArenaValue(profile.handle) &&
      normalizeArenaKey(profile.handle) === enteredCaptainKey) ||
      (!isPlaceholderArenaValue(profile.playerCode) &&
        normalizeArenaKey(profile.playerCode) === enteredCaptainKey) ||
      (Boolean(profile.email) && normalizeArenaKey(profile.email) === enteredCaptainKey));

  const isCaptainSelfEntry =
    Boolean(enteredCaptainKey) &&
    !isPlaceholderArenaValue(username) &&
    enteredCaptainKey.length >= 2 &&
    (matchesOwnAccount ||
      !profile.isGoogleSignedIn ||
      isPlaceholderArenaValue(profile.handle));

  const captainEffectiveStatus: PlayerLookupState =
    captainLookup.status === 'valid'
      ? captainLookup
      : isCaptainSelfEntry
      ? {
          status: 'valid',
          user: {
            uid: profile.id,
            displayName:
              profile.displayName && profile.displayName !== 'لاعب ضيف'
                ? profile.displayName
                : username.trim(),
            handle: username.trim().replace(/^@+/, ''),
            playerCode: !isPlaceholderArenaValue(profile.playerCode)
              ? profile.playerCode
              : 'ARENA-PLAYER',
            isOnline: true,
          },
        }
      : captainLookup;

  const missingTeamName = !teamName.trim();
  const missingUsername = !username.trim();
  const missing2v2Mate = is2v2 && !teammateUsername.trim();
  const missing4v4Mates = is4v4 && squadMates.some((m) => !(m.username || '').trim());

  const partnerInvalid = is2v2 && !missing2v2Mate && partnerLookup.status === 'invalid';
  const squadInvalid = is4v4 && squadLookups.some((l) => l.status === 'invalid');

  const canonicalKey = (raw: string, lookup: PlayerLookupState) =>
    (lookup.status === 'valid' && lookup.user ? lookup.user.handle : raw)
      .trim()
      .replace(/^@+/, '')
      .toLowerCase();

  const allEnteredHandles = [
    canonicalKey(username, captainEffectiveStatus),
    ...(is2v2 && teammateUsername.trim() ? [canonicalKey(teammateUsername, partnerLookup)] : []),
    ...(is4v4
      ? squadMates
          .map((m, idx) =>
            (m.username || '').trim() ? canonicalKey(m.username || '', squadLookups[idx]) : ''
          )
          .filter(Boolean)
      : []),
  ].filter(Boolean);
  const hasDuplicateTeammateHandle = new Set(allEnteredHandles).size < allEnteredHandles.length;

  const trimmedEmail = email.trim();
  const invalidEmail = Boolean(trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail));

  const buildRosterPayload = (): TeamRosterMember[] => {
    const captainHandle = captainEffectiveStatus.user?.handle || username.trim().replace(/^@+/, '');
    const list: TeamRosterMember[] = [
      {
        name: captainEffectiveStatus.user?.displayName || profile.displayName || captainHandle,
        username: captainHandle,
        role: isAr ? 'قائد الفريق' : 'Captain',
      },
    ];
    if (is2v2 && teammateUsername.trim()) {
      const partnerHandle = partnerLookup.user?.handle || teammateUsername.trim().replace(/^@+/, '');
      list.push({
        name: partnerLookup.user?.displayName || partnerHandle,
        username: partnerHandle,
        role: isAr ? 'شريك 2v2' : '2v2 Partner',
      });
    } else if (is4v4) {
      squadMates.forEach((m, idx) => {
        const lookup = squadLookups[idx];
        const handle = lookup.user?.handle || (m.username || '').trim().replace(/^@+/, '');
        const name = m.name.trim() || lookup.user?.displayName || handle;
        if (handle) {
          list.push({
            name,
            username: handle,
            role: isAr ? `لاعب #${idx + 2}` : `Player #${idx + 2}`,
          });
        }
      });
    }
    return list;
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (alreadyRegistered) {
      setFormError(
        isAr
          ? 'أنت مسجل بالفعل في هذه البطولة (يُسمح بالتسجيل مرة واحدة فقط).'
          : 'You are already registered in this tournament (once only).'
      );
      return;
    }
    if (isClosed) {
      setFormError(
        isAr
          ? 'التسجيل مغلق حالياً من الإدارة — يجب فتح التسجيل من لوحة التحكم أولاً.'
          : 'Registration is currently closed by Admin.'
      );
      return;
    }
    if (isFull) {
      setFormError(
        isAr
          ? 'اكتمل العدد الأقصى للمشاركين في هذه البطولة.'
          : 'Tournament slots are completely full.'
      );
      return;
    }
    if (missingTeamName) {
      setFormError(
        isAr
          ? tournament.modeTag === '1v1'
            ? 'يرجى كتابة اسمك أو اسم الفريق المشارك.'
            : 'يرجى كتابة اسم الفريق قبل تأكيد التسجيل.'
          : 'Please enter a team/player name before confirming.'
      );
      return;
    }
    if (missingUsername || isPlaceholderArenaValue(username) || enteredCaptainKey.length < 2) {
      setFormError(
        isAr
          ? 'يرجى إدخال اليوزر نيم أو ID صحيح خاص بك (حرفان على الأقل).'
          : 'Please enter a valid username or Player ID (at least 2 characters).'
      );
      return;
    }
    if (!isCaptainSelfEntry && captainLookup.status === 'invalid') {
      setFormError(
        isAr
          ? 'معرف القائد غير مسجل — استخدم اليوزر نيم الخاص بحسابك أو احفظه من «ملفي وفريقي».'
          : 'Captain ID is not registered — use your own account username or save it in Profile & Team.'
      );
      return;
    }
    if (missing2v2Mate) {
      setFormError(
        isAr
          ? 'في بطولات 2v2 يجب إدخال اليوزر نيم أو ID اللاعب المرافق معك.'
          : 'In 2v2 tournaments you must enter your teammate username or Player ID.'
      );
      return;
    }
    if (is2v2 && (partnerLookup.status === 'checking' || captainLookup.status === 'checking')) {
      setFormError(
        isAr
          ? 'جاري التحقق من معرفات اللاعبين... حاول مرة أخرى بعد لحظة.'
          : 'Verifying player IDs... please try again in a moment.'
      );
      return;
    }
    if (partnerInvalid) {
      setFormError(
        isAr
          ? 'اللاعب المرافق غير مسجل في المنصة — يجب إدخال يوزر نيم أو ID صحيح للاعب مسجل.'
          : 'Teammate is not registered on the platform — enter a valid registered username or Player ID.'
      );
      return;
    }
    if (missing4v4Mates) {
      setFormError(
        isAr
          ? 'في بطولات 4v4 يجب إدخال اليوزر نيم أو ID لجميع اللاعبين الثلاثة.'
          : 'In 4v4 tournaments you must enter usernames or IDs for all 3 teammates.'
      );
      return;
    }
    if (is4v4 && squadLookups.some((l) => l.status === 'checking')) {
      setFormError(
        isAr
          ? 'جاري التحقق من معرفات لاعبي الفريق... حاول بعد لحظة.'
          : 'Verifying squad IDs... please try again in a moment.'
      );
      return;
    }
    if (squadInvalid) {
      setFormError(
        isAr
          ? 'أحد لاعبي الفريق غير مسجل في المنصة — أدخل يوزر نيم أو ID صحيح لكل لاعب.'
          : 'One or more teammates are not registered — enter valid registered IDs.'
      );
      return;
    }
    if (hasDuplicateTeammateHandle) {
      setFormError(
        isAr
          ? 'لا يمكن تكرار نفس اليوزر نيم داخل نفس الفريق — أدخل لاعباً مختلفاً.'
          : 'Duplicate username detected within your team — each player must be unique.'
      );
      return;
    }
    if (invalidEmail) {
      setFormError(
        isAr ? 'يرجى إدخال صيغة بريد إلكتروني صحيحة.' : 'Please enter a valid email address.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const captainHandle = captainEffectiveStatus.user?.handle || username.trim().replace(/^@+/, '');
      const partnerHandle = partnerLookup.user?.handle || teammateUsername.trim().replace(/^@+/, '');
      const captainDisplay =
        captainEffectiveStatus.user?.displayName ||
        (profile.displayName && profile.displayName !== 'لاعب ضيف'
          ? profile.displayName
          : captainHandle);

      const res = await onConfirm(tournament.id, {
        mode,
        teamName: teamName.trim(),
        members: buildRosterPayload(),
        username: captainHandle,
        teammateUsername: is2v2 ? partnerHandle : undefined,
        email: trimmedEmail || undefined,
        isSelfCaptain: isCaptainSelfEntry,
        captainDisplayName: captainDisplay,
      });
      if (res && !res.ok && res.error) {
        setFormError(res.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const quickFill4v4Mate = (handle: string, name?: string) => {
    setFormError(null);
    setSquadMates((prev) => {
      const emptyIdx = prev.findIndex((m) => !(m.username || '').trim());
      if (emptyIdx === -1) return prev;
      return prev.map((m, i) =>
        i === emptyIdx ? { ...m, username: handle, name: name || m.name || handle } : m
      );
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-lg bg-[#0E1222] border border-white/15 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto relative">
        <div className="h-1 arena-gradient-bar rounded-full -mt-2 mb-4" />
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-[#22D3EE] font-semibold mb-1">
              {isAr
                ? `التسجيل لمرة واحدة فقط · نظام ${tournament.modeTag} · 8 مجموعات (4 فرق/مجموعة)`
                : `One-Time Registration · ${tournament.modeTag} · 8 Groups (4 Teams/Group)`}
            </p>
            <h3 className="text-lg font-bold text-white leading-snug">{tournament.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 pb-4 border-b border-white/[0.08]">
          <span>{translateFormatLabel(tournament.formatLabel, lang)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {isAr ? 'المكان:' : 'Venue:'} {tournament.venueName}
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-[#D4FF00] font-semibold">
            {isAr ? 'الجائزة:' : 'Prize:'} {tournament.prizePool}
          </span>
        </div>

        {!profile.isGoogleSignedIn && onGoogleSignIn && (
          <div className="mt-4 bg-[#070811] border border-[#22D3EE]/35 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-300">
              {isAr
                ? 'سجل بـ Google لحفظ مشاركتك في البطولة على كل الأجهزة.'
                : 'Sign in with Google to keep your entry synced across devices.'}
            </span>
            <button
              type="button"
              onClick={() => onGoogleSignIn()}
              className="min-h-[34px] px-3 rounded-lg bg-[#22D3EE] hover:bg-[#38BDF8] text-[#070811] text-[11px] font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isAr ? 'دخول Google' : 'Google Sign-In'}</span>
            </button>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {/* Format Badge Explaining Exact Required Players */}
          <div className="bg-[#070811] border border-[#22D3EE]/30 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-[#22D3EE] shrink-0" />
              <span>
                {is2v2
                  ? isAr
                    ? 'بطولة 2v2: يجب إضافة لاعب واحد فقط معك (إجمالي لاعبان)'
                    : '2v2 Format: You must add exactly 1 teammate (2 players total)'
                  : is4v4
                  ? isAr
                    ? 'بطولة 4v4: يجب إضافة 3 لاعبين معك (إجمالي 4 لاعبين)'
                    : '4v4 Format: You must add exactly 3 teammates (4 players total)'
                  : isAr
                  ? 'بطولة 1v1: لاعب واحد (أنت فقط)'
                  : '1v1 Format: Solo entry (Captain only)'}
              </span>
            </span>
          </div>

          {/* Required Team / Participant Name */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="register-team-name" className="block text-xs font-bold text-[#D4FF00]">
                {isAr
                  ? tournament.modeTag === '1v1'
                    ? 'الاسم الظاهر في جدول البطولة (مطلوب)'
                    : 'اسم الفريق (مطلوب — يظهر في المجموعات والأدوار الإقصائية)'
                  : tournament.modeTag === '1v1'
                  ? 'Display Name in Bracket (Required)'
                  : 'Team Name (Required — Shown in Groups & Knockout Tree)'}
              </label>
              {team.name && teamName !== team.name && (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setTeamName(team.name);
                  }}
                  className="text-[11px] text-[#22D3EE] hover:underline shrink-0"
                >
                  {isAr ? `استخدام "${team.name}"` : `Use "${team.name}"`}
                </button>
              )}
            </div>
            <input
              id="register-team-name"
              type="text"
              value={teamName}
              onChange={(e) => {
                setFormError(null);
                setTeamName(e.target.value);
              }}
              placeholder={isAr ? 'مثال: صقور المعادي أو Team Legends' : 'e.g., Maadi Falcons'}
              className="w-full min-h-[44px] bg-[#070811] border border-[#D4FF00]/40 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-[#D4FF00]"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1.5">
              {isAr
                ? 'اليوزر نيم أو ID الخاص بك — اللاعب #1 / قائد الفريق (مطلوب)'
                : 'Your Username or Player ID — Player #1 / Captain (Required)'}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setFormError(null);
                setUsername(e.target.value);
              }}
              placeholder={isAr ? 'مثال: Kareem_EG أو ARENA-1234' : 'e.g., Kareem_EG or ARENA-1234'}
              className={`w-full min-h-[44px] bg-[#070811] border rounded-xl px-3.5 text-sm text-white font-mono-num focus:outline-none ${
                captainEffectiveStatus.status === 'valid'
                  ? 'border-emerald-500/60 focus:border-emerald-400'
                  : captainEffectiveStatus.status === 'invalid'
                  ? 'border-rose-500/60 focus:border-rose-400'
                  : 'border-white/15 focus:border-[#D4FF00]'
              }`}
            />
            <PlayerLookupBadge
              lookup={captainEffectiveStatus}
              isAr={isAr}
              notFoundText={
                isAr
                  ? 'أدخل اليوزر نيم الخاص بك (حرفين على الأقل) أو ID مسجل في المنصة.'
                  : 'Enter your username (at least 2 chars) or a registered Player ID.'
              }
            />
          </div>

          {/* 2v2: STRICTLY 1 Required Teammate */}
          {is2v2 && (
            <div className="bg-[#070811] border border-[#06B6D4]/35 rounded-xl p-3.5 space-y-2">
              <label className="block text-xs text-[#22D3EE] font-bold">
                {isAr
                  ? 'اللاعب المرافق معك (اللاعب #2 — مطلوب لاعب واحد فقط لـ 2v2)'
                  : 'Your Teammate — Player #2 (Exactly 1 Partner Required for 2v2)'}
              </label>
              <input
                type="text"
                value={teammateUsername}
                onChange={(e) => {
                  setFormError(null);
                  setTeammateUsername(e.target.value);
                }}
                placeholder={
                  isAr
                    ? 'أدخل اليوزر نيم أو ID الصحيح للاعب الثاني (مثال: ARENA-1234)'
                    : "Enter partner's registered @username or Player ID"
                }
                className={`w-full min-h-[44px] bg-[#0E1222] border rounded-xl px-3.5 text-sm text-white font-mono-num focus:outline-none ${
                  partnerLookup.status === 'valid'
                    ? 'border-emerald-500/60 focus:border-emerald-400'
                    : partnerLookup.status === 'invalid'
                    ? 'border-rose-500/60 focus:border-rose-400'
                    : 'border-[#06B6D4]/45 focus:border-[#D4FF00]'
                }`}
              />
              <PlayerLookupBadge lookup={partnerLookup} isAr={isAr} />
              {savedFriends.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400">
                    {isAr ? 'اختيار سريع من أصدقائك:' : 'Quick pick from your friends:'}
                  </span>
                  {savedFriends.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setTeammateUsername(m.handle);
                      }}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#0E1222] border border-white/10 hover:border-[#22D3EE]/50 text-[11px] text-slate-200 font-mono-num inline-flex items-center gap-1.5"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          m.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                        }`}
                      />
                      <span>@{m.handle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4v4: STRICTLY 3 Required Teammates (4 players total) */}
          {is4v4 && (
            <div className="bg-[#070811] border border-[#06B6D4]/35 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#22D3EE] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {isAr
                      ? 'اللاعبون الثلاثة معك (مطلوب 3 لاعبين لاكتمال فريق 4v4)'
                      : '3 Required Teammates (Total 4 Players for 4v4)'}
                  </span>
                </span>
              </div>

              {savedFriends.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">
                    {isAr ? 'تعبئة سريعة:' : 'Quick fill:'}
                  </span>
                  {savedFriends.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => quickFill4v4Mate(m.handle, m.name)}
                      className="min-h-[28px] px-2 py-0.5 rounded-lg bg-[#0E1222] border border-white/10 hover:border-[#22D3EE]/50 text-[11px] text-slate-200 font-mono-num inline-flex items-center gap-1.5"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          m.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                        }`}
                      />
                      <span>+{m.handle}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2.5">
                {squadMates.map((member, idx) => {
                  const mateLookup = squadLookups[idx];
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-5">
                          <input
                            type="text"
                            value={member.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormError(null);
                              setSquadMates((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, name: val } : item))
                              );
                            }}
                            placeholder={
                              mateLookup.user?.displayName ||
                              (isAr ? `اسم اللاعب #${idx + 2} (اختياري)` : `Player #${idx + 2} Name`)
                            }
                            className="w-full min-h-[42px] bg-[#0E1222] border border-white/10 rounded-lg px-2.5 text-xs text-white focus:outline-none focus:border-[#22D3EE]"
                          />
                        </div>
                        <div className="sm:col-span-7">
                          <input
                            type="text"
                            value={member.username || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormError(null);
                              setSquadMates((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, username: val } : item))
                              );
                            }}
                            placeholder={
                              isAr
                                ? `يوزر نيم أو ID اللاعب #${idx + 2} *`
                                : `Player #${idx + 2} @username or ID *`
                            }
                            className={`w-full min-h-[42px] bg-[#0E1222] border rounded-lg px-2.5 text-xs text-white font-mono-num focus:outline-none ${
                              mateLookup.status === 'valid'
                                ? 'border-emerald-500/60 focus:border-emerald-400'
                                : mateLookup.status === 'invalid'
                                ? 'border-rose-500/60 focus:border-rose-400'
                                : 'border-[#06B6D4]/40 focus:border-[#D4FF00]'
                            }`}
                          />
                        </div>
                      </div>
                      <PlayerLookupBadge lookup={mateLookup} isAr={isAr} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasDuplicateTeammateHandle && (
            <p className="text-xs text-rose-400 font-medium">
              {isAr
                ? 'لا يمكن تكرار نفس اليوزر نيم داخل نفس الفريق — أدخل يوزر نيم مختلف لكل لاعب.'
                : 'Duplicate username detected within your team — each player must have a unique handle.'}
            </p>
          )}

          <div>
            <label htmlFor="register-email-input" className="flex items-center gap-1.5 text-xs text-slate-300 mb-1.5">
              <Mail className="w-3.5 h-3.5 text-[#F472B6]" />
              <span>
                {isAr
                  ? 'بريد Gmail (لاستلام مجموعتك ومواعيد ماتشاتك)'
                  : 'Gmail Address (To receive your group & match schedule)'}
              </span>
            </label>
            <input
              id="register-email-input"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => {
                setFormError(null);
                setEmail(e.target.value);
              }}
              placeholder="name@gmail.com"
              className="w-full min-h-[44px] bg-[#070811] border border-white/15 rounded-xl px-3.5 text-sm text-white font-mono-num focus:outline-none focus:border-[#22D3EE] text-left"
            />
            {invalidEmail ? (
              <p className="text-[11px] text-rose-400 mt-1">
                {isAr ? 'يرجى إدخال صيغة بريد إلكتروني صحيحة.' : 'Please enter a valid email address.'}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">
                {isAr
                  ? 'تُرسل إليك رسالة تحتوي على مجموعتك وموعد كل مباراة فور تحديدها من الإدارة.'
                  : 'You will receive an email with your assigned group and match times once set by Admin.'}
              </p>
            )}
          </div>

          <div className="bg-[#070811] border border-white/[0.08] rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">
                {isAr ? 'توزيع المجموعات:' : 'Group Placement:'}
              </span>
              <span className="text-slate-200 text-end">
                {isAr ? 'عشوائي ضمن 8 مجموعات (4 فرق/مجموعة)' : 'Random within 8 Groups (4 Teams each)'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">{isAr ? 'سياسة التسجيل:' : 'Registration Policy:'}</span>
              <span className="text-[#F472B6] font-semibold">
                {isAr ? 'مرة واحدة فقط لكل لاعب' : 'Once Only Per Player'}
              </span>
            </div>
          </div>

          {formError && (
            <div
              role="alert"
              className="bg-rose-950/75 border border-rose-500/45 rounded-xl px-3.5 py-2.5 flex items-start gap-2 text-xs text-rose-200 font-semibold"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className={`flex-1 min-h-[48px] rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-colors ${
              isClosed || isFull || alreadyRegistered
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                : 'bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:opacity-60 text-[#070811]'
            }`}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>
              {isClosed
                ? isAr
                  ? 'التسجيل مغلق من الليدر'
                  : 'Registration Closed'
                : isFull
                ? isAr
                  ? 'اكتمل عدد المقاعد'
                  : 'Tournament Full'
                : alreadyRegistered
                ? isAr
                  ? 'مسجل بالفعل (مرة واحدة فقط)'
                  : 'Already Registered (Once Only)'
                : submitting
                ? isAr
                  ? 'جاري تسجيل الفريق...'
                  : 'Registering Team...'
                : isAr
                ? 'تأكيد تسجيل الفريق وإدراجه في مجموعة'
                : 'Confirm Team Registration'}
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-5 rounded-xl border border-white/10 text-slate-300 hover:text-white text-sm font-medium transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ScreenshotModalProps {
  tournament: Tournament | null;
  match: BracketMatch | null;
  onClose: () => void;
  onSubmit: (payload: {
    tournamentId: string;
    matchId: string;
    claimedWinnerId: string;
    scoreA: number;
    scoreB: number;
    screenshotUrl: string;
    note: string;
  }) => Promise<void>;
}

export function ScreenshotModal({
  tournament,
  match,
  onClose,
  onSubmit,
}: ScreenshotModalProps) {
  const { isAr } = useLanguage();
  const [winnerId, setWinnerId] = useState<string>(match?.participantA?.id || '');
  const [scoreA, setScoreA] = useState<number>(2);
  const [scoreB, setScoreB] = useState<number>(1);
  const [note, setNote] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>(
    '/assets/aistudio/FC27-ut-guide_09aef642.jpg'
  );
  const [submitting, setSubmitting] = useState(false);

  const matchId = match?.id || null;
  const defaultWinnerId = match?.participantA?.id || match?.participantB?.id || '';
  useEffect(() => {
    if (!matchId) return;
    setWinnerId(defaultWinnerId);
    setScoreA(2);
    setScoreB(1);
    setNote('');
    setPreviewUrl('/assets/aistudio/FC27-ut-guide_09aef642.jpg');
  }, [matchId, defaultWinnerId]);

  if (!tournament || !match) return null;

  const selectedWinner = winnerId || match.participantA?.id || match.participantB?.id || '';

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFormSubmit = async () => {
    if (!selectedWinner) return;
    setSubmitting(true);
    try {
      await onSubmit({
        tournamentId: tournament.id,
        matchId: match.id,
        claimedWinnerId: selectedWinner,
        scoreA,
        scoreB,
        screenshotUrl: previewUrl,
        note,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-lg bg-[#0E1222] border border-white/15 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="h-1 arena-gradient-bar rounded-full -mt-2 mb-4" />
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-[#22D3EE] font-semibold mb-1">
              {isAr
                ? `رفع نتيجة المواجهة #${match.matchNumber}`
                : `Upload Result for Match #${match.matchNumber}`}
            </p>
            <h3 className="text-lg font-bold text-white">
              {match.participantA?.name || (isAr ? 'متأهل أ' : 'Qualifier A')}{' '}
              {isAr ? 'ضد' : 'vs'}{' '}
              {match.participantB?.name || (isAr ? 'متأهل ب' : 'Qualifier B')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-2">
              {isAr ? 'تحديد الطرف الفائز' : 'Select Match Winner'}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[match.participantA, match.participantB].map((p) => {
                if (!p) return null;
                const active = selectedWinner === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setWinnerId(p.id)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-sm font-medium truncate transition-colors ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300'
                        : 'bg-[#070811] border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 truncate">
                {isAr
                  ? `نقاط ${match.participantA?.name || 'الطرف الأول'}`
                  : `${match.participantA?.name || 'Side A'} Score`}
              </label>
              <input
                type="number"
                min={0}
                max={99}
                value={scoreA}
                onChange={(e) => setScoreA(Number(e.target.value))}
                className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-white font-mono-num text-sm focus:outline-none focus:border-[#D4FF00]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 truncate">
                {isAr
                  ? `نقاط ${match.participantB?.name || 'الطرف الثاني'}`
                  : `${match.participantB?.name || 'Side B'} Score`}
              </label>
              <input
                type="number"
                min={0}
                max={99}
                value={scoreB}
                onChange={(e) => setScoreB(Number(e.target.value))}
                className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-white font-mono-num text-sm focus:outline-none focus:border-[#D4FF00]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">
              {isAr ? 'لقطة شاشة النتيجة (Screenshot)' : 'Result Screenshot'}
            </label>
            <label className="flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 rounded-xl border border-dashed border-white/20 bg-[#070811] hover:border-[#22D3EE]/60 cursor-pointer text-sm text-slate-300 transition-colors">
              <Upload className="w-4 h-4 text-[#22D3EE]" />
              <span>
                {isAr ? 'اختر صورة من جهازك أو الموبايل' : 'Choose an image from your device'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {previewUrl && (
              <div className="mt-2.5 rounded-xl overflow-hidden border border-white/10 h-36 bg-[#070811]">
                <img
                  src={previewUrl}
                  alt={isAr ? 'معاينة سكرين شوت النتيجة' : 'Result screenshot preview'}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              {isAr ? 'ملاحظة للحكم (اختياري)' : 'Referee Note (Optional)'}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isAr ? 'مثال: عدد الإقصاءات أو تفاصيل الجولة' : 'e.g., match details or extra notes'
              }
              className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#D4FF00]"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            disabled={submitting || !selectedWinner}
            onClick={handleFormSubmit}
            className="flex-1 min-h-[48px] rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:bg-slate-800 disabled:text-slate-500 text-[#070811] font-extrabold text-sm transition-colors"
          >
            {submitting
              ? isAr
                ? 'جاري الرفع للمراجعة...'
                : 'Submitting for review...'
              : isAr
              ? 'إرسال النتيجة للجنة التحكيم'
              : 'Submit Result for Review'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-5 rounded-xl border border-white/10 text-slate-300 hover:text-white text-sm font-medium"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface UsernamePromptModalProps {
  open: boolean;
  isSignedIn: boolean;
  checkingProfile?: boolean;
  displayName: string;
  initialDisplayName?: string;
  initialUsername?: string;
  initialWhatsapp?: string;
  initialEmail?: string;
  onGoogleSignIn: () => Promise<void>;
  onSubmitUsername: (payload: {
    displayName: string;
    username: string;
    whatsappNumber: string;
    email: string;
  }) => Promise<void>;
}

export function UsernamePromptModal({
  open,
  isSignedIn,
  checkingProfile = false,
  displayName,
  initialDisplayName = '',
  initialUsername = '',
  initialWhatsapp = '',
  initialEmail = '',
  onGoogleSignIn,
  onSubmitUsername,
}: UsernamePromptModalProps) {
  const { isAr } = useLanguage();
  const [fullNameInput, setFullNameInput] = useState(initialDisplayName);
  const [usernameInput, setUsernameInput] = useState(initialUsername);
  const [whatsappInput, setWhatsappInput] = useState(initialWhatsapp);
  const [emailInput, setEmailInput] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFullNameInput(initialDisplayName || '');
      setUsernameInput(initialUsername || '');
      setWhatsappInput(initialWhatsapp || '');
      setEmailInput(initialEmail || '');
      setErrorMsg(null);
    }
  }, [open, initialDisplayName, initialUsername, initialWhatsapp, initialEmail, isSignedIn]);

  if (!open) return null;

  const trimmedFullName = fullNameInput.trim().replace(/\s+/g, ' ');
  const trimmedUsername = usernameInput.trim().replace(/^@+/, '');
  const cleanWhatsapp = sanitizeWhatsappInput(whatsappInput);
  const trimmedEmail = emailInput.trim();
  const isValidTriple = hasTripleName(trimmedFullName);
  const isValidWhatsapp = isValidWhatsappNumber(cleanWhatsapp);
  const isValidEmail = isValidEmailAddress(trimmedEmail);

  const handleConfirm = async () => {
    setErrorMsg(null);
    if (!isSignedIn) {
      setErrorMsg(
        isAr
          ? 'يجب تسجيل الدخول عبر Google أولاً قبل حفظ البيانات.'
          : 'You must sign in with Google first before saving your details.'
      );
      return;
    }
    if (!isValidTriple) {
      setErrorMsg(
        isAr
          ? 'يرجى كتابة الاسم ثلاثي (3 كلمات على الأقل، مثال: أحمد محمد محمود).'
          : 'Please enter your full triple name (at least 3 words).'
      );
      return;
    }
    if (!trimmedUsername) {
      setErrorMsg(isAr ? 'يرجى كتابة اليوزر نيم للمتابعة.' : 'Please enter your username.');
      return;
    }
    if (!isValidWhatsapp) {
      setErrorMsg(
        isAr
          ? 'يرجى إدخال رقم الهاتف / الواتساب صحيحاً (10 أرقام على الأقل).'
          : 'Please enter a valid phone / WhatsApp number (at least 10 digits).'
      );
      return;
    }
    if (!trimmedEmail || !isValidEmail) {
      setErrorMsg(
        isAr
          ? 'يرجى إدخال بريد Gmail صحيح ليتم إرسال جدول الماتشات والمجموعات عليه.'
          : 'Please enter a valid Gmail address to receive your match schedule and group.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitUsername({
        displayName: trimmedFullName,
        username: trimmedUsername,
        whatsappNumber: cleanWhatsapp,
        email: trimmedEmail,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTriggerGoogleSignIn = async () => {
    setSigningIn(true);
    setErrorMsg(null);
    try {
      await onGoogleSignIn();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="username-prompt-title"
    >
      <div className="w-full sm:max-w-lg bg-[#0E1222] border border-white/15 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto relative">
        <div className="h-1.5 arena-gradient-bar -mx-6 -mt-6 mb-4" />
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/Gemini_Generated_Image_c646y6c646y6c646_31bc66c8.jpeg"
              alt="Arena Pro"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover border border-white/15 shrink-0"
            />
            <div>
              <p className="text-[11px] font-bold text-[#22D3EE] mb-0.5">
                {isSignedIn
                  ? isAr
                    ? `تم تسجيل الدخول بـ Google · ${displayName}`
                    : `Signed in with Google · ${displayName}`
                  : isAr
                  ? 'أهلاً بك في أرينا برو · تسجيل الدخول مطلوب'
                  : 'Welcome to Arena Pro · Sign-In Required'}
              </p>
              <h3 id="username-prompt-title" className="text-lg font-extrabold text-white">
                {!isSignedIn
                  ? isAr
                    ? 'سجّل الدخول بحساب Google للمتابعة'
                    : 'Sign in with Google to Continue'
                  : checkingProfile
                  ? isAr
                    ? 'جاري التحقق من بيانات حسابك...'
                    : 'Checking your account profile...'
                  : isAr
                  ? 'إكمال بياناتك لأول مرة فقط'
                  : 'Complete Your First-Time Profile'}
              </h3>
            </div>
          </div>
        </div>

        {!isSignedIn ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-2.5 text-xs text-slate-200 bg-[#070811] border border-[#22D3EE]/30 rounded-xl p-3.5 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-[#22D3EE] shrink-0 mt-0.5" />
              <span>
                {isAr
                  ? 'يجب تسجيل الدخول بحساب Google أولاً. إذا كنت سجّلت بياناتك من قبل فستدخل مباشرة بدون إدخال الاسم أو الرقم مرة أخرى، وإذا كانت أول مرة فستكمل الاسم ثلاثي ورقم الهاتف مرة واحدة فقط.'
                  : 'Please sign in with Google first. Returning players enter immediately; first-time players enter their triple name and phone number once only.'}
              </span>
            </div>
            <button
              type="button"
              disabled={signingIn}
              onClick={handleTriggerGoogleSignIn}
              className="w-full min-h-[48px] rounded-xl bg-white hover:bg-slate-100 disabled:bg-slate-700 text-[#070811] font-extrabold text-sm flex items-center justify-center gap-2 transition-colors arena-google-btn"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>
                {signingIn
                  ? isAr
                    ? 'جاري تسجيل الدخول بـ Google...'
                    : 'Signing in with Google...'
                  : isAr
                  ? 'تسجيل الدخول عبر Google (مطلوب)'
                  : 'Sign in with Google (Required)'}
              </span>
            </button>
          </div>
        ) : checkingProfile ? (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-300 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-[#D4FF00]" />
            <span>
              {isAr
                ? 'جاري تحميل ملفك الشخصي والتحقق من تسجيلك السابق...'
                : 'Loading your profile and checking previous registration...'}
            </span>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {isAr
                  ? 'تُطلب هذه البيانات لأول مرة فقط: الاسم ثلاثي ورقم الهاتف، ولن يُطلب منك إدخالها مجدداً عند تسجيل الدخول لاحقاً.'
                  : 'Required for your first login only: triple name and phone number. You will not be asked again.'}
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prompt-triple-name" className="flex items-center gap-1.5 text-xs text-slate-200 font-semibold">
                <UserCheck className="w-3.5 h-3.5 text-[#D4FF00]" />
                <span>{isAr ? 'الاسم ثلاثي بالكامل (مطلوب)' : 'Full Triple Name (3 words required)'}</span>
              </label>
              <input
                id="prompt-triple-name"
                type="text"
                autoFocus
                value={fullNameInput}
                onChange={(e) => setFullNameInput(e.target.value)}
                placeholder={isAr ? 'مثال: أحمد محمد محمود' : 'e.g. Ahmed Mohamed Mahmoud'}
                className={`w-full min-h-[44px] bg-[#070811] border rounded-xl px-4 text-sm text-white focus:outline-none ${
                  fullNameInput.trim()
                    ? isValidTriple
                      ? 'border-emerald-500/50 focus:border-emerald-400'
                      : 'border-amber-500/50 focus:border-amber-400'
                    : 'border-white/15 focus:border-[#D4FF00]'
                }`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="prompt-username-input" className="block text-xs text-slate-200 font-semibold">
                  {isAr ? 'اليوزر نيم (Username)' : 'Username'}
                </label>
                <input
                  id="prompt-username-input"
                  type="text"
                  autoComplete="off"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder={isAr ? 'اليوزر نيم الخاص بك' : 'Your username'}
                  className="w-full min-h-[44px] bg-[#070811] border border-white/15 rounded-xl px-3.5 text-sm text-white font-mono-num focus:outline-none focus:border-[#D4FF00]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="prompt-whatsapp-input" className="flex items-center gap-1.5 text-xs text-slate-200 font-semibold">
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isAr ? 'رقم الهاتف / الواتساب (مطلوب)' : 'Phone / WhatsApp Number (Required)'}</span>
                </label>
                <input
                  id="prompt-whatsapp-input"
                  type="tel"
                  dir="ltr"
                  value={whatsappInput}
                  onChange={(e) => setWhatsappInput(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className={`w-full min-h-[44px] bg-[#070811] border rounded-xl px-3.5 text-sm text-white font-mono-num text-left focus:outline-none ${
                    whatsappInput.trim()
                      ? isValidWhatsapp
                        ? 'border-emerald-500/50 focus:border-emerald-400'
                        : 'border-amber-500/50 focus:border-amber-400'
                      : 'border-white/15 focus:border-emerald-400'
                  }`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prompt-gmail-input" className="flex items-center gap-1.5 text-xs text-slate-200 font-semibold">
                <Mail className="w-3.5 h-3.5 text-[#F472B6]" />
                <span>
                  {isAr
                    ? 'بريد Gmail (لإرسال جدول ماتشاتك ومجموعتك)'
                    : 'Gmail Address (For match schedules & group updates)'}
                </span>
              </label>
              <input
                id="prompt-gmail-input"
                type="email"
                dir="ltr"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                }}
                placeholder="yourname@gmail.com"
                className="w-full min-h-[44px] bg-[#070811] border border-white/15 rounded-xl px-3.5 text-sm text-white font-mono-num focus:outline-none focus:border-[#22D3EE] text-left"
              />
            </div>

            {errorMsg && <p className="text-xs text-rose-400 font-semibold">{errorMsg}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={submitting || !trimmedFullName || !trimmedUsername || !cleanWhatsapp}
                onClick={handleConfirm}
                className="flex-1 min-h-[46px] rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] disabled:bg-slate-800 disabled:text-slate-500 text-[#070811] font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>
                  {submitting
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ البيانات والبدء'
                    : 'Save & Continue'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TeamRosterModalProps {
  participant: BracketParticipant | null;
  tournamentTitle?: string;
  modeTag?: MatchFormatTag;
  onClose: () => void;
}

export function TeamRosterModal({
  participant,
  tournamentTitle,
  modeTag,
  onClose,
}: TeamRosterModalProps) {
  const { lang, isAr } = useLanguage();
  if (!participant) return null;

  const teamTitle = participant.teamName || participant.name;
  const checkInSummary = getTeamCheckInSummary(participant, modeTag);
  const derivedMembers: TeamRosterMember[] =
    participant.rosterMembers && participant.rosterMembers.length > 0
      ? participant.rosterMembers
      : [
          {
            name: participant.username || participant.name,
            username: participant.username,
            role: isAr ? 'قائد الفريق' : 'Team Captain',
          },
          ...(participant.teammateUsername
            ? [
                {
                  name: participant.teammateUsername,
                  username: participant.teammateUsername,
                  role: isAr ? 'شريك الفريق' : 'Teammate',
                },
              ]
            : []),
        ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[#0E1222] border border-white/15 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 arena-gradient-bar rounded-full -mt-2 mb-4" />
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#22D3EE] uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5" />
              <span>{isAr ? 'أعضاء الفريق المسجلين' : 'Registered Team Roster'}</span>
            </div>
            <h3 className="text-xl font-extrabold text-white truncate">{teamTitle}</h3>
            {tournamentTitle && (
              <p className="text-xs text-slate-400 truncate mt-0.5">{tournamentTitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 shrink-0"
            aria-label={isAr ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-white/[0.08] text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-[#D4FF00]/15 border border-[#D4FF00]/40 text-[#D4FF00] font-bold">
            {translateGroupName(participant.groupName, lang)}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#070811] border border-white/10 text-slate-300 font-mono-num">
            {isAr ? `تصنيف #${participant.seed}` : `Seed #${participant.seed}`}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#070811] border border-white/10 text-[#22D3EE] font-mono-num">
            @{participant.username}
          </span>
          {checkInSummary.arrivedCount > 0 && (
            <span
              className={`px-2.5 py-1 rounded-lg border font-mono-num font-black tracking-wider ${
                checkInSummary.status === 'team_ready'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              }`}
            >
              {checkInSummary.badge}
            </span>
          )}
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>{isAr ? 'اللاعبون المشاركون في الفريق:' : 'Players in this Team:'}</span>
            <span className="font-mono-num text-[#D4FF00]">
              {isAr ? `${derivedMembers.length} لاعب` : `${derivedMembers.length} players`}
            </span>
          </div>

          {derivedMembers.map((member, index) => {
            const memberChecked = checkInSummary.members[index]?.checkedIn;
            return (
              <div
                key={`${member.name}-${index}`}
                className={`border rounded-xl px-3.5 py-3 flex items-center justify-between gap-3 ${
                  memberChecked
                    ? 'bg-emerald-500/10 border-emerald-500/35'
                    : 'bg-[#070811] border-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#0E1222] border border-[#22D3EE]/30 flex items-center justify-center text-xs font-mono-num font-bold text-[#22D3EE] shrink-0">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{member.name}</span>
                      {memberChecked && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                          {isAr ? 'حضر' : 'Arrived'}
                        </span>
                      )}
                    </div>
                    {member.username && (
                      <div className="text-[11px] font-mono-num text-slate-400 truncate">
                        @{member.username}
                      </div>
                    )}
                  </div>
                </div>

                {member.role && (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#D4FF00]/15 text-[#D4FF00] border border-[#D4FF00]/30 shrink-0">
                    {member.role}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-white/[0.08]">
          <span className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-[#D4FF00]" />
            <span>{translateGroupName(participant.groupName, lang)}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 rounded-xl bg-[#D4FF00] text-[#070811] font-bold text-xs"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
