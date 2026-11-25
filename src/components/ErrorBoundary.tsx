import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado en la aplicación.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('FitnessDreams ErrorBoundary:', error, info);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let friendlyDetail = 'Se produjo un error de conexión o permisos.';
    try {
      const parsed = JSON.parse(this.state.message) as { error?: string; path?: string };
      if (parsed.error) {
        friendlyDetail = parsed.error.includes('permission')
          ? 'Tu cuenta actual no tiene permisos para esta vista. Inicia sesión con una cuenta autorizada.'
          : parsed.error;
      }
    } catch {
      if (this.state.message) {
        friendlyDetail = this.state.message;
      }
    }

    return (
      <div className="min-h-screen bg-[#06080D] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#0D121B] border border-red-500/40 p-6 space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h1 className="text-lg font-bold text-white">Aviso de conexión FitnessDreams</h1>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{friendlyDetail}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full min-h-[44px] rounded-xl bg-[#00A8FF] hover:bg-[#33C1FF] text-[#04070D] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Recargar aplicación
          </button>
        </div>
      </div>
    );
  }
}
