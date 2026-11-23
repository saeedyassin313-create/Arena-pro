import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { MessageCircle, Send, Users } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { FriendChatMessage, PlayerProfile, TeamMember } from '../types.ts';

export interface ChatContact {
  uid: string;
  handle: string;
  displayName: string;
  playerCode?: string;
  isOnline?: boolean;
  lastActiveAt?: string;
  isFriend?: boolean;
}

interface FriendsChatPanelProps {
  profile: PlayerProfile;
  teamMembers: TeamMember[];
  chatContacts: ChatContact[];
  messages: FriendChatMessage[];
  selectedTarget: string;
  onSelectTarget: (target: string) => void;
  onSendMessage: (target: string, text: string, targetHandle?: string) => Promise<boolean>;
  onMarkChannelRead: (channelId: string) => void;
  sectionRef?: RefObject<HTMLElement | null>;
  onVisibilityChange?: (visible: boolean) => void;
}

function getChannelForTarget(myUid: string, target: string): string {
  if (target === 'team-group') return 'team-group';
  return [myUid, target].sort().join('::');
}

export function FriendsChatPanel({
  profile,
  teamMembers,
  chatContacts,
  messages,
  selectedTarget,
  onSelectTarget,
  onSendMessage,
  onMarkChannelRead,
  sectionRef,
  onVisibilityChange,
}: FriendsChatPanelProps) {
  const { isAr } = useLanguage();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const mergedContacts = useMemo<ChatContact[]>(() => {
    const byKey = new Map<string, ChatContact>();

    for (const c of chatContacts) {
      if (!c.uid || c.uid === profile.id) continue;
      byKey.set(c.uid, c);
    }

    for (const m of teamMembers) {
      const uid = m.uid;
      if (!uid || uid === profile.id) continue;
      if (!byKey.has(uid)) {
        byKey.set(uid, {
          uid,
          handle: m.handle,
          displayName: m.name || m.handle,
          isOnline: m.isOnline,
          lastActiveAt: m.lastActiveAt,
          isFriend: true,
        });
      }
    }

    return Array.from(byKey.values());
  }, [chatContacts, teamMembers, profile.id]);

  const activeContact =
    selectedTarget === 'team-group'
      ? null
      : mergedContacts.find((c) => c.uid === selectedTarget) || null;

  const activeChannelId = getChannelForTarget(profile.id, selectedTarget);

  const channelMessages = useMemo(
    () => messages.filter((m) => m.channelId === activeChannelId),
    [messages, activeChannelId]
  );

  const getUnreadCount = (channelId: string): number =>
    messages.filter(
      (m) =>
        m.channelId === channelId &&
        m.senderUid !== profile.id &&
        !(m.readBy || []).includes(profile.id)
    ).length;

  // Observe whether the chat panel is currently in viewport
  useEffect(() => {
    const el = sectionRef?.current;
    if (!el || !onVisibilityChange || typeof IntersectionObserver === 'undefined') {
      onVisibilityChange?.(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        onVisibilityChange(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      onVisibilityChange(false);
    };
  }, [sectionRef, onVisibilityChange]);

  // Mark active channel read & scroll to bottom when new messages arrive
  useEffect(() => {
    const unreadInActive = getUnreadCount(activeChannelId);
    if (unreadInActive > 0) {
      onMarkChannelRead(activeChannelId);
    }
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [channelMessages.length, activeChannelId]);

  const handleSend = async () => {
    const clean = draft.trim();
    if (!clean || sending) return;
    if (selectedTarget !== 'team-group' && !activeContact) return;
    setSending(true);
    try {
      const ok = await onSendMessage(
        selectedTarget,
        clean,
        selectedTarget === 'team-group' ? 'team-group' : activeContact?.handle
      );
      if (ok) {
        setDraft('');
      }
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const groupUnread = getUnreadCount('team-group');
  const canChat = Boolean(profile.onboardingCompleted) && profile.handle !== 'Player_Guest';

  return (
    <section
      ref={sectionRef}
      id="friends-chat-section"
      className="bg-[#0E1222] border border-white/[0.08] rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#D4FF00]/15 border border-[#D4FF00]/35 flex items-center justify-center text-[#D4FF00] shrink-0">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              {isAr ? 'شات الأصدقاء المباشر' : 'Friends Live Chat'}
            </h2>
            <p className="text-xs text-slate-400">
              {isAr
                ? 'تواصل لحظياً مع أصدقائك، وتصلك رسالة تنبيه من الأعلى لو كنت خارج الشات.'
                : 'Real-time chat with friends — instant top alert whenever you are outside the chat.'}
            </p>
          </div>
        </div>
      </div>

      {!canChat ? (
        <div className="p-6 text-center text-xs text-slate-400">
          {isAr
            ? 'أكمل حفظ اليوزر نيم الخاص بك أولاً في «بيانات حساب اللاعب» لتفعيل الشات مع أصدقائك.'
            : 'Save your player username first in Player Account Details to enable Friends Chat.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[380px]">
          {/* Contacts Sidebar / Mobile Horizontal Selector */}
          <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-e border-white/[0.08] bg-[#070811]/60 p-3 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto max-h-[380px]">
            <button
              type="button"
              onClick={() => onSelectTarget('team-group')}
              className={`shrink-0 lg:w-full text-start px-3 py-2.5 rounded-xl border transition-colors flex items-center justify-between gap-2 ${
                selectedTarget === 'team-group'
                  ? 'bg-[#D4FF00]/15 border-[#D4FF00]/50 text-white'
                  : 'bg-[#0E1222] border-white/[0.06] text-slate-300 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#22D3EE]/15 text-[#22D3EE] flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate whitespace-nowrap">
                    {isAr ? 'جروب الأصدقاء' : 'Friends Group'}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {isAr ? 'محادثة جماعية للفريق' : 'Team group room'}
                  </div>
                </div>
              </div>
              {groupUnread > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#F02E97] text-white text-[10px] font-bold font-mono-num shrink-0">
                  {groupUnread}
                </span>
              )}
            </button>

            {mergedContacts.map((contact) => {
              const dmChannelId = getChannelForTarget(profile.id, contact.uid);
              const unread = getUnreadCount(dmChannelId);
              const active = selectedTarget === contact.uid;
              return (
                <button
                  key={contact.uid}
                  type="button"
                  onClick={() => onSelectTarget(contact.uid)}
                  className={`shrink-0 lg:w-full text-start px-3 py-2.5 rounded-xl border transition-colors flex items-center justify-between gap-2 ${
                    active
                      ? 'bg-[#22D3EE]/15 border-[#22D3EE]/50 text-white'
                      : 'bg-[#0E1222] border-white/[0.06] text-slate-300 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        contact.isOnline
                          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]'
                          : 'bg-slate-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate max-w-[140px] sm:max-w-none">
                        {contact.displayName}
                      </div>
                      <div className="text-[11px] font-mono-num text-slate-400 truncate">
                        @{contact.handle}
                      </div>
                    </div>
                  </div>
                  {unread > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#F02E97] text-white text-[10px] font-bold font-mono-num shrink-0">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}

            {mergedContacts.length === 0 && (
              <div className="hidden lg:block text-[11px] text-slate-400 px-2 py-3 leading-relaxed">
                {isAr
                  ? 'أضف أصدقاء باليوزر نيم أو الـ ID من الأعلى لبدء محادثات خاصة مع كل صديق.'
                  : 'Add friends above by username or ID to start direct chats.'}
              </div>
            )}
          </aside>

          {/* Active Conversation Thread */}
          <div className="lg:col-span-8 flex flex-col h-[380px] bg-[#070811]">
            {/* Thread Header */}
            <div className="px-4 py-3 border-b border-white/[0.08] bg-[#0E1222]/60 flex items-center justify-between gap-2">
              {selectedTarget === 'team-group' ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="w-4 h-4 text-[#22D3EE] shrink-0" />
                  <span className="text-sm font-bold text-white truncate">
                    {isAr ? 'جروب الأصدقاء العام' : 'All Friends Room'}
                  </span>
                </div>
              ) : activeContact ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      activeContact.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  <span className="text-sm font-bold text-white truncate">
                    {activeContact.displayName}
                  </span>
                  <span className="text-xs font-mono-num text-[#22D3EE] truncate">
                    @{activeContact.handle}
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    ·{' '}
                    {activeContact.isOnline
                      ? isAr
                        ? 'أونلاين'
                        : 'Online'
                      : isAr
                      ? 'أوفلاين'
                      : 'Offline'}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-400">
                  {isAr ? 'اختر صديقاً لبدء المحادثة' : 'Select a friend to chat'}
                </span>
              )}
            </div>

            {/* Messages Scroll Area */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {channelMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400 gap-2 px-4">
                  <MessageCircle className="w-8 h-8 text-slate-600" />
                  <p>
                    {selectedTarget === 'team-group'
                      ? isAr
                        ? 'لا توجد رسائل في جروب الأصدقاء بعد — ابدأ المحادثة الآن!'
                        : 'No messages in the friends room yet — say hello!'
                      : isAr
                      ? 'ابدأ أول رسالة مع صديقك الآن وستصله فوراً!'
                      : 'Send the first message to your friend now!'}
                  </p>
                </div>
              ) : (
                channelMessages.map((msg) => {
                  const isMine = msg.senderUid === profile.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[82%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm ${
                          isMine
                            ? 'bg-[#D4FF00] text-[#070811] rounded-ee-sm font-medium'
                            : 'bg-[#0E1222] border border-white/10 text-white rounded-es-sm'
                        }`}
                      >
                        {!isMine && selectedTarget === 'team-group' && (
                          <div className="text-[11px] font-bold text-[#22D3EE] mb-0.5">
                            {msg.senderName} (@{msg.senderHandle})
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                        <div
                          className={`text-[10px] font-mono-num mt-1 ${
                            isMine ? 'text-[#070811]/70 text-end' : 'text-slate-400 text-end'
                          }`}
                        >
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-3 border-t border-white/[0.08] bg-[#0E1222]/80 flex items-center gap-2"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  isAr ? 'اكتب رسالتك هنا...' : 'Type your message...'
                }
                maxLength={800}
                disabled={selectedTarget !== 'team-group' && !activeContact}
                className="flex-1 min-h-[44px] bg-[#070811] border border-white/15 rounded-xl px-3.5 text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#D4FF00]"
              />
              <button
                type="submit"
                disabled={
                  sending ||
                  !draft.trim() ||
                  (selectedTarget !== 'team-group' && !activeContact)
                }
                className="min-h-[44px] px-4 rounded-xl bg-[#D4FF00] hover:bg-[#e5ff4d] disabled:bg-slate-800 disabled:text-slate-500 text-[#070811] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isAr ? 'إرسال' : 'Send'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
