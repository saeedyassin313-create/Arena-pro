import { useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { LogIn, LogOut } from 'lucide-react';
import { auth, googleProvider } from '../firebase.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';

interface AuthButtonProps {
  user: User | null;
  authReady: boolean;
  onAuthError?: (message: string) => void;
  onSignedIn?: (user: User) => void;
  onSignedOut?: () => void;
}

export function AuthButton({
  user,
  authReady,
  onAuthError,
  onSignedIn,
  onSignedOut,
}: AuthButtonProps) {
  const { isAr } = useLanguage();
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      onSignedIn?.(cred.user);
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? isAr
            ? 'تم إغلاق نافذة تسجيل الدخول قبل الإكمال.'
            : 'Sign-in window was closed before completing.'
          : isAr
          ? 'تعذر تسجيل الدخول عبر Google. حاول مرة أخرى.'
          : 'Could not sign in with Google. Please try again.';
      onAuthError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut(auth);
      onSignedOut?.();
    } catch {
      onAuthError?.(isAr ? 'تعذر تسجيل الخروج حالياً.' : 'Unable to sign out right now.');
    } finally {
      setBusy(false);
    }
  };

  if (!authReady) {
    return (
      <div className="h-10 w-28 rounded-xl bg-white/5 border border-white/10 animate-pulse shrink-0" />
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex items-center gap-2 min-w-0 max-w-[160px]">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || (isAr ? 'صورة المستخدم' : 'User avatar')}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full object-cover border border-white/20 shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#7C3AED]/25 border border-[#F02E97]/50 text-[#D4FF00] text-xs font-bold flex items-center justify-center shrink-0">
              {(user.displayName || (isAr ? 'م' : 'U')).charAt(0)}
            </div>
          )}
          <span className="text-xs font-medium text-slate-200 truncate">
            {user.displayName || user.email}
          </span>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleSignOut}
          className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-white/15 hover:border-[#F02E97]/60 bg-[#0E1222] text-xs font-semibold text-slate-200 hover:text-pink-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{isAr ? 'خروج' : 'Sign Out'}</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleSignIn}
      className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-white hover:bg-slate-100 disabled:bg-slate-700 text-[#070811] text-xs font-extrabold flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 transition-colors arena-google-btn"
    >
      <LogIn className="w-3.5 h-3.5 shrink-0" />
      <span className="sm:hidden">
        {busy ? (isAr ? 'دخول...' : '...') : isAr ? 'دخول' : 'Sign In'}
      </span>
      <span className="hidden sm:inline">
        {busy
          ? isAr
            ? 'جاري الدخول...'
            : 'Signing in...'
          : isAr
          ? 'دخول بـ Google'
          : 'Google Sign In'}
      </span>
    </button>
  );
}
