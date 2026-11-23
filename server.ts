import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import express, { type Request, type Response } from 'express';
import nodemailer from 'nodemailer';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  buildGroupStageMatches,
  computeGroupStandings,
  createInitialState,
  generateBracketRounds,
  getGroupStageLabel,
  getGroupsForTournament,
} from './src/data/seed.ts';
import type {
  AdminPlayerSummary,
  BracketMatch,
  BracketParticipant,
  FriendChatMessage,
  FriendRequest,
  GameInfo,
  GameSlug,
  LiveFeedItem,
  MatchFormatTag,
  PlatformState,
  PlayerNotification,
  PlayerProfile,
  ResultSubmission,
  TeamMember,
  TeamRosterMember,
  Tournament,
} from './src/types.ts';
import {
  extractScannedIdentifier,
  getRequiredTeamSize,
  getTeamCheckInSummary,
  normalizeCheckInKey,
} from './src/utils/checkin.ts';
import { buildPlayerEmailTemplate } from './src/utils/emailTemplate.ts';
import {
  isValidEmailAddress,
  normalizeEmail,
  sanitizeWhatsappInput,
} from './src/utils/validation.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'arena-state.json');
const OFFICIAL_SENDER_EMAIL = 'saeedyassin313@gmail.com';
const BOOTSTRAPPED_ADMINS = ['saeedyassin313@gmail.com', 'arenapro185@gmail.com'];
const GEMINI_MODEL = 'gemini-4-hydrogen';

const aiClient =
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      })
    : null;

function normalizeKey(val?: string): string {
  return String(val || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

function isPlaceholderHandle(handle?: string): boolean {
  const k = normalizeKey(handle);
  return !k || k === 'player_guest' || k === 'player';
}

function isPlaceholderCode(code?: string): boolean {
  const k = normalizeKey(code);
  return !k || k === 'arena-1042' || k === 'arena-player' || k === 'guest';
}

function generatePlayerCodeFromUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) % 9000;
  }
  const num = 1000 + Math.abs(hash);
  return `ARENA-${num}`;
}

function sanitizeAdminEmailList(rawList?: unknown[]): string[] {
  const validEmails = (Array.isArray(rawList) ? rawList : [])
    .map((item) => normalizeEmail(String(item || '')))
    .filter((email) => isValidEmailAddress(email));
  return Array.from(new Set([...BOOTSTRAPPED_ADMINS, ...validEmails]));
}

function isEmailServiceConfigured(): boolean {
  const smtpUser = process.env.SMTP_USER || OFFICIAL_SENDER_EMAIL;
  return Boolean(
    process.env.RESEND_API_KEY || (smtpUser && process.env.SMTP_PASS)
  );
}

async function sendEmailIfConfigured(opts: {
  to?: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{
  deliveryStatus: PlayerNotification['deliveryStatus'];
  deliveryNote: string;
}> {
  const to = (opts.to || '').trim();
  if (!to || !isValidEmailAddress(to)) {
    return {
      deliveryStatus: 'no_email',
      deliveryNote: 'تم حفظ التنبيه داخل حساب اللاعب (لا يوجد بريد إلكتروني مسجل).',
    };
  }

  const smtpUser = process.env.SMTP_USER
    ? normalizeEmail(process.env.SMTP_USER)
    : OFFICIAL_SENDER_EMAIL;
  const activeSenderEmail = isValidEmailAddress(smtpUser)
    ? smtpUser
    : OFFICIAL_SENDER_EMAIL;
  const activeSenderDisplay =
    process.env.SMTP_FROM || `Arena Pro <${activeSenderEmail}>`;

  if (process.env.RESEND_API_KEY) {
    try {
      const from = process.env.RESEND_FROM || activeSenderDisplay;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          reply_to: activeSenderEmail,
          to: [to],
          subject: opts.subject,
          text: opts.text,
          html: opts.html,
        }),
      });
      if (res.ok) {
        return {
          deliveryStatus: 'sent',
          deliveryNote: `تم إرسال البريد الإلكتروني من ${activeSenderEmail} إلى ${to} عبر Resend.`,
        };
      }
      return {
        deliveryStatus: 'failed',
        deliveryNote: `تم حفظ التنبيه بالمنصة، وتعذر الإرسال عبر Resend (${res.status}).`,
      };
    } catch {
      return {
        deliveryStatus: 'failed',
        deliveryNote: 'تم حفظ التنبيه بالمنصة، وتعذر الاتصال بخدمة Resend.',
      };
    }
  }

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  if (smtpHost && smtpUser && process.env.SMTP_PASS) {
    try {
      const port = Number(process.env.SMTP_PORT) || 587;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: {
          user: smtpUser,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: activeSenderDisplay,
        replyTo: activeSenderEmail,
        to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return {
        deliveryStatus: 'sent',
        deliveryNote: `تم إرسال البريد الإلكتروني من ${activeSenderEmail} إلى ${to} عبر Gmail SMTP.`,
      };
    } catch {
      return {
        deliveryStatus: 'failed',
        deliveryNote: 'تم حفظ التنبيه بالمنصة، وتعذر الإرسال عبر خادم Gmail SMTP.',
      };
    }
  }

  return {
    deliveryStatus: 'not_configured',
    deliveryNote: `تم حفظ التنبيه داخل حساب اللاعب مع رابط إرسال يدوي من ${activeSenderEmail}.`,
  };
}

function loadServerState(): PlatformState {
  const seed = createInitialState();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PlatformState>;
      return {
        ...seed,
        ...parsed,
        games: Array.isArray(parsed.games) && parsed.games.length > 0 ? parsed.games : seed.games,
        tournaments: Array.isArray(parsed.tournaments) ? parsed.tournaments : seed.tournaments,
        submissions: Array.isArray(parsed.submissions) ? parsed.submissions : seed.submissions,
        liveFeed: Array.isArray(parsed.liveFeed) ? parsed.liveFeed : seed.liveFeed,
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        friendMessages: Array.isArray(parsed.friendMessages) ? parsed.friendMessages : [],
        friendRequests: Array.isArray(parsed.friendRequests) ? parsed.friendRequests : [],
        friendsByUid: parsed.friendsByUid || {},
        profilesByUid: parsed.profilesByUid || {},
        activityByHandle: parsed.activityByHandle || {},
        adminHandles: sanitizeAdminEmailList(parsed.adminHandles),
        profile: parsed.profile ? { ...seed.profile, ...parsed.profile } : seed.profile,
        team: parsed.team ? { ...seed.team, ...parsed.team } : seed.team,
        emailServiceConfigured: isEmailServiceConfigured(),
      };
    }
  } catch (err) {
    console.warn('[Arena Pro] Failed to read persisted state file, using seed:', err);
  }
  return {
    ...seed,
    adminHandles: [...BOOTSTRAPPED_ADMINS],
    emailServiceConfigured: isEmailServiceConfigured(),
  };
}

let serverState: PlatformState = loadServerState();

function persistServerState(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    serverState.adminHandles = sanitizeAdminEmailList(serverState.adminHandles);
    serverState.emailServiceConfigured = isEmailServiceConfigured();
    fs.writeFileSync(STATE_FILE, JSON.stringify(serverState, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Arena Pro] Unable to persist state to disk:', err);
  }
}

function isUserAdminIdentity(identity: { email?: string }): boolean {
  const email = normalizeEmail(identity.email);
  if (!email || !isValidEmailAddress(email)) return false;
  const allowed = new Set<string>(sanitizeAdminEmailList(serverState.adminHandles));
  return allowed.has(email);
}

function isRequestFromVerifiedAdmin(req: Request): string | null {
  const headerEmail = normalizeEmail(
    typeof req.headers['x-viewer-email'] === 'string' ? req.headers['x-viewer-email'] : ''
  );
  const headerVerified = req.headers['x-viewer-verified'] === 'true';
  if (!headerVerified || !isUserAdminIdentity({ email: headerEmail })) {
    return null;
  }
  return headerEmail;
}

// Track live WebSocket connections by uid
const wsClients = new Map<WebSocket, { uid: string; handle: string }>();

function isUidOnline(uid?: string): boolean {
  if (!uid) return false;
  for (const info of wsClients.values()) {
    if (info.uid === uid) return true;
  }
  return false;
}

function broadcastToUids(targetUids: string[], event: unknown): void {
  const uidSet = new Set(targetUids.filter(Boolean));
  const payload = JSON.stringify(event);
  for (const [sock, info] of wsClients.entries()) {
    if (sock.readyState === WebSocket.OPEN && uidSet.has(info.uid)) {
      sock.send(payload);
    }
  }
}

function broadcastAll(event: unknown): void {
  const payload = JSON.stringify(event);
  for (const [sock] of wsClients.entries()) {
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(payload);
    }
  }
}

function getViewerFromRequest(
  req: Request,
  overrides: { uid?: string; handle?: string; email?: string; emailVerified?: boolean } = {}
) {
  const q = (req.query || {}) as Record<string, string | undefined>;
  const headerUid =
    typeof req.headers['x-viewer-uid'] === 'string' && req.headers['x-viewer-uid'].trim()
      ? req.headers['x-viewer-uid'].trim()
      : undefined;
  const headerEmail =
    typeof req.headers['x-viewer-email'] === 'string' && req.headers['x-viewer-email'].trim()
      ? req.headers['x-viewer-email'].trim()
      : undefined;
  const headerHandle =
    typeof req.headers['x-viewer-handle'] === 'string' && req.headers['x-viewer-handle'].trim()
      ? req.headers['x-viewer-handle'].trim()
      : undefined;
  const headerVerified = req.headers['x-viewer-verified'] === 'true';
  return {
    uid: overrides.uid ?? headerUid ?? q.uid,
    handle: overrides.handle ?? headerHandle ?? q.handle,
    email: overrides.email ?? headerEmail ?? q.email,
    emailVerified:
      overrides.emailVerified ??
      (headerVerified || q.verified === '1' || q.verified === 'true'),
  };
}

function buildViewerState(viewer: {
  uid?: string;
  handle?: string;
  email?: string;
  emailVerified?: boolean;
}): PlatformState {
  const uid = (viewer.uid || '').trim() || serverState.profile.id || 'player-main';
  const stored = serverState.profilesByUid?.[uid];
  const baseProfile: PlayerProfile = stored
    ? { ...stored }
    : {
        ...serverState.profile,
        id: uid,
      };

  if (viewer.handle && !isPlaceholderHandle(viewer.handle)) {
    baseProfile.handle = viewer.handle.trim();
  }
  if (viewer.email && viewer.email.trim()) {
    baseProfile.email = viewer.email.trim();
  }
  if (!baseProfile.whatsappNumber && baseProfile.phoneOrDiscord) {
    const cleanPhone = sanitizeWhatsappInput(baseProfile.phoneOrDiscord);
    if (/\d{8,}/.test(cleanPhone)) {
      baseProfile.whatsappNumber = cleanPhone;
    }
  }
  if (isPlaceholderCode(baseProfile.playerCode) && uid !== 'player-main') {
    baseProfile.playerCode = generatePlayerCodeFromUid(uid);
  }

  const rawFriends = serverState.friendsByUid?.[uid] || [];
  const enrichedFriends: TeamMember[] = rawFriends.map((f) => {
    const friendProfile = f.uid ? serverState.profilesByUid?.[f.uid] : undefined;
    const online = isUidOnline(f.uid);
    return {
      ...f,
      isOnline: online,
      lastActiveAt:
        friendProfile?.lastActiveAt ||
        serverState.activityByHandle?.[normalizeKey(f.handle)] ||
        f.lastActiveAt,
    };
  });

  const scopedMessages = (serverState.friendMessages || []).filter(
    (m) =>
      m.channelId === 'team-group' || m.senderUid === uid || m.recipientUid === uid
  );

  const scopedRequests = (serverState.friendRequests || []).filter(
    (r) => r.fromUid === uid || r.toUid === uid
  );

  const isViewerAdmin =
    Boolean(viewer.emailVerified) &&
    isUserAdminIdentity({
      email: viewer.email || baseProfile.email,
    });

  return {
    ...serverState,
    adminHandles: isViewerAdmin ? sanitizeAdminEmailList(serverState.adminHandles) : [],
    emailServiceConfigured: isEmailServiceConfigured(),
    isViewerAdmin,
    profile: baseProfile,
    friendMessages: scopedMessages,
    friendRequests: scopedRequests,
    team: {
      ...serverState.team,
      captainName: baseProfile.displayName || serverState.team.captainName,
      members: enrichedFriends,
    },
  };
}

