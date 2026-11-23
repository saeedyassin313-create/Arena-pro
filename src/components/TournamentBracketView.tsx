import { Fragment, useState } from 'react';
import {
  Bell,
  Calendar,
  Camera,
  CheckCircle2,
  FileText,
  Lock,
  MapPin,
  Radio,
  Swords,
  Table2,
  Trophy,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { computeGroupStandings, getGroupsForTournament } from '../data/seed.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import {
  translateFormatLabel,
  translateGameInfo,
  translateGroupName,
  translateLeg,
  translateMatchStatus,
  translateNotificationDeliveryNote,
  translateRoundName,
  translateSchedule,
  translateTournamentStatus,
} from '../i18n/helpers.ts';
import type {
  BracketMatch,
  BracketParticipant,
  GameInfo,
  LiveFeedItem,
  MatchFormatTag,
  PlayerNotification,
  PlayerProfile,
  Tournament,
} from '../types.ts';
import {
  BracketChampionBeam,
  BracketPairConnectors,
  BroadcastScorePair,
  BroadcastScoreValue,
  ChampionPedestalCard,
  ChampionSpotlightBanner,
} from './BroadcastAnimations.tsx';
import { getTeamCheckInSummary } from '../utils/checkin.ts';
import { TeamRosterModal } from './Modals.tsx';

interface TournamentBracketViewProps {
  tournaments: Tournament[];
  games: GameInfo[];
  liveFeed: LiveFeedItem[];
  notifications?: PlayerNotification[];
  selectedTournamentId: string;
  profile: PlayerProfile;
  onSelectTournament: (id: string) => void;
  onQuickRegister: (t: Tournament) => void;
  onOpenScreenshotModal: (t: Tournament, m: BracketMatch) => void;
  isAdmin?: boolean;
  onOpenMatchesAdmin?: () => void;
}

