import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, QrCode, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import type { PlayerProfile } from '../types.ts';

interface QrCodeModalProps {
  open: boolean;
  profile: PlayerProfile;
  onClose: () => void;
  onOpenProfile?: () => void;
}

export function buildProfileQrUrl(profile: PlayerProfile): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://arena-pro.app';
  const code = (profile.playerCode || '').trim();
  const handle = (profile.handle || '').trim().replace(/^@+/, '');
  const useCode =
    code &&
    code.toLowerCase() !== 'arena-1042' &&
    code.toLowerCase() !== 'arena-player' &&
    code.toLowerCase() !== 'guest';
  const target = useCode ? code : handle;
  if (!target || target.toLowerCase() === 'player_guest') {
    return origin;
  }
  return `${origin}/?addFriend=${encodeURIComponent(target)}`;
}

export function QrCodeModal({ open, profile, onClose, onOpenProfile }: QrCodeModalProps) {
  const { isAr } = useLanguage();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const qrUrl = buildProfileQrUrl(profile);
  const isGuest =
    !profile.handle ||
    profile.handle.trim().toLowerCase() === 'player_guest' ||
    profile.handle.trim().toLowerCase() === 'player';

  useEffect(() => {
    if (!open) return;
    let active = true;
    QRCode.toDataURL(qrUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#070811',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, qrUrl]);

  if (!open) return null;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(qrUrl).catch(() => {});
    }
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `arena-pro-${profile.handle || 'qr'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#0E1222] border border-[#22D3EE]/35 rounded-2xl p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#D4FF00]/15 border border-[#D4FF00]/40 flex items-center justify-center text-[#D4FF00]">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                {isAr ? 'QR Code حسابك' : 'Your Account QR Code'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isAr ? 'امسحه لإرسال طلب صداقة مباشرة' : 'Scan to send a friend request'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center bg-white rounded-2xl p-4 shadow-inner">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={isAr ? `رمز QR للاعب ${profile.handle}` : `QR code for ${profile.handle}`}
              className="w-52 h-52 object-contain"
            />
          ) : (
            <div className="w-52 h-52 bg-slate-100 rounded-xl animate-pulse" />
          )}
        </div>

        <div className="bg-[#070811] border border-white/10 rounded-xl p-3.5 text-center space-y-1">
          <div className="text-sm font-bold text-white">{profile.displayName}</div>
          <div className="font-mono-num text-xs font-bold text-[#D4FF00]">
            @{profile.handle} · {profile.playerCode}
          </div>
          {isGuest && (
            <p className="text-[11px] text-amber-300 pt-1">
              {isAr
                ? 'سجّل اسم المستخدم من ملفي وفريقي لتفعيل كود فريد خاص بك.'
                : 'Set a custom username in Profile & Team to activate your unique ID.'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[42px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-colors"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[#22D3EE]" />
            )}
            <span>{copiedLink ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ الرابط' : 'Copy Link'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="min-h-[42px] px-3 rounded-xl bg-[#D4FF00] hover:bg-[#e5ff4d] text-[#070811] text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isAr ? 'تحميل QR' : 'Download QR'}</span>
          </button>
        </div>

        {onOpenProfile && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenProfile();
            }}
            className="w-full min-h-[40px] rounded-xl border border-[#22D3EE]/35 text-xs font-bold text-[#22D3EE] hover:bg-[#22D3EE]/10 transition-colors"
          >
            {isAr ? 'فتح ملفي وفريقي وإدارة اللغة والأصدقاء' : 'Open Profile, Team & Language'}
          </button>
        )}
      </div>
    </div>
  );
}