function getChatContactsForUid(viewerUid: string) {
  const map = new Map<
    string,
    {
      uid: string;
      handle: string;
      displayName: string;
      isOnline?: boolean;
      lastActiveAt?: string;
      isFriend?: boolean;
    }
  >();

  const friends = serverState.friendsByUid?.[viewerUid] || [];
  for (const f of friends) {
    if (!f.uid || f.uid === viewerUid) continue;
    const fp = serverState.profilesByUid?.[f.uid];
    map.set(f.uid, {
      uid: f.uid,
      handle: f.handle,
      displayName: f.name || f.handle,
      isOnline: isUidOnline(f.uid),
      lastActiveAt:
        fp?.lastActiveAt || serverState.activityByHandle?.[normalizeKey(f.handle)] || f.lastActiveAt,
      isFriend: true,
    });
  }

  for (const m of serverState.friendMessages || []) {
    if (m.channelId === 'team-group') continue;
    const peerUid =
      m.senderUid === viewerUid
        ? m.recipientUid
        : m.recipientUid === viewerUid
        ? m.senderUid
        : '';
    const peerHandle = m.senderUid === viewerUid ? m.recipientHandle : m.senderHandle;
    const peerName = m.senderUid === viewerUid ? m.recipientHandle : m.senderName;
    if (peerUid && peerUid !== viewerUid && !map.has(peerUid)) {
      map.set(peerUid, {
        uid: peerUid,
        handle: peerHandle || peerUid,
        displayName: peerName || peerHandle || peerUid,
        isOnline: isUidOnline(peerUid),
        isFriend: false,
      });
    }
  }

  return Array.from(map.values());
}

function lookupPlayerOnServer(rawQuery: string): {
  uid: string;
  handle: string;
  playerCode: string;
  displayName: string;
  isOnline: boolean;
  lastActiveAt?: string;
} | null {
  const q = normalizeKey(extractScannedIdentifier(rawQuery));
  if (!q || isPlaceholderHandle(q) || isPlaceholderCode(q)) return null;

  const candidates: PlayerProfile[] = [
    ...Object.values(serverState.profilesByUid || {}),
    serverState.profile,
  ].filter(Boolean);

  for (const p of candidates) {
    if (isPlaceholderHandle(p.handle)) continue;
    if (
      normalizeKey(p.handle) === q ||
      normalizeKey(p.playerCode) === q ||
      normalizeKey(p.displayName) === q
    ) {
      return {
        uid: p.id,
        handle: p.handle,
        playerCode: p.playerCode || generatePlayerCodeFromUid(p.id),
        displayName: p.displayName || p.handle,
        isOnline: isUidOnline(p.id),
        lastActiveAt: p.lastActiveAt,
      };
    }
  }

  for (const t of serverState.tournaments || []) {
    for (const r of t.rounds || []) {
      for (const m of r.matches || []) {
        for (const p of [m.participantA, m.participantB]) {
          if (!p) continue;
          if (normalizeKey(p.username) === q || normalizeKey(p.name) === q) {
            const uid = p.registeredByUid || p.id;
            return {
              uid,
              handle: p.username,
              playerCode: generatePlayerCodeFromUid(uid),
              displayName: p.name || p.username,
              isOnline: isUidOnline(uid),
            };
          }
        }
      }
    }
  }

  return null;
}

function getGroupSeatsMapFromTournament(t: Tournament) {
  const groupsOrder = getGroupsForTournament(t);
  const groupSeatsMap = new Map<string, (BracketParticipant | null)[]>();
  for (const gn of groupsOrder) {
    groupSeatsMap.set(gn, [null, null, null, null]);
  }
  const round0 = t.rounds[0];
  if (round0) {
    for (const m of round0.matches) {
      const gn = groupsOrder.includes(m.groupName) ? m.groupName : groupsOrder[0];
      const seats = groupSeatsMap.get(gn) || [null, null, null, null];
      if (m.participantA && typeof m.seatA === 'number' && m.seatA >= 0 && m.seatA < 4) {
        seats[m.seatA] = m.participantA;
      } else if (m.participantA && !seats.some((s) => s?.id === m.participantA?.id)) {
        const freeIdx = seats.findIndex((s) => s === null);
        if (freeIdx !== -1) seats[freeIdx] = m.participantA;
      }
      if (m.participantB && typeof m.seatB === 'number' && m.seatB >= 0 && m.seatB < 4) {
        seats[m.seatB] = m.participantB;
      } else if (m.participantB && !seats.some((s) => s?.id === m.participantB?.id)) {
        const freeIdx = seats.findIndex((s) => s === null);
        if (freeIdx !== -1) seats[freeIdx] = m.participantB;
      }
      groupSeatsMap.set(gn, seats);
    }
  }
  return { groupsOrder, groupSeatsMap };
}

function getAllParticipantsFromTournament(t: Tournament): BracketParticipant[] {
  const seen = new Map<string, BracketParticipant>();
  for (const r of t.rounds || []) {
    for (const m of r.matches || []) {
      if (m.participantA && !seen.has(m.participantA.id)) {
        seen.set(m.participantA.id, m.participantA);
      }
      if (m.participantB && !seen.has(m.participantB.id)) {
        seen.set(m.participantB.id, m.participantB);
      }
    }
  }
  return Array.from(seen.values());
}

function updateParticipantEverywhere(
  t: Tournament,
  updatedParticipant: BracketParticipant
): Tournament {
  const nextRounds = t.rounds.map((r) => ({
    ...r,
    matches: r.matches.map((m) => ({
      ...m,
      participantA:
        m.participantA?.id === updatedParticipant.id ? updatedParticipant : m.participantA,
      participantB:
        m.participantB?.id === updatedParticipant.id ? updatedParticipant : m.participantB,
    })),
  }));
  return { ...t, rounds: nextRounds, updatedAtMs: Date.now() };
}

function resolveParticipantEmail(player: BracketParticipant | null): string {
  if (!player) return '';
  if (player.email && isValidEmailAddress(player.email)) return player.email.trim();
  if (player.registeredByUid) {
    const byUid = serverState.profilesByUid?.[player.registeredByUid]?.email;
    if (byUid && isValidEmailAddress(byUid)) return byUid.trim();
  }
  if (player.username) {
    const key = normalizeKey(player.username);
    for (const prof of Object.values(serverState.profilesByUid || {})) {
      if (normalizeKey(prof.handle) === key && prof.email && isValidEmailAddress(prof.email)) {
        return prof.email.trim();
      }
    }
  }
  return '';
}