export function TournamentBracketView({
  tournaments,
  games,
  liveFeed,
  notifications = [],
  selectedTournamentId,
  profile,
  onSelectTournament,
  onQuickRegister,
  onOpenScreenshotModal,
  isAdmin = false,
  onOpenMatchesAdmin,
}: TournamentBracketViewProps) {
  const { lang, isAr } = useLanguage();
  const prefersReduced = useReducedMotion();
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'ongoing' | 'completed'>('all');
  const [modeFilter, setModeFilter] = useState<'all' | MatchFormatTag>('all');
  const [feedScope, setFeedScope] = useState<'all' | 'current'>('all');
  const [innerTab, setInnerTab] = useState<'bracket' | 'standings' | 'rules' | 'participants'>(
    'bracket'
  );
  const [activeRoundIdx, setActiveRoundIdx] = useState<number>(0);
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [showAllGroupMatches, setShowAllGroupMatches] = useState<boolean>(false);
  const [legFilter, setLegFilter] = useState<'all' | 'ذهاب' | 'عودة'>('all');
  const [mobileTreeRoundIdx, setMobileTreeRoundIdx] = useState<number>(0);
  const [mobileShowFullTree, setMobileShowFullTree] = useState<boolean>(false);
  const [selectedTeamParticipant, setSelectedTeamParticipant] =
    useState<BracketParticipant | null>(null);

  const filteredTournaments = tournaments.filter((t) => {
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesMode = modeFilter === 'all' || t.modeTag === modeFilter;
    return matchesStatus && matchesMode;
  });

  const tournament =
    filteredTournaments.find((t) => t.id === selectedTournamentId) || filteredTournaments[0];

  const handleFilterStatus = (next: 'all' | 'open' | 'ongoing' | 'completed') => {
    setStatusFilter(next);
    setActiveRoundIdx(0);
    const nextList = tournaments.filter(
      (t) =>
        (next === 'all' || t.status === next) &&
        (modeFilter === 'all' || t.modeTag === modeFilter)
    );
    if (nextList[0] && !nextList.some((t) => t.id === selectedTournamentId)) {
      onSelectTournament(nextList[0].id);
    }
  };

  const handleFilterMode = (next: 'all' | MatchFormatTag) => {
    setModeFilter(next);
    setActiveRoundIdx(0);
    const nextList = tournaments.filter(
      (t) =>
        (statusFilter === 'all' || t.status === statusFilter) &&
        (next === 'all' || t.modeTag === next)
    );
    if (nextList[0] && !nextList.some((t) => t.id === selectedTournamentId)) {
      onSelectTournament(nextList[0].id);
    }
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setModeFilter('all');
    setActiveRoundIdx(0);
    if (tournaments[0]) {
      onSelectTournament(tournaments[0].id);
    }
  };

  const game = tournament ? games.find((g) => g.slug === tournament.gameSlug) : undefined;
  const gameText = game ? translateGameInfo(game, lang) : undefined;
  const activeGroups = tournament ? getGroupsForTournament(tournament) : [];
  const isRegistered = tournament
    ? profile.registeredTournamentIds.includes(tournament.id)
    : false;
  const isClosed = tournament ? !tournament.registrationOpen : false;
  const currentRound = tournament
    ? tournament.rounds[activeRoundIdx] || tournament.rounds[0]
    : undefined;

  const seenEntrantIds = new Set<string>();
  const entrants: BracketParticipant[] = [];
  tournament?.rounds[0]?.matches.forEach((m) => {
    if (m.participantA && !seenEntrantIds.has(m.participantA.id)) {
      seenEntrantIds.add(m.participantA.id);
      entrants.push(m.participantA);
    }
    if (m.participantB && !seenEntrantIds.has(m.participantB.id)) {
      seenEntrantIds.add(m.participantB.id);
      entrants.push(m.participantB);
    }
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Header & Filtered Tournament Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            {isAr
              ? 'البطولات وجدول المواجهات والمجموعات'
              : 'Tournaments, Brackets & Groups'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'شجرة إقصاء آلية وتوزيع عشوائي للمجموعات مع إمكانية تعديل المواجهات من الليدر.'
              : 'Automated elimination brackets and randomized group draws with full Leader control.'}
          </p>
        </div>

        <select
          value={tournament?.id || ''}
          disabled={filteredTournaments.length === 0}
          onChange={(e) => {
            onSelectTournament(e.target.value);
            setActiveRoundIdx(0);
          }}
          aria-label={isAr ? 'اختر البطولة' : 'Select tournament'}
          className="min-h-[44px] bg-[#0E1222] border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#D4FF00] disabled:opacity-50"
        >
          {filteredTournaments.length === 0 ? (
            <option value="">
              {isAr ? 'لا توجد بطولات مطابقة' : 'No matching tournaments'}
            </option>
          ) : (
            filteredTournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.maxSlots})
              </option>
            ))
          )}
        </select>
      </div>

      {/* Top Filter Bar: Status & Match Format */}
      <section
        aria-label={isAr ? 'تصفية البطولات' : 'Filter tournaments'}
        className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
              {isAr ? 'الحالة:' : 'Status:'}
            </span>
            <div className="flex items-center gap-1 p-1 bg-[#070811] border border-white/[0.08] rounded-xl overflow-x-auto">
              {[
                { key: 'all', label: isAr ? 'الكل' : 'All', dotClass: '' },
                { key: 'open', label: isAr ? 'قائمة' : 'Open', dotClass: 'arena-dot-open' },
                { key: 'ongoing', label: isAr ? 'جارية' : 'Ongoing', dotClass: 'arena-dot-live animate-pulse' },
                { key: 'completed', label: isAr ? 'منتهية' : 'Completed', dotClass: 'arena-dot-done' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    handleFilterStatus(item.key as 'all' | 'open' | 'ongoing' | 'completed')
                  }
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    statusFilter === item.key
                      ? 'bg-[#D4FF00] text-[#070811]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.dotClass && (
                    <span
                      aria-hidden="true"
                      className={`w-2 h-2 rounded-full inline-block shrink-0 ${item.dotClass}`}
                    />
                  )}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
              {isAr ? 'النظام:' : 'Format:'}
            </span>
            <div className="flex items-center gap-1 p-1 bg-[#070811] border border-white/[0.08] rounded-xl overflow-x-auto">
              {[
                { key: 'all', label: isAr ? 'الكل' : 'All' },
                { key: '1v1', label: '1v1' },
                { key: '2v2', label: '2v2' },
                { key: '4v4', label: '4v4' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleFilterMode(item.key as 'all' | MatchFormatTag)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    modeFilter === item.key
                      ? 'bg-[#22D3EE] text-[#070811] font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-400 shrink-0">
          <span className="tabular-nums">
            {isAr ? (
              <>
                النتائج: <strong className="text-white">{filteredTournaments.length}</strong> من{' '}
                {tournaments.length}
              </>
            ) : (
              <>
                Results: <strong className="text-white">{filteredTournaments.length}</strong> of{' '}
                {tournaments.length}
              </>
            )}
          </span>
          {(statusFilter !== 'all' || modeFilter !== 'all') && (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[38px] px-3 rounded-lg border border-white/10 hover:border-white/25 text-slate-200 font-medium whitespace-nowrap transition-colors"
            >
              {isAr ? 'إعادة ضبط' : 'Reset'}
            </button>
          )}
        </div>
      </section>

      {/* Live Feed: Automatically displays completed matchups approved by Admin */}
      <section
        aria-label={isAr ? 'البث الحي لأحدث المواجهات المكتملة' : 'Live feed of completed matches'}
        className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                {isAr
                  ? 'البث الحي لأحدث المواجهات المكتملة (Live Feed)'
                  : 'Live Feed — Latest Completed Matches'}
              </h2>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'تظهر النتائج المعتمدة من الإدارة هنا تلقائياً فور مراجعتها وتأكيدها.'
                  : 'Admin-approved match results appear here automatically as soon as confirmed.'}
              </p>
            </div>
          </div>

          {tournament && (
            <div className="flex items-center gap-1 p-1 bg-[#070811] border border-white/[0.08] rounded-xl self-start">
              <button
                type="button"
                onClick={() => setFeedScope('all')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  feedScope === 'all'
                    ? 'bg-[#D4FF00] text-[#070811]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isAr ? 'جميع البطولات' : 'All Tournaments'}
              </button>
              <button
                type="button"
                onClick={() => setFeedScope('current')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  feedScope === 'current'
                    ? 'bg-[#D4FF00] text-[#070811]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isAr ? 'البطولة المختارة' : 'Selected Tournament'}
              </button>
            </div>
          )}
        </div>

        {(() => {
          const visibleFeed =
            feedScope === 'current' && tournament
              ? liveFeed.filter((item) => item.tournamentId === tournament.id)
              : liveFeed;

          if (visibleFeed.length === 0) {
            return (
              <div className="bg-[#070811] border border-white/[0.06] rounded-xl p-5 text-center text-xs text-slate-400">
                {isAr
                  ? 'لا توجد مواجهات مكتملة حتى الآن — ستظهر النتائج المعتمدة هنا تلقائياً فور اعتمادها من الأدمن.'
                  : 'No completed matches yet — verified results will stream here automatically once approved by Admin.'}
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <AnimatePresence initial={false}>
                {visibleFeed.slice(0, 6).map((item) => {
                  const aWon = item.winnerName === item.participantAName;
                  const bWon = item.winnerName === item.participantBName;
                  const timeStr = new Date(item.approvedAt).toLocaleTimeString(
                    isAr ? 'ar-EG' : 'en-US',
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  );
                  return (
                    <motion.article
                      key={item.id}
                      initial={prefersReduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={prefersReduced ? undefined : { opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      className="bg-[#070811] border border-white/[0.08] rounded-xl p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span className="text-[#D4FF00] font-semibold truncate">
                          {item.gameName} · {translateRoundName(item.roundName, lang)}
                        </span>
                        <span className="font-mono-num shrink-0">{timeStr}</span>
                      </div>

                      <div className="text-xs font-medium text-slate-300 truncate">
                        {item.tournamentTitle} · {isAr ? 'مواجهة' : 'Match'} #{item.matchNumber} (
                        {translateGroupName(item.groupName, lang)})
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-[#0E1222] border border-white/[0.06] rounded-lg px-3 py-2 text-xs">
                        <span
                          className={`truncate font-semibold ${
                            aWon ? 'arena-winner-gold-text font-extrabold' : 'text-slate-300'
                          }`}
                        >
                          {item.participantAName}
                        </span>
                        <BroadcastScorePair
                          scoreA={item.scoreA}
                          scoreB={item.scoreB}
                          winnerSide={aWon ? 'A' : bWon ? 'B' : null}
                        />
                        <span
                          className={`truncate font-semibold text-end ${
                            bWon ? 'arena-winner-gold-text font-extrabold' : 'text-slate-300'
                          }`}
                        >
                          {item.participantBName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] arena-winner-gold-text font-bold">
                        <Trophy className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {isAr ? 'الفائز المعتمد:' : 'Verified Winner:'} {item.winnerName}
                        </span>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          );
        })()}
      </section>

      {!tournament ? (
        <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-8 text-center space-y-4">
          <p className="text-sm text-slate-300">
            {tournaments.length === 0
              ? isAr
                ? 'لا توجد بطولات منشورة حالياً. ستظهر البطولات هنا فور إضافتها وفتحها من الإدارة.'
                : 'No tournaments published yet. Tournaments will appear here once added and opened by Admin.'
              : isAr
              ? 'لا توجد بطولات مطابقة للفلاتر المختارة حالياً.'
              : 'No tournaments match the selected filters right now.'}
          </p>
          {tournaments.length > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[44px] px-5 rounded-xl bg-[#D4FF00] hover:bg-[#E3FF4D] text-[#070811] text-xs font-bold transition-colors"
            >
              {isAr ? 'عرض جميع البطولات' : 'Show All Tournaments'}
            </button>
          )}
        </section>
      ) : (
        <>
          {/* Tournament Summary Header */}
          <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                  <span className="text-[#D4FF00] font-semibold">
                    {tournament.customGameName || gameText?.displayName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span
                      aria-hidden="true"
                      className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${
                        tournament.status === 'completed'
                          ? 'arena-dot-done'
                          : tournament.status === 'ongoing'
                          ? 'arena-dot-live animate-pulse'
                          : 'arena-dot-open'
                      }`}
                    />
                    <span
                      className={
                        tournament.status === 'completed'
                          ? 'text-slate-400'
                          : tournament.status === 'ongoing'
                          ? 'text-emerald-300'
                          : 'text-rose-300'
                      }
                    >
                      {translateTournamentStatus(tournament.status, lang)}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{tournament.modeTag}</span>
                  <span aria-hidden="true">·</span>
                  <span>{translateFormatLabel(tournament.formatLabel, lang)}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">{tournament.title}</h2>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300 pt-1">
                  <span className="flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-[#D4FF00]" />
                    {isAr ? 'الجائزة:' : 'Prize:'}{' '}
                    <strong className="text-white">{tournament.prizePool}</strong>
                  </span>
                  <span className="flex items-center gap-1.5 tabular-nums">
                    <Users className="w-4 h-4 text-slate-400" />
                    {isAr ? 'المسجلون:' : 'Entrants:'} {tournament.registeredCount} /{' '}
                    {tournament.maxSlots}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {isAr ? 'المكان:' : 'Venue:'} {tournament.venueName}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {isAdmin && onOpenMatchesAdmin && (
                  <button
                    type="button"
                    onClick={onOpenMatchesAdmin}
                    className="min-h-[46px] px-4 rounded-xl border border-[#22D3EE]/45 text-[#22D3EE] hover:bg-[#22D3EE]/10 text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-2"
                  >
                    <Swords className="w-4 h-4" />
                    <span>{isAr ? 'إدارة الماتشات (AI)' : 'Matches Admin (AI)'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onQuickRegister(tournament)}
                  className={`min-h-[46px] px-6 rounded-xl text-sm font-bold transition-colors whitespace-nowrap flex items-center gap-2 ${
                    isRegistered
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : isClosed
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/10'
                      : 'bg-[#D4FF00] hover:bg-[#E3FF4D] text-[#070811]'
                  }`}
                >
                  {isClosed && !isRegistered && <Lock className="w-4 h-4" />}
                  <span>
                    {isRegistered
                      ? isAr
                        ? 'مسجل في هذه البطولة'
                        : 'Registered'
                      : isClosed
                      ? isAr
                        ? 'التسجيل مغلق من الليدر'
                        : 'Registration Closed'
                      : isAr
                      ? 'سجل الآن'
                      : 'Register Now'}
                  </span>
                </button>
              </div>
            </div>

            {(() => {
              const headerFinalMatch = tournament.rounds[tournament.rounds.length - 1]?.matches[0];
              const headerFinalWinner =
                headerFinalMatch?.winnerId === headerFinalMatch?.participantA?.id
                  ? headerFinalMatch?.participantA
                  : headerFinalMatch?.winnerId === headerFinalMatch?.participantB?.id
                  ? headerFinalMatch?.participantB
                  : null;
              const championDisplayName =
                tournament.winnerName || headerFinalWinner?.teamName || headerFinalWinner?.name || null;
              if (!championDisplayName) return null;
              const championParticipant =
                headerFinalWinner ||
                entrants.find(
                  (p) =>
                    p.teamName === championDisplayName || p.name === championDisplayName
                ) ||
                null;
              return (
                <ChampionSpotlightBanner
                  winnerName={championDisplayName}
                  tournamentTitle={tournament.title}
                  prizePool={tournament.prizePool}
                  isAr={isAr}
                  onInspectWinner={
                    championParticipant
                      ? () => setSelectedTeamParticipant(championParticipant)
                      : undefined
                  }
                />
              );
            })()}

            {/* Sub-navigation Tabs */}
            <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center gap-2 overflow-x-auto">
              {[
                {
                  id: 'bracket',
                  label: isAr ? 'شجرة المواجهات والمجموعات' : 'Matches & Groups',
                  icon: Trophy,
                },
                {
                  id: 'standings',
                  label: isAr
                    ? `المجموعات (${activeGroups.length} × 4 فرق)`
                    : `Groups (${activeGroups.length} × 4 Teams)`,
                  icon: Table2,
                },
                { id: 'rules', label: isAr ? 'القوانين والجوائز' : 'Rules & Prizes', icon: FileText },
                {
                  id: 'participants',
                  label: isAr
                    ? `المشاركون (${entrants.length})`
                    : `Participants (${entrants.length})`,
                  icon: Users,
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = innerTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInnerTab(tab.id as typeof innerTab)}
                    className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#D4FF00] text-[#070811] font-bold'
                        : 'bg-[#070811] text-slate-300 hover:text-white border border-white/[0.08]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {(() => {
            const myTournamentNotifications = notifications.filter(
              (n) => n.tournamentId === tournament.id
            );
            if (myTournamentNotifications.length === 0) return null;
            const latest = myTournamentNotifications[0];
            return (
              <section className="bg-[#0E1222] border border-[#D4FF00]/35 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#D4FF00]/15 border border-[#D4FF00]/30 flex items-center justify-center text-[#D4FF00] shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-white">
                      {isAr ? 'تنبيه مشاركتك:' : 'Your Participation Alert:'}{' '}
                      <span className="text-[#D4FF00]">
                        {translateGroupName(latest.groupName, lang)}
                      </span>
                      {latest.opponentName
                        ? isAr
                          ? ` · ضد ${latest.opponentName}`
                          : ` · vs ${latest.opponentName}`
                        : ''}
                    </div>
                    <div className="text-emerald-300 font-medium">
                      {isAr ? 'موعد مباراتك:' : 'Match Schedule:'}{' '}
                      {translateSchedule(latest.scheduledAt, lang)}
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      {translateNotificationDeliveryNote(latest, lang)}
                    </div>
                  </div>
                </div>
                {latest.recipientEmail && (
                  <span className="text-[11px] font-mono-num text-slate-300 shrink-0">
                    {latest.recipientEmail}
                  </span>
                )}
              </section>
            );
          })()}

          {/* Tab 1: Automated Bracket Tree + Round Stepper */}
          {innerTab === 'bracket' && (
            <section className="space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 bracket-scroll">
                  {tournament.rounds.map((r, idx) => {
                    const active = idx === activeRoundIdx;
                    return (
                      <button
                        key={r.roundIndex}
                        type="button"
                        onClick={() => setActiveRoundIdx(idx)}
                        className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                          active
                            ? 'bg-[#D4FF00]/15 border-[#D4FF00] text-[#22D3EE]'
                            : 'bg-[#0E1222] border-white/[0.08] text-slate-300 hover:text-white'
                        }`}
                      >
                        {translateRoundName(r.nameAr, lang)} ({r.matches.length})
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    aria-label={isAr ? 'تصفية حسب المجموعة' : 'Filter by group'}
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="min-h-[40px] bg-[#0E1222] border border-white/15 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#D4FF00]"
                  >
                    <option value="all">
                      {isAr
                        ? `جميع المجموعات (${activeGroups.length})`
                        : `All Groups (${activeGroups.length})`}
                    </option>
                    {activeGroups.map((gn) => (
                      <option key={gn} value={gn}>
                        {translateGroupName(gn, lang)}
                      </option>
                    ))}
                  </select>

                  {currentRound &&
                    currentRound.matches.some((m) => m.leg && m.leg !== 'مباراة واحدة') && (
                      <div className="flex items-center gap-1 p-1 bg-[#0E1222] border border-white/[0.08] rounded-xl">
                        {(['all', 'ذهاب', 'عودة'] as const).map((legOpt) => (
                          <button
                            key={legOpt}
                            type="button"
                            onClick={() => setLegFilter(legOpt)}
                            className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                              legFilter === legOpt
                                ? 'bg-[#D4FF00] text-[#070811]'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {legOpt === 'all' ? (isAr ? 'الكل' : 'All') : translateLeg(legOpt, lang)}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              </div>

              {/* Visual 8-Group 4-Team Stage Board directly in Main View when Round 0 is active */}
              {activeRoundIdx === 0 && activeGroups.length > 0 && (() => {
                const standings = computeGroupStandings(tournament);
                return (
                  <div className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                          <Table2 className="w-4 h-4 text-[#D4FF00]" />
                          <span>
                            {isAr
                              ? `دور المجموعات (${activeGroups.length} مجموعات × 4 فرق)`
                              : `Group Stage (${activeGroups.length} Groups × 4 Teams)`}
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isAr
                            ? 'اضغط على أي مجموعة لعرض مبارياتها الـ 6 بالأسفل، أو اضغط على اسم الفريق لعرض أعضائه. يتأهل الأول والثاني إلى دور الـ 16.'
                            : 'Tap any group to filter its 6 matches below, or tap a team to view its roster. Top 2 advance to Round of 16.'}
                        </p>
                      </div>
                      {groupFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setGroupFilter('all')}
                          className="min-h-[34px] px-3 rounded-lg bg-[#070811] border border-[#22D3EE]/40 text-xs font-bold text-[#22D3EE] self-start sm:self-auto"
                        >
                          {isAr ? 'عرض جميع المجموعات' : 'Show All Groups'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {activeGroups.map((gn) => {
                        const rows = standings[gn] || [];
                        const isSelectedGroup = groupFilter === gn;
                        const emptySlotsCount = Math.max(0, 4 - rows.length);
                        return (
                          <div
                            key={gn}
                            className={`rounded-xl border overflow-hidden transition-colors bg-[#070811] ${
                              isSelectedGroup
                                ? 'border-[#D4FF00] ring-1 ring-[#D4FF00]/40'
                                : 'border-white/[0.08] hover:border-[#22D3EE]/45'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setGroupFilter((prev) => (prev === gn ? 'all' : gn))
                              }
                              className="w-full px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between text-start bg-[#0E1222]/60 hover:bg-[#0E1222]"
                            >
                              <span className="text-xs font-extrabold text-[#D4FF00]">
                                {translateGroupName(gn, lang)}
                              </span>
                              <span className="text-[11px] font-mono-num text-[#22D3EE] font-semibold">
                                {rows.length}/4
                              </span>
                            </button>

                            <div className="divide-y divide-white/[0.05]">
                              {rows.map((r, i) => {
                                const gd = r.goalsFor - r.goalsAgainst;
                                const gdText = gd > 0 ? `+${gd}` : `${gd}`;
                                const isLeader = i === 0 && r.played > 0;
                                const isRunnerUp = i === 1 && r.played > 0;
                                return (
                                  <button
                                    key={r.participant.id}
                                    type="button"
                                    onClick={() => setSelectedTeamParticipant(r.participant)}
                                    className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-white/[0.04] transition-colors text-start ${
                                      isLeader
                                        ? 'bg-emerald-500/[0.08]'
                                        : isRunnerUp
                                        ? 'bg-[#22D3EE]/[0.05]'
                                        : ''
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="font-mono-num text-[11px] text-[#D4FF00] w-4 shrink-0">
                                        {i + 1}.
                                      </span>
                                      <span className="text-white hover:text-[#22D3EE] font-semibold truncate">
                                        {r.participant.teamName || r.participant.name}
                                      </span>
                                      {isLeader && (
                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                                          {isAr ? '1' : 'Q1'}
                                        </span>
                                      )}
                                      {isRunnerUp && (
                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[#22D3EE]/15 text-[#22D3EE] shrink-0">
                                          {isAr ? '2' : 'Q2'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 font-mono-num text-[11px] shrink-0">
                                      <span
                                        className={
                                          gd > 0
                                            ? 'text-emerald-300'
                                            : gd < 0
                                            ? 'text-rose-400'
                                            : 'text-slate-500'
                                        }
                                      >
                                        {gdText}
                                      </span>
                                      <span className="font-bold text-emerald-300 w-5 text-end">
                                        {r.points}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}

                              {Array.from({ length: emptySlotsCount }).map((_, emptyIdx) => (
                                <div
                                  key={`empty-${gn}-${emptyIdx}`}
                                  className="px-3 py-2 flex items-center justify-between text-[11px] text-slate-600"
                                >
                                  <span className="font-mono-num">
                                    {rows.length + emptyIdx + 1}.{' '}
                                    {isAr ? 'خانة فريق متاحة' : 'Open Team Slot'}
                                  </span>
                                  <span className="font-mono-num">—</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {currentRound && (() => {
                const filteredMatches = currentRound.matches.filter((match) => {
                  const okGroup = groupFilter === 'all' || match.groupName === groupFilter;
                  const okLeg = legFilter === 'all' || match.leg === legFilter;
                  return okGroup && okLeg;
                });
                const shouldTruncate =
                  activeRoundIdx === 0 &&
                  groupFilter === 'all' &&
                  !showAllGroupMatches &&
                  filteredMatches.length > 12;
                const displayedMatches = shouldTruncate
                  ? filteredMatches.slice(0, 12)
                  : filteredMatches;

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {displayedMatches.map((match) => {
                        const canUpload = Boolean(
                          match.participantA && match.participantB && match.status !== 'completed'
                        );
                        const rawSchedule = match.scheduledAt || 'لم يتحدد';
                        const isUnscheduled = rawSchedule === 'لم يتحدد';
                        const scheduleText = translateSchedule(rawSchedule, lang);
                        return (
                          <div
                            key={match.id}
                            className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between gap-3"
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                              <span className="font-mono-num truncate">
                                {translateRoundName(currentRound.nameAr, lang)} · #{match.matchNumber}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {match.leg && match.leg !== 'مباراة واحدة' && (
                                  <span
                                    className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                                      match.leg === 'ذهاب'
                                        ? 'bg-[#D4FF00]/15 border-[#D4FF00]/40 text-[#22D3EE]'
                                        : 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                                    }`}
                                  >
                                    {translateLeg(match.leg, lang)}
                                  </span>
                                )}
                                <span className="text-[#D4FF00] font-medium">
                                  {translateGroupName(match.groupName, lang)}
                                </span>
                              </div>
                            </div>

                            <div
                              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border ${
                                isUnscheduled
                                  ? 'bg-[#070811] border-white/[0.06] text-slate-400'
                                  : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                              }`}
                            >
                              <Calendar className="w-3.5 h-3.5 shrink-0" />
                              <span>{isAr ? 'الموعد:' : 'Schedule:'}</span>
                              <strong className={isUnscheduled ? 'text-[#22D3EE]' : 'text-white'}>
                                {scheduleText}
                              </strong>
                            </div>

                            <div className="space-y-2">
                              <div
                                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
                                  match.winnerId && match.winnerId === match.participantA?.id
                                    ? 'arena-winner-gold-slot'
                                    : 'bg-[#070811] border-white/[0.06] text-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="font-mono-num text-[11px] text-slate-500 w-5 shrink-0">
                                    {match.participantA ? `#${match.participantA.seed}` : '—'}
                                  </span>
                                  {match.participantA ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedTeamParticipant(match.participantA)}
                                      className="min-w-0 text-start group flex-1"
                                      title={
                                        isAr
                                          ? 'اضغط لعرض أعضاء الفريق'
                                          : 'Click to view team members'
                                      }
                                    >
                                      <div className="text-xs sm:text-sm font-bold text-white group-hover:text-[#22D3EE] transition-colors truncate flex items-center gap-1.5">
                                        {match.winnerId && match.winnerId === match.participantA.id && (
                                          <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        )}
                                        <span
                                          className={`truncate ${
                                            match.winnerId &&
                                            match.winnerId === match.participantA.id
                                              ? 'arena-winner-gold-text font-extrabold'
                                              : ''
                                          }`}
                                        >
                                          {match.participantA.teamName || match.participantA.name}
                                        </span>
                                        <Users className="w-3 h-3 text-[#22D3EE] opacity-75 shrink-0" />
                                        {match.winnerId && match.winnerId === match.participantA.id && (
                                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded arena-winner-gold-badge shrink-0">
                                            {isAr ? 'فائز' : 'WIN'}
                                          </span>
                                        )}
                                        {(() => {
                                          const s = getTeamCheckInSummary(
                                            match.participantA,
                                            tournament.modeTag
                                          );
                                          if (s.arrivedCount === 0) return null;
                                          return (
                                            <span
                                              className={`text-[9px] font-mono-num font-black px-1.5 py-0.5 rounded border shrink-0 ${
                                                s.status === 'team_ready'
                                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                              }`}
                                            >
                                              {s.badge}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono-num truncate">
                                        @{match.participantA.username}
                                        {match.participantA.rosterMembers &&
                                        match.participantA.rosterMembers.length > 0
                                          ? isAr
                                            ? ` · ${match.participantA.rosterMembers.length} أعضاء`
                                            : ` · ${match.participantA.rosterMembers.length} players`
                                          : match.participantA.teammateUsername
                                          ? ` + @${match.participantA.teammateUsername}`
                                          : ''}
                                      </div>
                                    </button>
                                  ) : (
                                    <div className="min-w-0">
                                      <div className="text-xs sm:text-sm font-medium text-slate-400 truncate">
                                        {isAr ? 'بانتظار المتأهل' : 'Awaiting Qualifier'}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <BroadcastScoreValue
                                  value={match.scoreA}
                                  isWinner={Boolean(
                                    match.winnerId && match.winnerId === match.participantA?.id
                                  )}
                                />
                              </div>

                              <div
                                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
                                  match.winnerId && match.winnerId === match.participantB?.id
                                    ? 'arena-winner-gold-slot'
                                    : 'bg-[#070811] border-white/[0.06] text-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="font-mono-num text-[11px] text-slate-500 w-5 shrink-0">
                                    {match.participantB ? `#${match.participantB.seed}` : '—'}
                                  </span>
                                  {match.participantB ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedTeamParticipant(match.participantB)}
                                      className="min-w-0 text-start group flex-1"
                                      title={
                                        isAr
                                          ? 'اضغط لعرض أعضاء الفريق'
                                          : 'Click to view team members'
                                      }
                                    >
                                      <div className="text-xs sm:text-sm font-bold text-white group-hover:text-[#22D3EE] transition-colors truncate flex items-center gap-1.5">
                                        {match.winnerId && match.winnerId === match.participantB.id && (
                                          <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        )}
                                        <span
                                          className={`truncate ${
                                            match.winnerId &&
                                            match.winnerId === match.participantB.id
                                              ? 'arena-winner-gold-text font-extrabold'
                                              : ''
                                          }`}
                                        >
                                          {match.participantB.teamName || match.participantB.name}
                                        </span>
                                        <Users className="w-3 h-3 text-[#22D3EE] opacity-75 shrink-0" />
                                        {match.winnerId && match.winnerId === match.participantB.id && (
                                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded arena-winner-gold-badge shrink-0">
                                            {isAr ? 'فائز' : 'WIN'}
                                          </span>
                                        )}
                                        {(() => {
                                          const s = getTeamCheckInSummary(
                                            match.participantB,
                                            tournament.modeTag
                                          );
                                          if (s.arrivedCount === 0) return null;
                                          return (
                                            <span
                                              className={`text-[9px] font-mono-num font-black px-1.5 py-0.5 rounded border shrink-0 ${
                                                s.status === 'team_ready'
                                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                              }`}
                                            >
                                              {s.badge}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono-num truncate">
                                        @{match.participantB.username}
                                        {match.participantB.rosterMembers &&
                                        match.participantB.rosterMembers.length > 0
                                          ? isAr
                                            ? ` · ${match.participantB.rosterMembers.length} أعضاء`
                                            : ` · ${match.participantB.rosterMembers.length} players`
                                          : match.participantB.teammateUsername
                                          ? ` + @${match.participantB.teammateUsername}`
                                          : ''}
                                      </div>
                                    </button>
                                  ) : (
                                    <div className="min-w-0">
                                      <div className="text-xs sm:text-sm font-medium text-slate-400 truncate">
                                        {isAr ? 'بانتظار المتأهل' : 'Awaiting Qualifier'}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <BroadcastScoreValue
                                  value={match.scoreB}
                                  isWinner={Boolean(
                                    match.winnerId && match.winnerId === match.participantB?.id
                                  )}
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                              <span
                                className={`text-xs font-semibold flex items-center gap-2 ${
                                  match.status === 'completed'
                                    ? 'text-slate-400'
                                    : match.status === 'live' || match.status === 'pending_review'
                                    ? 'text-emerald-300'
                                    : 'text-rose-300'
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${
                                    match.status === 'completed'
                                      ? 'arena-dot-done'
                                      : match.status === 'live' || match.status === 'pending_review'
                                      ? 'arena-dot-live animate-pulse'
                                      : 'arena-dot-open'
                                  }`}
                                />
                                <span>{translateMatchStatus(match.status, lang)}</span>
                              </span>

                              {canUpload && (
                                <button
                                  type="button"
                                  onClick={() => onOpenScreenshotModal(tournament, match)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#D4FF00]/15 hover:bg-[#D4FF00]/25 border border-[#D4FF00]/40 text-[#D4FF00] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>
                                    {isAr ? 'رفع سكرين شوت النتيجة' : 'Upload Result Screenshot'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {activeRoundIdx === 0 && groupFilter === 'all' && filteredMatches.length > 12 && (
                      <div className="flex justify-center pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAllGroupMatches((prev) => !prev)}
                          className="min-h-[42px] px-5 rounded-xl bg-[#0E1222] border border-[#22D3EE]/40 hover:border-[#D4FF00] text-xs font-bold text-[#22D3EE] transition-colors"
                        >
                          {showAllGroupMatches
                            ? isAr
                              ? 'إظهار أول 12 مواجهة فقط'
                              : 'Show First 12 Matches Only'
                            : isAr
                            ? `عرض جميع مواجهات المجموعات (${filteredMatches.length})`
                            : `Show All Group Matches (${filteredMatches.length})`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* True Connected Knockout Bracket Tree (Desktop & Mobile Horizontal Scroll) */}
              {(() => {
                const rounds = tournament.rounds || [];
                if (rounds.length === 0) return null;

                const finalMatch = rounds[rounds.length - 1]?.matches[0];
                const finalWinner =
                  finalMatch?.winnerId === finalMatch?.participantA?.id
                    ? finalMatch?.participantA
                    : finalMatch?.winnerId === finalMatch?.participantB?.id
                    ? finalMatch?.participantB
                    : null;
                const championDisplay =
                  tournament.winnerName || finalWinner?.teamName || finalWinner?.name || null;

                // Knockout Elimination Tree always starts after Group Stage (rounds[1] = Round of 16 for 32-team tournaments)
                const treeStartIdx = rounds.length > 1 ? 1 : 0;
                const treeRounds = rounds.slice(treeStartIdx);
                const baseMatches = Math.max(1, treeRounds[0]?.matches.length || 1);
                const UNIT_HEIGHT = 112;
                const totalTreeHeight = baseMatches * UNIT_HEIGHT;

                return (
                  <div className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-4 sm:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-[#D4FF00]" />
                          <span>
                            {isAr
                              ? `شجرة الأدوار الإقصائية (${translateRoundName(
                                  treeRounds[0]?.nameAr || '',
                                  lang
                                )} ← النهائي)`
                              : `Knockout Elimination Tree (${translateRoundName(
                                  treeRounds[0]?.nameAr || '',
                                  lang
                                )} → Final)`}
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isAr
                            ? `يتأهل الأول والثاني من كل مجموعة (4 فرق/مجموعة) لتبدأ الأدوار الإقصائية من ${translateRoundName(
                                treeRounds[0]?.nameAr || '',
                                lang
                              )} — اضغط على اسم أي فريق لعرض أعضائه.`
                            : `Top 2 from each 4-team group qualify into ${translateRoundName(
                                treeRounds[0]?.nameAr || '',
                                lang
                              )} — click any team to view its roster.`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="hidden md:inline text-[11px] text-[#22D3EE] font-semibold">
                          {isAr ? 'اسحب أفقياً لاستعراض الأدوار' : 'Scroll horizontally to explore rounds'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMobileShowFullTree((prev) => !prev)}
                          className="md:hidden min-h-[34px] px-3 rounded-lg bg-[#070811] border border-[#22D3EE]/40 text-[11px] font-bold text-[#22D3EE]"
                        >
                          {mobileShowFullTree
                            ? isAr
                              ? 'عرض أدوار الموبايل'
                              : 'Mobile Round View'
                            : isAr
                            ? 'عرض الشجرة الأفقية'
                            : 'Full Horizontal Tree'}
                        </button>
                      </div>
                    </div>

                    {/* Mobile Native Knockout Round Stepper */}
                    {!mobileShowFullTree && (
                      <div className="md:hidden space-y-3">
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bracket-scroll">
                          {treeRounds.map((tr, rIdx) => {
                            const active = Math.min(mobileTreeRoundIdx, treeRounds.length - 1) === rIdx;
                            return (
                              <button
                                key={tr.roundIndex}
                                type="button"
                                onClick={() => setMobileTreeRoundIdx(rIdx)}
                                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                                  active
                                    ? 'bg-[#D4FF00] border-[#D4FF00] text-[#070811]'
                                    : 'bg-[#070811] border-white/10 text-slate-300'
                                }`}
                              >
                                {translateRoundName(tr.nameAr, lang)} ({tr.matches.length})
                              </button>
                            );
                          })}
                        </div>

                        {(() => {
                          const selectedKRound =
                            treeRounds[Math.min(mobileTreeRoundIdx, treeRounds.length - 1)];
                          if (!selectedKRound) return null;
                          return (
                            <div className="space-y-2.5">
                              {selectedKRound.matches.map((m) => {
                                const aWon = Boolean(m.winnerId && m.winnerId === m.participantA?.id);
                                const bWon = Boolean(m.winnerId && m.winnerId === m.participantB?.id);
                                return (
                                  <div
                                    key={m.id}
                                    className={`rounded-xl border p-3 text-xs space-y-2 ${
                                      m.status === 'completed'
                                        ? 'bg-[#070811] border-amber-400/45'
                                        : m.status === 'live'
                                        ? 'bg-[#070811] border-emerald-500/45'
                                        : 'bg-[#070811] border-white/[0.1]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                                      <span className="font-mono-num flex items-center gap-1.5">
                                        <span
                                          aria-hidden="true"
                                          className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                                            m.status === 'completed'
                                              ? 'arena-dot-done'
                                              : m.status === 'live' || m.status === 'pending_review'
                                              ? 'arena-dot-live animate-pulse'
                                              : 'arena-dot-open'
                                          }`}
                                        />
                                        <span>
                                          {translateRoundName(selectedKRound.nameAr, lang)} · #
                                          {m.matchNumber}
                                        </span>
                                      </span>
                                      <span className="text-[#22D3EE] font-semibold">
                                        {translateGroupName(m.groupName, lang)}
                                      </span>
                                    </div>

                                    <div
                                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
                                        aWon
                                          ? 'arena-winner-gold-slot font-bold'
                                          : 'bg-white/[0.03] border-transparent text-slate-200'
                                      }`}
                                    >
                                      {m.participantA ? (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedTeamParticipant(m.participantA)}
                                          className="truncate text-start hover:text-[#22D3EE] min-w-0 flex-1 font-semibold flex items-center gap-1.5"
                                        >
                                          {aWon && (
                                            <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                          )}
                                          <span className="truncate">
                                            {m.participantA.teamName || m.participantA.name}
                                          </span>
                                        </button>
                                      ) : (
                                        <span className="text-slate-500">
                                          {isAr ? 'بانتظار المتأهل' : 'TBD'}
                                        </span>
                                      )}
                                      <BroadcastScoreValue
                                        value={m.scoreA}
                                        isWinner={aWon}
                                        size="sm"
                                      />
                                    </div>

                                    <div
                                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
                                        bWon
                                          ? 'arena-winner-gold-slot font-bold'
                                          : 'bg-white/[0.03] border-transparent text-slate-200'
                                      }`}
                                    >
                                      {m.participantB ? (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedTeamParticipant(m.participantB)}
                                          className="truncate text-start hover:text-[#22D3EE] min-w-0 flex-1 font-semibold flex items-center gap-1.5"
                                        >
                                          {bWon && (
                                            <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                          )}
                                          <span className="truncate">
                                            {m.participantB.teamName || m.participantB.name}
                                          </span>
                                        </button>
                                      ) : (
                                        <span className="text-slate-500">
                                          {isAr ? 'بانتظار المتأهل' : 'TBD'}
                                        </span>
                                      )}
                                      <BroadcastScoreValue
                                        value={m.scoreB}
                                        isWinner={bWon}
                                        size="sm"
                                      />
                                    </div>
                                  </div>
                                );
                              })}

                              <div className="flex justify-center pt-1">
                                <ChampionPedestalCard
                                  championName={championDisplay}
                                  isAr={isAr}
                                  onInspectChampion={
                                    finalWinner
                                      ? () => setSelectedTeamParticipant(finalWinner)
                                      : undefined
                                  }
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className={`${mobileShowFullTree ? 'block' : 'hidden md:block'} overflow-x-auto pb-3 bracket-scroll`}>
                      <div className="inline-flex items-stretch gap-0 min-w-max px-1">
                        {treeRounds.map((r, tIdx) => {
                          const hasNext = tIdx < treeRounds.length - 1;
                          const slotHeight = UNIT_HEIGHT * 2 ** tIdx;
                          return (
                            <Fragment key={r.roundIndex}>
                              <div className="flex flex-col shrink-0">
                                {/* Round Header */}
                                <div className="text-xs font-extrabold text-[#D4FF00] pb-2 mb-3 border-b border-white/[0.08] px-2 flex items-center justify-between gap-2 w-[216px]">
                                  <span>{translateRoundName(r.nameAr, lang)}</span>
                                  <span className="font-mono-num text-[10px] text-slate-400">
                                    {r.matches.length}
                                  </span>
                                </div>

                                {/* Aligned Tree Nodes Column */}
                                <div
                                  className="flex flex-col justify-around"
                                  style={{ height: `${totalTreeHeight}px` }}
                                >
                                  {r.matches.map((m) => {
                                    const aWon = Boolean(m.winnerId && m.winnerId === m.participantA?.id);
                                    const bWon = Boolean(m.winnerId && m.winnerId === m.participantB?.id);

                                    return (
                                      <div
                                        key={m.id}
                                        className="relative flex items-center"
                                        style={{ height: `${slotHeight}px` }}
                                      >
                                        {/* Match Box */}
                                        <motion.div
                                          initial={false}
                                          animate={
                                            m.status === 'completed' && !prefersReduced
                                              ? { scale: [0.985, 1] }
                                              : { scale: 1 }
                                          }
                                          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                          className={`w-[216px] rounded-xl border p-2.5 text-xs space-y-1.5 shadow-sm transition-colors ${
                                            m.status === 'completed'
                                              ? 'bg-[#070811] border-amber-400/50 shadow-[0_0_16px_-8px_rgba(251,191,36,0.5)]'
                                              : m.status === 'live'
                                              ? 'bg-[#070811] border-emerald-500/55'
                                              : 'bg-[#070811] border-white/[0.1]'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono-num">
                                            <span className="flex items-center gap-1.5">
                                              <span
                                                aria-hidden="true"
                                                className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                                                  m.status === 'completed'
                                                    ? 'arena-dot-done'
                                                    : m.status === 'live' ||
                                                      m.status === 'pending_review'
                                                    ? 'arena-dot-live animate-pulse'
                                                    : 'arena-dot-open'
                                                }`}
                                              />
                                              <span>#{m.matchNumber}</span>
                                            </span>
                                            <span className="text-[#22D3EE]">
                                              {translateGroupName(m.groupName, lang)}
                                            </span>
                                          </div>

                                          {/* Team A */}
                                          <div
                                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                                              aWon
                                                ? 'arena-winner-gold-slot font-bold'
                                                : 'bg-white/[0.03] border-transparent text-slate-200'
                                            }`}
                                          >
                                            {m.participantA ? (
                                              <motion.button
                                                key={m.participantA.id}
                                                initial={
                                                  prefersReduced ? false : { opacity: 0.4, x: isAr ? -6 : 6 }
                                                }
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                                type="button"
                                                onClick={() => setSelectedTeamParticipant(m.participantA)}
                                                className="truncate text-start hover:text-[#22D3EE] transition-colors flex items-center gap-1 min-w-0 flex-1 font-semibold"
                                                title={isAr ? 'عرض أعضاء الفريق' : 'View team roster'}
                                              >
                                                {aWon && (
                                                  <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                                                )}
                                                <span className="truncate">
                                                  {m.participantA.teamName || m.participantA.name}
                                                </span>
                                              </motion.button>
                                            ) : (
                                              <span className="truncate text-slate-500">
                                                {isAr ? 'بانتظار المتأهل' : 'TBD'}
                                              </span>
                                            )}
                                            <BroadcastScoreValue
                                              value={m.scoreA}
                                              isWinner={aWon}
                                              size="sm"
                                            />
                                          </div>

                                          {/* Team B */}
                                          <div
                                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                                              bWon
                                                ? 'arena-winner-gold-slot font-bold'
                                                : 'bg-white/[0.03] border-transparent text-slate-200'
                                            }`}
                                          >
                                            {m.participantB ? (
                                              <motion.button
                                                key={m.participantB.id}
                                                initial={
                                                  prefersReduced ? false : { opacity: 0.4, x: isAr ? -6 : 6 }
                                                }
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                                type="button"
                                                onClick={() => setSelectedTeamParticipant(m.participantB)}
                                                className="truncate text-start hover:text-[#22D3EE] transition-colors flex items-center gap-1 min-w-0 flex-1 font-semibold"
                                                title={isAr ? 'عرض أعضاء الفريق' : 'View team roster'}
                                              >
                                                {bWon && (
                                                  <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                                                )}
                                                <span className="truncate">
                                                  {m.participantB.teamName || m.participantB.name}
                                                </span>
                                              </motion.button>
                                            ) : (
                                              <span className="truncate text-slate-500">
                                                {isAr ? 'بانتظار المتأهل' : 'TBD'}
                                              </span>
                                            )}
                                            <BroadcastScoreValue
                                              value={m.scoreB}
                                              isWinner={bWon}
                                              size="sm"
                                            />
                                          </div>
                                        </motion.div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Animated SVG Neon Bezier Advancement Paths */}
                              {hasNext && (
                                <BracketPairConnectors
                                  matches={r.matches}
                                  slotHeight={slotHeight}
                                  totalTreeHeight={totalTreeHeight}
                                  isRtl={isAr}
                                />
                              )}
                            </Fragment>
                          );
                        })}

                        {/* Champion Connector Beam + Trophy Pedestal Column */}
                        <div className="self-end">
                          <BracketChampionBeam
                            isCrowned={Boolean(championDisplay)}
                            isRtl={isAr}
                            height={totalTreeHeight}
                          />
                        </div>

                        <div className="flex flex-col shrink-0">
                          <div className="text-xs font-extrabold text-[#F472B6] pb-2 mb-3 border-b border-white/[0.08] px-2 text-center w-[186px]">
                            {isAr ? 'البطل المتوّج' : 'Champion'}
                          </div>
                          <div
                            className="flex items-center"
                            style={{ height: `${totalTreeHeight}px` }}
                          >
                            <ChampionPedestalCard
                              championName={championDisplay}
                              isAr={isAr}
                              onInspectChampion={
                                finalWinner
                                  ? () => setSelectedTeamParticipant(finalWinner)
                                  : undefined
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {/* Tab 2: 4-Teams-Per-Group Standings */}
          {innerTab === 'standings' &&
            (() => {
              const standings = computeGroupStandings(tournament);
              return (
                <section className="space-y-4">
                  {tournament.lastAiMatchupSummary && (
                    <div className="bg-[#0E1222] border border-emerald-500/30 rounded-2xl p-4 text-xs text-emerald-300">
                      {tournament.lastAiMatchupSummary}
                    </div>
                  )}
                  <div className="text-xs text-slate-400 flex items-center justify-between gap-2">
                    <span>
                      {isAr
                        ? `كل مجموعة تضم 4 فرق — يتأهل الأول والثاني إلى ${translateRoundName(
                            tournament.rounds[1]?.nameAr || 'دور الـ 16',
                            lang
                          )}. اضغط على اسم أي فريق لعرض أعضائه.`
                        : `Each group holds 4 teams — Top 2 advance to ${translateRoundName(
                            tournament.rounds[1]?.nameAr || 'دور الـ 16',
                            lang
                          )}. Click any team to view its roster.`}
                    </span>
                    <span className="font-mono-num text-[#22D3EE] font-semibold">
                      {isAr
                        ? `${activeGroups.length} مجموعات`
                        : `${activeGroups.length} Groups`}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {activeGroups.map((gn) => {
                      const rows = standings[gn] || [];
                      return (
                        <div
                          key={gn}
                          className="bg-[#0E1222] border border-white/[0.08] rounded-2xl overflow-hidden"
                        >
                          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
                            <span className="text-xs font-bold text-[#D4FF00]">
                              {translateGroupName(gn, lang)}
                            </span>
                            <span className="text-[11px] font-mono-num text-slate-400">
                              {isAr ? `${rows.length}/4 فرق` : `${rows.length}/4 teams`}
                            </span>
                          </div>
                          {rows.length === 0 ? (
                            <div className="p-5 text-center text-xs text-slate-500">
                              {isAr
                                ? 'لا توجد فرق في هذه المجموعة بعد.'
                                : 'No teams assigned to this group yet.'}
                            </div>
                          ) : (
                            <div className="divide-y divide-white/[0.05]">
                              <div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                                <span>{isAr ? '# · الفريق' : '# · Team'}</span>
                                <div className="flex items-center gap-2 font-mono-num">
                                  <span className="w-5 text-center">{isAr ? 'لعب' : 'P'}</span>
                                  <span className="w-5 text-center text-emerald-300">
                                    {isAr ? 'له' : 'GF'}
                                  </span>
                                  <span className="w-6 text-center text-rose-300">
                                    {isAr ? 'عليه' : 'GA'}
                                  </span>
                                  <span className="w-6 text-center">{isAr ? 'فارق' : 'GD'}</span>
                                  <span className="w-7 text-end text-[#D4FF00]">
                                    {isAr ? 'ن' : 'Pts'}
                                  </span>
                                </div>
                              </div>
                              {rows.map((r, i) => {
                                const gd = r.goalsFor - r.goalsAgainst;
                                const gdText = gd > 0 ? `+${gd}` : `${gd}`;
                                const isLeader = i === 0 && r.played > 0;
                                const isRunnerUp = i === 1 && r.played > 0;
                                return (
                                  <button
                                    key={r.participant.id}
                                    type="button"
                                    onClick={() => setSelectedTeamParticipant(r.participant)}
                                    className={`w-full px-3 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-white/[0.03] transition-colors text-start ${
                                      isLeader
                                        ? 'arena-winner-gold-slot font-bold'
                                        : isRunnerUp
                                        ? 'bg-[#22D3EE]/[0.05]'
                                        : ''
                                    }`}
                                    title={isAr ? 'اضغط لعرض أعضاء الفريق' : 'Click to view team roster'}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="font-mono-num text-[#D4FF00] w-4 shrink-0">
                                        #{i + 1}
                                      </span>
                                      {isLeader && (
                                        <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                                      )}
                                      <span
                                        className={`hover:text-[#22D3EE] font-semibold truncate ${
                                          isLeader ? 'arena-winner-gold-text' : 'text-white'
                                        }`}
                                      >
                                        {r.participant.teamName || r.participant.name}
                                      </span>
                                      {isLeader && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded arena-winner-gold-badge shrink-0">
                                          {isAr ? 'أول' : '1st'}
                                        </span>
                                      )}
                                      {isRunnerUp && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#22D3EE]/15 text-[#22D3EE] shrink-0">
                                          {isAr ? 'متأهل' : '2nd'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 font-mono-num shrink-0 text-[11px]">
                                      <span className="text-slate-400 w-5 text-center">
                                        {r.played}
                                      </span>
                                      <span className="text-emerald-300 font-bold w-5 text-center">
                                        {r.goalsFor}
                                      </span>
                                      <span className="text-rose-300 font-bold w-6 text-center">
                                        {r.goalsAgainst}
                                      </span>
                                      <span
                                        className={`font-bold w-6 text-center ${
                                          gd > 0
                                            ? 'text-emerald-300'
                                            : gd < 0
                                            ? 'text-rose-400'
                                            : 'text-slate-400'
                                        }`}
                                      >
                                        {gdText}
                                      </span>
                                      <span className="text-[#D4FF00] font-extrabold w-7 text-end">
                                        {r.points}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

          {/* Tab 3: Rules & Prizes */}
          {innerTab === 'rules' && (
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <h3 className="text-lg font-bold text-white">
                  {isAr ? 'قوانين ولوائح البطولة' : 'Tournament Rules & Regulations'}
                </h3>
                {tournament.rules.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3">
                    {isAr
                      ? 'لم تقم الإدارة بإضافة قوانين خاصة لهذه البطولة بعد.'
                      : 'No custom rules added by Admin for this tournament yet.'}
                  </p>
                ) : (
                  <ol className="space-y-3 text-sm text-slate-300 list-decimal list-inside">
                    {tournament.rules.map((rule, i) => (
                      <li key={i} className="leading-relaxed">
                        {rule}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <h3 className="text-lg font-bold text-white">
                  {isAr ? 'توزيع الجوائز المالية' : 'Prize Pool Breakdown'}
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between py-3 border-b border-white/[0.08]">
                    <span className="text-[#D4FF00] font-semibold">
                      {isAr ? 'المركز الأول (البطل)' : '1st Place (Champion)'}
                    </span>
                    <span className="font-mono-num font-bold text-white">
                      {isAr ? `65% من ${tournament.prizePool}` : `65% of ${tournament.prizePool}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-white/[0.08]">
                    <span className="text-slate-200 font-medium">
                      {isAr ? 'المركز الثاني (الوصيف)' : '2nd Place (Runner-Up)'}
                    </span>
                    <span className="font-mono-num font-semibold text-slate-200">
                      {isAr ? `25% من ${tournament.prizePool}` : `25% of ${tournament.prizePool}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-slate-400">
                      {isAr ? 'المركز الثالث' : '3rd Place'}
                    </span>
                    <span className="font-mono-num text-slate-300">
                      {isAr ? `10% من ${tournament.prizePool}` : `10% of ${tournament.prizePool}`}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Tab 4: Participants */}
          {innerTab === 'participants' && (
            <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
                <h3 className="text-base font-bold text-white">
                  {isAr ? 'قائمة المشاركين والمجموعات' : 'Participants & Assigned Groups'}
                </h3>
                <span className="text-xs text-slate-400 tabular-nums">
                  {isAr ? `${entrants.length} مشارك` : `${entrants.length} participants`}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:gap-px bg-white/[0.05]">
                {entrants.map((p) => {
                  const readySummary = getTeamCheckInSummary(p, tournament.modeTag);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedTeamParticipant(p)}
                      className="bg-[#0E1222] hover:bg-white/[0.03] p-4 flex items-center justify-between gap-3 text-start transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white hover:text-[#22D3EE] truncate flex items-center gap-1.5">
                          <span className="truncate">{p.teamName || p.name}</span>
                          <Users className="w-3.5 h-3.5 text-[#22D3EE] shrink-0" />
                        </div>
                        <div className="text-xs text-slate-400 font-mono-num mt-0.5 truncate">
                          @{p.username}
                          {p.teammateUsername ? ` + @${p.teammateUsername}` : ''} ·{' '}
                          {translateGroupName(p.groupName, lang)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {readySummary.arrivedCount > 0 && (
                          <span
                            className={`text-[10px] font-mono-num font-black px-2 py-0.5 rounded border ${
                              readySummary.status === 'team_ready'
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            }`}
                          >
                            {readySummary.badge}
                          </span>
                        )}
                        <span className="font-mono-num text-xs text-[#D4FF00]">#{p.seed}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <TeamRosterModal
        participant={selectedTeamParticipant}
        tournamentTitle={tournament?.title}
        modeTag={tournament?.modeTag}
        onClose={() => setSelectedTeamParticipant(null)}
      />
    </div>
  );
}
