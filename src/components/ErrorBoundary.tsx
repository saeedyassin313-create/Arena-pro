import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected application error',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Arena Pro ErrorBoundary caught:', error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isAr =
      typeof document !== 'undefined' ? document.documentElement.lang !== 'en' : true;

    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="min-h-screen bg-[#070811] text-white flex items-center justify-center p-6"
      >
        <div className="w-full max-w-md bg-[#0E1222] border border-rose-500/35 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400 mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-extrabold text-white">
            {isAr ? 'حدث خطأ غير متوقع في الواجهة' : 'Unexpected Interface Error'}
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            {isAr
              ? 'بياناتك وبطولاتك محفوظة بأمان. اضغط على إعادة المحاولة لاستئناف العمل فوراً.'
              : 'Your data and tournaments are safely preserved. Click retry to resume immediately.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="min-h-[42px] px-4 rounded-xl bg-[#D4FF00] hover:bg-[#e5ff4d] text-[#070811] text-xs font-extrabold transition-colors"
            >
              {isAr ? 'العودة للتطبيق' : 'Resume App'}
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="min-h-[42px] px-4 rounded-xl border border-white/15 hover:border-[#22D3EE]/50 text-xs font-bold text-slate-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#22D3EE]" />
              <span>{isAr ? 'تحديث الصفحة' : 'Reload Page'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
