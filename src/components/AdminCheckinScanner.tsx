import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  ImageUp,
  QrCode,
  RotateCcw,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { auth } from '../firebase.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { translateGroupName } from '../i18n/helpers.ts';
import type { BracketParticipant, Tournament } from '../types.ts';
import {
  extractScannedIdentifier,
  getTeamCheckInSummary,
  type TeamCheckInSummary,
} from '../utils/checkin.ts';
import { lookupDirectoryInFirestore } from '../utils/firestoreSync.ts';

export interface CheckInActionResult {
  ok: boolean;
  error?: string;
  badge?: string;
  status?: string;
  arrivedCount?: number;
  requiredCount?: number;
  participant?: BracketParticipant;
  matchedMember?: { name: string; handle: string };
  alreadyCheckedIn?: boolean;
  actionApplied?: 'checkin' | 'undo';
}

interface AdminCheckinScannerProps {
  tournaments: Tournament[];
  selectedTournamentId: string;
  onSelectTournament: (id: string) => void;
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
}

function playFeedbackTone(kind: 'one_ready' | 'team_ready' | 'error' | 'undo') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const scheduleTone = (freq: number, start: number, dur: number, vol = 0.08) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'error' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    if (kind === 'team_ready') {
      scheduleTone(587.33, now, 0.11);
      scheduleTone(783.99, now + 0.09, 0.12);
      scheduleTone(1046.5, now + 0.18, 0.22);
    } else if (kind === 'one_ready') {
      scheduleTone(523.25, now, 0.11);
      scheduleTone(659.25, now + 0.1, 0.15);
    } else if (kind === 'undo') {
      scheduleTone(440, now, 0.1, 0.05);
    } else {
      scheduleTone(220, now, 0.16, 0.06);
    }

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 650);
  } catch {
    // Ignore audio context errors cleanly
  }
}

