import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase.ts';
import type {
  AdminPlayerSummary,
  BracketMatch,
  BracketParticipant,
  BracketRound,
  FriendChatMessage,
  FriendRequest,
  GameInfo,
  LiveFeedItem,
  PlatformState,
  PlayerProfile,
  ResultSubmission,
  TeamMember,
  Tournament,
} from '../types.ts';
import { isValidEmailAddress, normalizeEmail, sanitizeWhatsappInput } from './validation.ts';

function utf8ToHex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function buildDirectoryLookupKey(prefix: 'h' | 'c', rawValue: string): string {
  const normalized = rawValue.trim().replace(/^@+/, '').toLowerCase();
  if (!normalized) return '';
  return `${prefix}_${utf8ToHex(normalized)}`.slice(0, 128);
}

function isPlaceholderHandle(handle?: string): boolean {
  const k = (handle || '').trim().replace(/^@+/, '').toLowerCase();
  return !k || k === 'player_guest' || k === 'player';
}

function isPlaceholderCode(code?: string): boolean {
  const k = (code || '').trim().toLowerCase();
  return !k || k === 'arena-1042' || k === 'arena-player' || keyIsGuest(k);
}

function keyIsGuest(k: string): boolean {
  return k === 'guest';
}

function isValidFirebaseDocId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function sanitizeDocId(raw: string, fallbackPrefix = 'doc'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (val as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  if (typeof val === 'string' && val) return val;
  return new Date().toISOString();
}

const BOOTSTRAPPED_ADMIN_EMAILS = new Set([
  'saeedyassin313@gmail.com',
  'arenapro185@gmail.com',
]);

export function buildAdminEmailKey(email: string): string {
  return normalizeEmail(email)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
}

export async function isCurrentUserFirestoreAdmin(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;
  const emailLower = normalizeEmail(user.email || '');
  if (BOOTSTRAPPED_ADMIN_EMAILS.has(emailLower)) {
    return true;
  }
  if (emailLower) {
    const emailKey = buildAdminEmailKey(emailLower);
    if (isValidFirebaseDocId(emailKey)) {
      try {
        const emailSnap = await getDoc(doc(db, 'adminEmails', emailKey));
        if (emailSnap.exists()) {
          const docEmail = normalizeEmail(String(emailSnap.data()?.email || ''));
          if (docEmail === emailLower) return true;
        }
      } catch {
        // fallback check below
      }
    }
  }
  if (!isValidFirebaseDocId(user.uid)) return false;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function syncProfileAndDirectoryToFirestore(profile: PlayerProfile): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== profile.id) return;

  const cleanHandle = (profile.handle || '').trim().replace(/^@+/, '').slice(0, 50);
  const cleanName = (profile.displayName || cleanHandle || 'Player').trim().slice(0, 80);
  const cleanCode = (profile.playerCode || '').trim().slice(0, 32);
  const cleanEmail = (profile.email || user.email || '').trim().slice(0, 120);
  const cleanWhatsapp = sanitizeWhatsappInput(
    profile.whatsappNumber || profile.phoneOrDiscord || ''
  );
  const cleanCity = (profile.city || 'القاهرة').trim().slice(0, 60);

  if (!cleanHandle || !cleanName) return;

  const userDocPath = `users/${user.uid}`;
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        uid: user.uid,
        displayName: cleanName,
        handle: cleanHandle,
        ...(cleanCode ? { playerCode: cleanCode } : {}),
        email: cleanEmail,
        whatsappNumber: cleanWhatsapp,
        city: cleanCity,
        onboardingCompleted: Boolean(profile.onboardingCompleted),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userDocPath);
  }

  if (isPlaceholderHandle(cleanHandle) || isPlaceholderCode(cleanCode)) return;

  const handleKey = buildDirectoryLookupKey('h', cleanHandle);
  const codeKey = buildDirectoryLookupKey('c', cleanCode);
  for (const lookupKey of [handleKey, codeKey]) {
    if (!lookupKey || !isValidFirebaseDocId(lookupKey)) continue;
    const dirPath = `playerDirectory/${lookupKey}`;
    try {
      const ref = doc(db, 'playerDirectory', lookupKey);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          lookupKey,
          uid: user.uid,
          displayName: cleanName,
          handle: cleanHandle,
          playerCode: cleanCode,
          updatedAt: serverTimestamp(),
        });
      } else if (snap.data()?.uid === user.uid) {
        await updateDoc(ref, {
          displayName: cleanName,
          handle: cleanHandle,
          playerCode: cleanCode,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, dirPath);
    }
  }
}

export async function lookupDirectoryInFirestore(rawQuery: string): Promise<{
  uid: string;
  handle: string;
  displayName: string;
  playerCode: string;
} | null> {
  if (!auth.currentUser) return null;
  const clean = rawQuery.trim().replace(/^@+/, '');
  if (!clean || isPlaceholderHandle(clean) || isPlaceholderCode(clean)) return null;

  const candidates = [
    buildDirectoryLookupKey('h', clean),
    buildDirectoryLookupKey('c', clean),
  ].filter((k) => Boolean(k) && isValidFirebaseDocId(k));

  for (const key of candidates) {
    const dirPath = `playerDirectory/${key}`;
    try {
      const snap = await getDoc(doc(db, 'playerDirectory', key));
      if (snap.exists()) {
        const d = snap.data() as {
          uid?: string;
          handle?: string;
          displayName?: string;
          playerCode?: string;
        };
        if (d.uid && d.handle && d.playerCode) {
          return {
            uid: d.uid,
            handle: d.handle,
            displayName: d.displayName || d.handle,
            playerCode: d.playerCode,
          };
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, dirPath);
    }
  }
  return null;
}

export async function mirrorFriendRequestCreateToFirestore(req: FriendRequest): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== req.fromUid) return;
  if (!isValidFirebaseDocId(req.id) || !isValidFirebaseDocId(req.fromUid) || !isValidFirebaseDocId(req.toUid)) {
    return;
  }
  const reqPath = `friendRequests/${req.id}`;
  try {
    const ref = doc(db, 'friendRequests', req.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: req.id,
        fromUid: req.fromUid,
        fromHandle: req.fromHandle.slice(0, 50),
        fromName: (req.fromName || req.fromHandle).slice(0, 80),
        fromPlayerCode: (req.fromPlayerCode || 'ARENA-PLAYER').slice(0, 32),
        toUid: req.toUid,
        toHandle: req.toHandle.slice(0, 50),
        toName: (req.toName || req.toHandle).slice(0, 80),
        toPlayerCode: (req.toPlayerCode || 'ARENA-PLAYER').slice(0, 32),
        role: (req.role || 'صديق').slice(0, 40),
        status: req.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, reqPath);
  }
}

