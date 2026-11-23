import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'ar' | 'en';

interface LanguageContextValue {
  lang: Language;
  isAr: boolean;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

const STORAGE_KEY = 'arena_lang';

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'ar';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    // ignore storage access issues
  }
  return 'ar';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLanguage);

  const setLang = (next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage access issues
    }
  };

  const toggleLang = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  };

  useEffect(() => {
    const isAr = lang === 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';
    document.title = isAr
      ? 'أرينا برو — منصة بطولات الألعاب'
      : 'Arena Pro — Competitive Gaming Tournaments';
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, isAr: lang === 'ar', setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