export function AdminCheckinScanner({
  tournaments,
  selectedTournamentId,
  onSelectTournament,
  onCheckInPlayer,
}: AdminCheckinScannerProps) {
  const { lang, isAr } = useLanguage();

  const [manualCode, setManualCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanFilter, setScanFilter] = useState<'all' | 'team_ready' | 'one_ready' | 'waiting'>(
    'all'
  );
  const [teamQuery, setTeamQuery] = useState('');
  const [lastResult, setLastResult] = useState<
    (CheckInActionResult & { rawCode?: string; timestamp: number }) | null
  >(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const lastScannedAtRef = useRef<Map<string, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const tournament = useMemo(
    () => tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0] || null,
    [tournaments, selectedTournamentId]
  );

  const participantsWithSummary = useMemo(() => {
    if (!tournament) return [] as { participant: BracketParticipant; summary: TeamCheckInSummary }[];
    const seen = new Set<string>();
    const list: { participant: BracketParticipant; summary: TeamCheckInSummary }[] = [];
    const round0 = tournament.rounds[0];
    if (round0) {
      for (const m of round0.matches) {
        for (const p of [m.participantA, m.participantB]) {
          if (p && !seen.has(p.id)) {
            seen.add(p.id);
            list.push({
              participant: p,
              summary: getTeamCheckInSummary(p, tournament.modeTag),
            });
          }
        }
      }
    }
    return list;
  }, [tournament]);

  const counts = useMemo(() => {
    let teamReady = 0;
    let oneReady = 0;
    let waiting = 0;
    for (const item of participantsWithSummary) {
      if (item.summary.status === 'team_ready') teamReady += 1;
      else if (item.summary.status === 'one_ready' || item.summary.status === 'partial_ready')
        oneReady += 1;
      else waiting += 1;
    }
    return {
      total: participantsWithSummary.length,
      teamReady,
      oneReady,
      waiting,
    };
  }, [participantsWithSummary]);

  const filteredTeams = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    return participantsWithSummary.filter(({ participant, summary }) => {
      if (scanFilter === 'team_ready' && summary.status !== 'team_ready') return false;
      if (
        scanFilter === 'one_ready' &&
        summary.status !== 'one_ready' &&
        summary.status !== 'partial_ready'
      ) {
        return false;
      }
      if (scanFilter === 'waiting' && summary.arrivedCount > 0) return false;

      if (!q) return true;
      const haystack = [
        participant.teamName || '',
        participant.name || '',
        participant.username || '',
        participant.teammateUsername || '',
        ...summary.members.flatMap((m) => [m.name, m.handle]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [participantsWithSummary, scanFilter, teamQuery]);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const executeCheckIn = useCallback(
    async (
      rawInput: string,
      options?: {
        participantId?: string;
        action?: 'checkin' | 'undo' | 'toggle';
        fromCamera?: boolean;
      }
    ) => {
      if (!tournament) return;
      const extracted = extractScannedIdentifier(rawInput);
      if (!extracted) return;

      if (options?.fromCamera) {
        const key = `${tournament.id}:${extracted.toLowerCase()}`;
        const now = Date.now();
        const prev = lastScannedAtRef.current.get(key) || 0;
        if (now - prev < 2600 || processingRef.current) {
          return;
        }
        lastScannedAtRef.current.set(key, now);
      }

      processingRef.current = true;
      setSubmitting(true);
      try {
        let resolvedHandle: string | undefined;
        let resolvedPlayerCode: string | undefined;
        if (auth.currentUser) {
          try {
            const dir = await lookupDirectoryInFirestore(extracted);
            if (dir) {
              resolvedHandle = dir.handle;
              resolvedPlayerCode = dir.playerCode;
            }
          } catch {
            // Non-fatal; server still resolves local directory & roster handles
          }
        }

        const res = await onCheckInPlayer(tournament.id, {
          code: extracted,
          participantId: options?.participantId,
          action: options?.action || 'checkin',
          resolvedHandle,
          resolvedPlayerCode,
        });

        setLastResult({
          ...res,
          rawCode: extracted,
          timestamp: Date.now(),
        });

        if (!res.ok) {
          playFeedbackTone('error');
        } else if (res.actionApplied === 'undo') {
          playFeedbackTone('undo');
        } else if (res.status === 'team_ready') {
          playFeedbackTone('team_ready');
        } else {
          playFeedbackTone('one_ready');
        }

        if (!options?.fromCamera && !options?.participantId && res.ok) {
          setManualCode('');
        }
      } finally {
        processingRef.current = false;
        setSubmitting(false);
      }
    },
    [tournament, onCheckInPlayer]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        isAr
          ? 'المتصفح الحالي لا يدعم تشغيل الكاميرا مباشرة. استخدم رفع صورة QR أو الإدخال اليدوي بالأسفل.'
          : 'Camera capture is unavailable in this browser. Upload a QR screenshot or enter the player ID below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);

      window.setTimeout(async () => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // Autoplay handled silently
        }

        if (scanTimerRef.current !== null) {
          window.clearInterval(scanTimerRef.current);
        }

        scanTimerRef.current = window.setInterval(() => {
          const v = videoRef.current;
          const canvas = canvasRef.current;
          if (!v || !canvas || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) {
            return;
          }
          const targetW = Math.min(v.videoWidth, 640);
          const targetH = Math.round((v.videoHeight / v.videoWidth) * targetW);
          if (canvas.width !== targetW) canvas.width = targetW;
          if (canvas.height !== targetH) canvas.height = targetH;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(v, 0, 0, targetW, targetH);
          const imageData = ctx.getImageData(0, 0, targetW, targetH);
          const decoded = jsQR(imageData.data, targetW, targetH, {
            inversionAttempts: 'dontInvert',
          });
          if (decoded?.data) {
            void executeCheckIn(decoded.data, { fromCamera: true });
          }
        }, 180);
      }, 60);
    } catch {
      stopCamera();
      setCameraError(
        isAr
          ? 'تم رفض إذن الكاميرا أو الكاميرا غير متاحة داخل النافذة. يمكنك رفع صورة QR أو كتابة ID اللاعب.'
          : 'Camera permission was denied or blocked here. Upload a QR image or type the player ID below.'
      );
    }
  }, [isAr, executeCheckIn, stopCamera]);

  const handleUploadQrImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('image load failed'));
        image.src = dataUrl;
      });

      const canvas = document.createElement('canvas');
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (!decoded?.data) {
        playFeedbackTone('error');
        setLastResult({
          ok: false,
          error: isAr
            ? 'لم يتم العثور على رمز QR واضح داخل الصورة المرفوعة.'
            : 'No readable QR code was detected in the uploaded image.',
          timestamp: Date.now(),
        });
        return;
      }

      await executeCheckIn(decoded.data);
    } catch {
      playFeedbackTone('error');
      setLastResult({
        ok: false,
        error: isAr ? 'تعذر قراءة ملف الصورة.' : 'Could not decode image file.',
        timestamp: Date.now(),
      });
    }
  };

  if (!tournament) {
    return (
      <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-8 text-center text-sm text-slate-400">
        {isAr
          ? 'لا توجد بطولات منشأة بعد. أنشئ بطولة أولاً من قسم إدارة الحجز.'
          : 'No tournaments found yet. Create a tournament in Booking Admin first.'}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tournament Switcher + Readiness KPIs */}
      <section className="bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#D4FF00]" />
              <span>
                {isAr
                  ? 'سكان حضور اللاعبين بالباركود (QR Check-In)'
                  : 'Venue QR Check-In Scanner'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isAr
                ? 'امسح QR حساب كل لاعب عند وصوله للمكان: لو لاعب واحد من الفريق حضر يظهر ONE READY، ولو الاثنين/الفريق كله حضر يظهر TEAM READY.'
                : 'Scan each player’s account QR at check-in: 1 arrived teammate shows ONE READY, and full team arrival switches immediately to TEAM READY.'}
            </p>
          </div>

          <select
            value={tournament.id}
            onChange={(e) => {
              onSelectTournament(e.target.value);
              setLastResult(null);
            }}
            aria-label={isAr ? 'اختر البطولة' : 'Select tournament'}
            className="min-h-[44px] bg-[#070811] border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#D4FF00]"
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.modeTag} · {t.registeredCount}/{t.maxSlots})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#070811] border border-white/[0.07] rounded-xl p-4">
            <div className="text-[11px] text-slate-400">
              {isAr ? 'الفرق المسجلة' : 'Registered Teams'}
            </div>
            <div className="text-2xl font-bold font-mono-num text-white mt-1">
              {counts.total}
            </div>
          </div>

          <div className="bg-emerald-500/[0.08] border border-emerald-500/30 rounded-xl p-4">
            <div className="text-[11px] font-bold text-emerald-300 tracking-wide">TEAM READY</div>
            <div className="text-2xl font-bold font-mono-num text-emerald-400 mt-1">
              {counts.teamReady}
            </div>
            <div className="text-[10px] text-emerald-200/75 mt-0.5">
              {isAr ? 'الفريق مكتمل وجاهز' : 'All teammates checked in'}
            </div>
          </div>

          <div className="bg-amber-500/[0.08] border border-amber-500/30 rounded-xl p-4">
            <div className="text-[11px] font-bold text-amber-300 tracking-wide">ONE READY</div>
            <div className="text-2xl font-bold font-mono-num text-amber-400 mt-1">
              {counts.oneReady}
            </div>
            <div className="text-[10px] text-amber-200/75 mt-0.5">
              {isAr ? 'حضر فرد واحد وبانتظار الباقي' : '1 arrived, awaiting teammate'}
            </div>
          </div>

          <div className="bg-[#070811] border border-white/[0.07] rounded-xl p-4">
            <div className="text-[11px] text-slate-400">
              {isAr ? 'بانتظار الحضور' : 'Awaiting Arrival'}
            </div>
            <div className="text-2xl font-bold font-mono-num text-slate-200 mt-1">
              {counts.waiting}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Live QR Camera + Image Upload + Manual Entry */}
        <section className="lg:col-span-5 bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#22D3EE]" />
              <span>{isAr ? 'ماسح QR المباشر' : 'Live QR Scanner'}</span>
            </h3>
            <span className="text-[11px] font-mono-num px-2.5 py-1 rounded-lg bg-[#070811] border border-white/10 text-[#D4FF00]">
              {tournament.modeTag}
            </span>
          </div>

          {/* Camera Viewport */}
          <div className="relative rounded-2xl overflow-hidden bg-[#070811] border border-white/10 aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {cameraActive ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-44 h-44 border-2 border-[#D4FF00]/80 rounded-2xl shadow-[0_0_0_9999px_rgba(7,8,17,0.45)] relative">
                  <div className="absolute inset-x-3 top-1/2 h-0.5 bg-[#22D3EE]/90 animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="p-6 text-center space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#0E1222] border border-[#D4FF00]/30 flex items-center justify-center text-[#D4FF00]">
                  <QrCode className="w-7 h-7" />
                </div>
                <div className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
                  {isAr
                    ? 'شغّل الكاميرا لمسح QR اللاعب مباشرة من هاتفه، أو ارفع لقطة شاشة للـ QR.'
                    : 'Start camera to scan the player’s phone QR directly, or upload a QR screenshot.'}
                </div>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Camera + Upload Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {cameraActive ? (
              <button
                type="button"
                onClick={stopCamera}
                className="min-h-[44px] px-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 hover:bg-rose-500/25 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <CameraOff className="w-4 h-4" />
                <span>{isAr ? 'إيقاف الكاميرا' : 'Stop Camera'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startCamera()}
                className="min-h-[44px] px-4 rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] text-[#070811] font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Camera className="w-4 h-4" />
                <span>{isAr ? 'تشغيل كاميرا السكان' : 'Start Camera Scan'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 rounded-xl bg-[#070811] border border-white/15 hover:border-[#22D3EE]/60 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <ImageUp className="w-4 h-4 text-[#22D3EE]" />
              <span>{isAr ? 'رفع صورة QR' : 'Upload QR Image'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadQrImage}
              className="hidden"
            />
          </div>

          {/* Manual ID / Handle / QR URL Input */}
          <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
            <label className="block text-xs font-semibold text-slate-300">
              {isAr
                ? 'أو أدخل كود اللاعب / اليوزر نيم / رابط الـ QR'
                : 'Or enter Player ID / @handle / QR URL'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualCode.trim()) {
                    void executeCheckIn(manualCode);
                  }
                }}
                placeholder="ARENA-3026 · @username"
                className="flex-1 min-w-0 min-h-[44px] bg-[#070811] border border-white/15 rounded-xl px-3.5 text-sm text-white font-mono-num placeholder:text-slate-500 focus:outline-none focus:border-[#D4FF00]"
              />
              <button
                type="button"
                disabled={submitting || !manualCode.trim()}
                onClick={() => void executeCheckIn(manualCode)}
                className="min-h-[44px] px-4 rounded-xl bg-[#22D3EE] hover:bg-[#38BDF8] disabled:bg-slate-700 disabled:text-slate-400 text-[#070811] font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <UserCheck className="w-4 h-4" />
                <span>{isAr ? 'تحضير' : 'Check In'}</span>
              </button>
            </div>
          </div>

          {/* Last Scan Result Spotlight */}
          {lastResult && (
            <div
              className={`rounded-2xl border p-4 space-y-2 ${
                !lastResult.ok
                  ? 'bg-rose-500/10 border-rose-500/40'
                  : lastResult.status === 'team_ready'
                  ? 'bg-emerald-500/15 border-emerald-400/50'
                  : lastResult.status === 'one_ready' || lastResult.status === 'partial_ready'
                  ? 'bg-amber-500/15 border-amber-400/50'
                  : 'bg-[#070811] border-white/15'
              }`}
            >
              {!lastResult.ok ? (
                <div className="flex items-start gap-2.5 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-white mb-0.5">
                      {isAr ? 'تعذر تسجيل الحضور' : 'Check-In Failed'}
                    </div>
                    <p>{lastResult.error}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-300">
                      {lastResult.actionApplied === 'undo'
                        ? isAr
                          ? 'تم إلغاء تحضير اللاعب'
                          : 'Check-In Reverted'
                        : lastResult.alreadyCheckedIn
                        ? isAr
                          ? 'مسجل حضور بالفعل'
                          : 'Already Checked In'
                        : isAr
                        ? 'تم مسح اللاعب بنجاح'
                        : 'Player Scanned Successfully'}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-black tracking-wider font-mono-num ${
                        lastResult.status === 'team_ready'
                          ? 'bg-emerald-400 text-[#070811]'
                          : lastResult.status === 'one_ready' ||
                            lastResult.status === 'partial_ready'
                          ? 'bg-amber-400 text-[#070811]'
                          : 'bg-slate-700 text-white'
                      }`}
                    >
                      {lastResult.badge}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-white truncate">
                        {lastResult.matchedMember?.name || lastResult.matchedMember?.handle}
                      </div>
                      <div className="text-xs text-slate-300 truncate">
                        {isAr ? 'الفريق:' : 'Team:'}{' '}
                        <strong className="text-white">
                          {lastResult.participant?.teamName || lastResult.participant?.name}
                        </strong>{' '}
                        · @{lastResult.matchedMember?.handle}
                      </div>
                    </div>
                    <div className="text-end font-mono-num text-sm font-extrabold text-white shrink-0">
                      {lastResult.arrivedCount ?? 0} / {lastResult.requiredCount ?? 1}
                    </div>
                  </div>

                  <div className="text-xs font-semibold pt-1 border-t border-white/10">
                    {lastResult.status === 'team_ready' ? (
                      <span className="text-emerald-300">
                        {isAr
                          ? 'TEAM READY — حضر جميع أعضاء الفريق والفريق جاهز للمواجهة الآن!'
                          : 'TEAM READY — All required teammates have arrived at the venue!'}
                      </span>
                    ) : lastResult.status === 'one_ready' ? (
                      <span className="text-amber-300">
                        {isAr
                          ? 'ONE READY — حضر لاعب واحد فقط من الفريق وبانتظار زميله.'
                          : 'ONE READY — One player arrived; waiting for teammate.'}
                      </span>
                    ) : lastResult.status === 'partial_ready' ? (
                      <span className="text-[#22D3EE]">
                        {isAr
                          ? `حضر ${lastResult.arrivedCount} من ${lastResult.requiredCount} لاعبين من الفريق.`
                          : `${lastResult.arrivedCount} of ${lastResult.requiredCount} players arrived.`}
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        {isAr ? 'بانتظار حضور لاعبي الفريق.' : 'Waiting for team players.'}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Right: Team Attendance & Readiness Board */}
        <section className="lg:col-span-7 bg-[#0E1222] border border-white/[0.08] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#D4FF00]" />
              <span>{isAr ? 'حالة جاهزية الفرق (التحضير)' : 'Team Readiness Board'}</span>
            </h3>

            <div className="flex items-center gap-1 p-1 bg-[#070811] border border-white/[0.08] rounded-xl overflow-x-auto">
              {[
                { key: 'all', label: isAr ? `الكل (${counts.total})` : `All (${counts.total})` },
                { key: 'team_ready', label: `TEAM READY (${counts.teamReady})` },
                { key: 'one_ready', label: `ONE READY (${counts.oneReady})` },
                {
                  key: 'waiting',
                  label: isAr ? `لم يحضر (${counts.waiting})` : `Waiting (${counts.waiting})`,
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    setScanFilter(tab.key as 'all' | 'team_ready' | 'one_ready' | 'waiting')
                  }
                  className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                    scanFilter === tab.key
                      ? 'bg-[#D4FF00] text-[#070811]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
              placeholder={
                isAr ? 'ابحث باسم الفريق أو يوزر اللاعب...' : 'Search by team name or @handle...'
              }
              className="w-full min-h-[42px] bg-[#070811] border border-white/10 rounded-xl ps-10 pe-3.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#22D3EE]"
            />
          </div>

          {filteredTeams.length === 0 ? (
            <div className="bg-[#070811] border border-white/[0.06] rounded-xl p-6 text-center text-xs text-slate-400">
              {participantsWithSummary.length === 0
                ? isAr
                  ? 'لا توجد فرق مسجلة في هذه البطولة حتى الآن.'
                  : 'No teams have registered in this tournament yet.'
                : isAr
                ? 'لا توجد نتائج مطابقة للبحث أو الفلتر المحدد.'
                : 'No teams match your current filter or search query.'}
            </div>
          ) : (
            <div className="space-y-3 max-h-[680px] overflow-y-auto pe-1">
              {filteredTeams.map(({ participant, summary }) => {
                const badgeStyle =
                  summary.status === 'team_ready'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : summary.status === 'one_ready'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : summary.status === 'partial_ready'
                    ? 'bg-[#22D3EE]/20 text-[#22D3EE] border-[#22D3EE]/40'
                    : 'bg-white/5 text-slate-400 border-white/10';

                return (
                  <article
                    key={participant.id}
                    className={`rounded-xl border p-4 space-y-3 transition-colors ${
                      summary.status === 'team_ready'
                        ? 'bg-emerald-500/[0.06] border-emerald-500/35'
                        : summary.status === 'one_ready' || summary.status === 'partial_ready'
                        ? 'bg-amber-500/[0.05] border-amber-500/30'
                        : 'bg-[#070811] border-white/[0.08]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-white truncate flex items-center gap-2">
                          <span className="font-mono-num text-xs text-[#D4FF00]">
                            #{participant.seed}
                          </span>
                          <span className="truncate">
                            {participant.teamName || participant.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>{translateGroupName(participant.groupName, lang)}</span>
                          <span>·</span>
                          <span className="font-mono-num text-[#22D3EE]">
                            {summary.arrivedCount}/{summary.requiredCount}{' '}
                            {isAr ? 'حاضر' : 'arrived'}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-3 py-1 rounded-lg border text-xs font-black tracking-wider font-mono-num shrink-0 ${badgeStyle}`}
                      >
                        {summary.badge}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {summary.members.map((member, mIdx) => (
                        <div
                          key={`${participant.id}-${member.handle || member.name}-${mIdx}`}
                          className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${
                            member.checkedIn
                              ? 'bg-emerald-500/10 border-emerald-500/35'
                              : 'bg-[#0E1222] border-white/[0.07]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {member.checkedIn ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {member.name}
                              </div>
                              {member.handle && (
                                <div className="text-[10px] font-mono-num text-slate-400 truncate">
                                  @{member.handle}
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() =>
                              void executeCheckIn(member.handle || member.name, {
                                participantId: participant.id,
                                action: 'toggle',
                              })
                            }
                            className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold shrink-0 flex items-center gap-1 transition-colors ${
                              member.checkedIn
                                ? 'bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-white/10'
                                : 'bg-[#D4FF00] hover:bg-[#E2FF4D] text-[#070811]'
                            }`}
                          >
                            {member.checkedIn ? (
                              <>
                                <RotateCcw className="w-3 h-3" />
                                <span>{isAr ? 'إلغاء' : 'Undo'}</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3 h-3" />
                                <span>{isAr ? 'حضر' : 'Arrived'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
