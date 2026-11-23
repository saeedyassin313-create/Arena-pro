import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  MapPin,
  Radio,
  Trophy,
  Users,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import {
  translateFormatLabel,
  translateGameInfo,
  translateRoundName,
} from '../i18n/helpers.ts';
import type { GameInfo, LiveFeedItem, MatchFormatTag, PlayerProfile, Tournament } from '../types.ts';
import { BroadcastScorePair, ChampionSpotlightBanner } from './BroadcastAnimations.tsx';
import { SafeImage } from './SafeImage.tsx';

interface HomeViewProps {
  tournaments: Tournament[];
  games: GameInfo[];
  liveFeed: LiveFeedItem[];
  profile: PlayerProfile;
  onQuickRegister: (t: Tournament) => void;
  onOpenBracket: (tournamentId: string) => void;
  onOpenGame: (slug: GameInfo['slug']) => void;
}

export function HomeView({
  tournaments,
  games,
  liveFeed,
  profile,
  onQuickRegister,
  onOpenBracket,
  onOpenGame,
}: HomeViewProps) {
  const { lang, isAr } = useLanguage();
  const [modeFilter, setModeFilter] = useState<'all' | MatchFormatTag>('all');

  const featured = tournaments.find((t) => t.isFeatured) || tournaments[0];
  const featuredGame = featured ? games.find((g) => g.slug === featured.gameSlug) : undefined;
  const featuredGameText = featuredGame ? translateGameInfo(featuredGame, lang) : undefined;

  const filteredTournaments = tournaments.filter((t) => {
    if (modeFilter === 'all') return true;
    return t.modeTag === modeFilter;
  });

  const totalRegistered = tournaments.reduce((acc, t) => acc + t.registeredCount, 0);
  const featuredClosed = featured ? !featured.registrationOpen : false;
  const featuredRegistered = featured
    ? profile.registeredTournamentIds.includes(featured.id)
    : false;

  const DirectionalArrow = isAr ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-10 pb-8">
      {/* Hero Split — Arena Pro Featured Championship or Brand Showcase */}
      {featured ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-[#0E1222] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6 relative overflow-hidden">
            <div className="h-1 arena-gradient-bar absolute top-0 inset-x-0" />
            <div>
              <div className="text-xs font-semibold flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[#D4FF00] font-extrabold tracking-wide uppercase">
                  {featured.customGameName || (isAr ? 'أرينا برو' : 'ARENA PRO')}
                </span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="text-[#22D3EE]">{translateFormatLabel(featured.formatLabel, lang)}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="text-slate-300">{featured.venueName}</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight [text-wrap:balance]">
                {featured.title}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                {isAr
                  ? 'بطولات أونلاين وفي أماكن مخصصة بنظام المجموعات العشوائية والمواجهات المباشرة 1v1 و 2v2 و 4v4 بتحكم كامل من الإدارة.'
                  : 'Online and venue tournaments featuring randomized groups and direct 1v1, 2v2, and 4v4 knockout brackets managed exclusively by Admin.'}
              </p>
            </div>

            <div className="bg-[#070811] border border-white/[0.08] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{isAr ? 'الجائزة الكبرى' : 'Grand Prize'}</span>
                <span className="font-extrabold text-[#D4FF00] text-sm">{featured.prizePool}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {isAr ? 'المقاعد المسجلة' : 'Registered Slots'}
                </span>
                <span className="font-mono-num text-[#22D3EE] font-semibold tabular-nums">
                  {isAr
                    ? `${featured.registeredCount} / ${featured.maxSlots} مقعد`
                    : `${featured.registeredCount} / ${featured.maxSlots} slots`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
                <div
                  className="h-full arena-gradient-bar rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((featured.registeredCount / featured.maxSlots) * 100))}%`,
                  }}
                />
              </div>
            </div>

            {featured.winnerName && (
              <ChampionSpotlightBanner
                winnerName={featured.winnerName}
                tournamentTitle={featured.title}
                prizePool={featured.prizePool}
                isAr={isAr}
              />
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onQuickRegister(featured)}
                className={`min-h-[48px] px-6 py-3 rounded-xl font-extrabold text-sm transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                  featuredRegistered
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                    : featuredClosed
                    ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-white/10'
                    : 'bg-[#D4FF00] hover:bg-[#E3FF4D] text-[#070811]'
                }`}
              >
                {featuredClosed && !featuredRegistered && <Lock className="w-4 h-4" />}
                <span>
                  {featuredRegistered
                    ? isAr
                      ? 'أنت مسجل في هذه البطولة'
                      : 'Registered in Tournament'
                    : featuredClosed
                    ? isAr
                      ? 'التسجيل مغلق من الليدر'
                      : 'Registration Closed'
                    : isAr
                    ? 'سجل الآن'
                    : 'Register Now'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onOpenBracket(featured.id)}
                className="min-h-[48px] px-5 py-3 rounded-xl border border-white/15 hover:border-[#22D3EE]/60 bg-[#070811]/60 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <span>{isAr ? 'جدول المواجهات' : 'Match Bracket'}</span>
                <DirectionalArrow className="w-4 h-4 text-[#22D3EE]" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-white/10 min-h-[260px] lg:min-h-full bg-[#0E1222]">
            <SafeImage
              src={featuredGame?.imageUrl || '/assets/aistudio/Gemini_Generated_Image_c646y6c646y6c646_31bc66c8.jpeg'}
              alt={featured.title}
              className="w-full h-full lg:h-full object-cover"
              fallbackTitle={
                featured.customGameName ||
                featuredGameText?.displayName ||
                (isAr ? 'أرينا برو' : 'Arena Pro')
              }
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#070811] via-[#070811]/35 to-transparent arena-photo-overlay">
              <div className="absolute bottom-0 inset-x-0 p-5 sm:p-6 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-200 flex items-center gap-2">
                  <span>{isAr ? 'حالة التسجيل' : 'Registration Status'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-bold text-[#D4FF00]">
                    {featured.registrationOpen
                      ? isAr
                        ? 'مفتوح الآن'
                        : 'Open Now'
                      : isAr
                      ? 'مغلق من الليدر'
                      : 'Closed by Leader'}
                  </span>
                </div>
                <img
                  src="/assets/aistudio/Gemini_Generated_Image_c646y6c646y6c646_31bc66c8.jpeg"
                  alt="Arena Pro"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-xl object-cover border border-white/25 shadow-lg shrink-0"
                />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-[#0E1222] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6 relative overflow-hidden">
            <div className="h-1 arena-gradient-bar absolute top-0 inset-x-0" />
            <div>
              <div className="text-xs font-bold flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[#D4FF00] tracking-wider uppercase">ARENA PRO</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="text-[#F472B6]">GAME ON · NEXT LEVEL</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight [text-wrap:balance]">
                {isAr
                  ? 'منصة أرينا برو للبطولات التنافسية'
                  : 'Arena Pro Competitive Tournament Hub'}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                {isAr
                  ? 'لا توجد بطولات منشورة حالياً. يتم إضافة البطولات وفتح باب التسجيل وتحديد القوانين يدوياً من الإدارة فقط.'
                  : 'No tournaments are published right now. Tournaments, booking locks, and game rules are configured exclusively by Admin.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenBracket('')}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#D4FF00] hover:bg-[#E3FF4D] text-[#070811] text-sm font-extrabold flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <span>{isAr ? 'متابعة المواجهات والبث الحي' : 'View Matches & Live Feed'}</span>
                <DirectionalArrow className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpenGame('fc27')}
                className="min-h-[48px] px-5 py-3 rounded-xl border border-white/15 hover:border-[#22D3EE]/60 bg-[#070811]/60 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {isAr ? 'استعراض الألعاب' : 'Explore Games'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-white/10 min-h-[260px] bg-[#070811]">
            <SafeImage
              src="/assets/aistudio/Gemini_Generated_Image_c646y6c646y6c646_31bc66c8.jpeg"
              alt="Arena Pro — Game On Next Level"
              className="w-full h-full object-cover"
              fallbackTitle="ARENA PRO"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#070811] via-[#070811]/20 to-transparent arena-photo-overlay">
              <div className="absolute bottom-0 inset-x-0 p-5">
                <div className="text-xs text-slate-200 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-[#F472B6]" />
                  <span>
                    {isAr ? 'الحجز مغلق حالياً حتى تفتحه الإدارة' : 'Booking currently locked by Admin'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4-Column Arena Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0E1222] border border-white/[0.09] rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-400">
            {isAr ? 'بطولات أرينا برو' : 'Arena Pro Tournaments'}
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white tabular-nums">
            {tournaments.length}
          </div>
        </div>
        <div className="bg-[#0E1222] border border-white/[0.09] rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-400">
            {isAr ? 'مشاركون في البطولات' : 'Total Entrants'}
          </div>
          <div className="mt-2 text-2xl font-extrabold text-[#22D3EE] tabular-nums">
            {totalRegistered}
          </div>
        </div>
        <div className="bg-[#0E1222] border border-white/[0.09] rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-400">{isAr ? 'ألعاب معتمدة' : 'Official Games'}</div>
          <div className="mt-2 text-2xl font-extrabold text-[#F472B6] tabular-nums">
            {games.length}
          </div>
        </div>
        <div className="bg-[#0E1222] border border-white/[0.09] rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-400">
            {isAr ? 'معرفك السريع (ID)' : 'Your Quick ID'}
          </div>
          <div className="mt-2 text-lg font-extrabold font-mono-num text-[#D4FF00] truncate">
            @{profile.handle}
          </div>
        </div>
      </section>

      {/* Tournaments List */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {isAr ? 'بطولات أرينا برو المتاحة' : 'Available Tournaments'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {isAr
                ? 'سجل بيوزرك وأضف صديقك في تحديات 2v2 ليتم وضعكم في مجموعة عشوائية.'
                : 'Register with your username and pair with a friend in 2v2 challenges for random group placement.'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0E1222] border border-white/[0.09] rounded-xl self-start max-w-full overflow-x-auto">
            {[
              { key: 'all', label: isAr ? 'الكل' : 'All' },
              { key: '1v1', label: '1v1' },
              { key: '2v2', label: '2v2' },
              { key: '4v4', label: '4v4' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setModeFilter(tab.key as 'all' | MatchFormatTag)}
                className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  modeFilter === tab.key
                    ? 'bg-[#D4FF00] text-[#070811]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTournaments.length === 0 ? (
          <div className="bg-[#0E1222] border border-white/[0.09] rounded-2xl p-8 text-center">
            <p className="text-sm text-slate-300">
              {tournaments.length === 0
                ? isAr
                  ? 'لا توجد بطولات منشورة حالياً. ستظهر البطولات هنا فور إضافتها من الإدارة.'
                  : 'No tournaments published yet. New tournaments will appear here once added by Admin.'
                : isAr
                ? 'لا توجد بطولات مطابقة لهذا النظام حالياً.'
                : 'No tournaments match this format filter right now.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTournaments.map((t) => {
              const game = games.find((g) => g.slug === t.gameSlug);
              const gameText = game ? translateGameInfo(game, lang) : undefined;
              const isRegistered = profile.registeredTournamentIds.includes(t.id);
              const isFull = t.registeredCount >= t.maxSlots;
              const isClosed = !t.registrationOpen;

              return (
                <article
                  key={t.id}
                  className="bg-[#0E1222] border border-white/[0.09] hover:border-[#22D3EE]/40 rounded-2xl overflow-hidden flex flex-col justify-between transition-colors"
                >
                  <div className="relative h-44">
                    <SafeImage
                      src={
                        game?.imageUrl ||
                        '/assets/aistudio/Gemini_Generated_Image_c646y6c646y6c646_31bc66c8.jpeg'
                      }
                      alt={t.title}
                      className="w-full h-full object-cover"
                      fallbackTitle={t.customGameName || gameText?.displayName}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0E1222] via-[#0E1222]/25 to-transparent" />
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                    <div>
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5 mb-2">
                        <span className="text-[#22D3EE] font-semibold">
                          {t.customGameName || gameText?.displayName || game?.nameEn}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#F472B6] font-semibold">{t.modeTag}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <span
                            aria-hidden="true"
                            className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                              t.status === 'completed'
                                ? 'arena-dot-done'
                                : t.status === 'ongoing'
                                ? 'arena-dot-live animate-pulse'
                                : 'arena-dot-open'
                            }`}
                          />
                          <span
                            className={
                              t.status === 'completed'
                                ? 'text-slate-400'
                                : t.status === 'ongoing'
                                ? 'text-emerald-300'
                                : 'text-rose-300'
                            }
                          >
                            {t.status === 'completed'
                              ? isAr
                                ? 'منتهية'
                                : 'Completed'
                              : t.status === 'ongoing'
                              ? isAr
                                ? 'جارية الآن'
                                : 'Live Now'
                              : isClosed
                              ? isAr
                                ? 'التسجيل مغلق'
                                : 'Closed'
                              : isAr
                              ? 'قائمة للتسجيل'
                              : 'Open'}
                          </span>
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white leading-snug">{t.title}</h3>

                      <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-3.5 h-3.5 text-[#D4FF00] shrink-0" />
                          <span>
                            {isAr ? 'الجائزة:' : 'Prize:'} {t.prizePool}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{t.venueName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="tabular-nums">
                            {isAr
                              ? `المشاركون: ${t.registeredCount} من ${t.maxSlots}`
                              : `Entrants: ${t.registeredCount} / ${t.maxSlots}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/[0.06] flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onQuickRegister(t)}
                        className={`flex-1 min-h-[44px] rounded-xl text-xs font-extrabold transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
                          isRegistered
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                            : isClosed || isFull
                            ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-white/10'
                            : 'bg-[#D4FF00] hover:bg-[#E3FF4D] text-[#070811]'
                        }`}
                      >
                        {isClosed && !isRegistered && <Lock className="w-3.5 h-3.5" />}
                        <span>
                          {isRegistered
                            ? isAr
                              ? 'مسجل بالفعل'
                              : 'Registered'
                            : isClosed
                            ? isAr
                              ? 'التسجيل مغلق'
                              : 'Closed'
                            : isFull
                            ? isAr
                              ? 'اكتمل العدد'
                              : 'Full'
                            : isAr
                            ? 'سجل الآن'
                            : 'Register'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenBracket(t.id)}
                        className="min-h-[44px] px-4 rounded-xl border border-white/15 hover:border-[#22D3EE]/50 text-xs font-semibold text-slate-200 transition-colors whitespace-nowrap shrink-0"
                      >
                        {isAr ? 'المواجهات' : 'Matches'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {liveFeed.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-[#22D3EE]" />
              <span>{isAr ? 'أحدث المواجهات المكتملة' : 'Latest Completed Matches'}</span>
            </h2>
            <button
              type="button"
              onClick={() => onOpenBracket(liveFeed[0].tournamentId)}
              className="text-xs text-[#D4FF00] hover:underline font-bold"
            >
              {isAr ? 'عرض الكل في المواجهات' : 'View All in Matches'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {liveFeed.slice(0, 3).map((item) => {
              const aWon = item.winnerName === item.participantAName;
              const bWon = item.winnerName === item.participantBName;
              return (
                <div
                  key={item.id}
                  className="bg-[#0E1222] border border-white/[0.09] rounded-2xl p-4 space-y-2"
                >
                  <div className="text-[11px] text-[#22D3EE] font-semibold">
                    {item.gameName} · {translateRoundName(item.roundName, lang)}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-white">
                    <span
                      className={`truncate ${
                        aWon ? 'arena-winner-gold-text font-extrabold' : 'text-white'
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
                      className={`truncate ${
                        bWon ? 'arena-winner-gold-text font-extrabold' : 'text-white'
                      }`}
                    >
                      {item.participantBName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] arena-winner-gold-text font-bold">
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {isAr ? 'الفائز:' : 'Winner:'} {item.winnerName}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick Games Strip */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg sm:text-xl font-bold text-white">
            {isAr ? 'الألعاب المعتمدة في أرينا برو' : 'Supported Games on Arena Pro'}
          </h2>
          <span className="text-xs text-slate-400">
            {isAr ? 'اضغط على اللعبة لعرض بطولاتها' : 'Select a game to view its tournaments'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {games.map((g) => {
            const gameText = translateGameInfo(g, lang);
            return (
              <button
                key={g.slug}
                type="button"
                onClick={() => onOpenGame(g.slug)}
                className="group text-start bg-[#0E1222] border border-white/[0.09] hover:border-[#D4FF00]/60 rounded-2xl overflow-hidden transition-colors"
              >
                <div className="h-44 overflow-hidden bg-[#070811]">
                  <SafeImage
                    src={g.imageUrl}
                    alt={g.nameEn}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    fallbackTitle={g.nameEn}
                  />
                </div>
                <div className="p-4">
                  <div className="text-base font-bold text-white truncate">
                    {gameText.displayName}
                  </div>
                  <div className="text-xs text-[#22D3EE] truncate mt-1">
                    {gameText.modeLabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