export async function mirrorFriendRequestRespondToFirestore(
  requestId: string,
  status: 'accepted' | 'declined'
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !isValidFirebaseDocId(requestId)) return;
  const reqPath = `friendRequests/${requestId}`;
  try {
    const ref = doc(db, 'friendRequests', requestId);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data()?.status === 'pending') {
      await updateDoc(ref, {
        status,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, reqPath);
  }
}

export async function mirrorFriendEdgeToFirestore(
  ownerUid: string,
  friend: { uid: string; handle: string; name: string; role?: string; playerCode?: string; requestId?: string }
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== ownerUid) return;
  if (!isValidFirebaseDocId(ownerUid) || !isValidFirebaseDocId(friend.uid) || ownerUid === friend.uid) {
    return;
  }
  const path = `users/${ownerUid}/friends/${friend.uid}`;
  try {
    await setDoc(doc(db, 'users', ownerUid, 'friends', friend.uid), {
      uid: friend.uid,
      handle: friend.handle.slice(0, 50),
      name: (friend.name || friend.handle).slice(0, 80),
      role: (friend.role || 'صديق').slice(0, 40),
      playerCode: (friend.playerCode || '').slice(0, 32),
      requestId: (friend.requestId || '').slice(0, 128),
      addedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteFriendEdgeFromFirestore(
  ownerUid: string,
  friendUid: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== ownerUid) return;
  if (!isValidFirebaseDocId(ownerUid) || !isValidFirebaseDocId(friendUid)) return;
  const path = `users/${ownerUid}/friends/${friendUid}`;
  try {
    await deleteDoc(doc(db, 'users', ownerUid, 'friends', friendUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function loadCloudUserBundle(uid: string): Promise<{
  friends: TeamMember[];
  friendRequests: FriendRequest[];
}> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== uid || !isValidFirebaseDocId(uid)) {
    return { friends: [], friendRequests: [] };
  }

  const friendsMap = new Map<string, TeamMember>();
  const friendsPath = `users/${uid}/friends`;
  try {
    const friendsSnap = await getDocs(collection(db, 'users', uid, 'friends'));
    for (const d of friendsSnap.docs) {
      const data = d.data() as {
        uid?: string;
        handle?: string;
        name?: string;
        role?: string;
        addedAt?: unknown;
      };
      if (data.uid && data.handle) {
        friendsMap.set(data.uid, {
          id: `m-${data.uid}`,
          uid: data.uid,
          name: data.name || data.handle,
          handle: data.handle,
          role: data.role || 'صديق',
          verified: true,
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, friendsPath);
  }

  const requestsMap = new Map<string, FriendRequest>();
  const reqColPath = 'friendRequests';
  try {
    const [incomingSnap, outgoingSnap] = await Promise.all([
      getDocs(query(collection(db, 'friendRequests'), where('toUid', '==', uid))),
      getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', uid))),
    ]);

    for (const snap of [incomingSnap, outgoingSnap]) {
      for (const docSnap of snap.docs) {
        const d = docSnap.data() as Record<string, unknown>;
        const reqObj: FriendRequest = {
          id: String(d.id || docSnap.id),
          fromUid: String(d.fromUid || ''),
          fromHandle: String(d.fromHandle || ''),
          fromName: String(d.fromName || d.fromHandle || ''),
          fromPlayerCode: String(d.fromPlayerCode || 'ARENA-PLAYER'),
          toUid: String(d.toUid || ''),
          toHandle: String(d.toHandle || ''),
          toName: String(d.toName || d.toHandle || ''),
          toPlayerCode: String(d.toPlayerCode || 'ARENA-PLAYER'),
          role: d.role ? String(d.role) : 'صديق',
          status:
            d.status === 'accepted' || d.status === 'declined' ? d.status : 'pending',
          createdAt: toIsoString(d.createdAt),
          respondedAt: d.status !== 'pending' ? toIsoString(d.updatedAt) : undefined,
        };
        requestsMap.set(reqObj.id, reqObj);

        if (reqObj.status === 'accepted') {
          const isSender = reqObj.fromUid === uid;
          const peerUid = isSender ? reqObj.toUid : reqObj.fromUid;
          const peerHandle = isSender ? reqObj.toHandle : reqObj.fromHandle;
          const peerName = isSender ? reqObj.toName : reqObj.fromName;
          const peerCode = isSender ? reqObj.toPlayerCode : reqObj.fromPlayerCode;
          if (peerUid && !friendsMap.has(peerUid)) {
            friendsMap.set(peerUid, {
              id: `m-${peerUid}`,
              uid: peerUid,
              name: peerName,
              handle: peerHandle,
              role: reqObj.role || 'صديق',
              verified: true,
            });
            mirrorFriendEdgeToFirestore(uid, {
              uid: peerUid,
              handle: peerHandle,
              name: peerName,
              role: reqObj.role || 'صديق',
              playerCode: peerCode,
              requestId: reqObj.id,
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, reqColPath);
  }

  return {
    friends: Array.from(friendsMap.values()),
    friendRequests: Array.from(requestsMap.values()),
  };
}

// =====================================================================
// Persistent Platform Cloud Sync (Tournaments, Games, Registrations, Feed, Submissions)
// =====================================================================

function sanitizeParticipantForCloud(p: BracketParticipant | null): Record<string, unknown> | null {
  if (!p) return null;
  const cleanRoster = Array.isArray(p.rosterMembers)
    ? p.rosterMembers.slice(0, 6).map((rm) => ({
        name: String(rm.name || '').slice(0, 80),
        ...(rm.username ? { username: String(rm.username).slice(0, 50) } : {}),
        ...(rm.role ? { role: String(rm.role).slice(0, 40) } : {}),
      }))
    : undefined;

  const cleanCheckedIn = Array.isArray(p.checkedInHandles)
    ? p.checkedInHandles
        .slice(0, 6)
        .map((h) => String(h || '').trim().replace(/^@+/, '').slice(0, 50))
        .filter(Boolean)
    : undefined;

  return {
    id: String(p.id).slice(0, 128),
    name: String(p.name || '').slice(0, 120),
    ...(p.teamName ? { teamName: String(p.teamName).slice(0, 120) } : {}),
    username: String(p.username || '').slice(0, 50),
    ...(p.teammateUsername ? { teammateUsername: String(p.teammateUsername).slice(0, 50) } : {}),
    ...(cleanRoster && cleanRoster.length > 0 ? { rosterMembers: cleanRoster } : {}),
    ...(cleanCheckedIn && cleanCheckedIn.length > 0 ? { checkedInHandles: cleanCheckedIn } : {}),
    ...(p.registeredByUid ? { registeredByUid: String(p.registeredByUid).slice(0, 128) } : {}),
    groupName: String(p.groupName || 'المجموعة أ').slice(0, 60),
    seed: Number(p.seed) || 1,
    gameId: String(p.gameId || '').slice(0, 50),
    isTeam: Boolean(p.isTeam),
  };
}

function sanitizeMatchForCloud(m: BracketMatch): Record<string, unknown> {
  return {
    id: String(m.id).slice(0, 128),
    roundIndex: Number(m.roundIndex) || 0,
    matchNumber: Number(m.matchNumber) || 1,
    groupName: String(m.groupName || '').slice(0, 60),
    ...(typeof m.seatA === 'number' ? { seatA: m.seatA } : {}),
    ...(typeof m.seatB === 'number' ? { seatB: m.seatB } : {}),
    ...(m.leg ? { leg: m.leg } : {}),
    ...(m.scheduledAt ? { scheduledAt: String(m.scheduledAt).slice(0, 120) } : {}),
    ...(m.pairKey ? { pairKey: String(m.pairKey).slice(0, 160) } : {}),
    participantA: sanitizeParticipantForCloud(m.participantA),
    participantB: sanitizeParticipantForCloud(m.participantB),
    scoreA: typeof m.scoreA === 'number' ? m.scoreA : null,
    scoreB: typeof m.scoreB === 'number' ? m.scoreB : null,
    winnerId: m.winnerId ? String(m.winnerId).slice(0, 128) : null,
    status: m.status || 'upcoming',
  };
}

function sanitizeRoundsForCloud(rounds: BracketRound[]): Record<string, unknown>[] {
  return (rounds || []).slice(0, 10).map((r) => ({
    roundIndex: Number(r.roundIndex) || 0,
    nameAr: String(r.nameAr || '').slice(0, 120),
    matches: (r.matches || []).map(sanitizeMatchForCloud),
  }));
}

export async function syncTournamentToFirestore(tournament: Tournament): Promise<void> {
  if (!(await isCurrentUserFirestoreAdmin())) return;
  if (!isValidFirebaseDocId(tournament.id)) return;

  const docPath = `tournaments/${tournament.id}`;
  const cleanRules = (tournament.rules || [])
    .map((r) => String(r).trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 40);

  const updatablePayload: Record<string, unknown> = {
    title: String(tournament.title || 'Tournament').trim().slice(0, 160),
    gameSlug:
      tournament.gameSlug === 'pool8' || tournament.gameSlug === 'fc27'
        ? tournament.gameSlug
        : 'custom',
    customGameName: tournament.customGameName
      ? String(tournament.customGameName).trim().slice(0, 120)
      : null,
    modeTag:
      tournament.modeTag === '2v2' || tournament.modeTag === '4v4'
        ? tournament.modeTag
        : '1v1',
    formatLabel: String(tournament.formatLabel || '').slice(0, 120),
    venueName: String(tournament.venueName || '').slice(0, 160),
    prizePool: String(tournament.prizePool || '').slice(0, 120),
    maxSlots: Math.min(64, Math.max(4, Number(tournament.maxSlots) || 32)),
    registeredCount: Math.min(64, Math.max(0, Number(tournament.registeredCount) || 0)),
    registrationOpen: Boolean(tournament.registrationOpen),
    resultsEntryOpen: Boolean(tournament.resultsEntryOpen),
    lastAiMatchupSummary: tournament.lastAiMatchupSummary
      ? String(tournament.lastAiMatchupSummary).slice(0, 1000)
      : null,
    status:
      tournament.status === 'ongoing' || tournament.status === 'completed'
        ? tournament.status
        : 'open',
    isFeatured: Boolean(tournament.isFeatured),
    entryType: tournament.entryType === 'team' ? 'team' : 'solo',
    rules: cleanRules,
    winnerName: tournament.winnerName ? String(tournament.winnerName).slice(0, 120) : null,
    rounds: sanitizeRoundsForCloud(tournament.rounds),
    updatedAtMs: Number(tournament.updatedAtMs) || Date.now(),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, 'tournaments', tournament.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: tournament.id,
        ...updatablePayload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, updatablePayload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function deleteTournamentFromFirestore(tournamentId: string): Promise<void> {
  if (!(await isCurrentUserFirestoreAdmin())) return;
  if (!isValidFirebaseDocId(tournamentId)) return;

  const docPath = `tournaments/${tournamentId}`;
  try {
    const regSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'registrations'));
    for (const r of regSnap.docs) {
      await deleteDoc(r.ref).catch(() => {});
    }
    await deleteDoc(doc(db, 'tournaments', tournamentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

export async function syncGameToFirestore(game: GameInfo): Promise<void> {
  if (!(await isCurrentUserFirestoreAdmin())) return;
  if (!isValidFirebaseDocId(game.slug)) return;

  const docPath = `games/${game.slug}`;
  const cleanRules = (game.rulesHighlights || [])
    .map((r) => String(r).trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 40);

  const updatablePayload = {
    nameAr: String(game.nameAr || game.nameEn).slice(0, 80),
    nameEn: String(game.nameEn || game.nameAr).slice(0, 80),
    modeLabel: String(game.modeLabel || '').slice(0, 120),
    scoringSystem: String(game.scoringSystem || '').slice(0, 160),
    teamSize: Math.min(10, Math.max(1, Number(game.teamSize) || 1)),
    imageUrl: String(game.imageUrl || '').slice(0, 400),
    activePlayersCount: Math.max(0, Number(game.activePlayersCount) || 0),
    summary: String(game.summary || '').slice(0, 500),
    rulesHighlights: cleanRules,
    updatedAtMs: Number(game.updatedAtMs) || Date.now(),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, 'games', game.slug);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        slug: game.slug,
        ...updatablePayload,
      });
    } else {
      await updateDoc(ref, updatablePayload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function syncLiveFeedItemToFirestore(item: LiveFeedItem): Promise<void> {
  if (!(await isCurrentUserFirestoreAdmin())) return;
  if (!isValidFirebaseDocId(item.id) || !isValidFirebaseDocId(item.tournamentId)) return;

  const docPath = `liveFeed/${item.id}`;
  const updatablePayload = {
    tournamentTitle: String(item.tournamentTitle || '').slice(0, 160),
    gameName: String(item.gameName || '').slice(0, 100),
    roundName: String(item.roundName || '').slice(0, 100),
    matchNumber: Number(item.matchNumber) || 1,
    groupName: String(item.groupName || '').slice(0, 60),
    participantAName: String(item.participantAName || '').slice(0, 120),
    participantBName: String(item.participantBName || '').slice(0, 120),
    scoreA: Number(item.scoreA) || 0,
    scoreB: Number(item.scoreB) || 0,
    winnerName: String(item.winnerName || '').slice(0, 120),
    approvedAt: String(item.approvedAt || new Date().toISOString()).slice(0, 60),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, 'liveFeed', item.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: item.id,
        tournamentId: item.tournamentId,
        ...updatablePayload,
      });
    } else {
      await updateDoc(ref, updatablePayload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export interface CloudRegistrationRecord {
  id: string;
  tournamentId: string;
  registeredByUid: string;
  participant: BracketParticipant;
  assignedSeatIndex?: number;
}

export async function syncRegistrationToFirestore(
  tournamentId: string,
  participant: BracketParticipant,
  assignedSeatIndex?: number
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !isValidFirebaseDocId(tournamentId)) return;

  const regId = sanitizeDocId(`reg_${user.uid}`, 'reg');
  const regPath = `tournaments/${tournamentId}/registrations/${regId}`;

  const cleanRoster = Array.isArray(participant.rosterMembers)
    ? participant.rosterMembers.slice(0, 6).map((rm) => ({
        name: String(rm.name || '').slice(0, 80),
        ...(rm.username ? { username: String(rm.username).slice(0, 50) } : {}),
        ...(rm.role ? { role: String(rm.role).slice(0, 40) } : {}),
      }))
    : [];

  try {
    const ref = doc(db, 'tournaments', tournamentId, 'registrations', regId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: regId,
        tournamentId,
        registeredByUid: user.uid,
        participantId: String(participant.id).slice(0, 128),
        name: String(participant.name || participant.teamName || participant.username).slice(0, 120),
        ...(participant.teamName ? { teamName: String(participant.teamName).slice(0, 120) } : {}),
        username: String(participant.username).slice(0, 50),
        ...(participant.teammateUsername
          ? { teammateUsername: String(participant.teammateUsername).slice(0, 50) }
          : {}),
        ...(cleanRoster.length > 0 ? { rosterMembers: cleanRoster } : {}),
        ...(Array.isArray(participant.checkedInHandles) && participant.checkedInHandles.length > 0
          ? {
              checkedInHandles: participant.checkedInHandles
                .slice(0, 6)
                .map((h) => String(h || '').trim().replace(/^@+/, '').slice(0, 50))
                .filter(Boolean),
            }
          : {}),
        groupName: String(participant.groupName || 'المجموعة أ').slice(0, 60),
        seed: Math.max(1, Number(participant.seed) || 1),
        gameId: String(participant.gameId || '').slice(0, 50),
        isTeam: Boolean(participant.isTeam),
        ...(typeof assignedSeatIndex === 'number' && assignedSeatIndex >= 0 && assignedSeatIndex <= 3
          ? { assignedSeatIndex }
          : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, regPath);
  }
}

export async function syncSubmissionCreateToFirestore(submission: ResultSubmission): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  if (!isValidFirebaseDocId(submission.id) || !isValidFirebaseDocId(submission.tournamentId)) return;

  const rawUrl = String(submission.screenshotUrl || '/assets/aistudio/FC27-ut-guide_09aef642.jpg');
  const safeScreenshotUrl =
    rawUrl.length <= 240000 ? rawUrl : '/assets/aistudio/FC27-ut-guide_09aef642.jpg';

  const docPath = `submissions/${submission.id}`;
  try {
    const ref = doc(db, 'submissions', submission.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: submission.id,
        tournamentId: submission.tournamentId,
        tournamentTitle: String(submission.tournamentTitle || '').slice(0, 160),
        matchId: String(submission.matchId || '').slice(0, 128),
        matchLabel: String(submission.matchLabel || '').slice(0, 240),
        submittedBy: String(submission.submittedBy || 'Player').slice(0, 80),
        submittedByUid: user.uid,
        claimedWinnerId: String(submission.claimedWinnerId || '').slice(0, 128),
        claimedWinnerName: String(submission.claimedWinnerName || '').slice(0, 120),
        scoreA: Number(submission.scoreA) || 0,
        scoreB: Number(submission.scoreB) || 0,
        screenshotUrl: safeScreenshotUrl,
        note: String(submission.note || '').slice(0, 400),
        status: submission.status || 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, docPath);
  }
}

export async function syncSubmissionStatusToFirestore(
  submissionId: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  if (!(await isCurrentUserFirestoreAdmin())) return;
  if (!isValidFirebaseDocId(submissionId)) return;

  const docPath = `submissions/${submissionId}`;
  try {
    const ref = doc(db, 'submissions', submissionId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        status,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath);
  }
}

export async function syncAdminEmailToFirestore(email: string): Promise<void> {
  const user = auth.currentUser;
  const cleanEmail = normalizeEmail(email).slice(0, 120);
  if (!user || !isValidEmailAddress(cleanEmail) || !(await isCurrentUserFirestoreAdmin())) return;
  const emailKey = buildAdminEmailKey(cleanEmail);
  if (!isValidFirebaseDocId(emailKey)) return;

  const docPath = `adminEmails/${emailKey}`;
  try {
    const ref = doc(db, 'adminEmails', emailKey);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        emailKey,
        email: cleanEmail,
        addedByUid: user.uid,
        addedByEmail: normalizeEmail(user.email || '').slice(0, 120),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        addedByUid: user.uid,
        addedByEmail: normalizeEmail(user.email || '').slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function removeAdminEmailFromFirestore(email: string): Promise<void> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || BOOTSTRAPPED_ADMIN_EMAILS.has(cleanEmail)) return;
  if (!(await isCurrentUserFirestoreAdmin())) return;
  const emailKey = buildAdminEmailKey(cleanEmail);
  if (!isValidFirebaseDocId(emailKey)) return;

  const docPath = `adminEmails/${emailKey}`;
  try {
    await deleteDoc(doc(db, 'adminEmails', emailKey));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

export async function syncAdminHandlesToFirestore(handles: string[]): Promise<void> {
  const user = auth.currentUser;
  if (!user || !(await isCurrentUserFirestoreAdmin())) return;

  const cleanHandles = Array.from(
    new Set([
      ...BOOTSTRAPPED_ADMIN_EMAILS,
      ...handles
        .map((h) => normalizeEmail(h).slice(0, 120))
        .filter((h) => isValidEmailAddress(h)),
    ])
  ).slice(0, 50);

  const docPath = 'platformConfig/admins';
  try {
    await setDoc(doc(db, 'platformConfig', 'admins'), {
      id: 'admins',
      handles: cleanHandles,
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function loadAllPlayerProfilesFromFirestore(): Promise<AdminPlayerSummary[]> {
  if (!(await isCurrentUserFirestoreAdmin())) return [];
  const docPath = 'users';
  try {
    const snap = await getDocs(collection(db, docPath));
    const list: AdminPlayerSummary[] = [];
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const uid = String(data.uid || d.id);
      list.push({
        id: uid,
        displayName: String(data.displayName || ''),
        handle: String(data.handle || ''),
        playerCode: String(data.playerCode || ''),
        email: String(data.email || ''),
        whatsappNumber: String(data.whatsappNumber || ''),
        city: String(data.city || ''),
        onboardingCompleted: Boolean(data.onboardingCompleted),
        updatedAt: data.updatedAt ? toIsoString(data.updatedAt) : undefined,
      });
    }
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, docPath);
    return [];
  }
}

let pendingPublicPlatformLoad: Promise<{
  games: GameInfo[];
  tournaments: Tournament[];
  registrationsByTournament: Record<string, CloudRegistrationRecord[]>;
  liveFeed: LiveFeedItem[];
}> | null = null;
let lastPublicPlatformLoadAt = 0;
let lastPublicPlatformResult: {
  games: GameInfo[];
  tournaments: Tournament[];
  registrationsByTournament: Record<string, CloudRegistrationRecord[]>;
  liveFeed: LiveFeedItem[];
} | null = null;

export async function loadPublicPlatformFromFirestore(): Promise<{
  games: GameInfo[];
  tournaments: Tournament[];
  registrationsByTournament: Record<string, CloudRegistrationRecord[]>;
  liveFeed: LiveFeedItem[];
}> {
  if (lastPublicPlatformResult && Date.now() - lastPublicPlatformLoadAt < 4000) {
    return lastPublicPlatformResult;
  }
  if (pendingPublicPlatformLoad) {
    return pendingPublicPlatformLoad;
  }

  pendingPublicPlatformLoad = (async () => {
    const games: GameInfo[] = [];
    const tournaments: Tournament[] = [];
    const registrationsByTournament: Record<string, CloudRegistrationRecord[]> = {};
    const liveFeed: LiveFeedItem[] = [];

  try {
    const [gamesSnap, tournamentsSnap, feedSnap] = await Promise.all([
      getDocs(collection(db, 'games')),
      getDocs(collection(db, 'tournaments')),
      getDocs(collection(db, 'liveFeed')),
    ]);

    for (const d of gamesSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const slug = String(data.slug || d.id) as GameInfo['slug'];
      if (slug === 'pool8' || slug === 'fc27' || slug === 'custom') {
        games.push({
          slug,
          nameAr: String(data.nameAr || ''),
          nameEn: String(data.nameEn || ''),
          modeLabel: String(data.modeLabel || ''),
          scoringSystem: String(data.scoringSystem || ''),
          teamSize: Number(data.teamSize) || 1,
          imageUrl: String(data.imageUrl || ''),
          activePlayersCount: Number(data.activePlayersCount) || 0,
          summary: String(data.summary || ''),
          rulesHighlights: Array.isArray(data.rulesHighlights)
            ? data.rulesHighlights.map((r) => String(r))
            : [],
          updatedAtMs: Number(data.updatedAtMs) || 0,
        });
      }
    }

    for (const d of tournamentsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = String(data.id || d.id);
      tournaments.push({
        id,
        title: String(data.title || ''),
        gameSlug:
          data.gameSlug === 'pool8' || data.gameSlug === 'fc27'
            ? data.gameSlug
            : 'custom',
        customGameName: data.customGameName ? String(data.customGameName) : undefined,
        modeTag:
          data.modeTag === '2v2' || data.modeTag === '4v4' ? data.modeTag : '1v1',
        formatLabel: String(data.formatLabel || ''),
        venueName: String(data.venueName || ''),
        prizePool: String(data.prizePool || ''),
        maxSlots: (Number(data.maxSlots) || 32) as Tournament['maxSlots'],
        registeredCount: Number(data.registeredCount) || 0,
        registrationOpen: Boolean(data.registrationOpen),
        resultsEntryOpen: Boolean(data.resultsEntryOpen),
        lastAiMatchupSummary: data.lastAiMatchupSummary
          ? String(data.lastAiMatchupSummary)
          : undefined,
        status:
          data.status === 'ongoing' || data.status === 'completed' ? data.status : 'open',
        isFeatured: Boolean(data.isFeatured),
        entryType: data.entryType === 'team' ? 'team' : 'solo',
        rules: Array.isArray(data.rules) ? data.rules.map((r) => String(r)) : [],
        winnerName: data.winnerName ? String(data.winnerName) : null,
        rounds: Array.isArray(data.rounds) ? (data.rounds as BracketRound[]) : [],
        updatedAtMs: Number(data.updatedAtMs) || 0,
      });
    }

    await Promise.all(
      tournaments.map(async (t) => {
        try {
          const regSnap = await getDocs(collection(db, 'tournaments', t.id, 'registrations'));
          const list: CloudRegistrationRecord[] = [];
          for (const rd of regSnap.docs) {
            const data = rd.data() as Record<string, unknown>;
            list.push({
              id: String(data.id || rd.id),
              tournamentId: t.id,
              registeredByUid: String(data.registeredByUid || ''),
              assignedSeatIndex:
                typeof data.assignedSeatIndex === 'number' ? data.assignedSeatIndex : undefined,
              participant: {
                id: String(data.participantId || rd.id),
                name: String(data.name || ''),
                teamName: data.teamName ? String(data.teamName) : undefined,
                username: String(data.username || ''),
                teammateUsername: data.teammateUsername
                  ? String(data.teammateUsername)
                  : undefined,
                rosterMembers: Array.isArray(data.rosterMembers)
                  ? (data.rosterMembers as BracketParticipant['rosterMembers'])
                  : undefined,
                checkedInHandles: Array.isArray(data.checkedInHandles)
                  ? data.checkedInHandles.map((h) => String(h))
                  : undefined,
                registeredByUid: String(data.registeredByUid || ''),
                groupName: String(data.groupName || 'المجموعة أ'),
                seed: Number(data.seed) || 1,
                gameId: String(data.gameId || ''),
                isTeam: Boolean(data.isTeam),
              },
            });
          }
          if (list.length > 0) {
            registrationsByTournament[t.id] = list;
          }
        } catch {
          // ignore per-tournament registration read failures
        }
      })
    );

    for (const d of feedSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      liveFeed.push({
        id: String(data.id || d.id),
        tournamentId: String(data.tournamentId || ''),
        tournamentTitle: String(data.tournamentTitle || ''),
        gameName: String(data.gameName || ''),
        roundName: String(data.roundName || ''),
        matchNumber: Number(data.matchNumber) || 1,
        groupName: String(data.groupName || ''),
        participantAName: String(data.participantAName || ''),
        participantBName: String(data.participantBName || ''),
        scoreA: Number(data.scoreA) || 0,
        scoreB: Number(data.scoreB) || 0,
        winnerName: String(data.winnerName || ''),
        approvedAt: String(data.approvedAt || ''),
      });
    }
  } catch {
    // non-fatal offline / public read fallback
  }

    const res = { games, tournaments, registrationsByTournament, liveFeed };
    lastPublicPlatformResult = res;
    lastPublicPlatformLoadAt = Date.now();
    return res;
  })();

  try {
    return await pendingPublicPlatformLoad;
  } finally {
    pendingPublicPlatformLoad = null;
  }
}

export async function loadAdminCloudExtras(): Promise<{
  adminHandles: string[];
  submissions: ResultSubmission[];
}> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { adminHandles: [], submissions: [] };
  }

  let adminHandles: string[] = [];
  const submissions: ResultSubmission[] = [];
  const isAdmin = await isCurrentUserFirestoreAdmin();

  if (isAdmin) {
    const adminSet = new Set<string>(BOOTSTRAPPED_ADMIN_EMAILS);
    try {
      const cfgSnap = await getDoc(doc(db, 'platformConfig', 'admins'));
      if (cfgSnap.exists()) {
        const d = cfgSnap.data() as { handles?: unknown };
        if (Array.isArray(d.handles)) {
          for (const h of d.handles) {
            const clean = normalizeEmail(String(h || ''));
            if (isValidEmailAddress(clean)) adminSet.add(clean);
          }
        }
      }
    } catch {
      // ignore
    }
    try {
      const emailSnap = await getDocs(collection(db, 'adminEmails'));
      for (const d of emailSnap.docs) {
        const clean = normalizeEmail(String(d.data()?.email || ''));
        if (isValidEmailAddress(clean)) adminSet.add(clean);
      }
    } catch {
      // ignore
    }
    adminHandles = Array.from(adminSet);
  }

  try {
    const subSnap = isAdmin
      ? await getDocs(collection(db, 'submissions'))
      : await getDocs(query(collection(db, 'submissions'), where('submittedByUid', '==', user.uid)));

    for (const d of subSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      submissions.push({
        id: String(data.id || d.id),
        tournamentId: String(data.tournamentId || ''),
        tournamentTitle: String(data.tournamentTitle || ''),
        matchId: String(data.matchId || ''),
        matchLabel: String(data.matchLabel || ''),
        submittedBy: String(data.submittedBy || ''),
        claimedWinnerId: String(data.claimedWinnerId || ''),
        claimedWinnerName: String(data.claimedWinnerName || ''),
        scoreA: Number(data.scoreA) || 0,
        scoreB: Number(data.scoreB) || 0,
        screenshotUrl: String(data.screenshotUrl || ''),
        note: String(data.note || ''),
        status:
          data.status === 'approved' || data.status === 'rejected' ? data.status : 'pending',
      });
    }
  } catch {
    // ignore
  }

  return { adminHandles, submissions };
}

export async function syncAdminSnapshotToFirestore(state: PlatformState): Promise<void> {
  if (!(await isCurrentUserFirestoreAdmin())) return;

  const tasks: Promise<unknown>[] = [];

  for (const g of state.games || []) {
    if ((g.rulesHighlights && g.rulesHighlights.length > 0) || g.updatedAtMs) {
      tasks.push(syncGameToFirestore(g).catch(() => {}));
    }
  }

  for (const t of state.tournaments || []) {
    tasks.push(syncTournamentToFirestore(t).catch(() => {}));
  }

  for (const item of (state.liveFeed || []).slice(0, 30)) {
    tasks.push(syncLiveFeedItemToFirestore(item).catch(() => {}));
  }

  if (Array.isArray(state.adminHandles) && state.adminHandles.length > 0) {
    tasks.push(syncAdminHandlesToFirestore(state.adminHandles).catch(() => {}));
  }

  await Promise.all(tasks);
}

export async function syncRegistrationCheckInToFirestore(
  tournamentId: string,
  participant: BracketParticipant
): Promise<void> {
  if (!(await isCurrentUserFirestoreAdmin())) return;
  if (!isValidFirebaseDocId(tournamentId)) return;

  const cleanCheckedIn = Array.isArray(participant.checkedInHandles)
    ? participant.checkedInHandles
        .slice(0, 6)
        .map((h) => String(h || '').trim().replace(/^@+/, '').slice(0, 50))
        .filter(Boolean)
    : [];

  const regColPath = `tournaments/${tournamentId}/registrations`;
  try {
    const regId = participant.registeredByUid
      ? sanitizeDocId(`reg_${participant.registeredByUid}`, 'reg')
      : '';
    if (regId && isValidFirebaseDocId(regId)) {
      const ref = doc(db, 'tournaments', tournamentId, 'registrations', regId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          checkedInHandles: cleanCheckedIn,
          updatedAt: serverTimestamp(),
        });
        return;
      }
    }
    const q = query(
      collection(db, 'tournaments', tournamentId, 'registrations'),
      where('participantId', '==', participant.id)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await updateDoc(d.ref, {
        checkedInHandles: cleanCheckedIn,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, regColPath);
  }
}

export async function syncChatMessageCreateToFirestore(
  msg: FriendChatMessage
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== msg.senderUid) return;
  if (!isValidFirebaseDocId(msg.id) || !isValidFirebaseDocId(msg.senderUid)) return;

  const docPath = `chatMessages/${msg.id}`;
  try {
    await setDoc(doc(db, 'chatMessages', msg.id), {
      id: msg.id,
      ...(msg.clientMsgId ? { clientMsgId: String(msg.clientMsgId).slice(0, 128) } : {}),
      channelId: String(msg.channelId || 'team-group').slice(0, 260),
      senderUid: user.uid,
      senderHandle: String(msg.senderHandle || 'player').slice(0, 50),
      senderName: String(msg.senderName || msg.senderHandle || 'Player').slice(0, 80),
      recipientUid: String(msg.recipientUid || 'team-group').slice(0, 128),
      recipientHandle: String(msg.recipientHandle || '').slice(0, 50),
      text: String(msg.text || '').slice(0, 1000),
      readBy: Array.isArray(msg.readBy) && msg.readBy.length > 0 ? msg.readBy.slice(0, 50) : [user.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, docPath);
  }
}

export async function markChatMessagesReadInFirestore(
  messagesToMark: FriendChatMessage[],
  viewerUid: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== viewerUid || !isValidFirebaseDocId(viewerUid)) {
    return;
  }
  for (const m of messagesToMark) {
    if (!isValidFirebaseDocId(m.id)) continue;
    const currentReadBy = Array.isArray(m.readBy) ? m.readBy : [];
    if (currentReadBy.includes(viewerUid)) continue;
    const nextReadBy = [...currentReadBy, viewerUid].slice(0, 50);
    const docPath = `chatMessages/${m.id}`;
    try {
      const ref = doc(db, 'chatMessages', m.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          readBy: nextReadBy,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    }
  }
}

export function subscribeToPublicPlatform(handlers: {
  onGames?: (games: GameInfo[]) => void;
  onTournaments?: (tournaments: Tournament[]) => void;
  onLiveFeed?: (liveFeed: LiveFeedItem[]) => void;
}): () => void {
  const unsubs: (() => void)[] = [];

  if (handlers.onGames) {
    const gamesPath = 'games';
    unsubs.push(
      onSnapshot(
        collection(db, gamesPath),
        (snap) => {
          const games: GameInfo[] = [];
          for (const d of snap.docs) {
            const data = d.data() as Record<string, unknown>;
            const slug = String(data.slug || d.id) as GameInfo['slug'];
            if (slug === 'pool8' || slug === 'fc27' || slug === 'custom') {
              games.push({
                slug,
                nameAr: String(data.nameAr || ''),
                nameEn: String(data.nameEn || ''),
                modeLabel: String(data.modeLabel || ''),
                scoringSystem: String(data.scoringSystem || ''),
                teamSize: Number(data.teamSize) || 1,
                imageUrl: String(data.imageUrl || ''),
                activePlayersCount: Number(data.activePlayersCount) || 0,
                summary: String(data.summary || ''),
                rulesHighlights: Array.isArray(data.rulesHighlights)
                  ? data.rulesHighlights.map((r) => String(r))
                  : [],
                updatedAtMs: Number(data.updatedAtMs) || 0,
              });
            }
          }
          if (games.length > 0) handlers.onGames?.(games);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, gamesPath);
        }
      )
    );
  }

  if (handlers.onTournaments) {
    const tournPath = 'tournaments';
    unsubs.push(
      onSnapshot(
        collection(db, tournPath),
        (snap) => {
          const tournaments: Tournament[] = snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: String(data.id || d.id),
              title: String(data.title || ''),
              gameSlug:
                data.gameSlug === 'pool8' || data.gameSlug === 'fc27'
                  ? data.gameSlug
                  : 'custom',
              customGameName: data.customGameName ? String(data.customGameName) : undefined,
              modeTag:
                data.modeTag === '2v2' || data.modeTag === '4v4' ? data.modeTag : '1v1',
              formatLabel: String(data.formatLabel || ''),
              venueName: String(data.venueName || ''),
              prizePool: String(data.prizePool || ''),
              maxSlots: (Number(data.maxSlots) || 32) as Tournament['maxSlots'],
              registeredCount: Number(data.registeredCount) || 0,
              registrationOpen: Boolean(data.registrationOpen),
              resultsEntryOpen: Boolean(data.resultsEntryOpen),
              lastAiMatchupSummary: data.lastAiMatchupSummary
                ? String(data.lastAiMatchupSummary)
                : undefined,
              status:
                data.status === 'ongoing' || data.status === 'completed'
                  ? data.status
                  : 'open',
              isFeatured: Boolean(data.isFeatured),
              entryType: data.entryType === 'team' ? 'team' : 'solo',
              rules: Array.isArray(data.rules) ? data.rules.map((r) => String(r)) : [],
              winnerName: data.winnerName ? String(data.winnerName) : null,
              rounds: Array.isArray(data.rounds) ? (data.rounds as BracketRound[]) : [],
              updatedAtMs: Number(data.updatedAtMs) || 0,
            };
          });
          if (tournaments.length > 0) handlers.onTournaments?.(tournaments);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, tournPath);
        }
      )
    );
  }

  if (handlers.onLiveFeed) {
    const feedPath = 'liveFeed';
    unsubs.push(
      onSnapshot(
        collection(db, feedPath),
        (snap) => {
          const liveFeed: LiveFeedItem[] = snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: String(data.id || d.id),
              tournamentId: String(data.tournamentId || ''),
              tournamentTitle: String(data.tournamentTitle || ''),
              gameName: String(data.gameName || ''),
              roundName: String(data.roundName || ''),
              matchNumber: Number(data.matchNumber) || 1,
              groupName: String(data.groupName || ''),
              participantAName: String(data.participantAName || ''),
              participantBName: String(data.participantBName || ''),
              scoreA: Number(data.scoreA) || 0,
              scoreB: Number(data.scoreB) || 0,
              winnerName: String(data.winnerName || ''),
              approvedAt: String(data.approvedAt || ''),
            };
          });
          if (liveFeed.length > 0) handlers.onLiveFeed?.(liveFeed);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, feedPath);
        }
      )
    );
  }

  return () => {
    for (const u of unsubs) u();
  };
}

function mapChatDoc(id: string, d: Record<string, unknown>): FriendChatMessage {
  return {
    id: String(d.id || id),
    clientMsgId: d.clientMsgId ? String(d.clientMsgId) : undefined,
    channelId: String(d.channelId || 'team-group'),
    senderUid: String(d.senderUid || ''),
    senderHandle: String(d.senderHandle || ''),
    senderName: String(d.senderName || d.senderHandle || 'Player'),
    recipientUid: String(d.recipientUid || 'team-group'),
    recipientHandle: String(d.recipientHandle || ''),
    text: String(d.text || ''),
    createdAt: toIsoString(d.createdAt),
    readBy: Array.isArray(d.readBy) ? d.readBy.map((u) => String(u)) : [],
  };
}

export function subscribeToUserRealtime(
  uid: string,
  handlers: {
    onFriends?: (friends: TeamMember[]) => void;
    onFriendRequests?: (requests: FriendRequest[]) => void;
    onChatMessages?: (messages: FriendChatMessage[]) => void;
  }
): () => void {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || user.uid !== uid || !isValidFirebaseDocId(uid)) {
    return () => {};
  }

  const unsubs: (() => void)[] = [];

  if (handlers.onFriends) {
    const friendsPath = `users/${uid}/friends`;
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'friends'),
        (snap) => {
          const list: TeamMember[] = [];
          for (const d of snap.docs) {
            const data = d.data() as { uid?: string; handle?: string; name?: string; role?: string };
            if (data.uid && data.handle) {
              list.push({
                id: `m-${data.uid}`,
                uid: data.uid,
                name: data.name || data.handle,
                handle: data.handle,
                role: data.role || 'صديق',
                verified: true,
              });
            }
          }
          handlers.onFriends?.(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, friendsPath);
        }
      )
    );
  }

  if (handlers.onFriendRequests) {
    const incomingReqs = new Map<string, FriendRequest>();
    const outgoingReqs = new Map<string, FriendRequest>();
    const emitReqs = () => {
      const merged = new Map<string, FriendRequest>();
      for (const [k, v] of incomingReqs) merged.set(k, v);
      for (const [k, v] of outgoingReqs) merged.set(k, v);
      handlers.onFriendRequests?.(
        Array.from(merged.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    };
    const mapReq = (docId: string, d: Record<string, unknown>): FriendRequest => ({
      id: String(d.id || docId),
      fromUid: String(d.fromUid || ''),
      fromHandle: String(d.fromHandle || ''),
      fromName: String(d.fromName || d.fromHandle || ''),
      fromPlayerCode: String(d.fromPlayerCode || 'ARENA-PLAYER'),
      toUid: String(d.toUid || ''),
      toHandle: String(d.toHandle || ''),
      toName: String(d.toName || d.toHandle || ''),
      toPlayerCode: String(d.toPlayerCode || 'ARENA-PLAYER'),
      role: d.role ? String(d.role) : 'صديق',
      status: d.status === 'accepted' || d.status === 'declined' ? d.status : 'pending',
      createdAt: toIsoString(d.createdAt),
      respondedAt: d.status !== 'pending' ? toIsoString(d.updatedAt) : undefined,
    });

    unsubs.push(
      onSnapshot(
        query(collection(db, 'friendRequests'), where('toUid', '==', uid)),
        (snap) => {
          incomingReqs.clear();
          for (const d of snap.docs) {
            const r = mapReq(d.id, d.data() as Record<string, unknown>);
            incomingReqs.set(r.id, r);
          }
          emitReqs();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'friendRequests');
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'friendRequests'), where('fromUid', '==', uid)),
        (snap) => {
          outgoingReqs.clear();
          for (const d of snap.docs) {
            const r = mapReq(d.id, d.data() as Record<string, unknown>);
            outgoingReqs.set(r.id, r);
          }
          emitReqs();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'friendRequests');
        }
      )
    );
  }

  if (handlers.onChatMessages) {
    const groupMsgs = new Map<string, FriendChatMessage>();
    const sentMsgs = new Map<string, FriendChatMessage>();
    const recvMsgs = new Map<string, FriendChatMessage>();
    const emitMsgs = () => {
      const merged = new Map<string, FriendChatMessage>();
      for (const [k, v] of groupMsgs) merged.set(k, v);
      for (const [k, v] of sentMsgs) merged.set(k, v);
      for (const [k, v] of recvMsgs) merged.set(k, v);
      handlers.onChatMessages?.(
        Array.from(merged.values())
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(-150)
      );
    };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'chatMessages'), where('channelId', '==', 'team-group')),
        (snap) => {
          groupMsgs.clear();
          for (const d of snap.docs) {
            const msg = mapChatDoc(d.id, d.data() as Record<string, unknown>);
            groupMsgs.set(msg.id, msg);
          }
          emitMsgs();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'chatMessages');
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'chatMessages'), where('senderUid', '==', uid)),
        (snap) => {
          sentMsgs.clear();
          for (const d of snap.docs) {
            const msg = mapChatDoc(d.id, d.data() as Record<string, unknown>);
            sentMsgs.set(msg.id, msg);
          }
          emitMsgs();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'chatMessages');
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'chatMessages'), where('recipientUid', '==', uid)),
        (snap) => {
          recvMsgs.clear();
          for (const d of snap.docs) {
            const msg = mapChatDoc(d.id, d.data() as Record<string, unknown>);
            recvMsgs.set(msg.id, msg);
          }
          emitMsgs();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'chatMessages');
        }
      )
    );
  }

  return () => {
    for (const u of unsubs) u();
  };
}