function buildEmailDispatchDataForMatch(t: Tournament, m: BracketMatch, gameName: string) {
  const mailtoLinks: { name: string; email: string; url: string }[] = [];
  const emailTargets: {
    name: string;
    email: string;
    subject: string;
    text: string;
    html: string;
  }[] = [];

  for (const [player, opponent] of [
    [m.participantA, m.participantB],
    [m.participantB, m.participantA],
  ] as [BracketParticipant | null, BracketParticipant | null][]) {
    const email = resolveParticipantEmail(player);
    if (!player || !email) continue;
    const tpl = buildPlayerEmailTemplate({
      playerName: player.name,
      tournamentTitle: t.title,
      gameName,
      groupName: m.groupName,
      scheduledAt: m.scheduledAt || 'لم يتحدد',
      matchLabel: `مباراة #${m.matchNumber}${m.leg ? ` (${m.leg})` : ''}`,
      opponentName: opponent?.name || 'بانتظار تحديد الخصم',
      venueName: t.venueName,
      prizePool: t.prizePool,
      appUrl: process.env.APP_URL || '',
    });
    mailtoLinks.push({
      name: player.name,
      email,
      url: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
        tpl.subject
      )}&body=${encodeURIComponent(tpl.text)}`,
    });
    emailTargets.push({
      name: player.name,
      email,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
    });
  }
  return { mailtoLinks, emailTargets };
}

function applyMatchResultOnServer(
  tournamentId: string,
  matchId: string,
  scoreA: number,
  scoreB: number,
  winnerId?: string | null,
  autoAiRank = true
): { ok: true; tournament: Tournament; aiSummaryAr?: string } | { ok: false; error: string } {
  const tIdx = serverState.tournaments.findIndex((t) => t.id === tournamentId);
  if (tIdx === -1) return { ok: false, error: 'البطولة غير موجودة.' };

  const t = serverState.tournaments[tIdx];
  const sA = Number(scoreA) || 0;
  const sB = Number(scoreB) || 0;

  let completedMatch: BracketMatch | null = null;
  let completedRoundName = '';
  let winningParticipant: BracketParticipant | null = null;

  const nextRounds = t.rounds.map((r) => ({
    ...r,
    matches: r.matches.map((m) => {
      if (m.id !== matchId) return m;
      let resolvedWinnerId: string | null = winnerId ?? null;
      if (!resolvedWinnerId && m.participantA && m.participantB) {
        if (sA > sB) resolvedWinnerId = m.participantA.id;
        else if (sB > sA) resolvedWinnerId = m.participantB.id;
      }
      winningParticipant =
        resolvedWinnerId && m.participantA?.id === resolvedWinnerId
          ? m.participantA
          : resolvedWinnerId && m.participantB?.id === resolvedWinnerId
          ? m.participantB
          : null;
      completedRoundName = r.nameAr;
      completedMatch = {
        ...m,
        scoreA: sA,
        scoreB: sB,
        winnerId: resolvedWinnerId,
        status: 'completed',
      };
      return completedMatch;
    }),
  }));

  if (!completedMatch) return { ok: false, error: 'المباراة غير موجودة.' };
  const cm = completedMatch as BracketMatch;

  if (cm.roundIndex >= 1 && winningParticipant && cm.roundIndex + 1 < nextRounds.length) {
    const nextRound = nextRounds[cm.roundIndex + 1];
    const targetMatchIdx = Math.floor((cm.matchNumber - 1) / 2);
    const isSlotA = cm.matchNumber % 2 === 1;
    if (nextRound.matches[targetMatchIdx]) {
      const target = { ...nextRound.matches[targetMatchIdx] };
      if (isSlotA) target.participantA = winningParticipant;
      else target.participantB = winningParticipant;
      if (target.participantA && target.participantB && target.status !== 'completed') {
        target.status = 'live';
      }
      nextRound.matches = nextRound.matches.map((m, idx) =>
        idx === targetMatchIdx ? target : m
      );
    }
  }

  let updatedTournament: Tournament = {
    ...t,
    rounds: nextRounds,
    status: t.status === 'open' ? 'ongoing' : t.status,
    updatedAtMs: Date.now(),
  };

  let aiSummaryAr: string | undefined;
  if (autoAiRank && cm.roundIndex === 0) {
    const standings = computeGroupStandings(updatedTournament);
    const groupRows = standings[cm.groupName] || [];
    if (groupRows.length > 0) {
      const leader = groupRows[0];
      const runnerUp = groupRows[1];
      const gd = leader.goalsFor - leader.goalsAgainst;
      aiSummaryAr = runnerUp
        ? `ترتيب ${cm.groupName}: المتصدر «${leader.participant.name}» (${leader.points} نقاط، فارق ${gd >= 0 ? `+${gd}` : gd}) والوصيف «${runnerUp.participant.name}» (${runnerUp.points} نقاط).`
        : `ترتيب ${cm.groupName}: المتصدر «${leader.participant.name}» (${leader.points} نقاط).`;
      updatedTournament = {
        ...updatedTournament,
        lastAiMatchupSummary: aiSummaryAr,
      };
    }
  }

  const gameObj = serverState.games.find((g) => g.slug === t.gameSlug);
  const gameName = t.customGameName || gameObj?.nameAr || t.gameSlug;
  const feedItem: LiveFeedItem = {
    id: `feed_${cm.id}`,
    tournamentId: t.id,
    tournamentTitle: t.title,
    gameName,
    roundName: completedRoundName,
    matchNumber: cm.matchNumber,
    groupName: cm.groupName,
    participantAName: cm.participantA?.name || 'لاعب 1',
    participantBName: cm.participantB?.name || 'لاعب 2',
    scoreA: sA,
    scoreB: sB,
    winnerName: winningParticipant ? (winningParticipant as BracketParticipant).name : 'تعادل',
    approvedAt: new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };

  serverState.tournaments[tIdx] = updatedTournament;
  serverState.liveFeed = [
    feedItem,
    ...(serverState.liveFeed || []).filter((f) => f.id !== feedItem.id),
  ].slice(0, 30);
  persistServerState();

  return { ok: true, tournament: updatedTournament, aiSummaryAr };
}

async function generateGeminiSummary(prompt: string, fallback: string): Promise<string> {
  if (!aiClient) return fallback;
  try {
    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    const text = response.text?.trim();
    return text || fallback;
  } catch (err) {
    console.warn('[Arena Pro] Gemini API fallback used:', err);
    return fallback;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' });

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url || '/ws/chat', `http://${req.headers.host || 'localhost'}`);
      const uid = (url.searchParams.get('uid') || '').trim();
      const handle = (url.searchParams.get('handle') || '').trim();
      wsClients.set(ws, { uid, handle });

      if (handle && !isPlaceholderHandle(handle)) {
        serverState.activityByHandle = {
          ...(serverState.activityByHandle || {}),
          [normalizeKey(handle)]: new Date().toISOString(),
        };
      }

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string };
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // ignore invalid WS frames
        }
      });

      ws.on('close', () => {
        const info = wsClients.get(ws);
        wsClients.delete(ws);
        if (info?.handle && !isPlaceholderHandle(info.handle)) {
          serverState.activityByHandle = {
            ...(serverState.activityByHandle || {}),
            [normalizeKey(info.handle)]: new Date().toISOString(),
          };
        }
      });
    } catch {
      ws.close();
    }
  });

  // 1. State endpoint
  app.get('/api/state', (req: Request, res: Response) => {
    const uid = typeof req.query.uid === 'string' ? req.query.uid : undefined;
    const handle = typeof req.query.handle === 'string' ? req.query.handle : undefined;
    const email = typeof req.query.email === 'string' ? req.query.email : undefined;
    const emailVerified =
      req.query.verified === '1' ||
      req.query.verified === 'true' ||
      req.headers['x-viewer-verified'] === 'true';
    res.json(buildViewerState({ uid, handle, email, emailVerified }));
  });

  // 2. Profile endpoints
  app.get('/api/profile/:uid', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    const profile = serverState.profilesByUid?.[uid] || null;
    res.json({ profile });
  });

  app.put('/api/profile', (req: Request, res: Response) => {
    const updated = (req.body || {}) as Partial<PlayerProfile> & { id?: string; emailVerified?: boolean };
    const uid = (updated.id || serverState.profile.id || 'player-main').trim();
    const existing = serverState.profilesByUid?.[uid] || serverState.profile;
    const nextHandle = (
      updated.handle !== undefined ? updated.handle : existing.handle || 'Player_Guest'
    ).trim();
    const nextDisplayName = (
      updated.displayName !== undefined
        ? updated.displayName
        : existing.displayName || nextHandle
    ).trim();
    const rawWhatsapp =
      updated.whatsappNumber !== undefined
        ? updated.whatsappNumber
        : updated.phoneOrDiscord !== undefined
        ? updated.phoneOrDiscord
        : existing.whatsappNumber || existing.phoneOrDiscord || '';
    const nextWhatsapp = sanitizeWhatsappInput(rawWhatsapp);
    const nextPlayerCode =
      updated.playerCode && !isPlaceholderCode(updated.playerCode)
        ? updated.playerCode
        : !isPlaceholderCode(existing.playerCode)
        ? existing.playerCode
        : uid === 'player-main'
        ? 'ARENA-1042'
        : generatePlayerCodeFromUid(uid);

    const nextProfile: PlayerProfile = {
      ...existing,
      ...updated,
      id: uid,
      handle: nextHandle || 'Player_Guest',
      displayName: nextDisplayName || 'لاعب ضيف',
      whatsappNumber: nextWhatsapp,
      phoneOrDiscord: nextWhatsapp || updated.phoneOrDiscord || existing.phoneOrDiscord || '',
      playerCode: nextPlayerCode,
      lastActiveAt: new Date().toISOString(),
    };

    serverState.profile = nextProfile;
    serverState.profilesByUid = {
      ...(serverState.profilesByUid || {}),
      [uid]: nextProfile,
    };
    if (!isPlaceholderHandle(nextProfile.handle)) {
      serverState.activityByHandle = {
        ...(serverState.activityByHandle || {}),
        [normalizeKey(nextProfile.handle)]: new Date().toISOString(),
      };
    }
    serverState.team = {
      ...serverState.team,
      captainName: nextProfile.displayName,
    };
    persistServerState();

    const emailVerified =
      req.headers['x-viewer-verified'] === 'true' || Boolean(updated.emailVerified);
    const verifiedEmail =
      typeof req.headers['x-viewer-email'] === 'string' && req.headers['x-viewer-email'].trim()
        ? req.headers['x-viewer-email'].trim()
        : nextProfile.email;

    res.json({
      state: buildViewerState({
        uid,
        handle: nextProfile.handle,
        email: verifiedEmail,
        emailVerified,
      }),
    });
  });

  // 3. Team & Friend removal
  app.post('/api/team', (req: Request, res: Response) => {
    const payload = (req.body || {}) as {
      viewerUid?: string;
      viewerHandle?: string;
      name?: string;
      tag?: string;
      removeMemberId?: string;
      regenerateCode?: boolean;
    };
    const uid = payload.viewerUid || serverState.profile.id;
    let nextFriends = [...(serverState.friendsByUid?.[uid] || [])];
    let removedFriendUid: string | undefined;

    if (payload.removeMemberId) {
      const target = nextFriends.find(
        (m) => m.id === payload.removeMemberId || m.uid === payload.removeMemberId
      );
      removedFriendUid = target?.uid;
      nextFriends = nextFriends.filter(
        (m) => m.id !== payload.removeMemberId && m.uid !== payload.removeMemberId
      );
      if (removedFriendUid && serverState.friendsByUid?.[removedFriendUid]) {
        serverState.friendsByUid[removedFriendUid] = serverState.friendsByUid[
          removedFriendUid
        ].filter((m) => m.uid !== uid && m.id !== `m-${uid}`);
      }
    }

    serverState.friendsByUid = {
      ...(serverState.friendsByUid || {}),
      [uid]: nextFriends,
    };
    serverState.team = {
      ...serverState.team,
      name: payload.name !== undefined ? payload.name.trim() || serverState.team.name : serverState.team.name,
      tag:
        payload.tag !== undefined
          ? payload.tag.trim().slice(0, 6).toUpperCase() || serverState.team.tag
          : serverState.team.tag,
      inviteCode: payload.regenerateCode
        ? `ARENA-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${new Date().getFullYear()}`
        : serverState.team.inviteCode,
      members: nextFriends,
    };
    persistServerState();

    if (removedFriendUid) {
      broadcastToUids([uid, removedFriendUid], { type: 'friend:removed' });
    }

    res.json({
      state: buildViewerState(
        getViewerFromRequest(req, { uid, handle: payload.viewerHandle })
      ),
    });
  });

  // 4. Player Lookup & Cloud Hydration
  app.get('/api/users/lookup', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const match = lookupPlayerOnServer(q);
    if (!match) {
      res.json({ found: false });
      return;
    }
    res.json({ found: true, user: match });
  });

  app.post('/api/sync/hydrate-player', (req: Request, res: Response) => {
    const { uid, handle, displayName, playerCode } = (req.body || {}) as {
      uid?: string;
      handle?: string;
      displayName?: string;
      playerCode?: string;
    };
    if (!uid || !handle) {
      res.status(400).json({ error: 'uid and handle required' });
      return;
    }
    const existing = serverState.profilesByUid?.[uid];
    const base = createInitialState().profile;
    serverState.profilesByUid = {
      ...(serverState.profilesByUid || {}),
      [uid]: {
        ...(existing || base),
        id: uid,
        handle: handle.trim(),
        displayName: (displayName || existing?.displayName || handle).trim(),
        playerCode:
          playerCode || existing?.playerCode || generatePlayerCodeFromUid(uid),
      },
    };
    persistServerState();
    res.json({ ok: true });
  });

  app.post('/api/sync/hydrate', (req: Request, res: Response) => {
    const { uid, email, handle, friends, friendRequests } = (req.body || {}) as {
      uid?: string;
      email?: string;
      handle?: string;
      friends?: TeamMember[];
      friendRequests?: FriendRequest[];
    };
    if (!uid) {
      res.status(400).json({ error: 'uid required' });
      return;
    }

    if (Array.isArray(friends) && friends.length > 0) {
      const existing = serverState.friendsByUid?.[uid] || [];
      const mergedMap = new Map<string, TeamMember>();
      for (const f of existing) mergedMap.set(f.uid || f.id, f);
      for (const f of friends) mergedMap.set(f.uid || f.id, f);
      serverState.friendsByUid = {
        ...(serverState.friendsByUid || {}),
        [uid]: Array.from(mergedMap.values()),
      };
    }

    if (Array.isArray(friendRequests) && friendRequests.length > 0) {
      const reqMap = new Map<string, FriendRequest>();
      for (const r of serverState.friendRequests || []) reqMap.set(r.id, r);
      for (const r of friendRequests) {
        const existing = reqMap.get(r.id);
        if (!existing || existing.status === 'pending') {
          reqMap.set(r.id, r);
        }
      }
      serverState.friendRequests = Array.from(reqMap.values());
    }

    persistServerState();
    res.json({
      state: buildViewerState(getViewerFromRequest(req, { uid, handle, email })),
    });
  });

  app.post('/api/sync/hydrate-platform', (req: Request, res: Response) => {
    const {
      uid,
      email,
      handle,
      adminHandles,
      games,
      tournaments,
      registrationsByTournament,
      liveFeed,
      submissions,
    } = (req.body || {}) as {
      uid?: string;
      email?: string;
      handle?: string;
      adminHandles?: string[];
      games?: GameInfo[];
      tournaments?: Tournament[];
      registrationsByTournament?: Record<
        string,
        { participant: BracketParticipant; assignedSeatIndex?: number }[]
      >;
      liveFeed?: LiveFeedItem[];
      submissions?: ResultSubmission[];
    };

    if (isRequestFromVerifiedAdmin(req) && Array.isArray(adminHandles) && adminHandles.length > 0) {
      serverState.adminHandles = sanitizeAdminEmailList([
        ...(serverState.adminHandles || []),
        ...adminHandles,
      ]);
    }

    if (Array.isArray(games) && games.length > 0) {
      const bySlug = new Map(serverState.games.map((g) => [g.slug, g]));
      for (const cg of games) {
        const localG = bySlug.get(cg.slug);
        if (!localG || (cg.updatedAtMs || 0) >= (localG.updatedAtMs || 0)) {
          bySlug.set(cg.slug, cg);
        }
      }
      serverState.games = Array.from(bySlug.values());
    }

    if (Array.isArray(tournaments) && tournaments.length > 0) {
      const byId = new Map(serverState.tournaments.map((t) => [t.id, t]));
      for (const ct of tournaments) {
        const localT = byId.get(ct.id);
        if (!localT || (ct.updatedAtMs || 0) > (localT.updatedAtMs || 0)) {
          byId.set(ct.id, ct);
        }
      }
      serverState.tournaments = Array.from(byId.values());
    }

    if (registrationsByTournament) {
      serverState.tournaments = serverState.tournaments.map((t) => {
        const cloudRegs = registrationsByTournament[t.id];
        if (!cloudRegs || cloudRegs.length === 0) return t;
        let updatedT = t;
        const existing = getAllParticipantsFromTournament(updatedT);
        const existingIds = new Set(existing.map((p) => p.id));
        const missingRegs = cloudRegs.filter((r) => !existingIds.has(r.participant.id));

        if (missingRegs.length > 0 && updatedT.rounds[0]) {
          const { groupsOrder, groupSeatsMap } = getGroupSeatsMapFromTournament(updatedT);
          for (const reg of missingRegs) {
            const gn = groupsOrder.includes(reg.participant.groupName)
              ? reg.participant.groupName
              : groupsOrder[0];
            const seats = [...(groupSeatsMap.get(gn) || [null, null, null, null])];
            const preferredIdx =
              typeof reg.assignedSeatIndex === 'number' &&
              reg.assignedSeatIndex >= 0 &&
              reg.assignedSeatIndex < 4 &&
              !seats[reg.assignedSeatIndex]
                ? reg.assignedSeatIndex
                : seats.findIndex((s) => s === null);
            if (preferredIdx !== -1) {
              seats[preferredIdx] = reg.participant;
              groupSeatsMap.set(gn, seats);
            }
          }
          const rebuiltRound0 = buildGroupStageMatches(
            updatedT.id,
            groupSeatsMap,
            groupsOrder,
            false
          );
          const prevRound0 = updatedT.rounds[0].matches || [];
          const mergedRound0 = rebuiltRound0.map((nm) => {
            const oldMatch = prevRound0.find(
              (om) =>
                om.id === nm.id ||
                (om.groupName === nm.groupName &&
                  om.seatA === nm.seatA &&
                  om.seatB === nm.seatB)
            );
            if (!oldMatch) return nm;
            return {
              ...nm,
              scheduledAt: oldMatch.scheduledAt || nm.scheduledAt,
              leg: oldMatch.leg || nm.leg,
              scoreA: oldMatch.scoreA,
              scoreB: oldMatch.scoreB,
              winnerId: oldMatch.winnerId,
              status: (
                oldMatch.status === 'completed' || oldMatch.status === 'pending_review'
                  ? oldMatch.status
                  : nm.participantA && nm.participantB
                  ? 'live'
                  : 'upcoming'
              ) as BracketMatch['status'],
            };
          });
          const nextCount = getAllParticipantsFromTournament({
            ...updatedT,
            rounds: updatedT.rounds.map((r, i) =>
              i === 0 ? { ...r, matches: mergedRound0 } : r
            ),
          }).length;
          updatedT = {
            ...updatedT,
            registeredCount: Math.max(updatedT.registeredCount, nextCount),
            rounds: updatedT.rounds.map((r, i) =>
              i === 0 ? { ...r, matches: mergedRound0 } : r
            ),
          };
        }

        const refreshed = getAllParticipantsFromTournament(updatedT);
        for (const reg of cloudRegs) {
          if (reg.participant.checkedInHandles?.length) {
            const ep = refreshed.find((p) => p.id === reg.participant.id);
            if (ep) {
              const mergedHandles = Array.from(
                new Set([...(ep.checkedInHandles || []), ...reg.participant.checkedInHandles])
              );
              if (mergedHandles.length !== (ep.checkedInHandles || []).length) {
                updatedT = updateParticipantEverywhere(updatedT, {
                  ...ep,
                  checkedInHandles: mergedHandles,
                });
              }
            }
          }
        }
        return updatedT;
      });
    }

    if (Array.isArray(liveFeed) && liveFeed.length > 0) {
      const feedMap = new Map<string, LiveFeedItem>();
      for (const f of serverState.liveFeed || []) feedMap.set(f.id, f);
      for (const f of liveFeed) feedMap.set(f.id, f);
      serverState.liveFeed = Array.from(feedMap.values()).slice(0, 30);
    }

    if (Array.isArray(submissions) && submissions.length > 0) {
      const subMap = new Map<string, ResultSubmission>();
      for (const s of serverState.submissions || []) subMap.set(s.id, s);
      for (const s of submissions) {
        const existing = subMap.get(s.id);
        if (!existing || existing.status === 'pending') {
          subMap.set(s.id, s);
        }
      }
      serverState.submissions = Array.from(subMap.values());
    }

    persistServerState();
    const emailVerified = req.headers['x-viewer-verified'] === 'true';
    res.json({
      state: buildViewerState({
        uid,
        handle,
        email:
          typeof req.headers['x-viewer-email'] === 'string'
            ? req.headers['x-viewer-email']
            : email,
        emailVerified,
      }),
    });
  });

  // 5. Friend Requests & Chat
  app.post('/api/friends/request', (req: Request, res: Response) => {
    const { fromUid, fromHandle, fromName, targetQuery, role } = (req.body || {}) as {
      fromUid?: string;
      fromHandle?: string;
      fromName?: string;
      targetQuery?: string;
      role?: string;
    };
    const senderUid = fromUid || serverState.profile.id;
    const senderProfile = serverState.profilesByUid?.[senderUid] || serverState.profile;
    const senderHandle = (fromHandle || senderProfile.handle || '').trim();
    const senderName = (fromName || senderProfile.displayName || senderHandle).trim();

    const target = lookupPlayerOnServer(targetQuery || '');
    if (!target) {
      res.status(404).json({ error: 'لم يتم العثور على لاعب بهذا اليوزر نيم أو الكود.' });
      return;
    }

    if (target.uid === senderUid || normalizeKey(target.handle) === normalizeKey(senderHandle)) {
      res.status(400).json({ error: 'لا يمكنك إرسال طلب صداقة لنفسك.' });
      return;
    }

    const existingFriends = serverState.friendsByUid?.[senderUid] || [];
    if (
      existingFriends.some(
        (f) => f.uid === target.uid || normalizeKey(f.handle) === normalizeKey(target.handle)
      )
    ) {
      res.status(400).json({ error: `@${target.handle} موجود بالفعل في قائمة أصدقائك.` });
      return;
    }

    const requests = [...(serverState.friendRequests || [])];
    const duplicate = requests.find(
      (r) =>
        r.status === 'pending' &&
        r.fromUid === senderUid &&
        (r.toUid === target.uid || normalizeKey(r.toHandle) === normalizeKey(target.handle))
    );
    if (duplicate) {
      res.status(400).json({ error: `تم إرسال طلب صداقة مسبقاً إلى @${target.handle}.` });
      return;
    }

    const reverseIdx = requests.findIndex(
      (r) =>
        r.status === 'pending' &&
        (r.fromUid === target.uid || normalizeKey(r.fromHandle) === normalizeKey(target.handle)) &&
        r.toUid === senderUid
    );

    if (reverseIdx !== -1) {
      const rev: FriendRequest = {
        ...requests[reverseIdx],
        status: 'accepted',
        respondedAt: new Date().toISOString(),
      };
      requests[reverseIdx] = rev;

      const myFriend: TeamMember = {
        id: `m-${target.uid}`,
        uid: target.uid,
        name: target.displayName || target.handle,
        handle: target.handle,
        role: role || rev.role || 'صديق',
        verified: true,
      };
      const theirFriend: TeamMember = {
        id: `m-${senderUid}`,
        uid: senderUid,
        name: senderName,
        handle: senderHandle,
        role: role || rev.role || 'صديق',
        verified: true,
      };

      serverState.friendRequests = requests;
      serverState.friendsByUid = {
        ...(serverState.friendsByUid || {}),
        [senderUid]: [...existingFriends, myFriend],
        [target.uid]: [...(serverState.friendsByUid?.[target.uid] || []), theirFriend],
      };
      persistServerState();

      broadcastToUids([senderUid, target.uid], {
        type: 'friend:updated',
        request: rev,
      });

      res.json({
        state: buildViewerState(
          getViewerFromRequest(req, { uid: senderUid, handle: senderHandle })
        ),
        request: rev,
        autoAccepted: true,
      });
      return;
    }

    const newReq: FriendRequest = {
      id: `fr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      fromUid: senderUid,
      fromHandle: senderHandle,
      fromName: senderName,
      fromPlayerCode: senderProfile.playerCode || 'ARENA-PLAYER',
      toUid: target.uid,
      toHandle: target.handle,
      toName: target.displayName || target.handle,
      toPlayerCode: target.playerCode || 'ARENA-PLAYER',
      role: role?.trim() || 'صديق',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    serverState.friendRequests = [newReq, ...requests];
    persistServerState();

    broadcastToUids([target.uid], {
      type: 'friend:request',
      request: newReq,
    });

    res.json({
      state: buildViewerState(
        getViewerFromRequest(req, { uid: senderUid, handle: senderHandle })
      ),
      request: newReq,
      autoAccepted: false,
    });
  });

  app.post('/api/friends/respond', (req: Request, res: Response) => {
    const { viewerUid, requestId, action } = (req.body || {}) as {
      viewerUid?: string;
      requestId?: string;
      action?: 'accept' | 'decline';
    };
    const requests = [...(serverState.friendRequests || [])];
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx === -1) {
      res.status(404).json({ error: 'طلب الصداقة غير موجود.' });
      return;
    }

    const original = requests[idx];
    const updated: FriendRequest = {
      ...original,
      status: action === 'accept' ? 'accepted' : 'declined',
      respondedAt: new Date().toISOString(),
    };
    requests[idx] = updated;
    serverState.friendRequests = requests;

    if (action === 'accept') {
      const friendsByUid = { ...(serverState.friendsByUid || {}) };
      const senderList = [...(friendsByUid[original.fromUid] || [])];
      if (!senderList.some((m) => m.uid === original.toUid)) {
        senderList.push({
          id: `m-${original.toUid}`,
          uid: original.toUid,
          name: original.toName || original.toHandle,
          handle: original.toHandle,
          role: original.role || 'صديق',
          verified: true,
        });
      }
      friendsByUid[original.fromUid] = senderList;

      const receiverList = [...(friendsByUid[original.toUid] || [])];
      if (!receiverList.some((m) => m.uid === original.fromUid)) {
        receiverList.push({
          id: `m-${original.fromUid}`,
          uid: original.fromUid,
          name: original.fromName || original.fromHandle,
          handle: original.fromHandle,
          role: original.role || 'صديق',
          verified: true,
        });
      }
      friendsByUid[original.toUid] = receiverList;
      serverState.friendsByUid = friendsByUid;
    }

    persistServerState();
    broadcastToUids([original.fromUid, original.toUid], {
      type: 'friend:updated',
      request: updated,
    });

    const uid = viewerUid || original.toUid;
    res.json({
      state: buildViewerState(getViewerFromRequest(req, { uid })),
      request: updated,
    });
  });

  app.get('/api/chat/messages', (req: Request, res: Response) => {
    const uid = typeof req.query.uid === 'string' ? req.query.uid : '';
    const messages = (serverState.friendMessages || []).filter(
      (m) => m.channelId === 'team-group' || m.senderUid === uid || m.recipientUid === uid
    );
    const contacts = uid ? getChatContactsForUid(uid) : [];
    res.json({ messages, contacts });
  });

  app.post('/api/chat/messages', (req: Request, res: Response) => {
    const { senderUid, senderHandle, recipientUid, recipientHandle, text, clientMsgId } =
      (req.body || {}) as {
        senderUid?: string;
        senderHandle?: string;
        recipientUid?: string;
        recipientHandle?: string;
        text?: string;
        clientMsgId?: string;
      };
    const cleanText = String(text || '').trim();
    if (!cleanText || !recipientUid) {
      res.status(400).json({ error: 'الرسالة فارغة.' });
      return;
    }

    const fromUid = senderUid || serverState.profile.id;
    const senderProfile = serverState.profilesByUid?.[fromUid] || serverState.profile;
    const fromHandle = senderHandle || senderProfile.handle || 'player';
    const fromName = senderProfile.displayName || fromHandle;
    const channelId =
      recipientUid === 'team-group'
        ? 'team-group'
        : [fromUid, recipientUid].sort().join('::');

    const msg: FriendChatMessage = {
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      clientMsgId,
      channelId,
      senderUid: fromUid,
      senderHandle: fromHandle,
      senderName: fromName,
      recipientUid,
      recipientHandle: recipientHandle || recipientUid,
      text: cleanText.slice(0, 1000),
      createdAt: new Date().toISOString(),
      readBy: [fromUid],
    };

    serverState.friendMessages = [...(serverState.friendMessages || []), msg].slice(-150);
    persistServerState();

    if (channelId === 'team-group') {
      broadcastAll({ type: 'chat:message', message: msg });
    } else {
      broadcastToUids([fromUid, recipientUid], { type: 'chat:message', message: msg });
    }

    res.json({ message: msg });
  });

  app.post('/api/chat/read', (req: Request, res: Response) => {
    const { viewerUid, channelId } = (req.body || {}) as {
      viewerUid?: string;
      channelId?: string;
    };
    if (viewerUid && channelId) {
      let changed = false;
      serverState.friendMessages = (serverState.friendMessages || []).map((m) => {
        if (m.channelId !== channelId || m.senderUid === viewerUid) return m;
        const readBy = m.readBy || [];
        if (readBy.includes(viewerUid)) return m;
        changed = true;
        return { ...m, readBy: [...readBy, viewerUid] };
      });
      if (changed) {
        persistServerState();
        broadcastAll({ type: 'chat:read', viewerUid, channelId });
      }
    }
    res.json({ ok: true });
  });

  app.post('/api/activity/offline', (req: Request, res: Response) => {
    const handle = typeof req.body?.handle === 'string' ? req.body.handle : '';
    if (handle && !isPlaceholderHandle(handle)) {
      serverState.activityByHandle = {
        ...(serverState.activityByHandle || {}),
        [normalizeKey(handle)]: new Date().toISOString(),
      };
      persistServerState();
    }
    res.json({ ok: true });
  });

  // 6. Admin Verification, Gmail Access Manager & Players Directory
  app.post('/api/admin/verify', (req: Request, res: Response) => {
    const headerEmail =
      typeof req.headers['x-viewer-email'] === 'string' ? req.headers['x-viewer-email'] : '';
    const bodyEmail = typeof req.body?.email === 'string' ? req.body.email : '';
    const emailVerified =
      req.headers['x-viewer-verified'] === 'true' || Boolean(req.body?.emailVerified);
    const email = normalizeEmail(headerEmail || bodyEmail);
    const isAdmin = emailVerified && isUserAdminIdentity({ email });
    res.json({ isAdmin });
  });

  app.post('/api/admin/handle', (req: Request, res: Response) => {
    const callerEmail = isRequestFromVerifiedAdmin(req);
    if (!callerEmail) {
      res.status(403).json({
        error: 'عذراً، صلاحية إضافة أدمن متاحة فقط لحسابات Gmail المعتمدة في الإدارة.',
      });
      return;
    }
    const rawEmail = typeof req.body?.adminHandle === 'string' ? req.body.adminHandle : '';
    const adminEmail = normalizeEmail(rawEmail);
    if (!adminEmail || !isValidEmailAddress(adminEmail)) {
      res.status(400).json({ error: 'يرجى إدخال بريد Gmail / بريد إلكتروني صحيح.' });
      return;
    }
    serverState.adminHandles = sanitizeAdminEmailList([
      ...(serverState.adminHandles || []),
      adminEmail,
    ]);
    persistServerState();
    res.json({
      state: buildViewerState({ email: callerEmail, emailVerified: true }),
    });
  });

  app.delete('/api/admin/handle', (req: Request, res: Response) => {
    const callerEmail = isRequestFromVerifiedAdmin(req);
    if (!callerEmail) {
      res.status(403).json({
        error: 'عذراً، صلاحية إزالة أدمن متاحة فقط لحسابات Gmail المعتمدة في الإدارة.',
      });
      return;
    }
    const rawEmail =
      typeof req.body?.adminHandle === 'string'
        ? req.body.adminHandle
        : typeof req.query.email === 'string'
        ? req.query.email
        : '';
    const targetEmail = normalizeEmail(rawEmail);
    if (!targetEmail || !isValidEmailAddress(targetEmail)) {
      res.status(400).json({ error: 'يرجى تحديد البريد الإلكتروني المطلوب إزالته.' });
      return;
    }
    if (BOOTSTRAPPED_ADMINS.includes(targetEmail)) {
      res.status(400).json({ error: 'لا يمكن إزالة حسابات الإدارة الأساسية المحمية.' });
      return;
    }
    serverState.adminHandles = sanitizeAdminEmailList(
      (serverState.adminHandles || []).filter((e) => normalizeEmail(e) !== targetEmail)
    );
    persistServerState();
    res.json({
      state: buildViewerState({ email: callerEmail, emailVerified: true }),
    });
  });

  app.get('/api/admin/players', (req: Request, res: Response) => {
    const callerEmail = isRequestFromVerifiedAdmin(req);
    if (!callerEmail) {
      res.status(403).json({
        error: 'الوصول لبيانات وأرقام اللاعبين محظور إلا لحسابات الإدارة المعتمدة.',
      });
      return;
    }

    const tournamentCountsByKey = new Map<string, Set<string>>();
    const registerTournamentParticipant = (key: string, tournamentId: string) => {
      const k = normalizeKey(key);
      if (!k) return;
      if (!tournamentCountsByKey.has(k)) tournamentCountsByKey.set(k, new Set());
      tournamentCountsByKey.get(k)!.add(tournamentId);
    };

    for (const t of serverState.tournaments || []) {
      for (const r of t.rounds || []) {
        for (const m of r.matches || []) {
          for (const side of [m.participantA, m.participantB]) {
            if (!side) continue;
            if (side.registeredByUid) registerTournamentParticipant(side.registeredByUid, t.id);
            if (side.username) registerTournamentParticipant(side.username, t.id);
          }
        }
      }
    }

    const byUid = new Map<string, AdminPlayerSummary>();
    const addOrMerge = (p: PlayerProfile) => {
      if (!p || !p.id) return;
      if (isPlaceholderHandle(p.handle) && !p.email && !p.whatsappNumber) return;
      const tSet = new Set<string>([
        ...(tournamentCountsByKey.get(normalizeKey(p.id)) || []),
        ...(tournamentCountsByKey.get(normalizeKey(p.handle)) || []),
      ]);
      const phone = sanitizeWhatsappInput(p.whatsappNumber || p.phoneOrDiscord || '');
      byUid.set(p.id, {
        id: p.id,
        displayName: (p.displayName || p.handle || '').trim(),
        handle: (p.handle || '').trim(),
        playerCode: (p.playerCode || '').trim(),
        email: (p.email || '').trim(),
        whatsappNumber: phone,
        city: (p.city || '').trim(),
        onboardingCompleted: Boolean(p.onboardingCompleted),
        updatedAt: p.lastActiveAt,
        tournamentsCount: tSet.size,
      });
    };

    for (const prof of Object.values(serverState.profilesByUid || {})) {
      addOrMerge(prof);
    }
    if (serverState.profile && !byUid.has(serverState.profile.id)) {
      addOrMerge(serverState.profile);
    }

    const players = Array.from(byUid.values()).sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || '') ||
      a.displayName.localeCompare(b.displayName, 'ar')
    );

    res.json({ players });
  });

  // 7. Tournaments & Games CRUD
  app.post('/api/tournaments', (req: Request, res: Response) => {
    const payload = (req.body || {}) as {
      title?: string;
      gameSlug?: GameSlug;
      customGameName?: string;
      modeTag?: MatchFormatTag;
      venueName?: string;
      prizePool?: string;
      maxSlots?: 4 | 8 | 16 | 32 | 64;
      rulesText?: string;
      openImmediately?: boolean;
    };
    const title = (payload.title || '').trim();
    if (!title) {
      res.status(400).json({ error: 'يرجى إدخال اسم البطولة.' });
      return;
    }

    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const modeTag: MatchFormatTag = payload.modeTag || '1v1';
    const entryType: 'solo' | 'team' = modeTag === '1v1' ? 'solo' : 'team';
    const maxSlots = payload.maxSlots || 32;
    const { rounds } = generateBracketRounds(
      id,
      maxSlots,
      0,
      entryType === 'team',
      false,
      modeTag === '2v2'
    );
    const numGroups = Math.max(1, Math.ceil(maxSlots / 4));

    const newTournament: Tournament = {
      id,
      title,
      gameSlug: payload.gameSlug || 'fc27',
      customGameName: payload.customGameName?.trim() || undefined,
      modeTag,
      formatLabel:
        modeTag === '4v4'
          ? `فرق 4 ضد 4 · ${numGroups} مجموعات`
          : modeTag === '2v2'
          ? `ثنائيات 2 ضد 2 · ${numGroups} مجموعات`
          : `فردي 1 ضد 1 · ${numGroups} مجموعات`,
      venueName: payload.venueName?.trim() || 'Arena Hall',
      prizePool: payload.prizePool?.trim() || '5,000 EGP',
      maxSlots,
      registeredCount: 0,
      registrationOpen: Boolean(payload.openImmediately),
      resultsEntryOpen: false,
      status: 'open',
      isFeatured: true,
      entryType,
      rules: (payload.rulesText || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      winnerName: null,
      rounds,
      updatedAtMs: Date.now(),
    };

    serverState.tournaments = [newTournament, ...serverState.tournaments];
    persistServerState();
    res.json({ state: buildViewerState(getViewerFromRequest(req)), tournament: newTournament });
  });

  app.patch('/api/admin/tournaments/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const idx = serverState.tournaments.findIndex((t) => t.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'البطولة غير موجودة.' });
      return;
    }

    const payload = (req.body || {}) as {
      registrationOpen?: boolean;
      resultsEntryOpen?: boolean;
      title?: string;
      venueName?: string;
      prizePool?: string;
      status?: Tournament['status'];
      modeTag?: MatchFormatTag;
      rulesText?: string;
    };
    const prev = serverState.tournaments[idx];
    const nextMode = payload.modeTag || prev.modeTag;

    const updated: Tournament = {
      ...prev,
      ...(typeof payload.registrationOpen === 'boolean'
        ? { registrationOpen: payload.registrationOpen }
        : {}),
      ...(typeof payload.resultsEntryOpen === 'boolean'
        ? { resultsEntryOpen: payload.resultsEntryOpen }
        : {}),
      ...(payload.title !== undefined ? { title: payload.title.trim() || prev.title } : {}),
      ...(payload.venueName !== undefined
        ? { venueName: payload.venueName.trim() || prev.venueName }
        : {}),
      ...(payload.prizePool !== undefined
        ? { prizePool: payload.prizePool.trim() || prev.prizePool }
        : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.modeTag !== undefined
        ? { modeTag: nextMode, entryType: nextMode === '1v1' ? 'solo' : 'team' }
        : {}),
      ...(payload.rulesText !== undefined
        ? {
            rules: payload.rulesText
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean),
          }
        : {}),
      updatedAtMs: Date.now(),
    };

    serverState.tournaments[idx] = updated;
    persistServerState();
    res.json({ state: buildViewerState(getViewerFromRequest(req)), tournament: updated });
  });

  app.delete('/api/admin/tournaments/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    if (!serverState.tournaments.some((t) => t.id === id)) {
      res.status(404).json({ error: 'البطولة غير موجودة.' });
      return;
    }
    serverState.tournaments = serverState.tournaments.filter((t) => t.id !== id);
    serverState.submissions = (serverState.submissions || []).filter((s) => s.tournamentId !== id);
    serverState.liveFeed = (serverState.liveFeed || []).filter((f) => f.tournamentId !== id);
    serverState.notifications = (serverState.notifications || []).filter(
      (n) => n.tournamentId !== id
    );
    persistServerState();
    res.json({ state: buildViewerState(getViewerFromRequest(req)) });
  });

  app.patch('/api/admin/games/:slug', (req: Request, res: Response) => {
    const slug = String(req.params.slug || '') as GameSlug;
    const idx = serverState.games.findIndex((g) => g.slug === slug);
    if (idx === -1) {
      res.status(404).json({ error: 'اللعبة غير موجودة.' });
      return;
    }
    const payload = (req.body || {}) as {
      rulesText?: string;
      summary?: string;
      scoringSystem?: string;
      modeLabel?: string;
    };
    const prev = serverState.games[idx];
    const updated: GameInfo = {
      ...prev,
      rulesHighlights:
        payload.rulesText !== undefined
          ? payload.rulesText
              .split('\n')
              .map((r) => r.trim())
              .filter(Boolean)
          : prev.rulesHighlights,
      summary: payload.summary !== undefined ? payload.summary.trim() : prev.summary,
      scoringSystem:
        payload.scoringSystem !== undefined ? payload.scoringSystem.trim() : prev.scoringSystem,
      modeLabel: payload.modeLabel !== undefined ? payload.modeLabel.trim() : prev.modeLabel,
      updatedAtMs: Date.now(),
    };
    serverState.games[idx] = updated;
    persistServerState();
    res.json({ state: buildViewerState(getViewerFromRequest(req)), game: updated });
  });

  // 8. Tournament Registration
  app.post('/api/tournaments/:id/register', async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const tIdx = serverState.tournaments.findIndex((t) => t.id === id);
    if (tIdx === -1) {
      res.status(404).json({ error: 'البطولة غير موجودة.' });
      return;
    }

    const t = serverState.tournaments[tIdx];
    if (!t.registrationOpen) {
      res.status(400).json({ error: 'التسجيل مغلق حالياً من قبل الإدارة.' });
      return;
    }
    if (t.registeredCount >= t.maxSlots) {
      res.status(400).json({ error: 'اكتمل العدد الأقصى للمشاركين في هذه البطولة.' });
      return;
    }

    const payload = (req.body || {}) as {
      uid?: string;
      mode?: 'solo' | 'team';
      teamName?: string;
      members?: TeamRosterMember[];
      username?: string;
      teammateUsername?: string;
      email?: string;
      isSelfCaptain?: boolean;
      captainDisplayName?: string;
    };

    const uid = payload.uid || serverState.profile.id;
    const cleanUsername = (payload.username || '').trim().replace(/^@+/, '');
    if (!cleanUsername) {
      res.status(400).json({ error: 'يرجى إدخال اليوزر نيم للمتابعة.' });
      return;
    }

    const existingParticipants = getAllParticipantsFromTournament(t);
    if (
      existingParticipants.some(
        (p) =>
          (p.registeredByUid && p.registeredByUid === uid) ||
          normalizeKey(p.username) === normalizeKey(cleanUsername)
      )
    ) {
      res.status(400).json({ error: 'أنت مسجل بالفعل في هذه البطولة.' });
      return;
    }

    const requiredSize = getRequiredTeamSize(t.modeTag);
    const roster =
      Array.isArray(payload.members) && payload.members.length > 0
        ? payload.members.slice(0, requiredSize)
        : [{ name: payload.captainDisplayName || cleanUsername, username: cleanUsername }];

    if (requiredSize > 1 && roster.length < requiredSize) {
      res.status(400).json({
        error: `يتطلب نظام ${t.modeTag} إدخال ${requiredSize} لاعبين في الفريق.`,
      });
      return;
    }

    const { groupsOrder, groupSeatsMap } = getGroupSeatsMapFromTournament(t);
    const availableSlots: { groupName: string; seatIdx: number; occupied: number }[] = [];
    for (const gn of groupsOrder) {
      const seats = groupSeatsMap.get(gn) || [null, null, null, null];
      const occupied = seats.filter(Boolean).length;
      seats.forEach((s, idx) => {
        if (!s) availableSlots.push({ groupName: gn, seatIdx: idx, occupied });
      });
    }

    if (availableSlots.length === 0) {
      res.status(400).json({ error: 'لا توجد مقاعد متاحة في المجموعات.' });
      return;
    }

    const minOccupied = Math.min(...availableSlots.map((a) => a.occupied));
    const balancedSlots = availableSlots.filter((a) => a.occupied === minOccupied);
    const chosen = balancedSlots[Math.floor(Math.random() * balancedSlots.length)];

    const participantId = `${t.id}-p-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const isTeam = t.modeTag !== '1v1' || payload.mode === 'team';
    const displayName =
      isTeam && payload.teamName?.trim()
        ? payload.teamName.trim()
        : payload.captainDisplayName?.trim() || cleanUsername;

    const viewerProfile = serverState.profilesByUid?.[uid] || serverState.profile;
    const resolvedEmail = payload.email?.trim() || viewerProfile.email || undefined;

    const newParticipant: BracketParticipant = {
      id: participantId,
      name: displayName,
      teamName: isTeam ? payload.teamName?.trim() || displayName : undefined,
      username: cleanUsername,
      email: resolvedEmail,
      hasEmail: Boolean(resolvedEmail),
      teammateUsername:
        payload.teammateUsername?.trim().replace(/^@+/, '') ||
        roster[1]?.username ||
        roster[1]?.name ||
        undefined,
      rosterMembers: roster,
      registeredByUid: uid,
      groupName: chosen.groupName,
      seed: existingParticipants.length + 1,
      gameId: viewerProfile.gameIds?.[t.gameSlug === 'pool8' ? 'pool8' : 'fc27'] || '',
      isTeam,
      checkedInHandles: [],
    };

    const seats = [...(groupSeatsMap.get(chosen.groupName) || [null, null, null, null])];
    seats[chosen.seatIdx] = newParticipant;
    groupSeatsMap.set(chosen.groupName, seats);

    const rebuiltRound0Matches = buildGroupStageMatches(
      t.id,
      groupSeatsMap,
      groupsOrder,
      false
    );
    const prevRound0Matches = t.rounds[0]?.matches || [];
    const mergedRound0Matches = rebuiltRound0Matches.map((nm) => {
      const oldMatch = prevRound0Matches.find(
        (om) =>
          om.id === nm.id ||
          (om.groupName === nm.groupName && om.seatA === nm.seatA && om.seatB === nm.seatB)
      );
      if (!oldMatch) return nm;
      return {
        ...nm,
        scheduledAt: oldMatch.scheduledAt || nm.scheduledAt,
        leg: oldMatch.leg || nm.leg,
        scoreA: oldMatch.scoreA,
        scoreB: oldMatch.scoreB,
        winnerId: oldMatch.winnerId,
        status: (
          oldMatch.status === 'completed' || oldMatch.status === 'pending_review'
            ? oldMatch.status
            : nm.participantA && nm.participantB
            ? 'live'
            : 'upcoming'
        ) as BracketMatch['status'],
      };
    });

    const nextRegisteredCount = Math.min(t.maxSlots, existingParticipants.length + 1);
    const capacityCompleted = nextRegisteredCount >= t.maxSlots;

    const updatedTournament: Tournament = {
      ...t,
      registeredCount: nextRegisteredCount,
      status: capacityCompleted ? 'ongoing' : t.status,
      resultsEntryOpen: t.resultsEntryOpen || capacityCompleted,
      rounds: t.rounds.map((r, idx) =>
        idx === 0 ? { ...r, matches: mergedRound0Matches } : r
      ),
      updatedAtMs: Date.now(),
    };
    serverState.tournaments[tIdx] = updatedTournament;

    const gameObj = serverState.games.find((g) => g.slug === t.gameSlug);
    const gameName = t.customGameName || gameObj?.nameAr || t.gameSlug;
    const template = buildPlayerEmailTemplate({
      playerName: displayName,
      tournamentTitle: t.title,
      gameName,
      groupName: chosen.groupName,
      scheduledAt: 'لم يتحدد',
      venueName: t.venueName,
      prizePool: t.prizePool,
      appUrl: process.env.APP_URL || '',
    });

    const delivery = await sendEmailIfConfigured({
      to: resolvedEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    const notif: PlayerNotification = {
      id: `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      tournamentId: t.id,
      tournamentTitle: t.title,
      participantId: newParticipant.id,
      recipientName: displayName,
      recipientEmail: resolvedEmail,
      groupName: chosen.groupName,
      scheduledAt: 'لم يتحدد',
      subject: template.subject,
      message: template.text,
      deliveryStatus: delivery.deliveryStatus,
      deliveryNote: delivery.deliveryNote,
      createdAt: new Date().toISOString(),
    };
    serverState.notifications = [notif, ...(serverState.notifications || [])].slice(0, 60);

    const updatedProfile: PlayerProfile = {
      ...viewerProfile,
      registeredTournamentIds: Array.from(
        new Set([...(viewerProfile.registeredTournamentIds || []), t.id])
      ),
    };
    serverState.profilesByUid = {
      ...(serverState.profilesByUid || {}),
      [uid]: updatedProfile,
    };
    if (serverState.profile.id === uid) {
      serverState.profile = updatedProfile;
    }

    persistServerState();
    res.json({
      state: buildViewerState(
        getViewerFromRequest(req, { uid, handle: updatedProfile.handle, email: updatedProfile.email })
      ),
      participant: newParticipant,
      assignedGroup: chosen.groupName,
      assignedSeatIndex: chosen.seatIdx,
      capacityCompleted,
      emailDeliveryStatus: delivery.deliveryStatus,
    });
  });

  // 9. Match Screenshot Submission
  app.post('/api/tournaments/:id/matches/:matchId/submit', (req: Request, res: Response) => {
    const tournamentId = String(req.params.id || '');
    const matchId = String(req.params.matchId || '');
    const tIdx = serverState.tournaments.findIndex((t) => t.id === tournamentId);
    if (tIdx === -1) {
      res.status(404).json({ error: 'البطولة غير موجودة.' });
      return;
    }

    const { claimedWinnerId, scoreA, scoreB, screenshotUrl, note, submittedBy } =
      (req.body || {}) as {
        claimedWinnerId?: string;
        scoreA?: number;
        scoreB?: number;
        screenshotUrl?: string;
        note?: string;
        submittedBy?: string;
      };

    const t = serverState.tournaments[tIdx];
    let targetMatch: BracketMatch | null = null;
    let targetRoundName = '';

    const nextRounds = t.rounds.map((r) => ({
      ...r,
      matches: r.matches.map((m) => {
        if (m.id !== matchId) return m;
        targetMatch = m;
        targetRoundName = r.nameAr;
        return { ...m, status: 'pending_review' as const };
      }),
    }));

    if (!targetMatch) {
      res.status(404).json({ error: 'المباراة غير موجودة.' });
      return;
    }
    const m = targetMatch as BracketMatch;

    const claimedWinner =
      m.participantA?.id === claimedWinnerId
        ? m.participantA
        : m.participantB?.id === claimedWinnerId
        ? m.participantB
        : m.participantA;

    const submission: ResultSubmission = {
      id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      tournamentId: t.id,
      tournamentTitle: t.title,
      matchId: m.id,
      matchLabel: `${targetRoundName} · ${m.participantA?.name || '؟'} ضد ${m.participantB?.name || '؟'}`,
      submittedBy: submittedBy || serverState.profile.handle || serverState.profile.displayName || 'Player',
      claimedWinnerId: claimedWinner?.id || claimedWinnerId || '',
      claimedWinnerName: claimedWinner?.name || 'فائز',
      scoreA: Number(scoreA) || 0,
      scoreB: Number(scoreB) || 0,
      screenshotUrl: screenshotUrl || '/assets/aistudio/FC27-ut-guide_09aef642.jpg',
      note: note?.trim() || '',
      status: 'pending',
    };

    serverState.tournaments[tIdx] = { ...t, rounds: nextRounds, updatedAtMs: Date.now() };
    serverState.submissions = [submission, ...(serverState.submissions || [])];
    persistServerState();

    res.json({ state: buildViewerState(getViewerFromRequest(req)), submission });
  });

  // 10. Admin Matchups & Draw Controls
  app.post('/api/admin/tournaments/:id/matchup', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const tIdx = serverState.tournaments.findIndex((t) => t.id === id);
    if (tIdx === -1) {
      res.status(404).json({ error: 'البطولة غير موجودة.' });
      return;
    }

    const payload = (req.body || {}) as {
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
    };

    let t = serverState.tournaments[tIdx];

    if (payload.shuffle) {
      const allParticipants = getAllParticipantsFromTournament(t);
      for (let i = allParticipants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allParticipants[i], allParticipants[j]] = [allParticipants[j], allParticipants[i]];
      }
      const groupsOrder = getGroupsForTournament(t);
      const groupSeatsMap = new Map<string, (BracketParticipant | null)[]>();
      for (const gn of groupsOrder) groupSeatsMap.set(gn, [null, null, null, null]);

      allParticipants.forEach((p, idx) => {
        const gn = groupsOrder[Math.floor(idx / 4) % groupsOrder.length];
        const seatIdx = idx % 4;
        groupSeatsMap.get(gn)![seatIdx] = { ...p, groupName: gn };
      });

      const matches = buildGroupStageMatches(t.id, groupSeatsMap, groupsOrder, false);
      t = {
        ...t,
        rounds: t.rounds.map((r, idx) => (idx === 0 ? { ...r, matches } : r)),
        updatedAtMs: Date.now(),
      };
    } else if (payload.moveToGroup) {
      const { participantId, targetGroup } = payload.moveToGroup;
      const { groupsOrder, groupSeatsMap } = getGroupSeatsMapFromTournament(t);
      if (!groupsOrder.includes(targetGroup)) {
        res.status(400).json({ error: 'المجموعة المستهدفة غير صالحة.' });
        return;
      }

      let movedParticipant: BracketParticipant | null = null;
      let sourceGroup = '';
      let sourceSeat = -1;

      for (const gn of groupsOrder) {
        const seats = groupSeatsMap.get(gn) || [null, null, null, null];
        const sIdx = seats.findIndex((s) => s?.id === participantId);
        if (sIdx !== -1) {
          movedParticipant = seats[sIdx];
          sourceGroup = gn;
          sourceSeat = sIdx;
          break;
        }
      }

      if (!movedParticipant) {
        res.status(404).json({ error: 'اللاعب غير موجود في المجموعات.' });
        return;
      }

      const targetSeats = [...(groupSeatsMap.get(targetGroup) || [null, null, null, null])];
      const freeIdx = targetSeats.findIndex((s) => s === null);
      if (freeIdx !== -1) {
        const sourceSeats = [...(groupSeatsMap.get(sourceGroup) || [null, null, null, null])];
        sourceSeats[sourceSeat] = null;
        groupSeatsMap.set(sourceGroup, sourceSeats);
        targetSeats[freeIdx] = { ...movedParticipant, groupName: targetGroup };
        groupSeatsMap.set(targetGroup, targetSeats);
      } else {
        const swapped = targetSeats[0];
        const sourceSeats = [...(groupSeatsMap.get(sourceGroup) || [null, null, null, null])];
        sourceSeats[sourceSeat] = swapped ? { ...swapped, groupName: sourceGroup } : null;
        groupSeatsMap.set(sourceGroup, sourceSeats);
        targetSeats[0] = { ...movedParticipant, groupName: targetGroup };
        groupSeatsMap.set(targetGroup, targetSeats);
      }

      const matches = buildGroupStageMatches(t.id, groupSeatsMap, groupsOrder, false);
      t = {
        ...t,
        rounds: t.rounds.map((r, idx) => (idx === 0 ? { ...r, matches } : r)),
        updatedAtMs: Date.now(),
      };
    } else if (payload.reorderMatches) {
      const { fromMatchId, toMatchId } = payload.reorderMatches;
      const nextRounds = t.rounds.map((r) => {
        const idxA = r.matches.findIndex((m) => m.id === fromMatchId);
        const idxB = r.matches.findIndex((m) => m.id === toMatchId);
        if (idxA === -1 || idxB === -1) return r;
        const copy = [...r.matches];
        const tmp = copy[idxA];
        copy[idxA] = copy[idxB];
        copy[idxB] = tmp;
        return {
          ...r,
          matches: copy.map((m, idx) => ({ ...m, matchNumber: idx + 1 })),
        };
      });
      t = { ...t, rounds: nextRounds, updatedAtMs: Date.now() };
    } else if (payload.swapSlots) {
      const { fromMatchId, fromSide, toMatchId, toSide } = payload.swapSlots;
      let pFrom: BracketParticipant | null = null;
      let pTo: BracketParticipant | null = null;
      for (const r of t.rounds) {
        for (const m of r.matches) {
          if (m.id === fromMatchId) pFrom = fromSide === 'A' ? m.participantA : m.participantB;
          if (m.id === toMatchId) pTo = toSide === 'A' ? m.participantA : m.participantB;
        }
      }
      const nextRounds = t.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => {
          const nextM = { ...m };
          if (m.id === fromMatchId) {
            if (fromSide === 'A') nextM.participantA = pTo;
            else nextM.participantB = pTo;
          }
          if (m.id === toMatchId) {
            if (toSide === 'A') nextM.participantA = pFrom;
            else nextM.participantB = pFrom;
          }
          return nextM;
        }),
      }));
      t = { ...t, rounds: nextRounds, updatedAtMs: Date.now() };
    } else if (payload.matchId) {
      const allParticipants = getAllParticipantsFromTournament(t);
      const byId = new Map(allParticipants.map((p) => [p.id, p]));
      const nextRounds = t.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => {
          if (m.id !== payload.matchId) return m;
          const nextA =
            payload.participantAId !== undefined
              ? payload.participantAId
                ? byId.get(payload.participantAId) || null
                : null
              : m.participantA;
          const nextB =
            payload.participantBId !== undefined
              ? payload.participantBId
                ? byId.get(payload.participantBId) || null
                : null
              : m.participantB;
          return {
            ...m,
            participantA: nextA,
            participantB: nextB,
            groupName: payload.groupName || m.groupName,
            status: (
              m.status === 'completed'
                ? 'completed'
                : nextA && nextB
                ? 'live'
                : 'upcoming'
            ) as BracketMatch['status'],
          };
        }),
      }));
      t = { ...t, rounds: nextRounds, updatedAtMs: Date.now() };
    }

    serverState.tournaments[tIdx] = t;
    persistServerState();
    res.json({ state: buildViewerState(getViewerFromRequest(req)), tournament: t });
  });

  // 11. Admin QR Check-In (ONE READY / TEAM READY)
  app.post('/api/admin/tournaments/:id/checkin', (req: Request, res: Response) => {
    const tournamentId = String(req.params.id || '');
    const tIdx = serverState.tournaments.findIndex((t) => t.id === tournamentId);
    if (tIdx === -1) {
      res.status(404).json({ error: 'البطولة غير موجودة.' });
      return;
    }

    const payload = (req.body || {}) as {
      code?: string;
      participantId?: string;
      action?: 'checkin' | 'undo' | 'toggle';
      resolvedHandle?: string;
      resolvedPlayerCode?: string;
    };

    const t = serverState.tournaments[tIdx];
    const participants = getAllParticipantsFromTournament(t);
    if (participants.length === 0) {
      res.status(400).json({ error: 'لا يوجد مشاركون مسجلون في هذه البطولة بعد.' });
      return;
    }

    const scannedRaw = extractScannedIdentifier(payload.code || '');
    const candidateKeys = [
      normalizeCheckInKey(scannedRaw),
      normalizeCheckInKey(payload.resolvedHandle),
      normalizeCheckInKey(payload.resolvedPlayerCode),
    ].filter(Boolean);

    const serverLookup = payload.code ? lookupPlayerOnServer(payload.code) : null;
    if (serverLookup?.handle) {
      candidateKeys.push(normalizeCheckInKey(serverLookup.handle));
    }

    let matchedParticipant: BracketParticipant | null = null;
    let matchedMember: { name: string; handle: string } | null = null;

    if (payload.participantId) {
      matchedParticipant = participants.find((p) => p.id === payload.participantId) || null;
    }

    if (matchedParticipant) {
      const roster =
        Array.isArray(matchedParticipant.rosterMembers) &&
        matchedParticipant.rosterMembers.length > 0
          ? matchedParticipant.rosterMembers
          : [{ name: matchedParticipant.name, username: matchedParticipant.username }];

      for (const rm of roster) {
        const rmHandle = normalizeCheckInKey(rm.username || rm.name);
        const rmName = normalizeCheckInKey(rm.name);
        if (candidateKeys.includes(rmHandle) || candidateKeys.includes(rmName)) {
          matchedMember = {
            name: rm.name || rm.username || matchedParticipant.username,
            handle: rm.username || rm.name || matchedParticipant.username,
          };
          break;
        }
      }
      if (!matchedMember) {
        const first = roster[0];
        matchedMember = {
          name: first?.name || matchedParticipant.name,
          handle: first?.username || matchedParticipant.username,
        };
      }
    } else {
      for (const p of participants) {
        const roster =
          Array.isArray(p.rosterMembers) && p.rosterMembers.length > 0
            ? p.rosterMembers
            : [{ name: p.username || p.name, username: p.username }];

        for (const rm of roster) {
          const rmHandle = normalizeCheckInKey(rm.username);
          const rmName = normalizeCheckInKey(rm.name);
          if (
            (rmHandle && candidateKeys.includes(rmHandle)) ||
            (rmName && candidateKeys.includes(rmName))
          ) {
            matchedParticipant = p;
            matchedMember = {
              name: rm.name || rm.username || p.username,
              handle: rm.username || rm.name || p.username,
            };
            break;
          }
        }
        if (matchedParticipant) break;

        if (
          (p.username && candidateKeys.includes(normalizeCheckInKey(p.username))) ||
          (p.teammateUsername &&
            candidateKeys.includes(normalizeCheckInKey(p.teammateUsername))) ||
          (p.gameId && candidateKeys.includes(normalizeCheckInKey(p.gameId))) ||
          (p.teamName && candidateKeys.includes(normalizeCheckInKey(p.teamName)))
        ) {
          matchedParticipant = p;
          matchedMember = {
            name: p.name || p.username,
            handle: p.username,
          };
          break;
        }
      }
    }

    if (!matchedParticipant || !matchedMember) {
      res.status(404).json({
        error: `لم يتم العثور على لاعب مسجل في هذه البطولة يطابق "${scannedRaw || payload.code}".`,
      });
      return;
    }

    const memberKey = normalizeCheckInKey(matchedMember.handle || matchedMember.name);
    const currentHandles = [...(matchedParticipant.checkedInHandles || [])];
    const alreadyCheckedIn = currentHandles.some((h) => normalizeCheckInKey(h) === memberKey);

    let actionApplied: 'checkin' | 'undo' = 'checkin';
    if (payload.action === 'undo') actionApplied = 'undo';
    else if (payload.action === 'toggle') actionApplied = alreadyCheckedIn ? 'undo' : 'checkin';

    let nextHandles: string[];
    if (actionApplied === 'undo') {
      nextHandles = currentHandles.filter(
        (h) =>
          normalizeCheckInKey(h) !== memberKey &&
          normalizeCheckInKey(h) !== normalizeCheckInKey(matchedMember!.name)
      );
    } else {
      nextHandles = alreadyCheckedIn
        ? currentHandles
        : [...currentHandles, matchedMember.handle || matchedMember.name];
    }

    const updatedParticipant: BracketParticipant = {
      ...matchedParticipant,
      checkedInHandles: nextHandles,
    };
    const updatedTournament = updateParticipantEverywhere(t, updatedParticipant);
    const summary = getTeamCheckInSummary(updatedParticipant, updatedTournament.modeTag);

    serverState.tournaments[tIdx] = updatedTournament;
    persistServerState();

    res.json({
      state: buildViewerState(getViewerFromRequest(req)),
      participant: updatedParticipant,
      matchedMember,
      badge: summary.badge,
      status: summary.status,
      arrivedCount: summary.arrivedCount,
      requiredCount: summary.requiredCount,
      alreadyCheckedIn,
      actionApplied,
    });
  });

  // 12. AI Home & Away Group Schedule (Gemini Server-Side)
  app.post('/api/admin/tournaments/:id/ai-schedule', async (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const customPrompt = typeof req.body?.customPrompt === 'string' ? req.body.customPrompt : '';
    const tIdx = serverState.tournaments.findIndex((t) => t.id === id);
    if (tIdx === -1) {
      res.status(404).json({ error: 'البطولة غير موجودة.' });
      return;
    }

    const t = serverState.tournaments[tIdx];
    const { groupsOrder, groupSeatsMap } = getGroupSeatsMapFromTournament(t);
    const allMatches: BracketMatch[] = [];
    let matchNumber = 1;

    for (const gn of groupsOrder) {
      const players = (groupSeatsMap.get(gn) || []).filter(
        (p): p is BracketParticipant => Boolean(p)
      );
      if (players.length < 2) continue;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const pA = { ...players[i], groupName: gn };
          const pB = { ...players[j], groupName: gn };
          allMatches.push({
            id: `${t.id}-r0-m${matchNumber}`,
            roundIndex: 0,
            matchNumber: matchNumber++,
            groupName: gn,
            leg: 'ذهاب',
            scheduledAt: 'لم يتحدد',
            pairKey: `${pA.id}__${pB.id}__leg1`,
            participantA: pA,
            participantB: pB,
            scoreA: null,
            scoreB: null,
            winnerId: null,
            status: 'live',
          });
          allMatches.push({
            id: `${t.id}-r0-m${matchNumber}`,
            roundIndex: 0,
            matchNumber: matchNumber++,
            groupName: gn,
            leg: 'عودة',
            scheduledAt: 'لم يتحدد',
            pairKey: `${pB.id}__${pA.id}__leg2`,
            participantA: pB,
            participantB: pA,
            scoreA: null,
            scoreB: null,
            winnerId: null,
            status: 'live',
          });
        }
      }
    }

    if (allMatches.length === 0) {
      res.status(400).json({
        error: 'يجب تسجيل لاعبين اثنين على الأقل في نفس المجموعة لتوليد جدول الذهاب والعودة.',
      });
      return;
    }

    const fallbackSummary = `تم إنشاء جدول ذهاب وعودة رسمي بإجمالي ${allMatches.length} مباراة موزعة على ${groupsOrder.length} مجموعات (الموعد الافتراضي: لم يتحدد).`;
    const summaryAr = await generateGeminiSummary(
      `أنت منظم بطولات رياضات إلكترونية في منصة أرينا برو. اكتب ملخصاً عربياً احترافياً من جملتين فقط لجدول دور المجموعات بنظام ذهاب وعودة لبطولة "${t.title}" (${t.modeTag}) بإجمالي ${allMatches.length} مباراة على ${groupsOrder.length} مجموعات. ملاحظة الإدارة: "${customPrompt || 'توزيع متوازن'}".`,
      fallbackSummary
    );

    const updatedTournament: Tournament = {
      ...t,
      resultsEntryOpen: true,
      status: 'ongoing',
      lastAiMatchupSummary: summaryAr,
      rounds: t.rounds.map((r, idx) =>
        idx === 0
          ? {
              ...r,
              nameAr: getGroupStageLabel(groupsOrder.length),
              matches: allMatches,
            }
          : r
      ),
      updatedAtMs: Date.now(),
    };

    serverState.tournaments[tIdx] = updatedTournament;
    persistServerState();

    res.json({
      state: buildViewerState(getViewerFromRequest(req)),
      matchesCount: allMatches.length,
      summaryAr,
    });
  });

  // 13. Match Schedule & Notifications
  app.patch(
    '/api/admin/tournaments/:id/matches/:matchId/schedule',
    async (req: Request, res: Response) => {
      const tournamentId = String(req.params.id || '');
      const matchId = String(req.params.matchId || '');
      const { scheduledAt, leg } = (req.body || {}) as {
        scheduledAt?: string;
        leg?: BracketMatch['leg'];
      };
      const tIdx = serverState.tournaments.findIndex((t) => t.id === tournamentId);
      if (tIdx === -1) {
        res.status(404).json({ error: 'البطولة غير موجودة.' });
        return;
      }

      const t = serverState.tournaments[tIdx];
      const cleanSchedule = (scheduledAt || '').trim() || 'لم يتحدد';
      let updatedMatch: BracketMatch | null = null;

      const nextRounds = t.rounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => {
          if (m.id !== matchId) return m;
          updatedMatch = {
            ...m,
            scheduledAt: cleanSchedule,
            ...(leg ? { leg } : {}),
          };
          return updatedMatch;
        }),
      }));

      if (!updatedMatch) {
        res.status(404).json({ error: 'المباراة غير موجودة.' });
        return;
      }

      const um = updatedMatch as BracketMatch;
      const updatedTournament: Tournament = {
        ...t,
        rounds: nextRounds,
        updatedAtMs: Date.now(),
      };
      serverState.tournaments[tIdx] = updatedTournament;

      const gameObj = serverState.games.find((g) => g.slug === t.gameSlug);
      const gameName = t.customGameName || gameObj?.nameAr || t.gameSlug;
      const { mailtoLinks, emailTargets } = buildEmailDispatchDataForMatch(
        updatedTournament,
        um,
        gameName
      );

      const newNotifs: PlayerNotification[] = [];
      for (const [p, opp] of [
        [um.participantA, um.participantB],
        [um.participantB, um.participantA],
      ] as [BracketParticipant | null, BracketParticipant | null][]) {
        if (!p) continue;
        const resolvedEmail = resolveParticipantEmail(p);
        const tpl = buildPlayerEmailTemplate({
          playerName: p.name,
          tournamentTitle: t.title,
          gameName,
          groupName: um.groupName,
          scheduledAt: cleanSchedule,
          matchLabel: `مباراة #${um.matchNumber}`,
          opponentName: opp?.name || 'بانتظار الخصم',
          venueName: t.venueName,
          prizePool: t.prizePool,
          appUrl: process.env.APP_URL || '',
        });
        const delivery = await sendEmailIfConfigured({
          to: resolvedEmail,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        });
        newNotifs.push({
          id: `notif_${Date.now().toString(36)}_${p.id}`,
          tournamentId: t.id,
          tournamentTitle: t.title,
          participantId: p.id,
          recipientName: p.name,
          recipientEmail: resolvedEmail || undefined,
          groupName: um.groupName,
          matchId: um.id,
          matchLabel: `مباراة #${um.matchNumber}`,
          opponentName: opp?.name,
          scheduledAt: cleanSchedule,
          subject: tpl.subject,
          message: tpl.text,
          deliveryStatus: delivery.deliveryStatus,
          deliveryNote: delivery.deliveryNote,
          createdAt: new Date().toISOString(),
        });
      }

      serverState.notifications = [...newNotifs, ...(serverState.notifications || [])].slice(0, 60);
      persistServerState();

      res.json({
        state: buildViewerState(getViewerFromRequest(req)),
        mailtoLinks,
        emailTargets,
      });
    }
  );

  app.post(
    '/api/admin/tournaments/:id/matches/:matchId/notify',
    async (req: Request, res: Response) => {
      const tournamentId = String(req.params.id || '');
      const matchId = String(req.params.matchId || '');
      const t = serverState.tournaments.find((item) => item.id === tournamentId);
      if (!t) {
        res.status(404).json({ error: 'البطولة غير موجودة.' });
        return;
      }

      let foundMatch: BracketMatch | null = null;
      for (const r of t.rounds) {
        const m = r.matches.find((item) => item.id === matchId);
        if (m) {
          foundMatch = m;
          break;
        }
      }
      if (!foundMatch) {
        res.status(404).json({ error: 'المباراة غير موجودة.' });
        return;
      }

      const gameObj = serverState.games.find((g) => g.slug === t.gameSlug);
      const gameName = t.customGameName || gameObj?.nameAr || t.gameSlug;
      const { mailtoLinks, emailTargets } = buildEmailDispatchDataForMatch(
        t,
        foundMatch,
        gameName
      );

      const newNotifs: PlayerNotification[] = [];
      let sentCount = 0;
      for (const [p, opp] of [
        [foundMatch.participantA, foundMatch.participantB],
        [foundMatch.participantB, foundMatch.participantA],
      ] as [BracketParticipant | null, BracketParticipant | null][]) {
        if (!p) continue;
        const resolvedEmail = resolveParticipantEmail(p);
        const tpl = buildPlayerEmailTemplate({
          playerName: p.name,
          tournamentTitle: t.title,
          gameName,
          groupName: foundMatch.groupName,
          scheduledAt: foundMatch.scheduledAt || 'لم يتحدد',
          matchLabel: `مباراة #${foundMatch.matchNumber}`,
          opponentName: opp?.name || 'بانتظار الخصم',
          venueName: t.venueName,
          prizePool: t.prizePool,
          appUrl: process.env.APP_URL || '',
        });
        const delivery = await sendEmailIfConfigured({
          to: resolvedEmail,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        });
        if (delivery.deliveryStatus === 'sent') sentCount += 1;
        newNotifs.push({
          id: `notif_${Date.now().toString(36)}_${p.id}`,
          tournamentId: t.id,
          tournamentTitle: t.title,
          participantId: p.id,
          recipientName: p.name,
          recipientEmail: resolvedEmail || undefined,
          groupName: foundMatch.groupName,
          matchId: foundMatch.id,
          matchLabel: `مباراة #${foundMatch.matchNumber}`,
          opponentName: opp?.name,
          scheduledAt: foundMatch.scheduledAt || 'لم يتحدد',
          subject: tpl.subject,
          message: tpl.text,
          deliveryStatus: delivery.deliveryStatus,
          deliveryNote: delivery.deliveryNote,
          createdAt: new Date().toISOString(),
        });
      }

      serverState.notifications = [...newNotifs, ...(serverState.notifications || [])].slice(0, 60);
      persistServerState();

      res.json({
        state: buildViewerState(getViewerFromRequest(req)),
        sentCount,
        mailtoLinks,
        emailTargets,
      });
    }
  );

  // 14. Match Result & Direct AI Knockout Matchups
  app.post(
    '/api/admin/tournaments/:id/matches/:matchId/result',
    (req: Request, res: Response) => {
      const tournamentId = String(req.params.id || '');
      const matchId = String(req.params.matchId || '');
      const { scoreA, scoreB, winnerId, autoAiRank } = (req.body || {}) as {
        scoreA?: number;
        scoreB?: number;
        winnerId?: string | null;
        autoAiRank?: boolean;
      };

      const result = applyMatchResultOnServer(
        tournamentId,
        matchId,
        Number(scoreA) || 0,
        Number(scoreB) || 0,
        winnerId,
        autoAiRank !== false
      );
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({
        state: buildViewerState(getViewerFromRequest(req)),
        aiSummaryAr: result.aiSummaryAr,
      });
    }
  );

  app.post(
    '/api/admin/tournaments/:id/ai-direct-matchups',
    async (req: Request, res: Response) => {
      const id = String(req.params.id || '');
      const customPrompt =
        typeof req.body?.customPrompt === 'string' ? req.body.customPrompt : '';
      const tIdx = serverState.tournaments.findIndex((t) => t.id === id);
      if (tIdx === -1) {
        res.status(404).json({ error: 'البطولة غير موجودة.' });
        return;
      }

      const t = serverState.tournaments[tIdx];
      if (t.rounds.length < 2) {
        res.status(400).json({ error: 'لا توجد مرحلة مواجهات مباشرة لهذه البطولة.' });
        return;
      }

      const standings = computeGroupStandings(t);
      const groupsOrder = getGroupsForTournament(t);

      const pairings: {
        pA: BracketParticipant | null;
        pB: BracketParticipant | null;
        label: string;
      }[] = [];
      for (let i = 0; i < groupsOrder.length; i += 2) {
        const g1 = groupsOrder[i];
        const g2 = groupsOrder[i + 1];
        const rows1 = standings[g1] || [];
        const rows2 = g2 ? standings[g2] || [] : [];
        if (g2) {
          pairings.push({
            pA: rows1[0]?.participant || null,
            pB: rows2[1]?.participant || null,
            label: `أول ${g1} × ثاني ${g2}`,
          });
          pairings.push({
            pA: rows2[0]?.participant || null,
            pB: rows1[1]?.participant || null,
            label: `أول ${g2} × ثاني ${g1}`,
          });
        } else {
          pairings.push({
            pA: rows1[0]?.participant || null,
            pB: rows1[1]?.participant || null,
            label: `أول ${g1} × ثاني ${g1}`,
          });
        }
      }

      const round1 = t.rounds[1];
      const updatedRound1Matches = round1.matches.map((m, idx) => {
        const pair = pairings[idx];
        if (!pair) return m;
        return {
          ...m,
          participantA: pair.pA,
          participantB: pair.pB,
          status: (
            m.status === 'completed'
              ? 'completed'
              : pair.pA && pair.pB
              ? 'live'
              : 'upcoming'
          ) as BracketMatch['status'],
        };
      });

      const placedCount = updatedRound1Matches.filter(
        (m) => m.participantA && m.participantB
      ).length;

      const fallbackSummary = `تم تحديد ${placedCount} مواجهة إقصائية مباشرة (نظام الأول × الثاني من المجموعات المتقابلة) في ${round1.nameAr}.`;
      const matchupsDesc = updatedRound1Matches
        .filter((m) => m.participantA && m.participantB)
        .slice(0, 8)
        .map((m) => `${m.participantA?.name} × ${m.participantB?.name}`)
        .join(' | ');

      const summaryAr = await generateGeminiSummary(
        `أنت محلل بطولات في أرينا برو. اكتب ملخصاً عربياً موجزاً من جملتين للمواجهات الإقصائية في "${round1.nameAr}" لبطولة "${t.title}". المواجهات: ${matchupsDesc || 'قيد الاكتمال'}. ملاحظة: "${customPrompt || 'أفضل ترتيب'}".`,
        fallbackSummary
      );

      serverState.tournaments[tIdx] = {
        ...t,
        lastAiMatchupSummary: summaryAr,
        rounds: t.rounds.map((r, idx) =>
          idx === 1 ? { ...r, matches: updatedRound1Matches } : r
        ),
        updatedAtMs: Date.now(),
      };
      persistServerState();

      res.json({
        state: buildViewerState(getViewerFromRequest(req)),
        matchupsCount: placedCount,
        summaryAr,
      });
    }
  );

  // 15. Submissions Review & Champion Declaration
  app.post('/api/admin/submissions/:id/review', (req: Request, res: Response) => {
    const subId = String(req.params.id || '');
    const decision = req.body?.decision === 'rejected' ? 'rejected' : 'approved';
    const subs = [...(serverState.submissions || [])];
    const idx = subs.findIndex((s) => s.id === subId);
    if (idx === -1) {
      res.status(404).json({ error: 'طلب النتيجة غير موجود.' });
      return;
    }

    const sub = { ...subs[idx], status: decision as ResultSubmission['status'] };
    subs[idx] = sub;
    serverState.submissions = subs;

    if (decision === 'approved') {
      const result = applyMatchResultOnServer(
        sub.tournamentId,
        sub.matchId,
        sub.scoreA,
        sub.scoreB,
        sub.claimedWinnerId,
        true
      );
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ state: buildViewerState(getViewerFromRequest(req)) });
      return;
    }

    serverState.tournaments = serverState.tournaments.map((t) => {
      if (t.id !== sub.tournamentId) return t;
      return {
        ...t,
        rounds: t.rounds.map((r) => ({
          ...r,
          matches: r.matches.map((m) =>
            m.id === sub.matchId ? { ...m, status: 'live' as const } : m
          ),
        })),
        updatedAtMs: Date.now(),
      };
    });
    persistServerState();
    res.json({ state: buildViewerState(getViewerFromRequest(req)) });
  });

  app.post('/api/admin/tournaments/:id/winner', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const winnerName = typeof req.body?.winnerName === 'string' ? req.body.winnerName.trim() : '';
    const tIdx = serverState.tournaments.findIndex((t) => t.id === id);
    if (tIdx === -1) {
      res.status(404).json({ error: 'البطولة غير موجودة.' });
      return;
    }
    if (!winnerName) {
      res.status(400).json({ error: 'يرجى إدخال اسم البطل.' });
      return;
    }

    serverState.tournaments[tIdx] = {
      ...serverState.tournaments[tIdx],
      winnerName,
      status: 'completed',
      registrationOpen: false,
      updatedAtMs: Date.now(),
    };
    persistServerState();
    res.json({ state: buildViewerState(getViewerFromRequest(req)) });
  });

  // Vite middleware in dev / static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Arena Pro] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Arena Pro] Fatal server startup error:', err);
  process.exit(1);
});
