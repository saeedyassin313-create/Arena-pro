import { useState } from 'react';
import { Gamepad2 } from 'lucide-react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export function SafeImage({ src, alt, className = '', fallbackTitle }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#141930] to-[#070811] text-slate-400 p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Gamepad2 className="w-8 h-8 text-[#D4FF00]/80 mb-2" />
        <span className="text-xs font-medium text-slate-300 line-clamp-1">
          {fallbackTitle || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
