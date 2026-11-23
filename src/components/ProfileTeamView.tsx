import { useEffect, useState, type RefObject } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  QrCode,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import {
  translateDisplayName,
  translateGroupName,
  translateNotificationDeliveryNote,
  translateSchedule,
  translateTeamRole,
} from '../i18n/helpers.ts';
import type {
  FriendChatMessage,
  FriendRequest,
  GameInfo,
  PlayerNotification,
  PlayerProfile,
  TeamClan,
} from '../types.ts';
import { usePlayerLookup } from '../utils/playerLookup.ts';
import {
  hasTripleName,
  isValidWhatsappNumber,
  sanitizeWhatsappInput,
} from '../utils/validation.ts';
import { FriendsChatPanel, type ChatContact } from './FriendsChatPanel.tsx';
import { buildProfileQrUrl } from './QrCodeModal.tsx';

interface ProfileTeamViewProps {
  profile: PlayerProfile;
  team: TeamClan;
  games: GameInfo[];
  notifications?: PlayerNotification[];
  friendMessages?: FriendChatMessage[];
  friendRequests?: FriendRequest[];
  chatContacts?: ChatContact[];
  selectedChatTarget?: string;
  initialFriendQuery?: string;
  onClearInitialFriendQuery?: () => void;
  onOpenQrModal?: () => void;
  onSelectChatTarget?: (target: string) => void;
  onSendChatMessage?: (target: string, text: string, targetHandle?: string) => Promise<boolean>;
  onMarkChatRead?: (channelId: string) => void;
  chatSectionRef?: RefObject<HTMLElement | null>;
  onChatVisibilityChange?: (visible: boolean) => void;
  onSaveProfile: (updated: Partial<PlayerProfile>) => Promise<boolean | void>;
  onSendFriendRequest: (targetQuery: string, role?: string) => Promise<boolean>;
  onRespondFriendRequest: (requestId: string, action: 'accept' | 'decline') => Promise<boolean>;
  onUpdateTeam: (payload: {
    name?: string;
    tag?: string;
    removeMemberId?: string;
    regenerateCode?: boolean;
  }) => Promise<boolean | void>;
  canUnlockAdmin?: boolean;
  isAdminLocked?: boolean;
  onUnlockAdmin?: () => void;
}

