import { Lock, MapPin, ShieldCheck, Trophy, Users } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { translateFormatLabel, translateGameInfo } from '../i18n/helpers.ts';
import type { GameInfo, GameSlug, PlayerProfile, Tournament } from '../types.ts';
import { SafeImage } from './SafeImage.tsx';

interface GamesHubViewProps {
  games: GameInfo[];
  tournaments: Tournament[];
  selectedGame: GameSlug;
  profile: PlayerProfile;
  onSelectGame: (slug: GameSlug) => void;
  onQuickRegister: (t: Tournament) => void;
  onOpenBracket: (tournamentId: string) => void;
}

export function GamesHubView({
  games,
  tournaments,
  selectedGame,
  profile,
  onSelectGame,
  onQuickRegister,
  onOpenBracket,
}: GamesHubViewProps) {
  const { lang, isAr } = useLanguage();
  const activeGame = games.find((g) => g.slug === selectedGame) || games[0];
  if (!activeGame) return null;

  const activeGameText = translateGameInfo(activeGame, lang);
  const gameTournaments = tournaments.filter((t) => t.gameSlug === activeGame.slug);

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            {isAr ? 'قسم الألعاب' : 'Games Hub'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isAr
              ? 'اختر اللعبة لاستعراض القوانين المعتمدة من الإدارة والبطولات الخاصة بها.'
              : 'Select a game to view Admin-defined rules and active tournaments.'}
          </p>
        </div>
      </div>

      {/* Game Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 bracket-scroll">
        {games.map((g) => {
          const isActive = g.slug === activeGame.slug;
          const gText = translateGameInfo(g, lang);
          return (
            <button
              key={g.slug}
              type="button"
              onClick={() => onSelectGame(g.slug)}
              className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-[#D4FF00] border-[#D4FF00] text-[#070811]'
                  : 'bg-[#0E1222] border-white/[0.09] text-slate-300 hover:text-white hover:border-[#22D3EE]/45'
              }`}
            >
              {gText.displayName}
            </button>
          );
        })}
      </div>

      {/* Dedicated Game Spotlight Card */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch bg-[#0E1222] border border-white/10 rounded-2xl overflow-hidden">
        <div className="lg:col-span-5 min-h-[240px] lg:min-h-full relative bg-[#070811]">
          <SafeImage
            src={activeGame.imageUrl}
            alt={activeGame.nameEn}
            className="w-full h-full object-cover"
            fallbackTitle={activeGameText.displayName}
          />
          <div
            className={`absolute inset-0 bg-gradient-to-t from-[#0E1222] via-transparent to-transparent ${
              isAr ? 'lg:bg-gradient-to-l' : 'lg:bg-gradient-to-r'
            }`}
          />
        </div>

        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div>
            <div className="text-xs font-semibold flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[#22D3EE]">{activeGame.nameEn}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="text-[#F472B6]">{activeGameText.modeLabel}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="tabular-nums text-slate-300">
                {isAr
                  ? `${activeGame.activePlayersCount} لاعب نشط`
                  : `${activeGame.activePlayersCount} active players`}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white">{activeGameText.displayName}</h2>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">{activeGameText.summary}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/[0.08]">
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {isAr ? 'نظام الاحتساب المعتمد' : 'Official Scoring Format'}
              </div>
              <div className="text-sm font-semibold text-white">
                {activeGameText.scoringSystem}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {isAr ? 'أنظمة التحدي المدعومة' : 'Supported Modes'}
              </div>
              <div className="text-sm font-semibold text-white">{activeGameText.modeLabel}</div>
            </div>
          </div>

          <div className="space-y-2.5 pt-4 border-t border-white/[0.08]">
            <div className="text-xs font-semibold text-[#D4FF00] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>
                {isAr
                  ? `قوانين الإدارة لبطولات ${activeGameText.displayName}`
                  : `Admin Rules for ${activeGameText.displayName}`}
              </span>
            </div>

            {activeGameText.rulesHighlights.length === 0 ? (
              <div className="bg-[#070811] border border-white/[0.07] rounded-xl px-4 py-3 text-xs text-slate-400">
                {isAr
                  ? 'لم تقم الإدارة بإضافة قوانين لهذه اللعبة بعد. ستظهر هنا فور إضافتها من لوحة التحكم.'
                  : 'No rules have been added by Admin for this game yet. Admin-authored rules will appear here once published.'}
              </div>
            ) : (
              <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                {activeGameText.rulesHighlights.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Tournaments specifically for the selected game */}
      <section className="space-y-4">
        <h3 className="text-lg sm:text-xl font-bold text-white">
          {isAr
            ? `بطولات ${activeGameText.displayName} المتاحة (${gameTournaments.length})`
            : `Available ${activeGameText.displayName} Tournaments (${gameTournaments.length})`}
        </h3>

        {gameTournaments.length === 0 ? (
          <div className="bg-[#0E1222] border border-white/[0.09] rounded-2xl p-8 text-center">
            <p className="text-sm text-slate-300">
              {isAr
                ? 'لا توجد بطولات مفتوحة حالياً لهذه اللعبة.'
                : 'No open tournaments for this game right now.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {gameTournaments.map((t) => {
              const isRegistered = profile.registeredTournamentIds.includes(t.id);
              const isClosed = !t.registrationOpen;
              return (
                <div
                  key={t.id}
                  className="bg-[#0E1222] border border-white/[0.09] rounded-2xl p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-[#22D3EE]">{translateFormatLabel(t.formatLabel, lang)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#F472B6]">{t.modeTag}</span>
                    </div>
                    <h4 className="text-base font-bold text-white">{t.title}</h4>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-[#D4FF00] shrink-0" />
                        <span>{t.prizePool}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="tabular-nums">
                          {isAr
                            ? `${t.registeredCount}/${t.maxSlots} مقعد`
                            : `${t.registeredCount}/${t.maxSlots} slots`}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5 text-slate-400">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{t.venueName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 pt-3 border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => onQuickRegister(t)}
                      className={`flex-1 min-h-[44px] rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5 ${
                        isRegistered
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                          : isClosed
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
                          : isAr
                          ? 'سجل الآن'
                          : 'Register'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBracket(t.id)}
                      className="min-h-[44px] px-4 rounded-xl border border-white/15 hover:border-[#22D3EE]/50 text-xs font-semibold text-slate-200 transition-colors"
                    >
                      {isAr ? 'شجرة البطولة' : 'Bracket'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