export function ProfileTeamView({
  profile,
  team,
  games: _games,
  notifications = [],
  friendMessages = [],
  friendRequests = [],
  chatContacts = [],
  selectedChatTarget = 'team-group',
  initialFriendQuery = '',
  onClearInitialFriendQuery,
  onOpenQrModal,
  onSelectChatTarget = () => {},
  onSendChatMessage = async () => false,
  onMarkChatRead = () => {},
  chatSectionRef,
  onChatVisibilityChange,
  onSaveProfile,
  onSendFriendRequest,
  onRespondFriendRequest,
  onUpdateTeam,
  canUnlockAdmin = false,
  isAdminLocked = false,
  onUnlockAdmin,
}: ProfileTeamViewProps) {
  const { lang, isAr, toggleLang } = useLanguage();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [email, setEmail] = useState(profile.email || '');
  const [city, setCity] = useState(profile.city);
  const [whatsappNumber, setWhatsappNumber] = useState(
    profile.whatsappNumber || profile.phoneOrDiscord || ''
  );
  const [profileFormError, setProfileFormError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [teamName, setTeamName] = useState(team.name);
  const [teamTag, setTeamTag] = useState(team.tag);
  const [memberHandle, setMemberHandle] = useState(initialFriendQuery);
  const [memberRole, setMemberRole] = useState(isAr ? 'شريك 2v2' : '2v2 Partner');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [respondingReqId, setRespondingReqId] = useState<string | null>(null);
  const [miniQrUrl, setMiniQrUrl] = useState<string>('');

  const incomingPending = friendRequests.filter(
    (r) => r.toUid === profile.id && r.status === 'pending'
  );
  const outgoingPending = friendRequests.filter(
    (r) => r.fromUid === profile.id && r.status === 'pending'
  );

  const friendLookup = usePlayerLookup(memberHandle);
  const isSelfLookup =
    friendLookup.status === 'valid' &&
    Boolean(friendLookup.user) &&
    (friendLookup.user!.handle.trim().toLowerCase() === (profile.handle || '').trim().toLowerCase() ||
      friendLookup.user!.playerCode.trim().toLowerCase() ===
        (profile.playerCode || '').trim().toLowerCase());
  const isAlreadyFriend =
    friendLookup.status === 'valid' &&
    Boolean(friendLookup.user) &&
    team.members.some(
      (m) => m.handle.trim().toLowerCase() === friendLookup.user!.handle.trim().toLowerCase()
    );
  const isAlreadyPendingOutgoing =
    friendLookup.status === 'valid' &&
    Boolean(friendLookup.user) &&
    outgoingPending.some(
      (r) => r.toHandle.trim().toLowerCase() === friendLookup.user!.handle.trim().toLowerCase()
    );
  const canSendRequest =
    friendLookup.status === 'valid' &&
    Boolean(friendLookup.user) &&
    !isSelfLookup &&
    !isAlreadyFriend &&
    !isAlreadyPendingOutgoing;

  useEffect(() => {
    if (initialFriendQuery) {
      setMemberHandle(initialFriendQuery);
    }
  }, [initialFriendQuery]);

  useEffect(() => {
    setDisplayName(profile.displayName);
    setHandle(profile.handle);
    setEmail(profile.email || '');
    setCity(profile.city);
    setWhatsappNumber(profile.whatsappNumber || profile.phoneOrDiscord || '');
  }, [profile]);

  useEffect(() => {
    const targetUrl = buildProfileQrUrl(profile);
    let active = true;
    QRCode.toDataURL(targetUrl, {
      width: 140,
      margin: 1,
      color: { dark: '#070811', light: '#FFFFFF' },
    })
      .then((url) => {
        if (active) setMiniQrUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [profile.handle, profile.playerCode]);

  useEffect(() => {
    setMemberRole((prev) => {
      if (isAr && prev === '2v2 Partner') return 'شريك 2v2';
      if (!isAr && prev === 'شريك 2v2') return '2v2 Partner';
      return prev;
    });
  }, [isAr]);

  const handleProfileSave = async () => {
    setProfileFormError(null);
    const cleanName = displayName.trim().replace(/\s+/g, ' ');
    const cleanHandle = handle.trim().replace(/^@+/, '');
    const cleanWhatsapp = sanitizeWhatsappInput(whatsappNumber);

    if (!hasTripleName(cleanName)) {
      setProfileFormError(
        isAr
          ? 'يرجى كتابة الاسم ثلاثي (3 كلمات على الأقل، مثال: أحمد محمد محمود).'
          : 'Please enter your full triple name (at least 3 words).'
      );
      return;
    }
    if (!cleanHandle) {
      setProfileFormError(isAr ? 'يرجى كتابة اليوزر نيم.' : 'Please enter your username.');
      return;
    }
    if (!isValidWhatsappNumber(cleanWhatsapp)) {
      setProfileFormError(
        isAr
          ? 'يرجى كتابة رقم واتساب صحيح للتواصل (10 أرقام على الأقل).'
          : 'Please enter a valid WhatsApp contact number (at least 10 digits).'
      );
      return;
    }

    setSavingProfile(true);
    try {
      await onSaveProfile({
        displayName: cleanName,
        handle: cleanHandle,
        email: email.trim() || undefined,
        city,
        whatsappNumber: cleanWhatsapp,
        phoneOrDiscord: cleanWhatsapp,
        onboardingCompleted: true,
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCopyInvite = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(team.inviteCode).catch(() => {});
    }
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyUsername = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(handle).catch(() => {});
    }
    setCopiedUser(true);
    window.setTimeout(() => setCopiedUser(false), 2000);
  };

  const handleSendRequestClick = async () => {
    const cleanHandle = memberHandle.trim().replace(/^@+/, '');
    if (!cleanHandle || !canSendRequest || !friendLookup.user) return;
    setSavingTeam(true);
    try {
      const ok = await onSendFriendRequest(friendLookup.user.handle, memberRole);
      if (ok) {
        setMemberHandle('');
        onClearInitialFriendQuery?.();
      }
    } finally {
      setSavingTeam(false);
    }
  };

  const handleRequestDecision = async (reqId: string, action: 'accept' | 'decline') => {
    setRespondingReqId(reqId);
    try {
      await onRespondFriendRequest(reqId, action);
    } finally {
      setRespondingReqId(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setSavingTeam(true);
    try {
      await onUpdateTeam({ removeMemberId: memberId });
    } finally {
      setSavingTeam(false);
    }
  };

  const handleSaveTeamMeta = async () => {
    setSavingTeam(true);
    try {
      await onUpdateTeam({ name: teamName, tag: teamTag });
    } finally {
      setSavingTeam(false);
    }
  };

  const formatLastSeen = (iso?: string): string => {
    if (!iso) return isAr ? 'أوفلاين' : 'Offline';
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return isAr ? 'أوفلاين' : 'Offline';
    const diffMin = Math.max(1, Math.floor((Date.now() - ms) / 60000));
    if (diffMin < 60) {
      return isAr ? `آخر نشاط منذ ${diffMin} د` : `Last seen ${diffMin}m ago`;
    }
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return isAr ? `آخر نشاط منذ ${diffHours} س` : `Last seen ${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return isAr ? `آخر نشاط منذ ${diffDays} ي` : `Last seen ${diffDays}d ago`;
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            {isAr ? 'ملف اللاعب واليوزر نيم والفريق' : 'Player Profile, Username & Team'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'شارك الـ QR أو اليوزر نيم مع صديقك لإرسال طلب صداقة وإضافته في بطولات 2v2 و 4v4.'
              : 'Share your QR code or username with friends to send friend requests and team up in 2v2 & 4v4.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Language Switcher inside Profile & Team */}
          <button
            type="button"
            onClick={toggleLang}
            aria-label={isAr ? 'Switch language to English' : 'تبديل اللغة إلى العربية'}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0E1222] border border-[#22D3EE]/35 hover:border-[#22D3EE] text-xs font-bold text-white flex items-center gap-2 transition-colors"
          >
            <Globe className="w-4 h-4 text-[#22D3EE] shrink-0" />
            <span className="text-slate-400">{isAr ? 'اللغة:' : 'Language:'}</span>
            <span className="text-[#D4FF00] font-extrabold">
              {isAr ? 'العربية · تبديل إلى English' : 'English · Switch to العربية'}
            </span>
          </button>

          <div className="bg-[#0E1222] border border-[#22D3EE]/35 rounded-xl px-4 py-2 flex items-center gap-2.5">
            <div className="text-xs">
              <div className="text-slate-400">
                {isAr ? 'معرفك (ID / Username)' : 'Your ID / Username'}
              </div>
              <div className="font-mono-num font-bold text-[#D4FF00]">
                @{handle} · {profile.playerCode}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyUsername}
              className="min-h-[36px] px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white flex items-center gap-1"
            >
              {copiedUser ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedUser ? (isAr ? 'تم' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
            </button>
          </div>

          {profile.isGoogleSignedIn && (
            <div className="flex items-center gap-3 bg-[#0E1222] border border-emerald-500/30 rounded-xl px-4 py-2">
              {profile.photoURL && (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover"
                />
              )}
              <div className="text-xs">
                <div className="font-semibold text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isAr ? 'حساب Google موثق' : 'Verified Google Account'}</span>
                </div>
                {profile.email && <div className="text-slate-400 font-mono-num">{profile.email}</div>}
              </div>
            </div>
          )}

          {canUnlockAdmin && onUnlockAdmin && (
            <button
              type="button"
              onClick={onUnlockAdmin}
              className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors ${
                isAdminLocked
                  ? 'bg-[#D4FF00] hover:bg-[#E2FF4D] text-[#070811] shadow-lg shadow-[#D4FF00]/15'
                  : 'bg-[#0E1222] border border-[#D4FF00]/40 hover:border-[#D4FF00] text-[#D4FF00]'
              }`}
            >
              {isAdminLocked ? (
                <Unlock className="w-4 h-4 shrink-0" />
              ) : (
                <Shield className="w-4 h-4 shrink-0" />
              )}
              <span>
                {isAdminLocked
                  ? isAr
                    ? 'فتح لوحة الإدارة'
                    : 'Unlock Admin Panel'
                  : isAr
                  ? 'لوحة الإدارة'
                  : 'Admin Panel'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Pending Incoming Friend Requests Card */}
      {incomingPending.length > 0 && (
        <section className="bg-[#0E1222] border border-[#D4FF00]/40 rounded-2xl p-5 space-y-3 shadow-lg shadow-[#D4FF00]/5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-[#D4FF00]" />
              <span>
                {isAr
                  ? `طلبات الصداقة الواردة (${incomingPending.length})`
                  : `Incoming Friend Requests (${incomingPending.length})`}
              </span>
            </h2>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#D4FF00]/15 text-[#D4FF00]">
              {isAr ? 'بانتظار موافقتك' : 'Needs your response'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {incomingPending.map((req) => {
              const busy = respondingReqId === req.id;
              return (
                <div
                  key={req.id}
                  className="bg-[#070811] border border-white/10 rounded-xl p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{req.fromName}</div>
                    <div className="text-xs font-mono-num text-[#22D3EE] truncate">
                      @{req.fromHandle} · {req.fromPlayerCode}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRequestDecision(req.id, 'accept')}
                      className="min-h-[36px] px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#070811] text-xs font-extrabold flex items-center gap-1 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isAr ? 'موافقة' : 'Accept'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRequestDecision(req.id, 'decline')}
                      className="min-h-[36px] px-3 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 disabled:opacity-50 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isAr ? 'رفض' : 'Decline'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-6 bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">
              {isAr ? 'بيانات حساب اللاعب' : 'Player Account Details'}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {isAr ? 'الاسم ثلاثي (الاسم في البطولات)' : 'Full Triple Name (Display Name)'}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={isAr ? 'مثال: أحمد محمد محمود' : 'e.g. Ahmed Mohamed Mahmoud'}
                className={`w-full min-h-[44px] bg-[#070811] border rounded-xl px-3.5 text-sm text-white focus:outline-none ${
                  displayName.trim() && !hasTripleName(displayName)
                    ? 'border-amber-500/50 focus:border-amber-400'
                    : 'border-white/10 focus:border-[#D4FF00]'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {isAr
                  ? 'اليوزر نيم (Username) — يظهر للأصدقاء والأدمن'
                  : 'Username — Visible to teammates & Admin'}
              </label>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3.5 text-sm text-white font-mono-num focus:outline-none focus:border-[#D4FF00]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {isAr ? 'المدينة / المكان' : 'City / Location'}
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-[#D4FF00]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {isAr ? 'رقم الواتساب للتواصل (مطلوب)' : 'WhatsApp Contact Number (Required)'}
              </label>
              <input
                type="tel"
                dir="ltr"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="010XXXXXXXX"
                className={`w-full min-h-[44px] bg-[#070811] border rounded-xl px-3.5 text-sm text-white font-mono-num text-left focus:outline-none ${
                  whatsappNumber.trim() && !isValidWhatsappNumber(whatsappNumber)
                    ? 'border-amber-500/50 focus:border-amber-400'
                    : 'border-white/10 focus:border-[#D4FF00]'
                }`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-1.5 text-xs text-[#22D3EE] mb-1.5">
                <Mail className="w-3.5 h-3.5" />
                <span>
                  {isAr
                    ? 'بريد Gmail (للتواصل واستلام جدول الماتشات)'
                    : 'Gmail Address (For match schedules & alerts)'}
                </span>
              </label>
              <input
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@gmail.com"
                className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3.5 text-sm text-white font-mono-num focus:outline-none focus:border-[#D4FF00] text-left"
              />
            </div>
          </div>

          {profileFormError && (
            <p className="text-xs text-rose-400 font-semibold">{profileFormError}</p>
          )}

          <button
            type="button"
            disabled={savingProfile}
            onClick={handleProfileSave}
            className="w-full min-h-[48px] rounded-xl bg-[#D4FF00] hover:bg-[#E3FF4D] disabled:bg-slate-800 text-[#070811] font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>
              {savingProfile
                ? isAr
                  ? 'جاري الحفظ...'
                  : 'Saving...'
                : isAr
                ? 'حفظ الاسم ثلاثي والواتساب واليوزر نيم'
                : 'Save Triple Name, WhatsApp & Username'}
            </span>
          </button>

          {/* Compact QR Code Card inside Profile */}
          <div className="bg-[#070811] border border-[#22D3EE]/30 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-16 h-16 rounded-xl bg-white p-1.5 shrink-0 flex items-center justify-center">
                {miniQrUrl ? (
                  <img
                    src={miniQrUrl}
                    alt={`QR ${profile.handle}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <QrCode className="w-8 h-8 text-[#070811]" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-white">
                  {isAr ? 'QR Code حسابك الشخصي' : 'Your Account QR Code'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {isAr
                    ? 'أي صديق يمسح الكود يقدر يبعتلك طلب صداقة فوراً'
                    : 'Friends scan to send you a friend request instantly'}
                </div>
                <div className="text-[11px] font-mono-num text-[#D4FF00] mt-1 truncate">
                  @{profile.handle} · {profile.playerCode}
                </div>
              </div>
            </div>
            {onOpenQrModal && (
              <button
                type="button"
                onClick={onOpenQrModal}
                className="min-h-[38px] px-3 rounded-xl bg-[#22D3EE]/15 border border-[#22D3EE]/40 text-[#22D3EE] hover:bg-[#22D3EE]/25 text-xs font-bold shrink-0 transition-colors"
              >
                {isAr ? 'تكبير / تحميل' : 'Open QR'}
              </button>
            )}
          </div>
        </section>

        <section className="lg:col-span-6 bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[#D4FF00]" />
              <span>
                {isAr
                  ? `فريقي والأصدقاء (${team.members.length})`
                  : `My Team & Friends (${team.members.length})`}
              </span>
            </h2>
            <span className="font-mono-num text-xs text-[#D4FF00] font-bold">[{team.tag}]</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1.5">
                {isAr ? 'اسم الفريق' : 'Team Name'}
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3.5 text-sm text-white focus:outline-none focus:border-[#D4FF00]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {isAr ? 'الاختصار (Tag)' : 'Team Tag'}
              </label>
              <input
                type="text"
                maxLength={5}
                value={teamTag}
                onChange={(e) => setTeamTag(e.target.value.toUpperCase())}
                className="w-full min-h-[44px] bg-[#070811] border border-white/10 rounded-xl px-3.5 text-sm text-white font-mono-num uppercase focus:outline-none focus:border-[#D4FF00]"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={savingTeam}
            onClick={handleSaveTeamMeta}
            className="min-h-[42px] px-4 rounded-xl border border-white/15 hover:border-[#22D3EE]/50 text-xs font-semibold text-white transition-colors"
          >
            {isAr ? 'تحديث اسم واختصار الفريق' : 'Update Team Name & Tag'}
          </button>

          <div className="bg-[#070811] border border-white/[0.08] rounded-xl p-4 space-y-2.5">
            <div className="text-xs text-slate-400">
              {isAr ? 'كود دعوة الأصدقاء' : 'Friend Invite Code'}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-[160px] bg-[#0E1222] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono-num text-[#D4FF00]">
                {team.inviteCode}
              </code>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="min-h-[40px] px-3.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>
                  {copiedCode ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ الكود' : 'Copy Code'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateTeam({ regenerateCode: true })}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:text-white"
                aria-label={isAr ? 'توليد كود دعوة جديد' : 'Generate new invite code'}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">
              {isAr
                ? 'الأصدقاء المضافون (يظهرون تلقائياً في تسجيل 2v2 و 4v4)'
                : 'Added Friends (Shown automatically in 2v2 & 4v4 registration)'}
            </div>
            {team.members.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-xl bg-[#070811] px-4 py-5 text-center text-xs text-slate-400">
                {isAr
                  ? 'لا يوجد أصدقاء مضافون بعد — أرسل طلب صداقة بالأسفل وعند موافقته سيظهر هنا.'
                  : 'No friends yet — send a friend request below and once accepted they appear here.'}
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-xl overflow-hidden bg-[#070811]">
                {team.members.map((m) => {
                  const online = Boolean(m.isOnline);
                  return (
                    <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              online
                                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]'
                                : 'bg-slate-500'
                            }`}
                            title={online ? (isAr ? 'أونلاين' : 'Online') : formatLastSeen(m.lastActiveAt)}
                            aria-label={online ? (isAr ? 'أونلاين' : 'Online') : (isAr ? 'أوفلاين' : 'Offline')}
                          />
                          <span className="text-sm font-semibold text-white truncate">
                            {translateDisplayName(m.name, lang)}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                              online
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-slate-800/80 text-slate-400'
                            }`}
                          >
                            {online ? (isAr ? 'أونلاين' : 'Online') : (isAr ? 'أوفلاين' : 'Offline')}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="font-mono-num text-[#22D3EE]">@{m.handle}</span>
                          <span aria-hidden="true">·</span>
                          <span>{translateTeamRole(m.role, lang)}</span>
                          {!online && m.lastActiveAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[11px] text-slate-500">
                                {formatLastSeen(m.lastActiveAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.uid && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectChatTarget(m.uid!);
                              chatSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            aria-label={isAr ? `شات مع ${m.handle}` : `Chat with ${m.handle}`}
                            className="min-h-[34px] px-2.5 rounded-lg border border-[#22D3EE]/35 text-[#22D3EE] hover:bg-[#22D3EE]/15 text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>{isAr ? 'شات' : 'Chat'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={savingTeam}
                          onClick={() => handleRemoveMember(m.id)}
                          aria-label={isAr ? `حذف ${m.handle}` : `Remove ${m.handle}`}
                          className="min-h-[34px] px-2.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/15 text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isAr ? 'حذف' : 'Remove'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outgoing Pending Requests */}
          {outgoingPending.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {isAr
                    ? `طلبات صداقة مرسلة بانتظار الموافقة (${outgoingPending.length})`
                    : `Sent Friend Requests Pending (${outgoingPending.length})`}
                </span>
              </div>
              <div className="space-y-1.5">
                {outgoingPending.map((req) => (
                  <div
                    key={req.id}
                    className="bg-[#070811] border border-amber-500/20 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-white">{req.toName}</span>{' '}
                      <span className="font-mono-num text-[#22D3EE]">@{req.toHandle}</span>
                    </div>
                    <button
                      type="button"
                      disabled={respondingReqId === req.id}
                      onClick={() => handleRequestDecision(req.id, 'decline')}
                      className="text-[11px] text-rose-300 hover:underline shrink-0"
                    >
                      {isAr ? 'إلغاء الطلب' : 'Cancel'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-white/[0.08] space-y-3">
            <div className="text-sm font-bold text-[#D4FF00] flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" />
              <span>{isAr ? 'ضيف صديق (إرسال طلب صداقة)' : 'Add Friend (Send Friend Request)'}</span>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder={
                  isAr
                    ? 'اكتب اليوزر نيم أو ID صديقك المسجل (مثال: Kareem أو ARENA-1234) *'
                    : "Enter registered friend's @username or Player ID *"
                }
                value={memberHandle}
                onChange={(e) => {
                  setMemberHandle(e.target.value);
                  if (!e.target.value.trim()) onClearInitialFriendQuery?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSendRequest && !savingTeam) {
                    handleSendRequestClick();
                  }
                }}
                className={`w-full min-h-[44px] bg-[#070811] border rounded-xl px-3.5 text-xs text-white font-mono-num placeholder:text-slate-400 focus:outline-none ${
                  canSendRequest
                    ? 'border-emerald-500/60 focus:border-emerald-400'
                    : friendLookup.status === 'invalid' || isSelfLookup || isAlreadyFriend || isAlreadyPendingOutgoing
                    ? 'border-rose-500/60 focus:border-rose-400'
                    : 'border-[#D4FF00]/40 focus:border-[#D4FF00]'
                }`}
              />

              {friendLookup.status === 'checking' && (
                <div className="flex items-center gap-1.5 text-[11px] text-[#22D3EE]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>{isAr ? 'جاري التحقق من الـ ID / اليوزر نيم...' : 'Verifying ID / username...'}</span>
                </div>
              )}

              {friendLookup.status === 'valid' &&
                friendLookup.user &&
                !isSelfLookup &&
                !isAlreadyFriend &&
                !isAlreadyPendingOutgoing && (
                  <div className="flex items-center justify-between gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0 truncate">
                        <span className="font-bold text-white">{friendLookup.user.displayName}</span>{' '}
                        <span className="font-mono-num text-[#22D3EE]">
                          (@{friendLookup.user.handle} · {friendLookup.user.playerCode})
                        </span>
                      </div>
                    </div>
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        friendLookup.user.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                      }`}
                      title={
                        friendLookup.user.isOnline
                          ? isAr
                            ? 'أونلاين'
                            : 'Online'
                          : isAr
                          ? 'أوفلاين'
                          : 'Offline'
                      }
                    />
                  </div>
                )}

              {isSelfLookup && (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{isAr ? 'لا يمكنك إرسال طلب صداقة لنفسك.' : 'You cannot send a friend request to yourself.'}</span>
                </div>
              )}

              {isAlreadyFriend && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{isAr ? 'هذا اللاعب صديقك بالفعل.' : 'This player is already your friend.'}</span>
                </div>
              )}

              {isAlreadyPendingOutgoing && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isAr
                      ? 'تم إرسال طلب صداقة لهذا اللاعب بالفعل وبانتظار موافقته.'
                      : 'A friend request was already sent to this player.'}
                  </span>
                </div>
              )}

              {friendLookup.status === 'invalid' && (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isAr
                      ? 'هذا الـ ID أو اليوزر نيم غير مسجل في المنصة — تأكد من صحة معرف صديقك.'
                      : 'This ID or username is not registered on the platform.'}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={savingTeam || !canSendRequest}
              onClick={handleSendRequestClick}
              className="min-h-[44px] px-5 rounded-xl bg-[#D4FF00] text-[#070811] hover:bg-[#e5ff4d] disabled:bg-slate-700 disabled:text-slate-400 text-xs font-extrabold flex items-center gap-2 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isAr ? 'إرسال طلب صداقة' : 'Send Friend Request'}</span>
            </button>
          </div>
        </section>
      </div>

      <FriendsChatPanel
        profile={profile}
        teamMembers={team.members}
        chatContacts={chatContacts}
        messages={friendMessages}
        selectedTarget={selectedChatTarget}
        onSelectTarget={onSelectChatTarget}
        onSendMessage={onSendChatMessage}
        onMarkChannelRead={onMarkChatRead}
        sectionRef={chatSectionRef}
        onVisibilityChange={onChatVisibilityChange}
      />

      {/* Player Group & Match Schedule Notifications Inbox */}
      <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#22D3EE]/15 border border-[#22D3EE]/35 flex items-center justify-center text-[#22D3EE] shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isAr
                  ? 'رسائلي وتنبيهات المجموعات ومواعيد الماتشات'
                  : 'My Group & Match Schedule Notifications'}
              </h2>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'تظهر هنا كل تنبيهات مجموعتك ومواعيد مبارياتك فور تحديدها من الإدارة.'
                  : 'All your assigned group notices and match schedules appear here.'}
              </p>
            </div>
          </div>
          {profile.email && (
            <span className="text-xs font-mono-num text-emerald-300">{profile.email}</span>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="bg-[#070811] border border-white/[0.06] rounded-xl p-5 text-center text-xs text-slate-400">
            {isAr
              ? 'لا توجد تنبيهات بعد — سجّل في بطولة ليصلك إشعار المجموعة ومواعيد الماتشات هنا فور تحديدها.'
              : 'No notifications yet — register in a tournament to receive group and match time alerts here.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="bg-[#070811] border border-white/[0.08] rounded-xl p-4 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#D4FF00] truncate">{n.tournamentTitle}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                      n.deliveryStatus === 'sent'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : n.deliveryStatus === 'failed'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {n.deliveryStatus === 'sent'
                      ? isAr
                        ? 'تم الإرسال بالبريد'
                        : 'Email Sent'
                      : n.deliveryStatus === 'failed'
                      ? isAr
                        ? 'تعذر الإرسال'
                        : 'Delivery Failed'
                      : isAr
                      ? 'تنبيه بالمنصة'
                      : 'In-App Alert'}
                  </span>
                </div>
                <div className="text-white font-medium">
                  {isAr ? 'المجموعة:' : 'Group:'}{' '}
                  <span className="text-[#22D3EE]">{translateGroupName(n.groupName, lang)}</span>
                  {n.opponentName
                    ? isAr
                      ? ` · ضد: ${n.opponentName}`
                      : ` · vs: ${n.opponentName}`
                    : ''}
                </div>
                <div className="flex items-center gap-1.5 text-emerald-300">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isAr ? 'الموعد:' : 'Schedule:'} {translateSchedule(n.scheduledAt, lang)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {translateNotificationDeliveryNote(n, lang)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
